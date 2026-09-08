-- =============================================================================
-- 024: Core business RPCs for Phase 2 features
-- Adds: issue_cash_ticket, generate_bus_qr, verify_bus_qr, file_complaint,
--       PNR generation in create_secure_ticket, ETM devices table.
-- Also updates create_secure_ticket to generate PNR and ticket.channel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ETM Devices table
-- -----------------------------------------------------------------------------
create table if not exists etm_devices (
  id                   uuid        primary key default gen_random_uuid(),
  device_serial        text        not null unique,
  assigned_bus_id      uuid        references buses (id) on delete set null,
  assigned_conductor_id uuid       references conductors (id) on delete set null,
  district_id          uuid        references districts (id) on delete set null,
  status               text        not null default 'ACTIVE'
                                     check (status in ('ACTIVE','OFFLINE','CHARGING','FAULTY')),
  battery_level        int         check (battery_level between 0 and 100),
  last_synced_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger etm_devices_set_updated_at
  before update on etm_devices
  for each row execute function set_updated_at();

create index if not exists idx_etm_district  on etm_devices (district_id);
create index if not exists idx_etm_bus       on etm_devices (assigned_bus_id);

alter table etm_devices enable row level security;
create policy etm_admin_all on etm_devices
  for all using (is_any_admin()) with check (is_any_admin());
-- Conductor reads their own ETM
create policy etm_conductor_read on etm_devices
  for select using (
    assigned_conductor_id = current_conductor_id()
  );

-- -----------------------------------------------------------------------------
-- 2. Update create_secure_ticket: add PNR generation + channel + district_id
-- -----------------------------------------------------------------------------
create or replace function create_secure_ticket(
  p_trip_id         uuid,
  p_origin_stop_id  uuid,
  p_dest_stop_id    uuid,
  p_passenger_count int default 1
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id    uuid;
  v_bus_id      uuid;
  v_district_id uuid;
  v_fare        numeric(10, 2);
  v_hmac_key    text;
  v_qr_payload  text;
  v_qr_signature text;
  v_ticket      tickets;
  v_config      transport_authority_config;
  v_pnr         text;
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

  -- Generate PNR: NIG-YYYYMMDD-XXXXXX (human-readable, unique)
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
    expires_at, channel, pnr, district_id
  ) values (
    auth.uid(), v_bus_id, p_trip_id, p_origin_stop_id, p_dest_stop_id,
    p_passenger_count, v_fare * p_passenger_count, v_qr_payload, v_qr_signature,
    'PAID', now() + interval '4 hours', 'APP', v_pnr, v_district_id
  )
  returning * into v_ticket;

  return v_ticket;
end;
$$;

revoke all on function create_secure_ticket(uuid, uuid, uuid, int) from public, anon, authenticated;
grant  execute on function create_secure_ticket(uuid, uuid, uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. issue_cash_ticket: conductor issues a physical cash ticket
--    Ticket is immediately VALIDATED (cash passenger is already on the bus).
--    Does NOT require payment gateway — fare collected physically.
-- -----------------------------------------------------------------------------
create or replace function issue_cash_ticket(
  p_trip_id         uuid,
  p_origin_stop_id  uuid,
  p_dest_stop_id    uuid,
  p_passenger_count int default 1
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id     uuid;
  v_bus_id       uuid;
  v_district_id  uuid;
  v_fare         numeric(10, 2);
  v_capacity     int;
  v_occupied     int;
  v_ticket       tickets;
  v_pnr          text;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_passenger_count < 1 or p_passenger_count > 10 then
    raise exception 'INVALID_PASSENGER_COUNT';
  end if;

  select t.route_id, t.bus_id, b.capacity, b.district_id
  into v_route_id, v_bus_id, v_capacity, v_district_id
  from trips t
  join buses b on b.id = t.bus_id
  where t.id = p_trip_id and t.status = 'ACTIVE'
  for update;

  if v_route_id is null then
    raise exception 'INVALID_TRIP';
  end if;

  -- Check capacity
  select current_passenger_count into v_occupied
  from trip_occupancy where trip_id = p_trip_id for update;

  v_occupied := coalesce(v_occupied, 0);

  if (v_occupied + p_passenger_count) > v_capacity then
    raise exception 'BUS_FULL';
  end if;

  select flat_fare_amount into v_fare
  from fare_matrix
  where route_id = v_route_id
    and origin_stop_id = p_origin_stop_id
    and dest_stop_id = p_dest_stop_id;

  if v_fare is null then
    raise exception 'NO_FARE_CONFIGURED';
  end if;

  -- Cash tickets use a CASH- prefix PNR for easy identification
  v_pnr := 'CASH-' || to_char(now(), 'YYYYMMDD') || '-'
            || upper(substring(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));

  -- Cash tickets start as VALIDATED immediately (no QR needed)
  insert into tickets (
    passenger_session_id, bus_id, trip_id, origin_stop_id, dest_stop_id,
    passenger_count, total_fare, qr_payload, qr_signature, status,
    expires_at, channel, pnr, district_id, validated_at
  ) values (
    auth.uid(), v_bus_id, p_trip_id, p_origin_stop_id, p_dest_stop_id,
    p_passenger_count, v_fare * p_passenger_count,
    -- Cash tickets have no QR; store placeholder to satisfy NOT NULL if any
    'CASH-' || gen_random_uuid()::text, '', 'VALIDATED',
    now() + interval '12 hours', 'CASH', v_pnr, v_district_id, now()
  )
  returning * into v_ticket;

  -- Immediately increment occupancy
  insert into trip_occupancy (trip_id, current_passenger_count, capacity)
  values (p_trip_id, p_passenger_count, v_capacity)
  on conflict (trip_id) do update
    set current_passenger_count = trip_occupancy.current_passenger_count + p_passenger_count;

  return v_ticket;
end;
$$;

revoke all on function issue_cash_ticket(uuid, uuid, uuid, int) from public, anon, authenticated;
grant  execute on function issue_cash_ticket(uuid, uuid, uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. generate_bus_qr: admin generates a cryptographic bus identity QR.
--    The QR payload encodes bus_id + registration + district so the conductor
--    ETM can confirm it's on the right bus before starting a trip.
-- -----------------------------------------------------------------------------
create or replace function generate_bus_qr(p_bus_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus         buses;
  v_hmac_key    text;
  v_payload     text;
  v_signature   text;
begin
  if not is_any_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_bus from buses where id = p_bus_id;
  if v_bus is null then
    raise exception 'BUS_NOT_FOUND';
  end if;

  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';

  -- Payload: bus_id|registration|district_id|generated_at_epoch
  v_payload := v_bus.id::text || '|'
    || coalesce(v_bus.bus_number, 'UNKNOWN') || '|'
    || coalesce(v_bus.district_id::text, 'NONE') || '|'
    || extract(epoch from now())::bigint::text;

  v_signature := encode(
    extensions.hmac(v_payload, v_hmac_key, 'sha256'),
    'hex'
  );

  update buses
  set bus_qr_payload    = v_payload,
      bus_qr_signature  = v_signature,
      qr_generated_at   = now()
  where id = p_bus_id;

  return jsonb_build_object(
    'bus_id',       p_bus_id,
    'qr_payload',   v_payload,
    'qr_signature', v_signature,
    'qr_string',    v_payload || '.' || v_signature,
    'generated_at', now()
  );
end;
$$;

revoke all on function generate_bus_qr(uuid) from public, anon, authenticated;
grant  execute on function generate_bus_qr(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. verify_bus_qr: conductor scans bus QR before starting trip
-- -----------------------------------------------------------------------------
create or replace function verify_bus_qr(
  p_qr_string text,   -- format: <payload>.<signature>
  p_bus_id    uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parts      text[];
  v_payload    text;
  v_signature  text;
  v_hmac_key   text;
  v_expected   text;
  v_bus        buses;
begin
  if not is_conductor() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_parts     := string_to_array(p_qr_string, '.');
  if array_length(v_parts, 1) < 2 then
    raise exception 'INVALID_QR_FORMAT';
  end if;

  v_payload   := array_to_string(v_parts[1:array_length(v_parts,1)-1], '.');
  v_signature := v_parts[array_length(v_parts, 1)];

  select * into v_bus from buses where id = p_bus_id;
  if v_bus is null then
    raise exception 'BUS_NOT_FOUND';
  end if;

  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';

  v_expected := encode(
    extensions.hmac(v_payload, v_hmac_key, 'sha256'),
    'hex'
  );

  if v_expected <> v_signature then
    raise exception 'BUS_QR_INVALID_SIGNATURE';
  end if;

  -- Check the payload starts with this bus's id
  if not v_payload like v_bus.id::text || '|%' then
    raise exception 'BUS_QR_WRONG_BUS';
  end if;

  return true;
end;
$$;

revoke all on function verify_bus_qr(text, uuid) from public, anon, authenticated;
grant  execute on function verify_bus_qr(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. file_complaint: passenger files a complaint (rate-limited)
-- -----------------------------------------------------------------------------
create or replace function file_complaint(
  p_trip_id   uuid,
  p_type      text,
  p_description text default null
)
returns complaints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_complaint complaints;
  v_bus_id    uuid;
  v_district_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_type not in ('CLEANLINESS','DRIVER_BEHAVIOR','OVERCROWDING','SAFETY','OVERCHARGING','OTHER') then
    raise exception 'INVALID_COMPLAINT_TYPE';
  end if;

  -- Rate limit: max 3 complaints per 24 hours per anonymous session
  if (
    select count(*) from complaints
    where passenger_id = auth.uid()
      and created_at > now() - interval '24 hours'
  ) >= 3 then
    raise exception 'RATE_LIMITED: max 3 complaints per 24 hours';
  end if;

  -- Get bus/district context from the trip
  select t.bus_id, b.district_id
  into v_bus_id, v_district_id
  from trips t join buses b on b.id = t.bus_id
  where t.id = p_trip_id;

  insert into complaints (
    trip_id, bus_id, district_id, passenger_id, type, description, status
  ) values (
    p_trip_id, v_bus_id, v_district_id, auth.uid(), p_type, p_description, 'OPEN'
  )
  returning * into v_complaint;

  return v_complaint;
end;
$$;

revoke all on function file_complaint(uuid, text, text) from public, anon, authenticated;
grant  execute on function file_complaint(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Verification
-- -----------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('authenticated', 'issue_cash_ticket(uuid, uuid, uuid, int)', 'execute') then
    raise exception 'MIGRATION 024 GRANT CHECK FAILED: issue_cash_ticket';
  end if;
  if not has_function_privilege('authenticated', 'generate_bus_qr(uuid)', 'execute') then
    raise exception 'MIGRATION 024 GRANT CHECK FAILED: generate_bus_qr';
  end if;
  if not has_function_privilege('authenticated', 'verify_bus_qr(text, uuid)', 'execute') then
    raise exception 'MIGRATION 024 GRANT CHECK FAILED: verify_bus_qr';
  end if;
  if not has_function_privilege('authenticated', 'file_complaint(uuid, text, text)', 'execute') then
    raise exception 'MIGRATION 024 GRANT CHECK FAILED: file_complaint';
  end if;
  raise notice 'MIGRATION 024 OK — cash ticketing, bus QR, complaints, ETM applied';
end;
$$;
