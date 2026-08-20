-- =============================================================================
-- 016: Rate limiting for sensitive RPCs.
--
-- enforce_rate_limit() is a sliding-window counter over rate_limit_events.
-- It is deliberately NOT granted to anon/authenticated directly — every
-- caller derives its own rate-limit key from auth.uid() server-side inside
-- a SECURITY DEFINER function, never from a client-supplied key. Exposing
-- it as a general "pass any key" RPC would let one authenticated user
-- rate-limit-lock another by spamming enforce_rate_limit('their-uid', ...).
-- =============================================================================

create table rate_limit_events (
  key text not null,
  occurred_at timestamptz not null default now()
);
create index rate_limit_events_key_occurred_idx on rate_limit_events (key, occurred_at);
alter table rate_limit_events enable row level security;
-- No policies: only SECURITY DEFINER functions ever touch this table.

create or replace function enforce_rate_limit(p_key text, p_max_events int, p_window interval)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from rate_limit_events
  where key = p_key and occurred_at > now() - p_window;

  if v_count >= p_max_events then
    raise exception 'RATE_LIMITED';
  end if;

  insert into rate_limit_events (key) values (p_key);
end;
$$;
-- Deliberately no grant here — internal helper only, called from other
-- SECURITY DEFINER functions in this schema.

-- -----------------------------------------------------------------------------
-- create_secure_ticket: add a per-passenger-session purchase-attempt limit.
-- Full body otherwise unchanged from migration 014.
-- -----------------------------------------------------------------------------
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
  v_origin_status trip_stop_status;
  v_route_id uuid;
  v_bus_id uuid;
  v_trip_status trip_status;
  v_capacity int;
  v_current_count int;
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

  perform enforce_rate_limit('ticket:' || auth.uid()::text, 10, interval '5 minutes');

  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 6 then
    raise exception 'INVALID_PASSENGER_COUNT';
  end if;

  select * into v_config from transport_authority_config limit 1;
  if v_config is null or v_config.is_payments_enabled is not true then
    raise exception 'PAYMENTS_DISABLED: transport authority UPI configuration is missing or disabled';
  end if;

  select status into v_origin_status
  from trip_stops
  where trip_id = p_trip_id and stop_id = p_origin_stop_id
  for update;

  if v_origin_status is null then
    raise exception 'INVALID_TRIP: origin stop is not on this trip';
  end if;

  if v_origin_status not in ('UPCOMING', 'ARRIVED') then
    raise exception 'ORIGIN_ALREADY_DEPARTED';
  end if;

  select t.route_id, t.bus_id, t.status into v_route_id, v_bus_id, v_trip_status
  from trips t
  where t.id = p_trip_id
  for update;

  if v_route_id is null or v_trip_status <> 'ACTIVE' then
    raise exception 'INVALID_TRIP: trip does not exist or is not active';
  end if;

  select flat_fare_amount into v_fare
  from fare_matrix
  where route_id = v_route_id
    and origin_stop_id = p_origin_stop_id
    and dest_stop_id = p_dest_stop_id;

  if v_fare is null then
    raise exception 'NO_FARE_CONFIGURED: no fare_matrix entry for this origin/destination on this route';
  end if;

  select capacity, current_passenger_count into v_capacity, v_current_count
  from trip_occupancy
  where trip_id = p_trip_id
  for update;

  if v_capacity is not null and v_current_count + p_passenger_count > v_capacity then
    raise exception 'BUS_FULL';
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

revoke execute on function create_secure_ticket(uuid, uuid, uuid, int) from anon;

-- -----------------------------------------------------------------------------
-- validate_ticket: add a per-conductor scan-attempt limit (safety net
-- against a buggy/looping client, not against normal scanning volume).
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
  v_scanned_payload text;
  v_scanned_signature text;
  v_ticket tickets;
  v_hmac_key text;
  v_expected_signature text;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED: caller is not the active conductor for this trip';
  end if;

  perform enforce_rate_limit('validate:' || auth.uid()::text, 60, interval '1 minute');

  v_scanned_payload := split_part(p_qr_payload, '.', 1);
  v_scanned_signature := split_part(p_qr_payload, '.', 2);

  if v_scanned_payload = '' or v_scanned_signature = '' then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  select * into v_ticket from tickets where qr_payload = v_scanned_payload for update;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  if v_scanned_signature <> v_ticket.qr_signature then
    raise exception 'TICKET_SIGNATURE_INVALID';
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

  insert into trip_occupancy (trip_id, current_passenger_count, capacity)
  select p_trip_id, v_ticket.passenger_count, b.capacity
  from trips t join buses b on b.id = t.bus_id
  where t.id = p_trip_id
  on conflict (trip_id) do update
    set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;

  return v_ticket;
end;
$$;

revoke execute on function validate_ticket(text, uuid) from anon;

-- -----------------------------------------------------------------------------
-- check_provisioning_rate_limit: called by the provision-conductor Edge
-- Function (via the admin's own scoped client, BEFORE it touches the
-- service-role client) — 20 conductor accounts per admin per hour. Exposed
-- as its own narrow RPC (rather than exposing enforce_rate_limit directly)
-- because the key is always self-derived from auth.uid(), never client-
-- supplied, so granting it to `authenticated` is safe.
-- -----------------------------------------------------------------------------
create or replace function check_provisioning_rate_limit()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  perform enforce_rate_limit('provision:' || auth.uid()::text, 20, interval '1 hour');
end;
$$;

revoke all on function check_provisioning_rate_limit() from anon, authenticated;
grant execute on function check_provisioning_rate_limit() to authenticated;

-- -----------------------------------------------------------------------------
-- find_nearest_stop / list_eligible_buses: coarser limits since these are
-- legitimately called often by normal UI interaction (search, live map).
-- Only rate-limited when auth.uid() is present (the passenger app always
-- establishes an anonymous session before calling these — see
-- ensurePassengerSession() — so this covers the real traffic pattern; a
-- call with no session at all is a defensive no-op here, not a loophole:
-- IP-based limiting for that edge case belongs at the CDN/edge layer, not
-- inside a stateless SQL function with no IP visibility).
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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    perform enforce_rate_limit('nearest-stop:' || auth.uid()::text, 60, interval '1 minute');
  end if;

  return query
  select
    s.id as stop_id,
    s.name,
    s.code,
    s.district,
    st_distance(s.location, st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography) as distance_meters
  from stops s
  order by s.location <-> st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography
  limit greatest(1, least(p_limit, 20));
end;
$$;

revoke all on function find_nearest_stop(double precision, double precision, int) from anon, authenticated;
grant execute on function find_nearest_stop(double precision, double precision, int) to anon, authenticated;

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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    perform enforce_rate_limit('eligible-buses:' || auth.uid()::text, 60, interval '1 minute');
  end if;

  return query
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
    and ts_origin.status in ('UPCOMING', 'ARRIVED')
  order by b.bus_number;
end;
$$;

revoke all on function list_eligible_buses(uuid, uuid) from anon, authenticated;
grant execute on function list_eligible_buses(uuid, uuid) to anon, authenticated;
