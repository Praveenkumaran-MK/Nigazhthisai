-- =============================================================================
-- Migration 066: Fix Schedule Adherence Check Constraints
--
-- ROOT CAUSE OF 400 Bad Request on evaluate_trip_schedule_adherence:
-- 1. Migration 060 added check constraints chk_trips_schedule_adherence and
--    chk_trip_stops_adherence_status enforcing:
--    ('ON_TIME', 'EARLY', 'LATE', 'VERY_LATE').
-- 2. However, the schedule adherence engine (migration 048) and all UI clients
--    (FleetPage, TicketPage, DashboardPage, BusPipelineTracker) classify delayed
--    buses (> 5 min) as 'DELAYED'.
-- 3. Setting 'DELAYED' threw a check constraint violation error in PostgreSQL,
--    which PostgREST surfaced as HTTP 400 Bad Request.
-- =============================================================================

-- 1. Allow 'DELAYED' in trips.schedule_adherence check constraint
alter table public.trips drop constraint if exists chk_trips_schedule_adherence;

alter table public.trips
  add constraint chk_trips_schedule_adherence
    check (schedule_adherence in ('ON_TIME', 'EARLY', 'DELAYED', 'LATE', 'VERY_LATE'));

-- 2. Allow 'DELAYED' in trip_stops.adherence_status check constraint
alter table public.trip_stops drop constraint if exists chk_trip_stops_adherence_status;

alter table public.trip_stops
  add constraint chk_trip_stops_adherence_status
    check (adherence_status in ('ON_TIME', 'EARLY', 'DELAYED', 'LATE', 'VERY_LATE'));

-- 3. Ensure permissions on evaluate_trip_schedule_adherence
grant execute on function public.evaluate_trip_schedule_adherence(uuid, double precision, double precision, double precision, timestamptz) to authenticated, anon;
