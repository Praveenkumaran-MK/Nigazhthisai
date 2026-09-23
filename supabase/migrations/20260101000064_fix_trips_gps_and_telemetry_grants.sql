-- =============================================================================
-- Migration 064: Fix Trips GPS Telemetry UPDATE Grants and RLS
--
-- ROOT CAUSE OF 403 (Forbidden) on PATCH /rest/v1/trips:
-- 1. The Conductor PWA's useGpsTelemetry hook continuously updates active trips
--    with { gps_last_updated_at, current_latitude, current_longitude, current_speed, last_telemetry_at }.
-- 2. Previous migrations restricted column UPDATE on public.trips and omitted
--    current_speed and last_telemetry_at from the permitted column list.
-- 3. In PostgreSQL, attempting to UPDATE columns not in the GRANT list results
--    in a 403 Forbidden error on every GPS geolocation ping.
-- 4. In addition, INSERT grant on public.gps_logs was missing for authenticated.
-- =============================================================================

-- 1. Ensure all telemetry and operational columns exist on public.trips
alter table public.trips
  add column if not exists current_speed        double precision default 0,
  add column if not exists last_telemetry_at    timestamptz,
  add column if not exists gps_last_updated_at  timestamptz,
  add column if not exists current_latitude     double precision,
  add column if not exists current_longitude    double precision,
  add column if not exists schedule_adherence   text,
  add column if not exists delay_minutes        integer default 0,
  add column if not exists estimated_arrival    timestamptz;

-- 2. Grant table-level UPDATE on public.trips to authenticated
-- This allows conductors to stream GPS telemetry and admins to update operational
-- fields without column-level permission denial. Row-level security (RLS) protects rows.
grant update on public.trips to authenticated;

-- 3. Grant INSERT on public.gps_logs to authenticated for telemetry streaming
grant insert, select on public.gps_logs to authenticated;

-- 4. Harden trips_update RLS policy to ensure both conductors & admins can update trips
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update
  using (
    is_any_admin()
    or is_conductor_for_trip(id)
    or exists (
      select 1 from public.conductors c
      where c.user_id = auth.uid()
    )
  )
  with check (
    is_any_admin()
    or is_conductor_for_trip(id)
    or exists (
      select 1 from public.conductors c
      where c.user_id = auth.uid()
    )
  );

-- 5. Harden gps_logs RLS policy to ensure conductors can insert telemetry logs
drop policy if exists gps_logs_conductor_insert on public.gps_logs;
create policy gps_logs_conductor_insert on public.gps_logs
  for insert
  with check (
    is_any_admin()
    or conductor_id is null
    or conductor_id = current_conductor_id()
    or is_conductor_for_trip(trip_id)
    or exists (
      select 1 from public.conductors c
      where c.user_id = auth.uid()
    )
  );
