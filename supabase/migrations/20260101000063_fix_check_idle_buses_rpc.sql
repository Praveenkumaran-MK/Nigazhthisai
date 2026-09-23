-- =============================================================================
-- Migration 063: Fix check_idle_buses RPC
--
-- ROOT CAUSE OF 400 Bad Request on /rpc/check_idle_buses:
-- 1. check_idle_buses was previously attempting to insert/filter alerts with
--    status 'OPEN' and 'INVESTIGATING', but alert_status enum only allows:
--    'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'.
-- 2. PostGIS calls (st_dwithin, st_makepoint) failed when search_path didn't
--    include 'extensions'.
-- 3. In early migrations check_idle_buses() returned void, preventing
--    CREATE OR REPLACE to integer without an explicit DROP FUNCTION.
-- 4. Explicit GRANT EXECUTE to authenticated and anon was missing under
--    restricted default privileges.
-- =============================================================================

-- Drop all historical function signatures
drop function if exists public.check_idle_buses();
drop function if exists public.check_idle_buses(integer);

create or replace function public.check_idle_buses()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_idle_minutes integer := 10;
  v_flagged      integer := 0;
  v_trip         record;
  v_last_time    timestamptz;
  v_elapsed_mins double precision;
  v_bus_number   text;
begin
  -- Fetch configurable threshold from transport_authority_config safely
  begin
    select coalesce(idle_alert_minutes, 10) into v_idle_minutes
    from public.transport_authority_config
    limit 1;
  exception when others then
    v_idle_minutes := 10;
  end;

  if v_idle_minutes is null or v_idle_minutes <= 0 then
    v_idle_minutes := 10;
  end if;

  for v_trip in
    select
      t.id as trip_id,
      t.bus_id,
      t.conductor_id,
      t.district_id,
      t.started_at,
      t.gps_last_updated_at,
      t.last_telemetry_at,
      b.bus_number
    from public.trips t
    left join public.buses b on b.id = t.bus_id
    where t.status = 'ACTIVE'
  loop
    -- Check timestamp from gps_logs first, or fallback to trip columns
    v_last_time := null;
    begin
      select max(recorded_at) into v_last_time
      from public.gps_logs
      where trip_id = v_trip.trip_id;
    exception when others then
      v_last_time := null;
    end;

    if v_last_time is null then
      v_last_time := coalesce(v_trip.last_telemetry_at, v_trip.gps_last_updated_at, v_trip.started_at);
    end if;

    if v_last_time is null then
      continue;
    end if;

    v_elapsed_mins := extract(epoch from (now() - v_last_time)) / 60.0;

    if v_elapsed_mins >= v_idle_minutes then
      -- Check if active or acknowledged alert already exists for this trip
      if not exists (
        select 1 from public.alerts
        where trip_id = v_trip.trip_id
          and status in ('ACTIVE', 'ACKNOWLEDGED')
      ) then
        v_bus_number := coalesce(v_trip.bus_number, 'Assigned Vehicle');

        insert into public.alerts (
          trip_id,
          bus_id,
          conductor_id,
          district_id,
          severity,
          status,
          title,
          message,
          source_role,
          bus_number_snapshot
        ) values (
          v_trip.trip_id,
          v_trip.bus_id,
          v_trip.conductor_id,
          v_trip.district_id,
          'WARNING',
          'ACTIVE',
          'Bus #' || v_bus_number || ' Idle Detected',
          'Vehicle #' || v_bus_number || ' has reported no GPS movement or telemetry heartbeat for ' || round(v_elapsed_mins::numeric) || ' minutes while on active service.',
          'system',
          v_bus_number
        );

        v_flagged := v_flagged + 1;
      end if;
    end if;
  end loop;

  return v_flagged;
end;
$$;

grant execute on function public.check_idle_buses() to authenticated, anon;
