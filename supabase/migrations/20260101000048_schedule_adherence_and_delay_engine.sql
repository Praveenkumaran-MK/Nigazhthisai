-- =============================================================================
-- 20260101000048_schedule_adherence_and_delay_engine.sql
-- Schedule Adherence & Delay Classification Engine
-- Continuously compares location polled from conductor phone (bus GPS) with
-- stop coordinates, calculating real-time ETA and classifying into ON_TIME/DELAYED.
-- =============================================================================

-- 1. Schema Expansion for Live Adherence & Spatial Telemetry
alter table public.trips
  add column if not exists schedule_adherence text default 'ON_TIME',
  add column if not exists delay_minutes integer default 0,
  add column if not exists current_latitude double precision,
  add column if not exists current_longitude double precision,
  add column if not exists current_speed double precision default 0,
  add column if not exists distance_to_next_stop_meters double precision,
  add column if not exists estimated_arrival_at_next_stop timestamptz,
  add column if not exists last_telemetry_at timestamptz;

alter table public.trip_stops
  add column if not exists delay_minutes integer default 0,
  add column if not exists adherence_status text default 'ON_TIME';

-- 2. Core Server-Side Adherence & Delay Engine Function
create or replace function public.evaluate_trip_schedule_adherence(
  p_trip_id uuid,
  p_lat double precision default null,
  p_lon double precision default null,
  p_speed double precision default null,
  p_timestamp timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_trip record;
  v_lat double precision := p_lat;
  v_lon double precision := p_lon;
  v_speed double precision := coalesce(p_speed, 0);
  v_time timestamptz := coalesce(p_timestamp, now());
  v_target_stop record;
  v_dist_meters double precision;
  v_speed_mps double precision;
  v_eta_seconds double precision;
  v_projected_arrival timestamptz;
  v_scheduled_arrival timestamptz;
  v_delay_minutes integer := 0;
  v_adherence text := 'ON_TIME';
  v_base_time timestamptz;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    return jsonb_build_object('error', 'Trip not found');
  end if;

  -- If coordinates not passed in, look up the latest GPS ping from gps_logs
  if v_lat is null or v_lon is null then
    select latitude, longitude, coalesce(speed, 0), recorded_at
    into v_lat, v_lon, v_speed, v_time
    from public.gps_logs
    where trip_id = p_trip_id
    order by recorded_at desc
    limit 1;
  end if;

  if v_lat is null or v_lon is null then
    return jsonb_build_object(
      'trip_id', p_trip_id,
      'schedule_adherence', 'ON_TIME',
      'delay_minutes', 0,
      'status', 'NO_GPS'
    );
  end if;

  -- Base departure time for schedule calculation
  v_base_time := coalesce(v_trip.started_at, v_trip.scheduled_departure, v_trip.created_at);

  -- Find the current target stop (first UPCOMING or ARRIVED in sequence)
  select ts.id as trip_stop_id, ts.stop_id, ts.sequence_order, ts.status,
         ts.expected_arrival_time, ts.arrival_time,
         s.name as stop_name, s.code as stop_code,
         st_y(s.location::geometry) as stop_lat,
         st_x(s.location::geometry) as stop_lon,
         rs.eta_offset_minutes
  into v_target_stop
  from public.trip_stops ts
  join public.stops s on s.id = ts.stop_id
  left join public.route_stops rs on rs.route_id = v_trip.route_id and rs.stop_id = ts.stop_id
  where ts.trip_id = p_trip_id
    and ts.status in ('UPCOMING', 'ARRIVED')
  order by ts.sequence_order asc
  limit 1;

  if not found then
    -- All stops have been departed, trip is concluding
    update public.trips
    set schedule_adherence = 'ON_TIME',
        delay_minutes = 0,
        last_telemetry_at = v_time,
        updated_at = now()
    where id = p_trip_id;

    return jsonb_build_object(
      'trip_id', p_trip_id,
      'schedule_adherence', 'ON_TIME',
      'delay_minutes', 0,
      'status', 'COMPLETED'
    );
  end if;

  -- Spatial Math: Haversine distance in meters between bus location & target stop
  v_dist_meters := 6371000 * 2 * asin(sqrt(
    power(sin(radians(v_lat - v_target_stop.stop_lat) / 2), 2) +
    cos(radians(v_target_stop.stop_lat)) * cos(radians(v_lat)) *
    power(sin(radians(v_lon - v_target_stop.stop_lon) / 2), 2)
  ));

  -- Speed in m/s (assume 25 km/h ~ 6.94 m/s if stopping or in congested traffic)
  if v_speed > 10 then
    v_speed_mps := least(v_speed * 1000.0 / 3600.0, 20.0);
  else
    v_speed_mps := 6.94;
  end if;

  v_eta_seconds := v_dist_meters / greatest(v_speed_mps, 1.0);
  v_projected_arrival := v_time + (v_eta_seconds || ' seconds')::interval;

  -- Determine Scheduled Arrival Time for this stop
  if v_target_stop.expected_arrival_time is not null then
    begin
      v_scheduled_arrival := v_target_stop.expected_arrival_time::timestamptz;
    exception when others then
      v_scheduled_arrival := (v_base_time::date || ' ' || v_target_stop.expected_arrival_time)::timestamptz;
    end;
  elsif v_target_stop.eta_offset_minutes is not null then
    v_scheduled_arrival := v_base_time + (v_target_stop.eta_offset_minutes || ' minutes')::interval;
  else
    -- Standard 12-minute transit corridor headway between sequential stops
    v_scheduled_arrival := v_base_time + ((v_target_stop.sequence_order - 1) * 12 || ' minutes')::interval;
  end if;

  -- Temporal Comparison (Actual / Projected vs Scheduled)
  if v_target_stop.status = 'ARRIVED' then
    v_delay_minutes := round(extract(epoch from (coalesce(v_target_stop.arrival_time, v_time) - v_scheduled_arrival)) / 60.0);
  else
    v_delay_minutes := round(extract(epoch from (v_projected_arrival - v_scheduled_arrival)) / 60.0);
  end if;

  -- Classification Threshold:
  -- ON_TIME if delay <= 5 minutes (standard Indian transit schedule tolerance [-5, +5])
  -- DELAYED if delay > 5 minutes
  -- EARLY if delay < -10 minutes
  if v_delay_minutes > 5 then
    v_adherence := 'DELAYED';
  elsif v_delay_minutes < -10 then
    v_adherence := 'EARLY';
  else
    v_adherence := 'ON_TIME';
  end if;

  -- Update Trips table with live spatial evaluation
  update public.trips
  set schedule_adherence = v_adherence,
      delay_minutes = v_delay_minutes,
      current_latitude = v_lat,
      current_longitude = v_lon,
      current_speed = v_speed,
      distance_to_next_stop_meters = round(v_dist_meters::numeric, 1),
      estimated_arrival_at_next_stop = v_projected_arrival,
      last_telemetry_at = v_time,
      updated_at = now()
  where id = p_trip_id;

  -- Update Trip_Stops table for this target stop
  update public.trip_stops
  set delay_minutes = v_delay_minutes,
      adherence_status = v_adherence
  where id = v_target_stop.trip_stop_id;

  return jsonb_build_object(
    'trip_id', p_trip_id,
    'schedule_adherence', v_adherence,
    'delay_minutes', v_delay_minutes,
    'distance_meters', round(v_dist_meters::numeric, 1),
    'target_stop', v_target_stop.stop_name,
    'target_stop_status', v_target_stop.status,
    'projected_arrival', v_projected_arrival,
    'scheduled_arrival', v_scheduled_arrival
  );
end;
$$;

grant execute on function public.evaluate_trip_schedule_adherence(uuid, double precision, double precision, double precision, timestamptz) to authenticated, anon;

-- 3. Batch Evaluation for All Active Trips in Fleet
create or replace function public.evaluate_all_active_trips_adherence()
returns table (
  trip_id uuid,
  schedule_adherence text,
  delay_minutes integer,
  distance_meters numeric
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  eval_res jsonb;
begin
  for r in select id from public.trips where status = 'ACTIVE' loop
    eval_res := public.evaluate_trip_schedule_adherence(r.id);
    trip_id := r.id;
    schedule_adherence := eval_res->>'schedule_adherence';
    delay_minutes := (eval_res->>'delay_minutes')::integer;
    distance_meters := (eval_res->>'distance_meters')::numeric;
    return next;
  end loop;
end;
$$;

grant execute on function public.evaluate_all_active_trips_adherence() to authenticated, anon;

-- 4. Unified Automated Trigger on GPS Logs: Stop Progression + Schedule Adherence Engine
create or replace function public.auto_advance_trip_on_gps()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_trip_status       text;
  v_curr_stop         record;
  v_dist_meters       numeric;
begin
  if new.trip_id is null or new.latitude is null or new.longitude is null then
    return new;
  end if;

  select status into v_trip_status from public.trips where id = new.trip_id;
  if v_trip_status <> 'ACTIVE' then
    return new;
  end if;

  -- 1. Execute Schedule Adherence & Delay Classification Engine
  perform public.evaluate_trip_schedule_adherence(
    new.trip_id,
    new.latitude,
    new.longitude,
    new.speed,
    new.recorded_at
  );

  -- 2. Find target stop for Arrival / Departure geofence check
  select ts.id as trip_stop_id, ts.stop_id, ts.sequence_order, ts.status,
         st_y(s.location::geometry) as lat,
         st_x(s.location::geometry) as lon
  into v_curr_stop
  from public.trip_stops ts
  join public.stops s on s.id = ts.stop_id
  where ts.trip_id = new.trip_id
    and ts.status in ('UPCOMING', 'ARRIVED')
  order by ts.sequence_order asc
  limit 1;

  if not found then
    return new;
  end if;

  -- Calculate distance in meters using Haversine formula
  v_dist_meters := 6371000 * 2 * asin(sqrt(
    power(sin(radians(new.latitude - v_curr_stop.lat) / 2), 2) +
    cos(radians(v_curr_stop.lat)) * cos(radians(new.latitude)) *
    power(sin(radians(new.longitude - v_curr_stop.lon) / 2), 2)
  ));

  -- A. If within 150m and status is UPCOMING, mark stop as ARRIVED
  if v_dist_meters <= 150 and v_curr_stop.status = 'UPCOMING' then
    update public.trip_stops
    set status = 'ARRIVED',
        arrival_time = coalesce(arrival_time, now())
    where id = v_curr_stop.trip_stop_id;

    update public.trips
    set current_stop_id = v_curr_stop.stop_id,
        updated_at = now()
    where id = new.trip_id;

  -- B. If stop was already ARRIVED and bus has moved away (> 200m), auto-depart
  elsif v_dist_meters > 200 and v_curr_stop.status = 'ARRIVED' then
    perform public.depart_stop_and_expire_tickets(new.trip_id, v_curr_stop.stop_id);
  end if;

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists trg_auto_advance_trip_on_gps on public.gps_logs;
create trigger trg_auto_advance_trip_on_gps
  after insert on public.gps_logs
  for each row execute function public.auto_advance_trip_on_gps();

notify pgrst, 'reload schema';
