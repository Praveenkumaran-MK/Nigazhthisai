-- =============================================================================
-- 008: Security-sensitive RPCs. Every function that mutates money/tickets/
-- occupancy/trip progression is SECURITY DEFINER + wrapped in an implicit
-- PL/pgSQL transaction (a single function body is atomic in Postgres unless
-- it raises), so partial state is impossible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- find_nearest_stop: PostGIS nearest-neighbour lookup using the <-> operator
-- (KNN, uses the GiST index from migration 006) instead of downloading every
-- stop to the browser.
-- -----------------------------------------------------------------------------
create or replace function find_nearest_stop(
  p_latitude double precision,
  p_longitude double precision,
  p_limit int default 1
)
returns table (
  stop_id uuid,
  name text,
  code text,
  district text,
  distance_meters double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as stop_id,
    s.name,
    s.code,
    s.district,
    st_distance(s.location, st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography) as distance_meters
  from stops s
  order by s.location <-> st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography
  limit greatest(1, least(p_limit, 20));
$$;

grant execute on function find_nearest_stop(double precision, double precision, int) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- list_eligible_buses: implements the "must not show a bus that has already
-- passed the passenger's origin" rule (spec section 22) using ordered
-- trip_stops progression rather than raw lat/lng proximity. A trip is
-- eligible when it is ACTIVE on the requested route and the origin stop's
-- trip_stops row is still UPCOMING or ARRIVED (not yet DEPARTED/SKIPPED).
-- -----------------------------------------------------------------------------
create or replace function list_eligible_buses(
  p_route_id uuid,
  p_origin_stop_id uuid
)
returns table (
  trip_id uuid,
  bus_id uuid,
  bus_number text,
  bus_type bus_type,
  capacity int,
  current_stop_id uuid,
  current_stop_name text,
  available_seats int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as trip_id,
    b.id as bus_id,
    b.bus_number,
    b.type as bus_type,
    b.capacity,
    t.current_stop_id,
    cs.name as current_stop_name,
    coalesce(b.capacity - o.current_passenger_count, b.capacity) as available_seats
  from trips t
  join buses b on b.id = t.bus_id
  join trip_stops ts_origin
    on ts_origin.trip_id = t.id and ts_origin.stop_id = p_origin_stop_id
  left join stops cs on cs.id = t.current_stop_id
  left join trip_occupancy o on o.trip_id = t.id
  where t.route_id = p_route_id
    and t.status = 'ACTIVE'
    -- Conservative rule: if progression state is ambiguous (no row at all
    -- would already be excluded by the join above), only ever include a bus
    -- whose origin stop has NOT yet been departed or skipped.
    and ts_origin.status in ('UPCOMING', 'ARRIVED')
  order by b.bus_number;
$$;

grant execute on function list_eligible_buses(uuid, uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_secure_ticket: the ONLY way a ticket can be created. Recomputes and
-- validates every input server-side; never trusts a client-supplied fare or
-- status. Generates an HMAC-signed QR payload using pgcrypto so the signing
-- key never has to leave the database (and is never present in any browser
-- bundle).
--
-- IMPORTANT (documented per Section 1.3): the HMAC key below is a
-- placeholder read from a dedicated `app_secrets` table rather than hard-
-- coded, because Postgres has no native "environment secret" primitive
-- reachable from SQL. Set the real value via:
--   update app_secrets set value = '<random-64-byte-hex>' where name = 'ticket_qr_hmac_key';
-- immediately after running migrations, using the Supabase SQL editor or CLI
-- with a service-role connection — never from client code.
-- -----------------------------------------------------------------------------
create table if not exists app_secrets (
  name text primary key,
  value text not null
);
alter table app_secrets enable row level security;
-- No policies at all: only SECURITY DEFINER functions (which bypass RLS)
-- and the service role can ever read this table.

insert into app_secrets (name, value)
values ('ticket_qr_hmac_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function create_secure_ticket(
  p_trip_id uuid,
  p_origin_stop_id uuid,
  p_dest_stop_id uuid,
  p_passenger_count int default 1
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id uuid;
  v_bus_id uuid;
  v_fare numeric(10, 2);
  v_hmac_key text;
  v_qr_payload text;
  v_qr_signature text;
  v_ticket tickets;
  v_config transport_authority_config;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: an anonymous session is required to purchase a ticket';
  end if;

  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 6 then
    raise exception 'INVALID_PASSENGER_COUNT';
  end if;

  select * into v_config from transport_authority_config limit 1;
  if v_config is null or v_config.is_payments_enabled is not true then
    raise exception 'PAYMENTS_DISABLED: transport authority UPI configuration is missing or disabled';
  end if;

  select t.route_id, t.bus_id into v_route_id, v_bus_id
  from trips t
  where t.id = p_trip_id and t.status = 'ACTIVE'
  for update;

  if v_route_id is null then
    raise exception 'INVALID_TRIP: trip does not exist or is not active';
  end if;

  -- Reject if the bus has already departed the origin stop (same rule as
  -- list_eligible_buses, enforced again here so a stale client cannot buy a
  -- ticket for a bus that has since moved on).
  if not exists (
    select 1 from trip_stops
    where trip_id = p_trip_id and stop_id = p_origin_stop_id
      and status in ('UPCOMING', 'ARRIVED')
  ) then
    raise exception 'ORIGIN_ALREADY_DEPARTED';
  end if;

  select flat_fare_amount into v_fare
  from fare_matrix
  where route_id = v_route_id
    and origin_stop_id = p_origin_stop_id
    and dest_stop_id = p_dest_stop_id;

  if v_fare is null then
    raise exception 'NO_FARE_CONFIGURED: no fare_matrix entry for this origin/destination on this route';
  end if;

  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  if v_hmac_key is null then
    raise exception 'SERVER_MISCONFIGURED: missing ticket signing key';
  end if;

  v_qr_payload := encode(extensions.gen_random_bytes(24), 'base64');
  v_qr_signature := encode(extensions.hmac(v_qr_payload || '|' || p_trip_id::text, v_hmac_key, 'sha256'), 'hex');

  insert into tickets (
    passenger_session_id, bus_id, trip_id, origin_stop_id, dest_stop_id,
    passenger_count, total_fare, qr_payload, qr_signature, status, expires_at
  ) values (
    auth.uid(), v_bus_id, p_trip_id, p_origin_stop_id, p_dest_stop_id,
    p_passenger_count, v_fare * p_passenger_count, v_qr_payload, v_qr_signature,
    'PAID', now() + interval '4 hours'
  )
  returning * into v_ticket;

  return v_ticket;
end;
$$;

grant execute on function create_secure_ticket(uuid, uuid, uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- validate_ticket: atomic, conductor-only. Locks the ticket row (SELECT ...
-- FOR UPDATE) so two concurrent scans of the same QR cannot both succeed —
-- the second call sees status = 'VALIDATED' and is rejected.
-- -----------------------------------------------------------------------------
create or replace function validate_ticket(
  p_qr_payload text,
  p_trip_id uuid
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket tickets;
  v_hmac_key text;
  v_expected_signature text;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED: caller is not the active conductor for this trip';
  end if;

  select * into v_ticket from tickets where qr_payload = p_qr_payload for update;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  v_expected_signature := encode(extensions.hmac(v_ticket.qr_payload || '|' || v_ticket.trip_id::text, v_hmac_key, 'sha256'), 'hex');
  if v_expected_signature <> v_ticket.qr_signature then
    raise exception 'TICKET_SIGNATURE_INVALID';
  end if;

  if v_ticket.trip_id <> p_trip_id then
    raise exception 'WRONG_TRIP: ticket was issued for a different trip/bus';
  end if;

  if v_ticket.status = 'VALIDATED' then
    raise exception 'ALREADY_VALIDATED';
  end if;

  if v_ticket.status = 'EXPIRED' or v_ticket.expires_at < now() then
    raise exception 'TICKET_EXPIRED';
  end if;

  if v_ticket.status = 'CANCELLED' then
    raise exception 'TICKET_CANCELLED';
  end if;

  if v_ticket.status <> 'PAID' then
    raise exception 'TICKET_NOT_PAID';
  end if;

  update tickets set status = 'VALIDATED', validated_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  -- Atomically bump occupancy; capacity check constraint prevents overbooking.
  insert into trip_occupancy (trip_id, current_passenger_count, capacity)
  select p_trip_id, v_ticket.passenger_count, b.capacity
  from trips t join buses b on b.id = t.bus_id
  where t.id = p_trip_id
  on conflict (trip_id) do update
    set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;

  return v_ticket;
end;
$$;

grant execute on function validate_ticket(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- depart_stop_and_expire_tickets: conductor presses "Departed [Stop]". Marks
-- the trip_stop DEPARTED, advances trips.current_stop_id, and atomically
-- expires every VALIDATED/PAID ticket whose destination is that stop
-- (decrementing occupancy for tickets that were boarded/validated).
-- -----------------------------------------------------------------------------
create or replace function depart_stop_and_expire_tickets(
  p_trip_id uuid,
  p_stop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_stop_id uuid;
  v_alighted_count int;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update trip_stops
  set status = 'DEPARTED', departure_time = now()
  where trip_id = p_trip_id and stop_id = p_stop_id
    and status in ('UPCOMING', 'ARRIVED');

  if not found then
    raise exception 'INVALID_STOP_TRANSITION';
  end if;

  select stop_id into v_next_stop_id
  from trip_stops
  where trip_id = p_trip_id
    and sequence_order = (
      select sequence_order + 1 from trip_stops where trip_id = p_trip_id and stop_id = p_stop_id
    );

  update trips set current_stop_id = coalesce(v_next_stop_id, p_stop_id) where id = p_trip_id;

  select coalesce(sum(passenger_count), 0) into v_alighted_count
  from tickets
  where trip_id = p_trip_id and dest_stop_id = p_stop_id and status = 'VALIDATED';

  update tickets
  set status = 'EXPIRED'
  where trip_id = p_trip_id and dest_stop_id = p_stop_id and status in ('PAID', 'VALIDATED');

  if v_alighted_count > 0 then
    update trip_occupancy
    set current_passenger_count = greatest(0, current_passenger_count - v_alighted_count)
    where trip_id = p_trip_id;
  end if;

  if v_next_stop_id is null then
    update trips set status = 'COMPLETED', ended_at = now() where id = p_trip_id;
  end if;
end;
$$;

grant execute on function depart_stop_and_expire_tickets(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- start_trip: conductor-initiated. Sets trip ACTIVE, seeds trip_occupancy,
-- initializes current_stop_id to the first stop.
-- -----------------------------------------------------------------------------
create or replace function start_trip(p_trip_id uuid)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip trips;
  v_first_stop_id uuid;
  v_capacity int;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select stop_id into v_first_stop_id from trip_stops
  where trip_id = p_trip_id order by sequence_order asc limit 1;

  select b.capacity into v_capacity from trips t join buses b on b.id = t.bus_id where t.id = p_trip_id;

  update trips
  set status = 'ACTIVE', started_at = now(), current_stop_id = v_first_stop_id
  where id = p_trip_id and status = 'SCHEDULED'
  returning * into v_trip;

  if v_trip is null then
    raise exception 'INVALID_TRIP_STATE';
  end if;

  insert into trip_occupancy (trip_id, current_passenger_count, capacity)
  values (p_trip_id, 0, v_capacity)
  on conflict (trip_id) do nothing;

  return v_trip;
end;
$$;

grant execute on function start_trip(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- create_conductor_account: admin-only provisioning RPC. Creates a Supabase
-- Auth user (synthetic email <govt-id>@conductor.internal) via the
-- auth.users table is NOT directly insertable from SQL in hosted Supabase;
-- this must be done through the Supabase Admin API (service role) from a
-- trusted context (Admin PWA calls a small server-side/Edge Function step).
-- This function performs the second half: linking an already-created
-- auth.users id to a conductors row. See supabase/functions/provision-conductor
-- for the auth.users creation step.
-- -----------------------------------------------------------------------------
create or replace function link_conductor_account(
  p_conductor_id uuid,
  p_user_id uuid
)
returns conductors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conductor conductors;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update conductors set user_id = p_user_id where id = p_conductor_id
  returning * into v_conductor;

  update profiles set role = 'conductor' where id = p_user_id;

  return v_conductor;
end;
$$;

grant execute on function link_conductor_account(uuid, uuid) to authenticated;
