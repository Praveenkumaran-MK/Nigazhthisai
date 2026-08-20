-- =============================================================================
-- 014: (a) materialize a confirmed schedule into a real trip, and
--       (b) close the ticket-purchase capacity gap + lock-order inversion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- confirm_schedule_and_create_trip: previously nothing in the app ever
-- created a `trips` row outside of supabase/seed.sql — the Admin Schedules
-- page created `schedules` rows that nothing consumed, so every conductor's
-- "no trip scheduled" screen only ever worked on the day the seed ran.
-- Admin calls this after picking a conductor for a PLANNED schedule; it
-- creates the trip (SCHEDULED) and copies the route's ordered stops into
-- trip_stops, then marks the schedule CONFIRMED.
-- -----------------------------------------------------------------------------
create or replace function confirm_schedule_and_create_trip(
  p_schedule_id uuid,
  p_conductor_id uuid
)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule schedules;
  v_trip trips;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_schedule from schedules where id = p_schedule_id for update;

  if v_schedule is null then
    raise exception 'SCHEDULE_NOT_FOUND';
  end if;

  if v_schedule.status <> 'PLANNED' then
    raise exception 'SCHEDULE_NOT_PLANNED';
  end if;

  if not exists (select 1 from conductors where id = p_conductor_id and is_active) then
    raise exception 'INVALID_CONDUCTOR';
  end if;

  insert into trips (bus_id, route_id, conductor_id, service_date, status)
  values (v_schedule.bus_id, v_schedule.route_id, p_conductor_id, v_schedule.scheduled_start::date, 'SCHEDULED')
  returning * into v_trip;

  insert into trip_stops (trip_id, stop_id, sequence_order)
  select v_trip.id, rs.stop_id, rs.sequence_order
  from route_stops rs
  where rs.route_id = v_schedule.route_id
  order by rs.sequence_order;

  update schedules set status = 'CONFIRMED' where id = p_schedule_id;

  return v_trip;
end;
$$;

revoke all on function confirm_schedule_and_create_trip(uuid, uuid) from public;
grant execute on function confirm_schedule_and_create_trip(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- create_secure_ticket: replace to (1) add a real capacity check instead of
-- relying on the raw trip_occupancy CHECK constraint to reject overselling
-- at scan time with an unparseable error, and (2) lock trip_stops before
-- trips — matching the lock order depart_stop_and_expire_tickets already
-- uses — instead of the reverse order this function used previously, which
-- could both deadlock under concurrent load and let a purchase read
-- trip_stops as still-UPCOMING microseconds before a conductor's departure
-- commits, selling a ticket for a stop the bus has already left.
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

  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 6 then
    raise exception 'INVALID_PASSENGER_COUNT';
  end if;

  select * into v_config from transport_authority_config limit 1;
  if v_config is null or v_config.is_payments_enabled is not true then
    raise exception 'PAYMENTS_DISABLED: transport authority UPI configuration is missing or disabled';
  end if;

  -- Lock trip_stops BEFORE trips (see header comment on lock ordering).
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

  -- Capacity check: fail with a clean BUS_FULL now rather than letting the
  -- trip_occupancy CHECK constraint reject it later at scan time.
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

revoke all on function create_secure_ticket(uuid, uuid, uuid, int) from public;
grant execute on function create_secure_ticket(uuid, uuid, uuid, int) to authenticated;
