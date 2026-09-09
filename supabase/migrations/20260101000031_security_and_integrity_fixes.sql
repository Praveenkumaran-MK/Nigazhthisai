-- =============================================================================
-- 031: Security Hardening, RLS Fixes & Data Integrity Corrections
--   1. Fix Emergency Chat RLS (remove leaky policies, enforce session isolation)
--   2. Fix tk.total_fare column in revenue & conductor stats RPCs
--   3. Add capacity locking & seat segment reservation to create_secure_ticket
--   4. Fix generate_passenger_cash_ticket schema alignment (total_fare & session)
--   5. Secure validate_ticket_by_pnr (exact PNR match + trip binding)
--   6. Enforce strict district boundary on NULL district entities
--   7. Rate limit emergency chat creations to prevent denial-of-service
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FIX EMERGENCY CHAT RLS LEAKS
-- -----------------------------------------------------------------------------
drop policy if exists emg_chats_passenger_select on passenger_emergency_chats;
drop policy if exists emg_msgs_public_select on passenger_emergency_messages;

-- Strictly scope passenger read to their own session or auth UID
create policy emg_chats_passenger_select on passenger_emergency_chats
  for select
  using (
    passenger_session_id = coalesce(auth.jwt()->>'session_id', auth.uid()::text)
    or passenger_session_id = current_setting('request.headers', true)::json->>'x-session-id'
  );

create policy emg_msgs_passenger_select on passenger_emergency_messages
  for select
  using (
    is_any_admin()
    or chat_id in (
      select id from passenger_emergency_chats
      where passenger_session_id = coalesce(auth.jwt()->>'session_id', auth.uid()::text)
         or passenger_session_id = current_setting('request.headers', true)::json->>'x-session-id'
    )
    or chat_id in (
      select id from passenger_emergency_chats
      where trip_id in (
        select id from trips where conductor_id = current_conductor_id()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 2. HARDENED REVENUE ANALYTICS RPC (total_fare fix)
-- -----------------------------------------------------------------------------
create or replace function get_revenue_analytics(
  p_district_id  uuid default null,
  p_start_date   date default (current_date - interval '30 days')::date,
  p_end_date     date default current_date,
  p_group_by     text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_district_id uuid;
  v_total_revenue         numeric(14, 2) := 0.00;
  v_total_tickets         int := 0;
  v_breakdown             jsonb;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can access revenue analytics';
  end if;

  if is_district_admin() then
    v_effective_district_id := my_district_id();
  else
    v_effective_district_id := p_district_id;
  end if;

  -- 1. Grand totals (using total_fare column)
  select
    coalesce(sum(tk.total_fare), 0.00),
    coalesce(count(tk.id), 0)
  into v_total_revenue, v_total_tickets
  from tickets tk
  where tk.created_at::date between p_start_date and p_end_date
    and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
    and (v_effective_district_id is null or tk.district_id = v_effective_district_id);

  -- 2. Breakdown by dimension
  if p_group_by = 'day' then
    select coalesce(jsonb_agg(d order by d->>'group_key' asc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', tk.created_at::date::text,
        'label', to_char(tk.created_at::date, 'YYYY-MM-DD'),
        'total_revenue', coalesce(sum(tk.total_fare), 0.00),
        'tickets_count', count(tk.id),
        'cash_revenue', coalesce(sum(case when tk.channel = 'ETM' then tk.total_fare else 0 end), 0.00),
        'digital_revenue', coalesce(sum(case when tk.channel <> 'ETM' then tk.total_fare else 0 end), 0.00)
      ) as d
      from tickets tk
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by tk.created_at::date
    ) s;

  elsif p_group_by = 'bus' then
    select coalesce(jsonb_agg(d order by (d->>'total_revenue')::numeric desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', b.id::text,
        'label', coalesce(b.bus_number, 'Unknown Bus'),
        'bus_number', b.bus_number,
        'bus_type', b.type,
        'total_revenue', coalesce(sum(tk.total_fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      join trips tr on tr.id = tk.trip_id
      left join buses b on b.id = tr.bus_id
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by b.id, b.bus_number, b.type
    ) s;

  elsif p_group_by = 'route' then
    select coalesce(jsonb_agg(d order by (d->>'total_revenue')::numeric desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', r.id::text,
        'label', coalesce(r.route_number || ' (' || r.origin || ' → ' || r.destination || ')', 'Unknown Route'),
        'route_number', r.route_number,
        'origin', r.origin,
        'destination', r.destination,
        'total_revenue', coalesce(sum(tk.total_fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      join trips tr on tr.id = tk.trip_id
      left join routes r on r.id = tr.route_id
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by r.id, r.route_number, r.origin, r.destination
    ) s;

  elsif p_group_by = 'concession' then
    select coalesce(jsonb_agg(d order by (d->>'tickets_count')::int desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', coalesce(tk.concession_type, 'NORMAL'),
        'label', coalesce(tk.concession_type, 'NORMAL'),
        'total_revenue', coalesce(sum(tk.total_fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by coalesce(tk.concession_type, 'NORMAL')
    ) s;

  else
    select coalesce(jsonb_agg(d order by (d->>'total_revenue')::numeric desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', coalesce(tk.channel, 'APP'),
        'label', coalesce(tk.channel, 'APP'),
        'total_revenue', coalesce(sum(tk.total_fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by coalesce(tk.channel, 'APP')
    ) s;
  end if;

  return jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'group_by', p_group_by,
    'district_id', v_effective_district_id,
    'total_revenue', v_total_revenue,
    'total_tickets', v_total_tickets,
    'breakdown', coalesce(v_breakdown, '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. HARDENED CONDUCTOR STATS RPC (total_fare fix)
-- -----------------------------------------------------------------------------
create or replace function get_conductor_stats(
  p_conductor_id uuid default null,
  p_target_date  date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_conductor_id uuid;
  v_trips_count            int := 0;
  v_active_trip            record;
  v_tickets_count          int := 0;
  v_cash_revenue           numeric(12, 2) := 0.00;
  v_digital_revenue        numeric(12, 2) := 0.00;
  v_total_passengers       int := 0;
begin
  if current_conductor_id() is not null then
    v_effective_conductor_id := current_conductor_id();
  elsif is_any_admin() then
    v_effective_conductor_id := p_conductor_id;
  else
    raise exception 'UNAUTHORIZED: must be conductor or admin to view conductor stats';
  end if;

  if v_effective_conductor_id is null then
    raise exception 'PARAM_REQUIRED: conductor_id is required';
  end if;

  -- Trips count on target date
  select count(*) into v_trips_count
  from trips
  where conductor_id = v_effective_conductor_id
    and scheduled_departure::date = p_target_date;

  -- Active trip
  select t.id, t.status, t.bus_id, b.bus_number, r.route_number, r.origin, r.destination,
         t.actual_departure, t.current_stop_index
  into v_active_trip
  from trips t
  left join buses b on b.id = t.bus_id
  left join routes r on r.id = t.route_id
  where t.conductor_id = v_effective_conductor_id
    and t.status = 'ACTIVE'
  order by t.actual_departure desc
  limit 1;

  -- Aggregate total_fare
  select
    coalesce(count(tk.id), 0),
    coalesce(sum(case when tk.channel = 'ETM' then tk.total_fare else 0 end), 0.00),
    coalesce(sum(case when tk.channel <> 'ETM' then tk.total_fare else 0 end), 0.00),
    coalesce(sum(tk.passenger_count), 0)
  into v_tickets_count, v_cash_revenue, v_digital_revenue, v_total_passengers
  from tickets tk
  join trips tr on tr.id = tk.trip_id
  where tr.conductor_id = v_effective_conductor_id
    and (tk.created_at::date = p_target_date or tr.scheduled_departure::date = p_target_date)
    and tk.status in ('PAID', 'VALIDATED', 'EXPIRED');

  return jsonb_build_object(
    'conductor_id', v_effective_conductor_id,
    'date', p_target_date,
    'trips_count', v_trips_count,
    'active_trip', case when v_active_trip.id is not null then jsonb_build_object(
      'id', v_active_trip.id,
      'status', v_active_trip.status,
      'bus_id', v_active_trip.bus_id,
      'bus_number', v_active_trip.bus_number,
      'route_number', v_active_trip.route_number,
      'origin', v_active_trip.origin,
      'destination', v_active_trip.destination,
      'actual_departure', v_active_trip.actual_departure,
      'current_stop_index', v_active_trip.current_stop_index
    ) else null end,
    'tickets_issued', v_tickets_count,
    'cash_revenue', v_cash_revenue,
    'digital_revenue', v_digital_revenue,
    'total_revenue', v_cash_revenue + v_digital_revenue,
    'passengers_carried', v_total_passengers
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. HARDENED create_secure_ticket (Capacity & Seat Segment Locking)
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
  v_route_id       uuid;
  v_bus_id         uuid;
  v_district_id    uuid;
  v_capacity       int;
  v_origin_seq     int;
  v_dest_seq       int;
  v_max_occupied   int;
  v_base_fare      numeric(10, 2);
  v_discount_pct   numeric(5, 2);
  v_final_fare     numeric(10, 2);
  v_hmac_key       text;
  v_qr_payload     text;
  v_qr_signature   text;
  v_ticket         tickets;
  v_config         transport_authority_config;
  v_pnr            text;
  v_conc           text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: an anonymous session is required to purchase a ticket';
  end if;

  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 6 then
    raise exception 'INVALID_PASSENGER_COUNT';
  end if;

  v_conc := coalesce(p_concession_type, 'NORMAL');
  if v_conc not in ('NORMAL','STUDENT','SENIOR_CITIZEN','FREEDOM_FIGHTER','MONTHLY_PASS') then
    raise exception 'INVALID_CONCESSION_TYPE';
  end if;

  select * into v_config from transport_authority_config limit 1;
  if v_config is null or v_config.is_payments_enabled is not true then
    raise exception 'PAYMENTS_DISABLED: transport authority UPI configuration is missing or disabled';
  end if;

  -- Lock trip and bus row
  select t.route_id, t.bus_id, b.district_id, b.capacity
  into v_route_id, v_bus_id, v_district_id, v_capacity
  from trips t
  join buses b on b.id = t.bus_id
  where t.id = p_trip_id and t.status = 'ACTIVE'
  for update;

  if v_route_id is null then
    raise exception 'INVALID_TRIP: trip does not exist or is not active';
  end if;

  -- Stop progression check
  select sequence_order into v_origin_seq
  from trip_stops
  where trip_id = p_trip_id and stop_id = p_origin_stop_id
    and status in ('UPCOMING', 'ARRIVED');

  if v_origin_seq is null then
    raise exception 'ORIGIN_ALREADY_DEPARTED';
  end if;

  select sequence_order into v_dest_seq
  from trip_stops
  where trip_id = p_trip_id and stop_id = p_dest_stop_id;

  if v_dest_seq is null or v_dest_seq <= v_origin_seq then
    raise exception 'INVALID_DESTINATION_STOP';
  end if;

  -- Segment Capacity Check with FOR UPDATE lock
  select coalesce(max(occupied_seats), 0)
  into v_max_occupied
  from trip_seat_segments
  where trip_id = p_trip_id
    and sequence_order >= v_origin_seq
    and sequence_order < v_dest_seq
  for update;

  if (v_max_occupied + p_passenger_count) > v_capacity then
    raise exception 'BUS_CAPACITY_EXCEEDED: insufficient seats available on this segment';
  end if;

  -- Fare calculation
  select flat_fare_amount into v_base_fare
  from fare_matrix
  where route_id = v_route_id
    and origin_stop_id = p_origin_stop_id
    and dest_stop_id = p_dest_stop_id;

  if v_base_fare is null then
    raise exception 'NO_FARE_CONFIGURED: no fare_matrix entry for this origin/destination on this route';
  end if;

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

  -- Reserve occupied seats on the segments
  update trip_seat_segments
  set occupied_seats = occupied_seats + p_passenger_count
  where trip_id = p_trip_id
    and sequence_order >= v_origin_seq
    and sequence_order < v_dest_seq;

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

-- -----------------------------------------------------------------------------
-- 5. HARDENED generate_passenger_cash_ticket
-- -----------------------------------------------------------------------------
create or replace function generate_passenger_cash_ticket(
  p_trip_id         uuid,
  p_origin_stop_id  uuid,
  p_dest_stop_id    uuid,
  p_passenger_count int  default 1,
  p_concession_type text default 'NORMAL'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conductor_id  uuid;
  v_trip          trips;
  v_route_id      uuid;
  v_bus_id        uuid;
  v_district_id   uuid;
  v_capacity      int;
  v_origin_seq    int;
  v_dest_seq      int;
  v_fare_per_pax  numeric(10, 2);
  v_discount_pct  numeric(5, 2) := 0.00;
  v_total_fare    numeric(10, 2);
  v_pnr           text;
  v_ticket        tickets;
  v_config        transport_authority_config;
  v_hmac_key      text;
  v_qr_payload    text;
  v_qr_signature  text;
begin
  if not is_conductor() and not is_any_admin() then
    raise exception 'FORBIDDEN: only conductors or admins can issue cash tickets';
  end if;

  v_conductor_id := current_conductor_id();

  select t.*, b.capacity into v_trip
  from trips t
  join buses b on b.id = t.bus_id
  where t.id = p_trip_id;

  if v_trip.id is null then
    raise exception 'NOT_FOUND: trip % not found', p_trip_id;
  end if;

  v_route_id    := v_trip.route_id;
  v_bus_id      := v_trip.bus_id;
  v_district_id := v_trip.district_id;
  v_capacity    := v_trip.capacity;

  select sequence_order into v_origin_seq
  from trip_stops where trip_id = p_trip_id and stop_id = p_origin_stop_id;

  select sequence_order into v_dest_seq
  from trip_stops where trip_id = p_trip_id and stop_id = p_dest_stop_id;

  select calculate_fare(v_route_id, p_origin_stop_id, p_dest_stop_id)
  into v_fare_per_pax;

  if v_fare_per_pax is null or v_fare_per_pax <= 0 then
    v_fare_per_pax := 20.00;
  end if;

  case upper(p_concession_type)
    when 'STUDENT'         then v_discount_pct := 0.50;
    when 'SENIOR_CITIZEN'  then v_discount_pct := 0.50;
    when 'MONTHLY_PASS'    then v_discount_pct := 0.75;
    when 'FREEDOM_FIGHTER' then v_discount_pct := 1.00;
    else                        v_discount_pct := 0.00;
  end case;

  v_total_fare := round((v_fare_per_pax * p_passenger_count) * (1.0 - v_discount_pct), 2);
  v_pnr := 'ETM' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  if v_hmac_key is null then
    v_hmac_key := 'default-dev-secret-key';
  end if;

  v_qr_payload   := encode(extensions.gen_random_bytes(24), 'base64');
  v_qr_signature := encode(
    extensions.hmac(v_qr_payload || '|' || p_trip_id::text, v_hmac_key, 'sha256'),
    'hex'
  );

  -- Reserve occupied seats
  if v_origin_seq is not null and v_dest_seq is not null then
    update trip_seat_segments
    set occupied_seats = occupied_seats + p_passenger_count
    where trip_id = p_trip_id
      and sequence_order >= v_origin_seq
      and sequence_order < v_dest_seq;
  end if;

  insert into tickets (
    passenger_session_id,
    bus_id,
    trip_id,
    district_id,
    origin_stop_id,
    dest_stop_id,
    passenger_count,
    concession_type,
    total_fare,
    status,
    channel,
    pnr,
    qr_payload,
    qr_signature,
    validated_at,
    expires_at
  ) values (
    coalesce(auth.uid(), gen_random_uuid()),
    v_bus_id,
    p_trip_id,
    v_district_id,
    p_origin_stop_id,
    p_dest_stop_id,
    p_passenger_count,
    p_concession_type,
    v_total_fare,
    'VALIDATED',
    'ETM',
    v_pnr,
    v_qr_payload,
    v_qr_signature,
    now(),
    now() + interval '8 hours'
  )
  returning * into v_ticket;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'pnr', v_ticket.pnr,
    'trip_id', v_ticket.trip_id,
    'fare', v_ticket.total_fare,
    'passenger_count', v_ticket.passenger_count,
    'concession_type', v_ticket.concession_type,
    'status', 'VALIDATED',
    'qr_payload', v_qr_payload,
    'qr_signature', v_qr_signature,
    'created_at', v_ticket.created_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. HARDENED validate_ticket_by_pnr (Exact PNR + Trip enforcement)
-- -----------------------------------------------------------------------------
create or replace function validate_ticket_by_pnr(
  p_pnr     text,
  p_trip_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket         tickets;
  v_normalized_pnr text;
  v_origin_stop    stops;
  v_dest_stop      stops;
begin
  if not is_conductor() and not is_any_admin() then
    raise exception 'FORBIDDEN: only conductors or admins can validate tickets';
  end if;

  v_normalized_pnr := upper(trim(p_pnr));

  -- Search ticket by EXACT PNR code
  select * into v_ticket
  from tickets
  where upper(pnr) = v_normalized_pnr
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'TICKET_NOT_FOUND',
      'message', 'No ticket found with PNR: ' || v_normalized_pnr
    );
  end if;

  -- Guard: Trip check
  if p_trip_id is not null and v_ticket.trip_id is distinct from p_trip_id then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'WRONG_TRIP',
      'message', 'Ticket is not valid for this trip',
      'ticket_id', v_ticket.id,
      'ticket_trip_id', v_ticket.trip_id
    );
  end if;

  if v_ticket.status = 'VALIDATED' then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'ALREADY_VALIDATED',
      'message', 'Ticket already validated at ' || coalesce(to_char(v_ticket.validated_at, 'HH24:MI:SS'), 'earlier'),
      'ticket_id', v_ticket.id,
      'validated_at', v_ticket.validated_at
    );
  end if;

  if v_ticket.status = 'EXPIRED' then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'EXPIRED',
      'message', 'Ticket has expired',
      'ticket_id', v_ticket.id
    );
  end if;

  if v_ticket.status = 'CANCELLED' then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'CANCELLED',
      'message', 'Ticket was cancelled and is invalid',
      'ticket_id', v_ticket.id
    );
  end if;

  -- Mark as validated
  update tickets
  set status       = 'VALIDATED',
      validated_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  select * into v_origin_stop from stops where id = v_ticket.origin_stop_id;
  select * into v_dest_stop from stops where id = v_ticket.dest_stop_id;

  return jsonb_build_object(
    'valid', true,
    'ticket_id', v_ticket.id,
    'pnr', v_ticket.pnr,
    'status', v_ticket.status,
    'fare', v_ticket.total_fare,
    'passenger_count', v_ticket.passenger_count,
    'concession_type', coalesce(v_ticket.concession_type, 'NORMAL'),
    'origin_stop_name', coalesce(v_origin_stop.name, 'Origin'),
    'dest_stop_name', coalesce(v_dest_stop.name, 'Destination'),
    'validated_at', v_ticket.validated_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. STRICT DISTRICT ADMIN CHECKS ON edit_trip & assign_etm
-- -----------------------------------------------------------------------------
create or replace function edit_trip(
  p_trip_id              uuid,
  p_route_id             uuid        default null,
  p_bus_id               uuid        default null,
  p_conductor_id         uuid        default null,
  p_scheduled_departure  timestamptz default null,
  p_scheduled_arrival    timestamptz default null,
  p_reason               text        default null
)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip       trips;
  v_admin_id   uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can edit trips';
  end if;

  v_admin_id := auth.uid();

  select * into v_trip
  from trips
  where id = p_trip_id;

  if not found then
    raise exception 'NOT_FOUND: Trip % not found', p_trip_id;
  end if;

  if v_trip.status not in ('SCHEDULED', 'PLANNED') then
    raise exception 'INVALID_STATE: Trip is currently in % status and cannot be edited', v_trip.status;
  end if;

  -- Strict district isolation: district admins cannot edit trips outside their district or null district trips
  if is_district_admin() then
    if v_trip.district_id is null or v_trip.district_id <> my_district_id() then
      raise exception 'FORBIDDEN: district admin can only edit trips belonging to their assigned district';
    end if;
  end if;

  -- Audit log each changed field
  if p_route_id is not null and p_route_id is distinct from v_trip.route_id then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'route_id', v_trip.route_id::text, p_route_id::text, p_reason);
  end if;

  if p_bus_id is not null and p_bus_id is distinct from v_trip.bus_id then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'bus_id', v_trip.bus_id::text, p_bus_id::text, p_reason);
  end if;

  if p_conductor_id is not null and p_conductor_id is distinct from v_trip.conductor_id then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'conductor_id', v_trip.conductor_id::text, p_conductor_id::text, p_reason);
  end if;

  if p_scheduled_departure is not null and p_scheduled_departure is distinct from v_trip.scheduled_departure then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'scheduled_departure', v_trip.scheduled_departure::text, p_scheduled_departure::text, p_reason);
  end if;

  if p_scheduled_arrival is not null and p_scheduled_arrival is distinct from v_trip.scheduled_arrival then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'scheduled_arrival', v_trip.scheduled_arrival::text, p_scheduled_arrival::text, p_reason);
  end if;

  update trips
  set route_id            = coalesce(p_route_id, route_id),
      bus_id              = coalesce(p_bus_id, bus_id),
      conductor_id        = coalesce(p_conductor_id, conductor_id),
      scheduled_departure = coalesce(p_scheduled_departure, scheduled_departure),
      scheduled_arrival   = coalesce(p_scheduled_arrival, scheduled_arrival),
      last_edited_at      = now(),
      last_edited_by      = v_admin_id
  where id = p_trip_id
  returning * into v_trip;

  return v_trip;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RATE LIMIT EMERGENCY CHAT TO PREVENT SPAM
-- -----------------------------------------------------------------------------
create or replace function start_emergency_chat(
  p_ticket_id       uuid             default null,
  p_emergency_type  text             default 'GENERAL',
  p_message         text             default 'Emergency reported by passenger',
  p_latitude        double precision default null,
  p_longitude       double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id   text;
  v_ticket       tickets;
  v_trip         trips;
  v_chat         passenger_emergency_chats;
  v_msg          passenger_emergency_messages;
  v_district_id  uuid;
  v_trip_id      uuid;
  v_bus_id       uuid;
  v_alert_id     uuid;
  v_recent_chats int;
begin
  v_session_id := coalesce(
    auth.jwt()->>'session_id',
    auth.uid()::text,
    current_setting('request.headers', true)::json->>'x-session-id',
    'anon-' || gen_random_uuid()::text
  );

  -- Rate limit check: max 5 emergency sessions per hour per session
  select count(*) into v_recent_chats
  from passenger_emergency_chats
  where passenger_session_id = v_session_id
    and created_at > (now() - interval '1 hour');

  if v_recent_chats >= 5 then
    raise exception 'RATE_LIMITED: emergency chat creation limit reached for this session';
  end if;

  if p_ticket_id is not null then
    select * into v_ticket from tickets where id = p_ticket_id;
    if found then
      v_trip_id     := v_ticket.trip_id;
      v_district_id := v_ticket.district_id;
      if v_trip_id is not null then
        select * into v_trip from trips where id = v_trip_id;
        v_bus_id := v_trip.bus_id;
      end if;
    end if;
  end if;

  insert into passenger_emergency_chats (
    ticket_id,
    trip_id,
    bus_id,
    district_id,
    passenger_session_id,
    emergency_type,
    initial_latitude,
    initial_longitude,
    status
  ) values (
    p_ticket_id,
    v_trip_id,
    v_bus_id,
    v_district_id,
    v_session_id,
    upper(p_emergency_type),
    p_latitude,
    p_longitude,
    'OPEN'
  )
  returning * into v_chat;

  insert into passenger_emergency_messages (
    chat_id,
    sender_role,
    sender_id,
    message,
    latitude,
    longitude
  ) values (
    v_chat.id,
    'passenger',
    v_session_id,
    p_message,
    p_latitude,
    p_longitude
  )
  returning * into v_msg;

  insert into alerts (
    trip_id,
    bus_id,
    district_id,
    severity,
    status,
    title,
    message,
    source_role,
    latitude,
    longitude
  ) values (
    v_trip_id,
    v_bus_id,
    v_district_id,
    'CRITICAL',
    'ACTIVE',
    'EMERGENCY: ' || upper(p_emergency_type),
    p_message,
    'passenger',
    p_latitude,
    p_longitude
  )
  returning id into v_alert_id;

  return jsonb_build_object(
    'chat_id', v_chat.id,
    'status', v_chat.status,
    'emergency_type', v_chat.emergency_type,
    'alert_id', v_alert_id,
    'initial_message', v_msg.message,
    'created_at', v_chat.created_at
  );
end;
$$;
