-- -----------------------------------------------------------------------------
-- 049: Passenger Emergency SOS & Admin Live Bidirectional Chat Linkage
-- -----------------------------------------------------------------------------

-- 1. Add chat_id to alerts so Admin can directly identify and join passenger emergency chats
alter table public.alerts add column if not exists chat_id uuid references public.passenger_emergency_chats(id) on delete set null;
create index if not exists idx_alerts_chat_id on public.alerts(chat_id);

-- 2. Update start_emergency_chat to populate alerts.chat_id
create or replace function public.start_emergency_chat(
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

  -- Anti-Abuse Rate Limiting: Max 5 emergency reports per session/user in 15 minutes
  select count(*) into v_recent_count
  from passenger_emergency_chats
  where passenger_session_id = v_session_id
    and created_at > (now() - interval '15 minutes');

  if v_recent_count >= 5 then
    raise exception 'RATE_LIMITED: Maximum emergency alerts exceeded. Please contact emergency services directly via 112.';
  end if;

  -- Validate ticket if provided
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

  -- Create emergency chat session
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

  -- Insert initial message
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

  -- Spawn emergency alert for control room with linked chat_id
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
    longitude,
    chat_id
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
    p_longitude,
    v_chat.id
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

grant execute on function public.start_emergency_chat(uuid, text, text, double precision, double precision) to authenticated, anon;

-- 3. Update send_emergency_message
create or replace function public.send_emergency_message(
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
    v_sender_id   := coalesce(auth.uid()::text, 'admin');
  elsif is_conductor() then
    v_sender_role := 'conductor';
    v_sender_id   := coalesce(current_conductor_id()::text, 'conductor');
  else
    v_sender_role := 'passenger';
    v_sender_id   := coalesce(
      auth.jwt()->>'session_id',
      auth.uid()::text,
      current_setting('request.headers', true)::json->>'x-session-id',
      'anon'
    );
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

  -- If Admin replies, update status to IN_PROGRESS and refresh updated_at
  if v_sender_role = 'admin' and v_chat.status = 'OPEN' then
    update passenger_emergency_chats
    set status = 'IN_PROGRESS',
        updated_at = now()
    where id = p_chat_id;
  else
    update passenger_emergency_chats
    set updated_at = now()
    where id = p_chat_id;
  end if;

  return jsonb_build_object(
    'message_id',  v_msg.id,
    'chat_id',     v_msg.chat_id,
    'sender_role', v_msg.sender_role,
    'message',     v_msg.message,
    'created_at',  v_msg.created_at
  );
end;
$$;

grant execute on function public.send_emergency_message(uuid, text, double precision, double precision) to authenticated, anon;

-- 4. Update resolve_emergency_chat
create or replace function public.resolve_emergency_chat(
  p_chat_id   uuid,
  p_notes     text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_any_admin() and not is_conductor() then
    raise exception 'FORBIDDEN: only administrators or conductors can resolve emergency chats';
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

  -- Also resolve linked alert if exists
  update public.alerts
  set status = 'RESOLVED',
      resolved_at = now()
  where chat_id = p_chat_id
    and status != 'RESOLVED';

  return true;
end;
$$;

grant execute on function public.resolve_emergency_chat(uuid, text) to authenticated, anon;

notify pgrst, 'reload schema';
