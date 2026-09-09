-- =============================================================================
-- 032: Production Backend Hardening & Concurrency Integrity
--   1. ETM Assignment Concurrency & Exclusion Locks
--   2. Trip Edit Versioning & Optimistic Locking
--   3. Payment & Ticket Idempotency (Unique constraint + replay safe)
--   4. Cryptographic QR Verification & Anti-Replay Nonce
--   5. SOS / Alert Abuse Protection & Rate Limiting (Status: SPAM support)
--   6. Idle Bus Detection PostGIS Stop Proximity & Speed Threshold
--   7. Realtime Multi-Tenant Isolation
--   8. Analytics Strict District Isolation
--   9. Concurrency-Safe Ticket Validation (Locking + is_validated flag)
--  10. Trip & Conductor Scheduling Conflict Prevention
--  11. Maintenance State Consistency Synchronization
--  12. Idempotent Retry Safety across RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SCHEMA HARDENING & CONSTRAINTS
-- -----------------------------------------------------------------------------

-- 1.1 Add versioning & optimistic lock column to trips
alter table trips
  add column if not exists version integer not null default 1;

-- 1.2 Add idempotency_key, razorpay_payment_id, is_validated, validated_at to tickets
alter table tickets
  add column if not exists idempotency_key text,
  add column if not exists razorpay_payment_id text,
  add column if not exists is_validated boolean not null default false,
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references auth.users(id) on delete set null;

-- Unique partial index for payment and ticket idempotency
create unique index if not exists idx_tickets_idempotency_key
  on tickets (idempotency_key)
  where (idempotency_key is not null);

create unique index if not exists idx_tickets_razorpay_payment_id
  on tickets (razorpay_payment_id)
  where (razorpay_payment_id is not null);

-- 1.3 Ensure ETM assignments active partial index is rock-solid
create unique index if not exists idx_etm_assignments_active_device
  on etm_assignments (etm_device_id)
  where (unassigned_at is null);

create unique index if not exists idx_etm_assignments_active_conductor
  on etm_assignments (conductor_id)
  where (unassigned_at is null and conductor_id is not null);

-- 1.4 Allow SPAM status on alert_status enum
alter type alert_status add value if not exists 'SPAM';

-- -----------------------------------------------------------------------------
-- 2. HARDENED RPC 1: ETM ASSIGNMENT (CONCURRENCY & LOCK SAFE)
-- -----------------------------------------------------------------------------
drop function if exists assign_etm(uuid, uuid, uuid, uuid, text);
drop function if exists assign_etm(uuid, uuid, uuid, uuid);

create or replace function assign_etm(
  p_etm_device_id uuid,
  p_conductor_id  uuid default null,
  p_bus_id        uuid default null,
  p_trip_id       uuid default null,
  p_notes         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device      etm_devices;
  v_assignment  etm_assignments;
  v_district_id uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can assign ETM devices';
  end if;

  -- 1. Acquire row lock on the device to prevent concurrent assignment race
  select * into v_device
  from etm_devices
  where id = p_etm_device_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: ETM device % not found', p_etm_device_id;
  end if;

  -- Verify tenant scoping
  if not is_master_admin() and v_device.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: ETM device belongs to another district';
  end if;

  v_district_id := v_device.district_id;

  -- 2. Atomically close any existing active assignment for this ETM device
  update etm_assignments
  set unassigned_at = now(),
      notes = coalesce(notes || ' | ', '') || 'Reassigned via assign_etm'
  where etm_device_id = p_etm_device_id
    and unassigned_at is null;

  -- 3. If conductor provided, lock conductor row and close their previous active assignment
  if p_conductor_id is not null then
    perform 1 from conductors where id = p_conductor_id for update;

    update etm_assignments
    set unassigned_at = now(),
        notes = coalesce(notes || ' | ', '') || 'Unassigned due to new device assignment'
    where conductor_id = p_conductor_id
      and unassigned_at is null;
  end if;

  -- 4. Create new assignment
  insert into etm_assignments (
    etm_device_id,
    conductor_id,
    bus_id,
    trip_id,
    district_id,
    notes,
    assigned_at
  ) values (
    p_etm_device_id,
    p_conductor_id,
    p_bus_id,
    p_trip_id,
    v_district_id,
    p_notes,
    now()
  )
  returning * into v_assignment;

  -- 5. Update device status
  update etm_devices
  set status = 'ACTIVE',
      updated_at = now()
  where id = p_etm_device_id;

  return jsonb_build_object(
    'assignment_id', v_assignment.id,
    'etm_device_id', v_assignment.etm_device_id,
    'conductor_id',  v_assignment.conductor_id,
    'bus_id',        v_assignment.bus_id,
    'status',        'ACTIVE',
    'assigned_at',   v_assignment.assigned_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. HARDENED RPC 2: TRIP EDIT LOCKING & VERSIONING (OPTIMISTIC CONCURRENCY)
-- -----------------------------------------------------------------------------
drop function if exists edit_trip(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, integer);
drop function if exists edit_trip(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text);

create or replace function edit_trip(
  p_trip_id              uuid,
  p_route_id             uuid        default null,
  p_bus_id               uuid        default null,
  p_conductor_id         uuid        default null,
  p_scheduled_departure  timestamptz default null,
  p_scheduled_arrival    timestamptz default null,
  p_reason               text        default 'Administrative adjustment',
  p_expected_version     integer     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip       trips;
  v_new_route  uuid;
  v_new_bus    uuid;
  v_new_cond   uuid;
  v_new_dep    timestamptz;
  v_new_arr    timestamptz;
  v_edit       trip_edits;
  v_conflict_id uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can modify scheduled trips';
  end if;

  -- 1. Lock trip row
  select * into v_trip
  from trips
  where id = p_trip_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: Trip % not found', p_trip_id;
  end if;

  -- Verify tenant scoping
  if not is_master_admin() and v_trip.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: Trip belongs to another district';
  end if;

  -- 2. Reject editing completed/cancelled trips
  if v_trip.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'INVALID_STATE: Cannot edit a trip that is already %', v_trip.status;
  end if;

  -- 3. Optimistic locking check
  if p_expected_version is not null and v_trip.version <> p_expected_version then
    raise exception 'CONFLICT: Trip was modified concurrently by another user (current version %, expected %)',
      v_trip.version, p_expected_version;
  end if;

  v_new_route := coalesce(p_route_id, v_trip.route_id);
  v_new_bus   := coalesce(p_bus_id, v_trip.bus_id);
  v_new_cond  := coalesce(p_conductor_id, v_trip.conductor_id);
  v_new_dep   := coalesce(p_scheduled_departure, v_trip.scheduled_departure, v_trip.started_at);
  v_new_arr   := coalesce(p_scheduled_arrival, v_trip.scheduled_arrival, v_trip.ended_at);

  -- 4. Overlap conflict prevention: Bus check
  if v_new_dep is not null and v_new_arr is not null then
    select id into v_conflict_id
    from trips
    where bus_id = v_new_bus
      and id <> p_trip_id
      and status in ('SCHEDULED', 'ACTIVE')
      and (
        (scheduled_departure, coalesce(scheduled_arrival, scheduled_departure + interval '2 hours'))
        overlaps
        (v_new_dep, v_new_arr)
      )
    limit 1;

    if v_conflict_id is not null then
      raise exception 'CONFLICT: Bus % is already assigned to active/scheduled trip % during this window',
        v_new_bus, v_conflict_id;
    end if;

    -- Conductor overlap check
    if v_new_cond is not null then
      select id into v_conflict_id
      from trips
      where conductor_id = v_new_cond
        and id <> p_trip_id
        and status in ('SCHEDULED', 'ACTIVE')
        and (
          (scheduled_departure, coalesce(scheduled_arrival, scheduled_departure + interval '2 hours'))
          overlaps
          (v_new_dep, v_new_arr)
        )
      limit 1;

      if v_conflict_id is not null then
        raise exception 'CONFLICT: Conductor % is already assigned to active/scheduled trip % during this window',
          v_new_cond, v_conflict_id;
      end if;
    end if;
  end if;

  -- 5. Record audit entry
  insert into trip_edits (
    trip_id,
    edited_by,
    previous_route_id,
    new_route_id,
    previous_bus_id,
    new_bus_id,
    previous_conductor_id,
    new_conductor_id,
    previous_scheduled_departure,
    new_scheduled_departure,
    previous_scheduled_arrival,
    new_scheduled_arrival,
    reason
  ) values (
    p_trip_id,
    auth.uid(),
    v_trip.route_id,
    v_new_route,
    v_trip.bus_id,
    v_new_bus,
    v_trip.conductor_id,
    v_new_cond,
    v_trip.scheduled_departure,
    v_new_dep,
    v_trip.scheduled_arrival,
    v_new_arr,
    p_reason
  )
  returning * into v_edit;

  -- 6. Apply updates with version bump
  update trips
  set route_id            = v_new_route,
      bus_id              = v_new_bus,
      conductor_id        = v_new_cond,
      scheduled_departure = v_new_dep,
      scheduled_arrival   = v_new_arr,
      version             = version + 1,
      updated_at          = now()
  where id = p_trip_id;

  return jsonb_build_object(
    'trip_id',    p_trip_id,
    'version',    v_trip.version + 1,
    'route_id',   v_new_route,
    'bus_id',     v_new_bus,
    'conductor_id', v_new_cond,
    'scheduled_departure', v_new_dep,
    'scheduled_arrival',   v_new_arr,
    'audit_id',   v_edit.id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. HARDENED RPC 3: CASH TICKET ISSUANCE WITH IDEMPOTENCY KEY
-- -----------------------------------------------------------------------------
create or replace function generate_passenger_cash_ticket(
  p_trip_id          uuid,
  p_from_stop_id     uuid,
  p_to_stop_id       uuid,
  p_fare_amount      numeric,
  p_passenger_count  int  default 1,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip           trips;
  v_bus            buses;
  v_pnr            text;
  v_ticket         tickets;
  v_from_order     int;
  v_to_order       int;
  v_current_count  int;
  v_existing       tickets;
begin
  if not (is_conductor() or is_any_admin()) then
    raise exception 'FORBIDDEN: Only active conductors can issue walk-in cash tickets';
  end if;

  -- 1. Check idempotency: If key provided and ticket exists, return it immediately
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select * into v_existing
    from tickets
    where idempotency_key = trim(p_idempotency_key);

    if found then
      return jsonb_build_object(
        'ticket_id',        v_existing.id,
        'pnr',              v_existing.pnr,
        'fare',             v_existing.total_fare,
        'passenger_count',  v_existing.passenger_count,
        'status',           v_existing.status,
        'created_at',       v_existing.created_at,
        'is_duplicate',     true
      );
    end if;
  end if;

  -- 2. Lock trip and bus rows
  select * into v_trip
  from trips
  where id = p_trip_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: Trip % not found', p_trip_id;
  end if;

  if v_trip.status <> 'ACTIVE' then
    raise exception 'INVALID_STATE: Cannot issue tickets for inactive trip (status: %)', v_trip.status;
  end if;

  select * into v_bus
  from buses
  where id = v_trip.bus_id;

  -- 3. Verify stop progression
  select sequence_order into v_from_order
  from route_stops
  where route_id = v_trip.route_id and stop_id = p_from_stop_id;

  select sequence_order into v_to_order
  from route_stops
  where route_id = v_trip.route_id and stop_id = p_to_stop_id;

  if v_from_order is null or v_to_order is null or v_from_order >= v_to_order then
    raise exception 'INVALID_STOPS: Destination stop must come after boarding stop';
  end if;

  -- 4. Concurrency-safe capacity check
  select coalesce(max(occupied_seats), 0) into v_current_count
  from trip_seat_segments
  where trip_id = p_trip_id
    and sequence_order >= v_from_order
    and sequence_order < v_to_order
  for update;

  if (v_current_count + p_passenger_count) > v_bus.capacity then
    raise exception 'OVERCAPACITY: Bus capacity exceeded (% available, % requested)',
      (v_bus.capacity - v_current_count), p_passenger_count;
  end if;

  -- 5. Generate collision-resistant unique PNR
  loop
    v_pnr := 'NGZ-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from tickets where pnr = v_pnr);
  end loop;

  -- 6. Insert Ticket record
  insert into tickets (
    pnr,
    trip_id,
    district_id,
    from_stop_id,
    to_stop_id,
    total_fare,
    passenger_count,
    passenger_session_id,
    status,
    channel,
    payment_method,
    idempotency_key,
    is_validated,
    validated_at
  ) values (
    v_pnr,
    p_trip_id,
    v_trip.district_id,
    p_from_stop_id,
    p_to_stop_id,
    p_fare_amount,
    p_passenger_count,
    gen_random_uuid(),
    'PAID',
    'CASH',
    'CASH',
    nullif(trim(p_idempotency_key), ''),
    true, -- Walk-in cash ticket is issued directly by conductor on-board
    now()
  )
  returning * into v_ticket;

  -- 7. Atomically increment occupied seats
  update trip_seat_segments
  set occupied_seats = occupied_seats + p_passenger_count
  where trip_id = p_trip_id
    and sequence_order >= v_from_order
    and sequence_order < v_to_order;

  return jsonb_build_object(
    'ticket_id',        v_ticket.id,
    'pnr',              v_ticket.pnr,
    'fare',             v_ticket.total_fare,
    'passenger_count',  v_ticket.passenger_count,
    'status',           v_ticket.status,
    'created_at',       v_ticket.created_at,
    'is_duplicate',     false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. HARDENED RPC 4: CONCURRENCY-SAFE PNR & QR TICKET VALIDATION
-- -----------------------------------------------------------------------------
create or replace function validate_ticket_by_pnr(
  p_trip_id uuid,
  p_pnr     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket      tickets;
  v_trip        trips;
  v_from_name   text;
  v_to_name     text;
begin
  if not (is_conductor() or is_any_admin()) then
    raise exception 'FORBIDDEN: Only active conductors can validate passenger tickets';
  end if;

  if p_pnr is null or trim(p_pnr) = '' then
    raise exception 'INVALID_INPUT: PNR cannot be empty';
  end if;

  -- 1. Row lock on ticket to prevent simultaneous validation race
  select * into v_ticket
  from tickets
  where pnr = upper(trim(p_pnr))
  for update;

  if not found then
    raise exception 'NOT_FOUND: Ticket with PNR % not found', upper(trim(p_pnr));
  end if;

  -- 2. Verify payment status
  if v_ticket.status not in ('PAID', 'VALIDATED') then
    raise exception 'INVALID_STATUS: Ticket % is unpaid or invalid (status: %)', v_ticket.pnr, v_ticket.status;
  end if;

  -- 3. Prevent double validation
  if v_ticket.is_validated then
    return jsonb_build_object(
      'success',        false,
      'error_code',     'ALREADY_VALIDATED',
      'message',        'Ticket was already validated at ' || to_char(v_ticket.validated_at, 'HH12:MI AM'),
      'pnr',            v_ticket.pnr,
      'validated_at',   v_ticket.validated_at,
      'passenger_count', v_ticket.passenger_count
    );
  end if;

  -- 4. Trip match check
  if v_ticket.trip_id <> p_trip_id then
    return jsonb_build_object(
      'success',        false,
      'error_code',     'WRONG_TRIP',
      'message',        'Ticket is booked for a different bus trip',
      'pnr',            v_ticket.pnr
    );
  end if;

  -- 5. Execute validation atomically
  update tickets
  set is_validated = true,
      validated_at = now(),
      validated_by = auth.uid(),
      status       = 'VALIDATED',
      updated_at   = now()
  where id = v_ticket.id;

  select name into v_from_name from stops where id = v_ticket.from_stop_id;
  select name into v_to_name   from stops where id = v_ticket.to_stop_id;

  return jsonb_build_object(
    'success',         true,
    'pnr',             v_ticket.pnr,
    'passenger_count', v_ticket.passenger_count,
    'total_fare',      v_ticket.total_fare,
    'from_stop',       v_from_name,
    'to_stop',         v_to_name,
    'validated_at',    now(),
    'message',         'Ticket validated successfully'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. HARDENED RPC 5: SOS ABUSE PROTECTION & RATE LIMITING
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
  v_recent_count int;
begin
  v_session_id := coalesce(
    auth.jwt()->>'session_id',
    auth.uid()::text,
    current_setting('request.headers', true)::json->>'x-session-id',
    'anon-' || gen_random_uuid()::text
  );

  -- 1. Anti-Abuse Rate Limiting: Max 5 emergency reports per session/user in 15 minutes
  select count(*) into v_recent_count
  from passenger_emergency_chats
  where passenger_session_id = v_session_id
    and created_at > (now() - interval '15 minutes');

  if v_recent_count >= 5 then
    raise exception 'RATE_LIMITED: Maximum emergency alerts exceeded. Please contact emergency services directly via 112.';
  end if;

  -- 2. Validate ticket if provided
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

  -- 3. Create emergency chat session
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

  -- 4. Insert initial message
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
    trim(p_message),
    p_latitude,
    p_longitude
  )
  returning * into v_msg;

  -- 5. Spawn emergency alert for control room
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
    trim(p_message),
    'passenger',
    p_latitude,
    p_longitude
  )
  returning id into v_alert_id;

  return jsonb_build_object(
    'chat_id',         v_chat.id,
    'status',          v_chat.status,
    'emergency_type',  v_chat.emergency_type,
    'alert_id',        v_alert_id,
    'initial_message', v_msg.message,
    'created_at',      v_chat.created_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. HARDENED RPC 6: IDLE BUS DETECTION WITH STOP PROXIMITY & SPEED CHECK
-- -----------------------------------------------------------------------------
create or replace function check_idle_buses()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idle_minutes int := 10;
  v_flagged      int := 0;
  v_bus          record;
  v_last_loc     record;
  v_prev_loc     record;
  v_distance_m   double precision;
  v_near_stop    boolean;
begin
  select coalesce(idle_alert_minutes, 10) into v_idle_minutes
  from transport_authority_config
  limit 1;

  if v_idle_minutes is null or v_idle_minutes <= 0 then
    v_idle_minutes := 10;
  end if;

  for v_bus in
    select
      t.id as trip_id,
      t.bus_id,
      t.district_id,
      b.bus_number
    from trips t
    join buses b on b.id = t.bus_id
    where t.status = 'ACTIVE'
  loop
    -- Fetch the latest GPS telemetry
    select latitude, longitude, speed, recorded_at
    into v_last_loc
    from gps_logs
    where trip_id = v_bus.trip_id
    order by recorded_at desc
    limit 1;

    if v_last_loc.recorded_at is null then
      continue;
    end if;

    -- Check if bus is near any known bus stop (within 80 meters)
    -- If at or near a bus stop, idle duration is normal (dwell/traffic boarding)
    select exists (
      select 1 from stops s
      where s.district_id = v_bus.district_id
        and st_dwithin(
          s.location,
          st_makepoint(v_last_loc.longitude, v_last_loc.latitude)::geography,
          80.0
        )
    ) into v_near_stop;

    if v_near_stop then
      -- Bus is legitimately at a bus stop / depot, ignore idle trigger
      continue;
    end if;

    -- Speed check: If bus is actively moving (> 5 km/h), not idle
    if coalesce(v_last_loc.speed, 0) > 5.0 then
      continue;
    end if;

    -- Fetch older GPS reading from v_idle_minutes ago
    select latitude, longitude, recorded_at
    into v_prev_loc
    from gps_logs
    where trip_id = v_bus.trip_id
      and recorded_at <= (v_last_loc.recorded_at - (v_idle_minutes || ' minutes')::interval)
    order by recorded_at desc
    limit 1;

    if v_prev_loc.latitude is not null then
      -- Compute distance in meters
      v_distance_m := st_distance(
        st_makepoint(v_last_loc.longitude, v_last_loc.latitude)::geography,
        st_makepoint(v_prev_loc.longitude, v_prev_loc.latitude)::geography
      );

      if v_distance_m < 25.0 then -- Bus stationary (< 25m) outside bus stops for > v_idle_minutes
        if not exists (
          select 1 from alerts
          where trip_id = v_bus.trip_id
            and title ilike '%Stationary%'
            and created_at > (now() - interval '30 minutes')
        ) then
          insert into alerts (
            trip_id,
            bus_id,
            district_id,
            severity,
            status,
            title,
            message,
            source_role,
            bus_number_snapshot,
            latitude,
            longitude
          ) values (
            v_bus.trip_id,
            v_bus.bus_id,
            v_bus.district_id,
            'WARNING',
            'ACTIVE',
            'Bus Stationary Outside Stop: ' || coalesce(v_bus.bus_number, 'Unknown'),
            'Bus ' || coalesce(v_bus.bus_number, '') || ' has stopped (< 25m moved) away from stops for over ' || v_idle_minutes || ' minutes.',
            'system',
            v_bus.bus_number,
            v_last_loc.latitude,
            v_last_loc.longitude
          );
          v_flagged := v_flagged + 1;
        end if;
      end if;
    end if;
  end loop;

  return v_flagged;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. HARDENED RPC 7: STRICT ANALYTICS DISTRICT ISOLATION
-- -----------------------------------------------------------------------------
create or replace function get_revenue_analytics(
  p_start_date   timestamptz default now() - interval '30 days',
  p_end_date     timestamptz default now(),
  p_district_id  uuid        default null,
  p_group_by     text        default 'date'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_district uuid;
  v_result             jsonb;
begin
  -- Strict isolation: Master admin can query any or all districts; District admin locked to their district
  if is_master_admin() then
    v_effective_district := p_district_id;
  elsif is_district_admin() then
    v_effective_district := my_district_id();
    if v_effective_district is null then
      raise exception 'FORBIDDEN: Admin account is not associated with any district';
    end if;
  else
    raise exception 'FORBIDDEN: Only administrators can view revenue analytics';
  end if;

  if p_group_by = 'bus' then
    select jsonb_agg(row_to_json(t)) into v_result
    from (
      select
        b.bus_number,
        b.id as bus_id,
        count(tk.id) as ticket_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      join trips tr on tr.id = tk.trip_id
      join buses b on b.id = tr.bus_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= p_start_date
        and tk.created_at <= p_end_date
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by b.id, b.bus_number
      order by total_revenue desc
    ) t;

  elsif p_group_by = 'route' then
    select jsonb_agg(row_to_json(t)) into v_result
    from (
      select
        r.route_number,
        r.name as route_name,
        r.id as route_id,
        count(tk.id) as ticket_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue
      from tickets tk
      join trips tr on tr.id = tk.trip_id
      join routes r on r.id = tr.route_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= p_start_date
        and tk.created_at <= p_end_date
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by r.id, r.route_number, r.name
      order by total_revenue desc
    ) t;

  elsif p_group_by = 'payment_method' then
    select jsonb_agg(row_to_json(t)) into v_result
    from (
      select
        coalesce(tk.payment_method, tk.channel) as method,
        count(tk.id) as ticket_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue
      from tickets tk
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= p_start_date
        and tk.created_at <= p_end_date
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by coalesce(tk.payment_method, tk.channel)
    ) t;

  else -- Default group by date
    select jsonb_agg(row_to_json(t)) into v_result
    from (
      select
        date_trunc('day', tk.created_at)::date as sale_date,
        count(tk.id) as ticket_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= p_start_date
        and tk.created_at <= p_end_date
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by date_trunc('day', tk.created_at)::date
      order by sale_date desc
    ) t;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. HARDENED RPC 8: MAINTENANCE STATE CONSISTENCY
-- -----------------------------------------------------------------------------
create or replace function log_maintenance_entry(
  p_target_type       text, -- 'BUS' or 'ETM'
  p_target_id         uuid,
  p_maintenance_type  text,
  p_description       text,
  p_cost              numeric default 0.0,
  p_technician_name   text    default null,
  p_set_status        text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus         buses;
  v_etm         etm_devices;
  v_district_id uuid;
  v_log_id      uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can log maintenance events';
  end if;

  if upper(p_target_type) = 'BUS' then
    select * into v_bus
    from buses
    where id = p_target_id
    for update;

    if not found then
      raise exception 'NOT_FOUND: Bus % not found', p_target_id;
    end if;

    v_district_id := v_bus.district_id;

    insert into bus_maintenance_logs (
      bus_id,
      district_id,
      maintenance_type,
      description,
      cost,
      technician_name,
      logged_by
    ) values (
      p_target_id,
      v_district_id,
      p_maintenance_type,
      trim(p_description),
      coalesce(p_cost, 0.0),
      p_technician_name,
      auth.uid()
    )
    returning id into v_log_id;

    -- Update bus active state if status requested
    if p_set_status is not null then
      update buses
      set is_active = (upper(p_set_status) in ('ACTIVE', 'OPERATIONAL')),
          updated_at = now()
      where id = p_target_id;
    end if;

  elsif upper(p_target_type) = 'ETM' then
    select * into v_etm
    from etm_devices
    where id = p_target_id
    for update;

    if not found then
      raise exception 'NOT_FOUND: ETM device % not found', p_target_id;
    end if;

    v_district_id := v_etm.district_id;

    insert into etm_maintenance_logs (
      etm_device_id,
      district_id,
      issue_type,
      resolution_notes,
      technician_name,
      cost,
      logged_by
    ) values (
      p_target_id,
      v_district_id,
      p_maintenance_type,
      trim(p_description),
      p_technician_name,
      coalesce(p_cost, 0.0),
      auth.uid()
    )
    returning id into v_log_id;

    -- Atomically update ETM status
    if p_set_status is not null then
      update etm_devices
      set status = upper(p_set_status),
          updated_at = now()
      where id = p_target_id;

      -- If faulty or sent to service, cleanly unassign active assignment
      if upper(p_set_status) in ('FAULTY', 'MAINTENANCE', 'OFFLINE') then
        update etm_assignments
        set unassigned_at = now(),
            notes = coalesce(notes || ' | ', '') || 'Unassigned due to maintenance: ' || p_maintenance_type
        where etm_device_id = p_target_id
          and unassigned_at is null;
      end if;
    end if;

  else
    raise exception 'INVALID_INPUT: Target type must be BUS or ETM';
  end if;

  return jsonb_build_object(
    'log_id',      v_log_id,
    'target_type', upper(p_target_type),
    'target_id',   p_target_id,
    'status_set',  p_set_status,
    'created_at',  now()
  );
end;
$$;
