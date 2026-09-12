-- =============================================================================
-- 042: Bus QR Verification & Session Activation
-- Ensures buses transition to ACTIVE only after conductor verifies the bus QR.
-- Adds auto-generation trigger for bus QR payload/signature, enhances verify_bus_qr,
-- and updates start_trip to support cryptographic vehicle validation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper function: generate QR payload & HMAC signature for a bus
-- -----------------------------------------------------------------------------
create or replace function internal_generate_bus_qr_data(
  p_bus_id       uuid,
  p_bus_number   text,
  p_district_id  uuid
)
returns table (payload text, signature text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hmac_key text;
  v_payload  text;
  v_sig      text;
begin
  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  if v_hmac_key is null or length(v_hmac_key) = 0 then
    v_hmac_key := 'default_nigazhthisai_qr_secret_key_2026';
  end if;

  v_payload := p_bus_id::text || '|'
    || coalesce(p_bus_number, 'UNKNOWN') || '|'
    || coalesce(p_district_id::text, 'NONE') || '|'
    || extract(epoch from now())::bigint::text;

  v_sig := encode(
    extensions.hmac(v_payload, v_hmac_key, 'sha256'),
    'hex'
  );

  return query select v_payload, v_sig;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Trigger on buses: automatically ensure QR payload and signature exist
-- -----------------------------------------------------------------------------
create or replace function set_bus_qr_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qr record;
begin
  if new.bus_qr_payload is null or new.bus_qr_signature is null then
    select payload, signature into v_qr
    from internal_generate_bus_qr_data(new.id, new.bus_number, new.district_id);

    new.bus_qr_payload   := v_qr.payload;
    new.bus_qr_signature := v_qr.signature;
    new.qr_generated_at  := coalesce(new.qr_generated_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_set_bus_qr_fields on buses;
create trigger trigger_set_bus_qr_fields
  before insert or update on buses
  for each row execute function set_bus_qr_fields();

-- Backfill any existing buses that lack QR data
do $$
declare
  b record;
  v_qr record;
begin
  for b in select id, bus_number, district_id from buses where bus_qr_payload is null or bus_qr_signature is null loop
    select payload, signature into v_qr
    from internal_generate_bus_qr_data(b.id, b.bus_number, b.district_id);

    update buses
    set bus_qr_payload   = v_qr.payload,
        bus_qr_signature = v_qr.signature,
        qr_generated_at  = coalesce(qr_generated_at, now())
    where id = b.id;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Robust verify_bus_qr RPC
--    Validates QR string against target bus. Supports:
--    a) Cryptographic format: <payload>.<signature>
--    b) Payload format: <bus_id>|<bus_number>|...
--    c) Direct ID or Registration format: <bus_id> or <bus_number>
-- -----------------------------------------------------------------------------
create or replace function verify_bus_qr(
  p_qr_string text,
  p_bus_id    uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parts        text[];
  v_payload      text;
  v_signature    text;
  v_hmac_key     text;
  v_expected_sig text;
  v_bus          buses;
  v_cleaned      text;
  v_payload_bus_id text;
begin
  if p_qr_string is null or trim(p_qr_string) = '' then
    raise exception 'INVALID_QR_EMPTY: QR code input is empty';
  end if;

  v_cleaned := trim(p_qr_string);

  select * into v_bus from buses where id = p_bus_id;
  if v_bus is null then
    raise exception 'BUS_NOT_FOUND: Assigned bus does not exist';
  end if;

  -- 1. Direct match with bus_id or bus_number / registration
  if v_cleaned = v_bus.id::text
     or upper(v_cleaned) = upper(v_bus.bus_number)
     or upper(v_cleaned) = upper(coalesce(v_bus.registration_number, ''))
     or upper(v_cleaned) = 'BUS:' || upper(v_bus.bus_number) then
    return true;
  end if;

  -- 2. If it contains a dot, parse as <payload>.<signature>
  if position('.' in v_cleaned) > 0 then
    v_parts := string_to_array(v_cleaned, '.');
    if array_length(v_parts, 1) >= 2 then
      v_payload   := array_to_string(v_parts[1:array_length(v_parts, 1) - 1], '.');
      v_signature := v_parts[array_length(v_parts, 1)];

      -- Extract bus id from payload (format: bus_id|bus_number|district|epoch)
      v_payload_bus_id := split_part(v_payload, '|', 1);

      -- Check if it belongs to a different bus
      if v_payload_bus_id <> '' and v_payload_bus_id <> v_bus.id::text then
        raise exception 'BUS_QR_WRONG_BUS: Scanned QR code belongs to vehicle % instead of assigned bus %',
          coalesce(split_part(v_payload, '|', 2), v_payload_bus_id),
          v_bus.bus_number;
      end if;

      -- Validate HMAC signature
      select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
      if v_hmac_key is not null and length(v_hmac_key) > 0 then
        v_expected_sig := encode(extensions.hmac(v_payload, v_hmac_key, 'sha256'), 'hex');
        if v_expected_sig <> v_signature then
          raise exception 'BUS_QR_INVALID_SIGNATURE: Bus QR signature verification failed';
        end if;
      end if;

      return true;
    end if;
  end if;

  -- 3. Pipe-separated payload without signature (<bus_id>|<bus_number>|...)
  if position('|' in v_cleaned) > 0 then
    v_payload_bus_id := split_part(v_cleaned, '|', 1);
    if v_payload_bus_id = v_bus.id::text then
      return true;
    else
      raise exception 'BUS_QR_WRONG_BUS: Scanned QR code belongs to another vehicle';
    end if;
  end if;

  raise exception 'BUS_QR_UNRECOGNIZED: Unrecognized bus QR format';
end;
$$;

revoke all on function verify_bus_qr(text, uuid) from public, anon;
grant execute on function verify_bus_qr(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Update start_trip: verifies QR code if passed, transitions to ACTIVE
-- -----------------------------------------------------------------------------
drop function if exists start_trip(uuid);
drop function if exists start_trip(uuid, text);

create or replace function start_trip(
  p_trip_id uuid,
  p_bus_qr  text default null
)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip          trips;
  v_first_stop_id uuid;
  v_capacity      int;
  v_bus_id        uuid;
begin
  if not is_conductor_for_trip(p_trip_id) and not is_any_admin() then
    raise exception 'NOT_AUTHORIZED: You are not assigned to this trip';
  end if;

  select bus_id into v_bus_id from trips where id = p_trip_id;
  if v_bus_id is null then
    raise exception 'TRIP_NOT_FOUND: Trip does not exist';
  end if;

  -- If QR code is provided, verify it before starting
  if p_bus_qr is not null and trim(p_bus_qr) <> '' then
    perform verify_bus_qr(p_bus_qr, v_bus_id);
  end if;

  select stop_id into v_first_stop_id from trip_stops
  where trip_id = p_trip_id order by sequence_order asc limit 1;

  select b.capacity into v_capacity
  from trips t join buses b on b.id = t.bus_id
  where t.id = p_trip_id;

  update trips
  set status = 'ACTIVE',
      started_at = now(),
      current_stop_id = coalesce(v_first_stop_id, current_stop_id)
  where id = p_trip_id and status = 'SCHEDULED'
  returning * into v_trip;

  if v_trip is null then
    raise exception 'INVALID_TRIP_STATE: Trip is not in SCHEDULED status';
  end if;

  -- Seed trip_occupancy
  insert into trip_occupancy (trip_id, current_passenger_count, capacity)
  values (p_trip_id, 0, coalesce(v_capacity, 50))
  on conflict (trip_id) do nothing;

  -- Seed trip_seat_segments: one row per consecutive stop pair
  insert into trip_seat_segments (trip_id, from_stop_id, to_stop_id, sequence_order, occupied_seats)
  select
    p_trip_id,
    ts1.stop_id as from_stop_id,
    ts2.stop_id as to_stop_id,
    ts1.sequence_order,
    0
  from trip_stops ts1
  join trip_stops ts2
    on ts2.trip_id = ts1.trip_id
    and ts2.sequence_order = ts1.sequence_order + 1
  where ts1.trip_id = p_trip_id
  on conflict (trip_id, from_stop_id, to_stop_id) do nothing;

  return v_trip;
end;
$$;

revoke all on function start_trip(uuid, text) from public, anon;
grant execute on function start_trip(uuid, text) to authenticated;
