-- =============================================================================
-- 027: Concession types on tickets + Trip ratings by passengers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add concession_type to tickets table
--    Discount is applied at the RPC level; stored here for audit/reporting.
-- -----------------------------------------------------------------------------
alter table tickets
  add column if not exists concession_type text
    default 'NORMAL'
    check (concession_type in (
      'NORMAL',
      'STUDENT',
      'SENIOR_CITIZEN',
      'FREEDOM_FIGHTER',
      'MONTHLY_PASS'
    ));

-- Concession discount percentages (authoritative; checked server-side)
-- NORMAL          → 0%   (full fare)
-- STUDENT         → 50%
-- SENIOR_CITIZEN  → 50%
-- FREEDOM_FIGHTER → 100% (free, but ticket still issued for boarding record)
-- MONTHLY_PASS    → 75%  (heavily discounted; requires separate pass validation in prod)

-- -----------------------------------------------------------------------------
-- 2. Trip ratings table
--    Passengers can rate a trip (1–5 stars) after the ticket expires.
--    One rating per passenger session per trip (unique constraint).
-- -----------------------------------------------------------------------------
create table if not exists trip_ratings (
  id                   uuid        primary key default gen_random_uuid(),
  ticket_id            uuid        not null references tickets (id) on delete cascade,
  trip_id              uuid        not null references trips   (id) on delete cascade,
  passenger_session_id uuid        not null,
  rating               int         not null check (rating between 1 and 5),
  comment              text,
  created_at           timestamptz not null default now(),
  -- One rating per anonymous session per trip
  unique (passenger_session_id, trip_id)
);

create index if not exists idx_trip_ratings_trip on trip_ratings (trip_id);
create index if not exists idx_trip_ratings_session on trip_ratings (passenger_session_id);

alter table trip_ratings enable row level security;

-- Passenger inserts their own rating
create policy trip_ratings_passenger_insert on trip_ratings
  for insert with check (passenger_session_id = auth.uid());

-- Passenger reads their own ratings
create policy trip_ratings_passenger_read on trip_ratings
  for select using (passenger_session_id = auth.uid());

-- Admin reads all ratings
create policy trip_ratings_admin_read on trip_ratings
  for select using (is_any_admin());

-- Realtime for admin dashboard average rating updates
alter publication supabase_realtime add table trip_ratings;

-- -----------------------------------------------------------------------------
-- 3. rate_trip RPC — called by the passenger app after trip completion.
--    Validates the ticket belongs to the caller and is in EXPIRED/VALIDATED status.
-- -----------------------------------------------------------------------------
create or replace function rate_trip(
  p_ticket_id uuid,
  p_rating    int,
  p_comment   text default null
)
returns trip_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket  tickets;
  v_row     trip_ratings;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING: must be between 1 and 5';
  end if;

  select * into v_ticket
  from tickets
  where id = p_ticket_id
    and passenger_session_id = auth.uid();

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND: ticket does not exist or does not belong to you';
  end if;

  if v_ticket.status not in ('EXPIRED', 'VALIDATED') then
    raise exception 'TICKET_NOT_ELIGIBLE: can only rate expired or validated tickets';
  end if;

  insert into trip_ratings (
    ticket_id, trip_id, passenger_session_id, rating, comment
  ) values (
    p_ticket_id, v_ticket.trip_id, auth.uid(), p_rating, p_comment
  )
  on conflict (passenger_session_id, trip_id)
    do update set rating = p_rating, comment = p_comment
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function rate_trip(uuid, int, text) from public, anon, authenticated;
grant  execute on function rate_trip(uuid, int, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Update create_secure_ticket to accept + apply concession discount
--    Drops old signature and recreates with concession_type parameter.
-- -----------------------------------------------------------------------------
create or replace function create_secure_ticket(
  p_trip_id         uuid,
  p_origin_stop_id  uuid,
  p_dest_stop_id    uuid,
  p_passenger_count int    default 1,
  p_concession_type text   default 'NORMAL'
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id      uuid;
  v_bus_id        uuid;
  v_district_id   uuid;
  v_base_fare     numeric(10, 2);
  v_discount_pct  numeric(5, 2);
  v_final_fare    numeric(10, 2);
  v_hmac_key      text;
  v_qr_payload    text;
  v_qr_signature  text;
  v_ticket        tickets;
  v_config        transport_authority_config;
  v_pnr           text;
  v_conc          text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: an anonymous session is required to purchase a ticket';
  end if;

  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 6 then
    raise exception 'INVALID_PASSENGER_COUNT';
  end if;

  -- Validate concession type
  v_conc := coalesce(p_concession_type, 'NORMAL');
  if v_conc not in ('NORMAL','STUDENT','SENIOR_CITIZEN','FREEDOM_FIGHTER','MONTHLY_PASS') then
    raise exception 'INVALID_CONCESSION_TYPE';
  end if;

  select * into v_config from transport_authority_config limit 1;
  if v_config is null or v_config.is_payments_enabled is not true then
    raise exception 'PAYMENTS_DISABLED: transport authority UPI configuration is missing or disabled';
  end if;

  select t.route_id, t.bus_id, b.district_id
  into v_route_id, v_bus_id, v_district_id
  from trips t
  join buses b on b.id = t.bus_id
  where t.id = p_trip_id and t.status = 'ACTIVE'
  for update;

  if v_route_id is null then
    raise exception 'INVALID_TRIP: trip does not exist or is not active';
  end if;

  if not exists (
    select 1 from trip_stops
    where trip_id = p_trip_id and stop_id = p_origin_stop_id
      and status in ('UPCOMING', 'ARRIVED')
  ) then
    raise exception 'ORIGIN_ALREADY_DEPARTED';
  end if;

  select flat_fare_amount into v_base_fare
  from fare_matrix
  where route_id = v_route_id
    and origin_stop_id = p_origin_stop_id
    and dest_stop_id = p_dest_stop_id;

  if v_base_fare is null then
    raise exception 'NO_FARE_CONFIGURED: no fare_matrix entry for this origin/destination on this route';
  end if;

  -- Apply concession discount
  v_discount_pct := case v_conc
    when 'STUDENT'         then 0.50
    when 'SENIOR_CITIZEN'  then 0.50
    when 'FREEDOM_FIGHTER' then 1.00
    when 'MONTHLY_PASS'    then 0.75
    else 0.00
  end;

  v_final_fare := round(v_base_fare * (1.0 - v_discount_pct), 2);

  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  if v_hmac_key is null then
    raise exception 'SERVER_MISCONFIGURED: missing ticket signing key';
  end if;

  v_pnr := 'NIG-' || to_char(now(), 'YYYYMMDD') || '-'
            || upper(substring(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));

  v_qr_payload   := encode(extensions.gen_random_bytes(24), 'base64');
  v_qr_signature := encode(
    extensions.hmac(v_qr_payload || '|' || p_trip_id::text, v_hmac_key, 'sha256'),
    'hex'
  );

  insert into tickets (
    passenger_session_id, bus_id, trip_id, origin_stop_id, dest_stop_id,
    passenger_count, total_fare, qr_payload, qr_signature, status,
    expires_at, channel, pnr, district_id, concession_type
  ) values (
    auth.uid(), v_bus_id, p_trip_id, p_origin_stop_id, p_dest_stop_id,
    p_passenger_count, v_final_fare * p_passenger_count, v_qr_payload, v_qr_signature,
    'PAID', now() + interval '4 hours', 'APP', v_pnr, v_district_id, v_conc
  )
  returning * into v_ticket;

  return v_ticket;
end;
$$;

-- Re-grant (old 4-arg signature is still valid; new 5-arg is added)
revoke all on function create_secure_ticket(uuid, uuid, uuid, int, text) from public, anon, authenticated;
grant  execute on function create_secure_ticket(uuid, uuid, uuid, int, text) to authenticated;

-- Also allow calling with old 4-arg signature (backward compat via default param)
grant  execute on function create_secure_ticket(uuid, uuid, uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'tickets' and column_name = 'concession_type'
  ) then
    raise exception 'MIGRATION 027 FAILED: tickets.concession_type not found';
  end if;

  if not exists (
    select 1 from information_schema.tables where table_name = 'trip_ratings'
  ) then
    raise exception 'MIGRATION 027 FAILED: trip_ratings table not found';
  end if;

  raise notice 'MIGRATION 027 OK — concession types + trip ratings applied';
end;
$$;
