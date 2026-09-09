-- =============================================================================
-- 038: Fix generate_passenger_cash_ticket Record Field Error
--
-- Fixes "record v_trip has no field capacity" by cleanly querying buses table
-- for bus capacity and inserting with proper column alignments.
-- Drops all conflicting overloads and creates a single unified RPC.
-- =============================================================================

-- Drop existing overloads to avoid signature ambiguity
drop function if exists public.generate_passenger_cash_ticket(uuid, uuid, uuid, int, text);
drop function if exists public.generate_passenger_cash_ticket(uuid, uuid, uuid, numeric, int, text);

create or replace function public.generate_passenger_cash_ticket(
  p_trip_id          uuid,
  p_origin_stop_id   uuid,
  p_dest_stop_id     uuid,
  p_passenger_count  int  default 1,
  p_concession_type  text default 'NORMAL',
  p_fare_amount      numeric default null,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conductor_id   uuid;
  v_trip           public.trips%rowtype;
  v_bus            public.buses%rowtype;
  v_capacity       int := 40;
  v_origin_seq     int;
  v_dest_seq       int;
  v_fare_per_pax   numeric(10, 2);
  v_discount_pct   numeric(5, 2) := 0.00;
  v_discount_amt   numeric(10, 2) := 0.00;
  v_total_fare     numeric(10, 2);
  v_pnr            text;
  v_ticket         public.tickets%rowtype;
  v_qr_payload     text;
  v_qr_signature   text;
  v_existing       public.tickets%rowtype;
begin
  if not is_conductor() and not is_any_admin() then
    raise exception 'FORBIDDEN: Only active conductors or administrators can issue cash tickets';
  end if;

  v_conductor_id := current_conductor_id();

  -- 1. Idempotency Check
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select * into v_existing
    from public.tickets
    where idempotency_key = trim(p_idempotency_key);

    if found then
      return jsonb_build_object(
        'ticket_id',        v_existing.id,
        'pnr',              v_existing.pnr,
        'fare',             v_existing.total_fare,
        'passenger_count',  v_existing.passenger_count,
        'concession_type',  v_existing.concession_type,
        'qr_payload',       v_existing.qr_payload,
        'qr_signature',     v_existing.qr_signature,
        'status',           v_existing.status,
        'created_at',       v_existing.created_at,
        'is_duplicate',     true
      );
    end if;
  end if;

  -- 2. Fetch Trip
  select * into v_trip
  from public.trips
  where id = p_trip_id;

  if v_trip.id is null then
    raise exception 'NOT_FOUND: Trip % not found', p_trip_id;
  end if;

  -- 3. Fetch Bus & Capacity safely
  select * into v_bus
  from public.buses
  where id = v_trip.bus_id;

  if v_bus.id is not null and v_bus.capacity is not null then
    v_capacity := v_bus.capacity;
  end if;

  -- 4. Stop sequence ordering
  select sequence_order into v_origin_seq
  from public.trip_stops
  where trip_id = p_trip_id and stop_id = p_origin_stop_id;

  select sequence_order into v_dest_seq
  from public.trip_stops
  where trip_id = p_trip_id and stop_id = p_dest_stop_id;

  if v_origin_seq is null then
    select sequence_order into v_origin_seq
    from public.route_stops
    where route_id = v_trip.route_id and stop_id = p_origin_stop_id;
  end if;

  if v_dest_seq is null then
    select sequence_order into v_dest_seq
    from public.route_stops
    where route_id = v_trip.route_id and stop_id = p_dest_stop_id;
  end if;

  if v_origin_seq is not null and v_dest_seq is not null and v_origin_seq >= v_dest_seq then
    raise exception 'INVALID_STOPS: Destination stop must be after origin stop';
  end if;

  -- 5. Fare Calculation
  if p_fare_amount is not null and p_fare_amount > 0 then
    v_fare_per_pax := p_fare_amount / greatest(coalesce(p_passenger_count, 1), 1);
  else
    select public.calculate_fare(v_trip.route_id, p_origin_stop_id, p_dest_stop_id)
    into v_fare_per_pax;

    if v_fare_per_pax is null or v_fare_per_pax <= 0 then
      v_fare_per_pax := 20.00;
    end if;
  end if;

  case upper(coalesce(p_concession_type, 'NORMAL'))
    when 'STUDENT'         then v_discount_pct := 0.50;
    when 'SENIOR_CITIZEN'  then v_discount_pct := 0.50;
    when 'MONTHLY_PASS'    then v_discount_pct := 0.75;
    when 'FREEDOM_FIGHTER' then v_discount_pct := 1.00;
    else                        v_discount_pct := 0.00;
  end case;

  v_total_fare := round((v_fare_per_pax * coalesce(p_passenger_count, 1)) * (1.0 - v_discount_pct), 2);
  v_discount_amt := round((v_fare_per_pax * coalesce(p_passenger_count, 1)) * v_discount_pct, 2);

  -- 6. PNR and Cryptographic QR Tokens
  loop
    v_pnr := 'ETM' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.tickets where pnr = v_pnr);
  end loop;

  v_qr_payload := encode(extensions.gen_random_bytes(24), 'base64');
  v_qr_signature := encode(
    extensions.hmac(v_qr_payload || '|' || p_trip_id::text, 'nigazhthisai-hmac-sha256-secret-key-production-hardening-2026', 'sha256'),
    'hex'
  );

  -- 7. Reserve seat segment counts
  if v_origin_seq is not null and v_dest_seq is not null then
    update public.trip_seat_segments
    set occupied_seats = occupied_seats + coalesce(p_passenger_count, 1)
    where trip_id = p_trip_id
      and sequence_order >= v_origin_seq
      and sequence_order < v_dest_seq;
  end if;

  -- 8. Insert Ticket Record
  insert into public.tickets (
    passenger_session_id,
    bus_id,
    trip_id,
    origin_stop_id,
    dest_stop_id,
    passenger_count,
    total_fare,
    qr_payload,
    qr_signature,
    status,
    district_id,
    concession_type,
    discount_amount,
    payment_method,
    pnr,
    channel,
    created_by_conductor_id,
    idempotency_key,
    is_validated,
    validated_at,
    expires_at
  ) values (
    gen_random_uuid(),
    v_trip.bus_id,
    p_trip_id,
    p_origin_stop_id,
    p_dest_stop_id,
    coalesce(p_passenger_count, 1),
    v_total_fare,
    v_qr_payload,
    v_qr_signature,
    'VALIDATED',
    v_trip.district_id,
    upper(coalesce(p_concession_type, 'NORMAL')),
    v_discount_amt,
    'CASH',
    v_pnr,
    'CONDUCTOR_POS',
    v_conductor_id,
    p_idempotency_key,
    true,
    now(),
    now() + interval '24 hours'
  )
  returning * into v_ticket;

  return jsonb_build_object(
    'ticket_id',        v_ticket.id,
    'pnr',              v_ticket.pnr,
    'fare',             v_ticket.total_fare,
    'passenger_count',  v_ticket.passenger_count,
    'concession_type',  v_ticket.concession_type,
    'qr_payload',       v_ticket.qr_payload,
    'qr_signature',     v_ticket.qr_signature,
    'status',           v_ticket.status,
    'created_at',       v_ticket.created_at,
    'is_duplicate',     false
  );
end;
$$;

grant execute on function public.generate_passenger_cash_ticket(uuid, uuid, uuid, int, text, numeric, text) to authenticated;
