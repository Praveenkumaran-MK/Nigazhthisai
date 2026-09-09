-- =============================================================================
-- 037: Fix Trip Scheduling, Columns, and Multi-Tier Admin RPCs
--
-- 1. Adds scheduled_departure & scheduled_arrival to trips table.
-- 2. Updates confirm_schedule_and_create_trip to support both master_admin
--    and district_admin (is_any_admin()), populating scheduled dates & district_id.
-- 3. Provides direct_schedule_trip RPC to create and materialize trips in 1 step.
-- =============================================================================

-- 1. Ensure scheduled_departure, scheduled_arrival, and district_id exist on trips
alter table public.trips
  add column if not exists scheduled_departure timestamptz,
  add column if not exists scheduled_arrival timestamptz,
  add column if not exists district_id uuid references public.districts(id) on delete set null;

-- Back-fill scheduled_departure if null
update public.trips
set scheduled_departure = coalesce(started_at, created_at)
where scheduled_departure is null;

-- 2. Update confirm_schedule_and_create_trip
create or replace function public.confirm_schedule_and_create_trip(
  p_schedule_id uuid,
  p_conductor_id uuid
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules;
  v_route public.routes;
  v_trip public.trips;
  v_district_id uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can confirm schedules and create trips';
  end if;

  select * into v_schedule from public.schedules where id = p_schedule_id for update;

  if v_schedule is null then
    raise exception 'SCHEDULE_NOT_FOUND';
  end if;

  if v_schedule.status <> 'PLANNED' then
    raise exception 'SCHEDULE_NOT_PLANNED';
  end if;

  if not exists (select 1 from public.conductors where id = p_conductor_id and is_active) then
    raise exception 'INVALID_CONDUCTOR';
  end if;

  -- Determine district
  select district_id into v_district_id from public.routes where id = v_schedule.route_id;
  if v_district_id is null then
    v_district_id := my_district_id();
  end if;

  insert into public.trips (
    bus_id,
    route_id,
    conductor_id,
    service_date,
    scheduled_departure,
    scheduled_arrival,
    district_id,
    status
  )
  values (
    v_schedule.bus_id,
    v_schedule.route_id,
    p_conductor_id,
    v_schedule.scheduled_start::date,
    v_schedule.scheduled_start,
    v_schedule.scheduled_end,
    v_district_id,
    'SCHEDULED'
  )
  returning * into v_trip;

  -- Populate trip stops from route stops
  insert into public.trip_stops (trip_id, stop_id, sequence_order)
  select v_trip.id, rs.stop_id, rs.sequence_order
  from public.route_stops rs
  where rs.route_id = v_schedule.route_id
  order by rs.sequence_order;

  -- Mark schedule confirmed
  update public.schedules set status = 'CONFIRMED' where id = p_schedule_id;

  return v_trip;
end;
$$;

grant execute on function public.confirm_schedule_and_create_trip(uuid, uuid) to authenticated;

-- 3. New direct_schedule_trip RPC to create schedule + materialize trip in 1 atomic step
create or replace function public.direct_schedule_trip(
  p_route_id uuid,
  p_bus_id uuid,
  p_conductor_id uuid,
  p_scheduled_departure timestamptz,
  p_duration_hours numeric default 2.0
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheduled_end timestamptz;
  v_district_id uuid;
  v_trip public.trips;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Administrator authorization required';
  end if;

  if p_route_id is null or p_bus_id is null or p_scheduled_departure is null then
    raise exception 'INVALID_ARGUMENTS: Route, bus, and departure time are required';
  end if;

  v_scheduled_end := p_scheduled_departure + (coalesce(p_duration_hours, 2.0) || ' hours')::interval;

  -- Resolve district
  select district_id into v_district_id from public.routes where id = p_route_id;
  if v_district_id is null then
    v_district_id := my_district_id();
  end if;

  -- Create schedule record
  insert into public.schedules (
    route_id,
    bus_id,
    scheduled_start,
    scheduled_end,
    status
  )
  values (
    p_route_id,
    p_bus_id,
    p_scheduled_departure,
    v_scheduled_end,
    'CONFIRMED'
  );

  -- Create trip record
  insert into public.trips (
    bus_id,
    route_id,
    conductor_id,
    service_date,
    scheduled_departure,
    scheduled_arrival,
    district_id,
    status
  )
  values (
    p_bus_id,
    p_route_id,
    p_conductor_id,
    p_scheduled_departure::date,
    p_scheduled_departure,
    v_scheduled_end,
    v_district_id,
    'SCHEDULED'
  )
  returning * into v_trip;

  -- Insert trip stops
  insert into public.trip_stops (trip_id, stop_id, sequence_order)
  select v_trip.id, rs.stop_id, rs.sequence_order
  from public.route_stops rs
  where rs.route_id = p_route_id
  order by rs.sequence_order;

  return v_trip;
end;
$$;

grant execute on function public.direct_schedule_trip(uuid, uuid, uuid, timestamptz, numeric) to authenticated;
