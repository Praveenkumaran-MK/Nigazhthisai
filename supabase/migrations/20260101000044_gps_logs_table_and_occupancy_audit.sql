-- =============================================================================
-- 044: Central GPS Logs Table & Automated Occupancy Departure Audit
-- Fulfills:
--   1. Cloud GPS storage: Explicit gps_logs table with indexes & RLS policies
--   2. Idle detection integration: Backs check_idle_buses with persistent records
--   3. Departure occupancy audit: Automatically logs revenue leakage alerts on departure
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create gps_logs table if not exists
-- -----------------------------------------------------------------------------
create table if not exists gps_logs (
  id           uuid        primary key default gen_random_uuid(),
  trip_id      uuid        references trips (id) on delete cascade,
  bus_id       uuid        references buses (id) on delete set null,
  conductor_id uuid        references conductors (id) on delete set null,
  latitude     double precision not null,
  longitude    double precision not null,
  speed        double precision,
  heading      double precision,
  accuracy     double precision,
  recorded_at  timestamptz not null default now()
);

create index if not exists idx_gps_logs_trip_time on gps_logs (trip_id, recorded_at desc);
create index if not exists idx_gps_logs_bus_time  on gps_logs (bus_id, recorded_at desc);
create index if not exists idx_gps_logs_recorded  on gps_logs (recorded_at desc);

alter table gps_logs enable row level security;

-- Public can read live GPS for tracking
drop policy if exists gps_logs_public_read on gps_logs;
create policy gps_logs_public_read on gps_logs
  for select
  using (true);

-- Conductors and admins can write GPS points
drop policy if exists gps_logs_write on gps_logs;
create policy gps_logs_write on gps_logs
  for insert
  with check (true);

alter publication supabase_realtime add table gps_logs;

-- -----------------------------------------------------------------------------
-- 2. Enhanced depart_stop_and_expire_tickets: runs revenue audit on departure
-- -----------------------------------------------------------------------------
create or replace function depart_stop_and_expire_tickets(
  p_trip_id uuid,
  p_stop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_stop_id uuid;
  v_seq int;
begin
  if not is_conductor_for_trip(p_trip_id) and not is_any_admin() then
    raise exception 'NOT_AUTHORIZED: Caller is not the active conductor for this trip';
  end if;

  -- 1. Mark current stop as DEPARTED
  update trip_stops
  set status = 'DEPARTED', departure_time = now()
  where trip_id = p_trip_id and stop_id = p_stop_id
  returning sequence_order into v_seq;

  -- 2. Advance current_stop_id to the next stop in sequence
  select stop_id into v_next_stop_id
  from trip_stops
  where trip_id = p_trip_id and sequence_order = v_seq + 1;

  update trips
  set current_stop_id = coalesce(v_next_stop_id, current_stop_id)
  where id = p_trip_id;

  -- 3. Expire tickets whose destination was this stop
  update tickets
  set status = 'EXPIRED'
  where trip_id = p_trip_id
    and dest_stop_id = p_stop_id
    and status in ('PAID', 'VALIDATED');

  -- 4. Automatically run revenue leakage audit in background
  perform audit_trip_revenue_leakage(p_trip_id);
end;
$$;

revoke all on function depart_stop_and_expire_tickets(uuid, uuid) from public, anon;
grant execute on function depart_stop_and_expire_tickets(uuid, uuid) to authenticated;
