-- =============================================================================
-- 039: Dedicated calculate_fare Function & Robust Cash Ticket Generator
--
-- 1. Creates calculate_fare(route_id, origin_stop_id, dest_stop_id) with
--    fare_matrix lookup and distance/hop fallback so it NEVER fails.
-- 2. Hardens generate_passenger_cash_ticket with automatic stop ordering
--    and bidirectional sequence tolerance.
-- =============================================================================

-- 1. Create calculate_fare RPC
create or replace function public.calculate_fare(
  p_route_id uuid,
  p_origin_stop_id uuid,
  p_dest_stop_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fare numeric(10, 2);
  v_seq_from int;
  v_seq_to int;
  v_num_stops int;
begin
  if p_origin_stop_id is null or p_dest_stop_id is null then
    return 15.00;
  end if;

  if p_origin_stop_id = p_dest_stop_id then
    return 10.00;
  end if;

  -- 1. Explicit fare_matrix forward lookup
  select flat_fare_amount into v_fare
  from public.fare_matrix
  where route_id = p_route_id
    and origin_stop_id = p_origin_stop_id
    and dest_stop_id = p_dest_stop_id;

  if v_fare is not null and v_fare > 0 then
    return v_fare;
  end if;

  -- 2. Explicit fare_matrix reverse lookup
  select flat_fare_amount into v_fare
  from public.fare_matrix
  where route_id = p_route_id
    and origin_stop_id = p_dest_stop_id
    and dest_stop_id = p_origin_stop_id;

  if v_fare is not null and v_fare > 0 then
    return v_fare;
  end if;

  -- 3. Calculate from route_stops sequence hop distance
  select sequence_order into v_seq_from
  from public.route_stops
  where route_id = p_route_id and stop_id = p_origin_stop_id;

  select sequence_order into v_seq_to
  from public.route_stops
  where route_id = p_route_id and stop_id = p_dest_stop_id;

  if v_seq_from is not null and v_seq_to is not null then
    v_num_stops := abs(v_seq_to - v_seq_from);
    -- Standard stage fare: Rs 10 base + Rs 5 per additional stage
    return greatest(10.00, least(10.00 + (v_num_stops * 5.00), 80.00));
  end if;

  -- Default fallback standard fare
  return 15.00;
end;
$$;

grant execute on function public.calculate_fare(uuid, uuid, uuid) to anon, authenticated;

-- 2. Hardened generate_passenger_cash_ticket
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
  v_actual_origin  uuid := p_origin_stop_id;
  v_actual_dest    uuid := p_dest_stop_id;
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

  -- 3. Fetch Bus & Capacity
  select * into v_bus
  from public.buses
  where id = v_trip.bus_id;

  if v_bus.id is not null and v_bus.capacity is not null then
    v_capacity := v_bus.capacity;
  end if;

  -- 4. Stop sequence ordering & automatic bidirectional tolerance
  select sequence_order into v_origin_seq
  from public.trip_stops
  where trip_id = p_trip_id and stop_id = v_actual_origin;

  select sequence_order into v_dest_seq
  from public.trip_stops
  where trip_id = p_trip_id and stop_id = v_actual_dest;

  if v_origin_seq is null then
    select sequence_order into v_origin_seq
    from public.route_stops
    where route_id = v_trip.route_id and stop_id = v_actual_origin;
  end if;

  if v_dest_seq is null then
    select sequence_order into v_dest_seq
    from public.route_stops
    where route_id = v_trip.route_id and stop_id = v_actual_dest;
  end if;

  -- If conductor selected stops in reverse order, swap them safely
  if v_origin_seq is not null and v_dest_seq is not null and v_origin_seq > v_dest_seq then
    declare
      v_tmp_stop uuid := v_actual_origin;
      v_tmp_seq  int  := v_origin_seq;
    begin
      v_actual_origin := v_actual_dest;
      v_actual_dest   := v_tmp_stop;
      v_origin_seq    := v_dest_seq;
      v_dest_seq      := v_tmp_seq;
    end;
  end if;

  -- 5. Calculate Fare
  if p_fare_amount is not null and p_fare_amount > 0 then
    v_fare_per_pax := p_fare_amount / greatest(coalesce(p_passenger_count, 1), 1);
  else
    v_fare_per_pax := public.calculate_fare(v_trip.route_id, v_actual_origin, v_actual_dest);
  end if;

  case upper(coalesce(p_concession_type, 'NORMAL'))
    when 'STUDENT'         then v_discount_pct := 0.50;
    when 'SENIOR'          then v_discount_pct := 0.50;
    when 'SENIOR_CITIZEN'  then v_discount_pct := 0.50;
    when 'MONTHLY_PASS'    then v_discount_pct := 0.75;
    when 'FREEDOM_FIGHTER' then v_discount_pct := 1.00;
    else                        v_discount_pct := 0.00;
  end case;

  v_total_fare := round((v_fare_per_pax * coalesce(p_passenger_count, 1)) * (1.0 - v_discount_pct), 2);
  v_discount_amt := round((v_fare_per_pax * coalesce(p_passenger_count, 1)) * v_discount_pct, 2);

  -- 6. PNR and HMAC QR Generation
  loop
    v_pnr := 'ETM' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.tickets where pnr = v_pnr);
  end loop;

  v_qr_payload := encode(extensions.gen_random_bytes(24), 'base64');
  v_qr_signature := encode(
    extensions.hmac(v_qr_payload || '|' || p_trip_id::text, 'nigazhthisai-hmac-sha256-secret-key-production-hardening-2026', 'sha256'),
    'hex'
  );

  -- 7. Reserve seat counts
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
    v_actual_origin,
    v_actual_dest,
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
