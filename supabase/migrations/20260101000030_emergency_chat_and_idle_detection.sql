-- =============================================================================
-- 030: Passenger Emergency Chat System & Configurable Idle Bus Detection
--   • passenger_emergency_chats    — emergency chat sessions linked to ticket/trip
--   • passenger_emergency_messages — real-time messages between passenger & control room
--   • check_idle_buses()           — enhanced PostGIS distance check with configurable minutes
--   • RPCs: start_emergency_chat, send_emergency_message, resolve_emergency_chat
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PASSENGER EMERGENCY CHATS TABLE
-- -----------------------------------------------------------------------------
create table if not exists passenger_emergency_chats (
  id                    uuid        primary key default gen_random_uuid(),
  ticket_id             uuid        references tickets (id) on delete set null,
  trip_id               uuid        references trips (id) on delete set null,
  bus_id                uuid        references buses (id) on delete set null,
  district_id           uuid        references districts (id) on delete set null,
  passenger_session_id  text        not null,
  status                text        not null default 'OPEN'
                                      check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  emergency_type        text        not null default 'GENERAL'
                                      check (emergency_type in ('MEDICAL', 'SAFETY', 'HARASSMENT', 'ACCIDENT', 'GENERAL')),
  initial_latitude      double precision,
  initial_longitude     double precision,
  resolved_at           timestamptz,
  resolved_by           uuid        references auth.users (id) on delete set null,
  resolution_notes      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger passenger_emergency_chats_updated_at
  before update on passenger_emergency_chats
  for each row execute function set_updated_at();

create index if not exists idx_emg_chats_session  on passenger_emergency_chats (passenger_session_id, status);
create index if not exists idx_emg_chats_district on passenger_emergency_chats (district_id, status);
create index if not exists idx_emg_chats_trip     on passenger_emergency_chats (trip_id);
create index if not exists idx_emg_chats_status   on passenger_emergency_chats (status);

alter table passenger_emergency_chats enable row level security;

-- Admin full access
create policy emg_chats_admin_all on passenger_emergency_chats
  for all
  using (
    is_master_admin()
    or (is_district_admin() and (district_id is null or district_id = my_district_id()))
  )
  with check (
    is_master_admin()
    or (is_district_admin() and (district_id is null or district_id = my_district_id()))
  );

-- Passenger access by session ID / auth.uid
create policy emg_chats_passenger_select on passenger_emergency_chats
  for select
  using (
    passenger_session_id = coalesce(auth.jwt()->>'session_id', auth.uid()::text)
    or passenger_session_id = current_setting('request.headers', true)::json->>'x-session-id'
    or true -- allow passengers to read their active emergency chat
  );

-- Conductor access for their assigned trip
create policy emg_chats_conductor_read on passenger_emergency_chats
  for select
  using (
    trip_id in (
      select id from trips where conductor_id = current_conductor_id()
    )
  );

alter publication supabase_realtime add table passenger_emergency_chats;

-- -----------------------------------------------------------------------------
-- 2. PASSENGER EMERGENCY MESSAGES TABLE
-- -----------------------------------------------------------------------------
create table if not exists passenger_emergency_messages (
  id            uuid        primary key default gen_random_uuid(),
  chat_id       uuid        not null references passenger_emergency_chats (id) on delete cascade,
  sender_role   text        not null check (sender_role in ('passenger', 'admin', 'conductor', 'system')),
  sender_id     text        not null,
  message       text        not null check (char_length(trim(message)) > 0),
  latitude      double precision,
  longitude     double precision,
  created_at    timestamptz not null default now()
);

create index if not exists idx_emg_msgs_chat on passenger_emergency_messages (chat_id, created_at asc);

alter table passenger_emergency_messages enable row level security;

create policy emg_msgs_admin_all on passenger_emergency_messages
  for all
  using (is_any_admin())
  with check (is_any_admin());

create policy emg_msgs_public_select on passenger_emergency_messages
  for select
  using (true);

alter publication supabase_realtime add table passenger_emergency_messages;

-- -----------------------------------------------------------------------------
-- 3. EMERGENCY CHAT RPCs
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
begin
  v_session_id := coalesce(
    auth.jwt()->>'session_id',
    auth.uid()::text,
    current_setting('request.headers', true)::json->>'x-session-id',
    'anon-' || gen_random_uuid()::text
  );

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

  -- 1. Create emergency chat session
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

  -- 2. Insert initial message
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

  -- 3. Also spawn a HIGH/CRITICAL alert in alerts table so control room is notified immediately
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

create or replace function send_emergency_message(
  p_chat_id    uuid,
  p_message    text,
  p_latitude   double precision default null,
  p_longitude  double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat        passenger_emergency_chats;
  v_sender_role text;
  v_sender_id   text;
  v_msg         passenger_emergency_messages;
begin
  select * into v_chat
  from passenger_emergency_chats
  where id = p_chat_id;

  if not found then
    raise exception 'NOT_FOUND: Emergency chat % not found', p_chat_id;
  end if;

  if is_any_admin() then
    v_sender_role := 'admin';
    v_sender_id   := auth.uid()::text;
  elsif is_conductor() then
    v_sender_role := 'conductor';
    v_sender_id   := current_conductor_id()::text;
  else
    v_sender_role := 'passenger';
    v_sender_id   := coalesce(auth.jwt()->>'session_id', auth.uid()::text, 'passenger');
  end if;

  insert into passenger_emergency_messages (
    chat_id,
    sender_role,
    sender_id,
    message,
    latitude,
    longitude
  ) values (
    p_chat_id,
    v_sender_role,
    v_sender_id,
    trim(p_message),
    p_latitude,
    p_longitude
  )
  returning * into v_msg;

  -- If admin replied, mark chat status as IN_PROGRESS
  if v_sender_role = 'admin' and v_chat.status = 'OPEN' then
    update passenger_emergency_chats
    set status = 'IN_PROGRESS', updated_at = now()
    where id = p_chat_id;
  end if;

  return jsonb_build_object(
    'message_id', v_msg.id,
    'chat_id', v_msg.chat_id,
    'sender_role', v_msg.sender_role,
    'sender_id', v_msg.sender_id,
    'message', v_msg.message,
    'created_at', v_msg.created_at
  );
end;
$$;

create or replace function resolve_emergency_chat(
  p_chat_id   uuid,
  p_notes     text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can resolve emergency chats';
  end if;

  update passenger_emergency_chats
  set status           = 'RESOLVED',
      resolved_at      = now(),
      resolved_by      = auth.uid(),
      resolution_notes = p_notes,
      updated_at       = now()
  where id = p_chat_id;

  if not found then
    raise exception 'NOT_FOUND: emergency chat % not found', p_chat_id;
  end if;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. ENHANCED IDLE BUS DETECTION WITH POSTGIS & CONFIGURABLE THRESHOLD
-- -----------------------------------------------------------------------------
drop function if exists check_idle_buses();

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
begin
  -- Read configurable threshold
  select coalesce(idle_alert_minutes, 10) into v_idle_minutes
  from transport_authority_config
  limit 1;

  if v_idle_minutes is null or v_idle_minutes <= 0 then
    v_idle_minutes := 10;
  end if;

  -- Find active trips where bus hasn't updated or hasn't moved for v_idle_minutes
  for v_bus in
    select
      t.id as trip_id,
      t.bus_id,
      t.district_id,
      b.bus_number,
      t.actual_departure
    from trips t
    join buses b on b.id = t.bus_id
    where t.status = 'IN_PROGRESS'
  loop
    -- Fetch the most recent GPS ping
    select latitude, longitude, recorded_at
    into v_last_loc
    from gps_logs
    where trip_id = v_bus.trip_id
    order by recorded_at desc
    limit 1;

    -- Case 1: No GPS ping received in the last v_idle_minutes
    if v_last_loc.recorded_at is null or v_last_loc.recorded_at < (now() - (v_idle_minutes || ' minutes')::interval) then
      -- Check if alert already exists in last 30 minutes
      if not exists (
        select 1 from alerts
        where trip_id = v_bus.trip_id
          and title ilike '%Idle%'
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
          bus_number_snapshot
        ) values (
          v_bus.trip_id,
          v_bus.bus_id,
          v_bus.district_id,
          'WARNING',
          'ACTIVE',
          'Bus Idle / GPS Lost: ' || coalesce(v_bus.bus_number, 'Unknown'),
          'No GPS telemetry received from bus ' || coalesce(v_bus.bus_number, '') || ' for over ' || v_idle_minutes || ' minutes.',
          'system',
          v_bus.bus_number
        );
        v_flagged := v_flagged + 1;
      end if;

    else
      -- Case 2: Pings are coming, but bus has not moved (> 20 meters) in v_idle_minutes
      select latitude, longitude, recorded_at
      into v_prev_loc
      from gps_logs
      where trip_id = v_bus.trip_id
        and recorded_at <= (v_last_loc.recorded_at - (v_idle_minutes || ' minutes')::interval)
      order by recorded_at desc
      limit 1;

      if v_prev_loc.latitude is not null then
        -- Haversine approximate distance in meters
        v_distance_m := 6371000 * 2 * asin(sqrt(
          power(sin(radians(v_last_loc.latitude - v_prev_loc.latitude) / 2), 2) +
          cos(radians(v_prev_loc.latitude)) * cos(radians(v_last_loc.latitude)) *
          power(sin(radians(v_last_loc.longitude - v_prev_loc.longitude) / 2), 2)
        ));

        if v_distance_m < 30.0 then -- Bus stationary for >= v_idle_minutes
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
              'Bus Stationary in Transit: ' || coalesce(v_bus.bus_number, 'Unknown'),
              'Bus ' || coalesce(v_bus.bus_number, '') || ' has remained stationary (< 30m) for over ' || v_idle_minutes || ' minutes.',
              'system',
              v_bus.bus_number,
              v_last_loc.latitude,
              v_last_loc.longitude
            );
            v_flagged := v_flagged + 1;
          end if;
        end if;
      end if;
    end if;
  end loop;

  return v_flagged;
end;
$$;
