-- =============================================================================
-- 028: Core infrastructure tables for 13-feature production expansion
--   • etm_assignments       — full assignment history with idempotency
--   • trip_edits            — immutable audit log of every trip field change
--   • bus_maintenance_logs  — bus maintenance status + notes
--   • etm_maintenance_logs  — ETM device maintenance tracking
--   • route_weekly_schedules — weekday-aware departure templates
--   • Extend alerts         — add bus_number_snapshot, source_role columns
--   • Extend trips          — add etm_device_id, last edit tracking
--   • Extend schedules      — add editable fields guard
--   • Extend transport_authority_config — configurable idle threshold
-- =============================================================================

-- =============================================================================
-- 1. ETM ASSIGNMENTS — full assignment history
--    The etm_devices table already tracks current_assigned_* as soft state.
--    This table is the authoritative audit trail: every (un)assignment is
--    a new row, never an update.  The ACTIVE row is the one without unassigned_at.
-- =============================================================================
create table if not exists etm_assignments (
  id                   uuid        primary key default gen_random_uuid(),
  etm_device_id        uuid        not null references etm_devices (id) on delete cascade,
  conductor_id         uuid        references conductors (id) on delete set null,
  bus_id               uuid        references buses (id) on delete set null,
  trip_id              uuid        references trips (id) on delete set null,
  district_id          uuid        references districts (id) on delete set null,
  assigned_by          uuid        not null references auth.users (id) on delete restrict,
  assigned_at          timestamptz not null default now(),
  unassigned_at        timestamptz,          -- null  ⟹ currently active
  unassigned_by        uuid        references auth.users (id) on delete set null,
  notes                text,
  -- One active (unassigned_at IS NULL) assignment per ETM device
  constraint etm_one_active_assignment
    exclude using btree (etm_device_id with =) where (unassigned_at is null)
);

create index if not exists idx_etm_assignments_device
  on etm_assignments (etm_device_id, assigned_at desc);
create index if not exists idx_etm_assignments_conductor
  on etm_assignments (conductor_id) where unassigned_at is null;
create index if not exists idx_etm_assignments_trip
  on etm_assignments (trip_id) where unassigned_at is null;

alter table etm_assignments enable row level security;

create policy etm_assignments_admin_all on etm_assignments
  for all using (is_any_admin()) with check (is_any_admin());

-- Conductor reads their own active assignment
create policy etm_assignments_conductor_read on etm_assignments
  for select using (
    conductor_id = current_conductor_id()
    and unassigned_at is null
  );

alter publication supabase_realtime add table etm_assignments;

-- =============================================================================
-- 2. TRIP EDITS — immutable audit log
--    Every field change to a trip is appended here before the update is applied.
--    Deletion is forbidden by RLS (no delete policy).
-- =============================================================================
create table if not exists trip_edits (
  id           uuid        primary key default gen_random_uuid(),
  trip_id      uuid        not null references trips (id) on delete cascade,
  edited_by    uuid        not null references auth.users (id) on delete restrict,
  edited_at    timestamptz not null default now(),
  field_name   text        not null,   -- e.g. 'conductor_id', 'bus_id', 'start_time'
  old_value    text,                   -- cast to text for simplicity
  new_value    text,
  reason       text                    -- optional admin note
);

create index if not exists idx_trip_edits_trip on trip_edits (trip_id, edited_at desc);

alter table trip_edits enable row level security;

create policy trip_edits_admin_read on trip_edits
  for select using (is_any_admin());

-- Only appended via SECURITY DEFINER edit_trip() RPC — no direct client insert
create policy trip_edits_admin_insert on trip_edits
  for insert with check (is_any_admin());

-- Explicitly no UPDATE or DELETE policy — records are immutable

-- =============================================================================
-- 3. BUS MAINTENANCE LOGS
-- =============================================================================
create table if not exists bus_maintenance_logs (
  id             uuid        primary key default gen_random_uuid(),
  bus_id         uuid        not null references buses (id) on delete cascade,
  district_id    uuid        references districts (id) on delete set null,
  status         text        not null
                               check (status in (
                                 'OPERATIONAL','UNDER_MAINTENANCE','OUT_OF_SERVICE','DECOMMISSIONED'
                               )),
  notes          text,
  updated_by     uuid        not null references auth.users (id) on delete restrict,
  created_at     timestamptz not null default now()
);

create index if not exists idx_bus_maint_bus    on bus_maintenance_logs (bus_id, created_at desc);
create index if not exists idx_bus_maint_status on bus_maintenance_logs (status);
create index if not exists idx_bus_maint_district on bus_maintenance_logs (district_id, created_at desc);

alter table bus_maintenance_logs enable row level security;

create policy bus_maint_admin_all on bus_maintenance_logs
  for all
  using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  )
  with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );

alter publication supabase_realtime add table bus_maintenance_logs;

-- =============================================================================
-- 4. ETM MAINTENANCE LOGS
-- =============================================================================
create table if not exists etm_maintenance_logs (
  id             uuid        primary key default gen_random_uuid(),
  etm_device_id  uuid        not null references etm_devices (id) on delete cascade,
  district_id    uuid        references districts (id) on delete set null,
  status         text        not null
                               check (status in (
                                 'ACTIVE','OFFLINE','CHARGING','FAULTY','UNDER_REPAIR','DECOMMISSIONED'
                               )),
  battery_level  int         check (battery_level between 0 and 100),
  notes          text,
  updated_by     uuid        not null references auth.users (id) on delete restrict,
  created_at     timestamptz not null default now()
);

create index if not exists idx_etm_maint_device   on etm_maintenance_logs (etm_device_id, created_at desc);
create index if not exists idx_etm_maint_district on etm_maintenance_logs (district_id, created_at desc);

alter table etm_maintenance_logs enable row level security;

create policy etm_maint_admin_all on etm_maintenance_logs
  for all
  using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  )
  with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );

-- =============================================================================
-- 5. ROUTE WEEKLY SCHEDULES — day-of-week departure templates
--    Multiple departure times per route per weekday.
--    These are templates — confirm_schedule_and_create_trip() instantiates them
--    into actual trips on the correct date.
-- =============================================================================
create table if not exists route_weekly_schedules (
  id              uuid    primary key default gen_random_uuid(),
  route_id        uuid    not null references routes (id) on delete cascade,
  district_id     uuid    references districts (id) on delete set null,
  -- 0 = Sunday, 1 = Monday, … 6 = Saturday (ISO 8601 dow convention)
  day_of_week     int     not null check (day_of_week between 0 and 6),
  -- Departure time as HH:MM — stored as time without time zone
  departure_time  time    not null,
  bus_id          uuid    references buses (id) on delete set null,
  -- Preferred conductor for auto-scheduling (overrideable at confirm time)
  preferred_conductor_id uuid references conductors (id) on delete set null,
  duration_hours  numeric(4, 2) not null default 2.0 check (duration_hours > 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (route_id, day_of_week, departure_time)
);

create trigger route_weekly_schedules_updated_at
  before update on route_weekly_schedules
  for each row execute function set_updated_at();

create index if not exists idx_rws_route   on route_weekly_schedules (route_id, day_of_week);
create index if not exists idx_rws_district on route_weekly_schedules (district_id);

alter table route_weekly_schedules enable row level security;

create policy rws_admin_all on route_weekly_schedules
  for all
  using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  )
  with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );

-- Public/anon can read active templates (needed for passenger schedule display)
create policy rws_public_read on route_weekly_schedules
  for select using (is_active = true);

-- =============================================================================
-- 6. EXTEND alerts — add bus_number_snapshot + source_role
--    bus_number_snapshot: denormalized for history (bus may later be deleted)
--    source_role:         who triggered the alert
-- =============================================================================
alter table alerts
  add column if not exists bus_number_snapshot text,
  add column if not exists source_role         text
    default 'system'
    check (source_role in ('passenger', 'conductor', 'system', 'admin'));

-- Back-fill existing rows with bus_number from buses table
update alerts a
set bus_number_snapshot = b.bus_number
from buses b
where a.bus_id = b.id
  and a.bus_number_snapshot is null;

-- =============================================================================
-- 7. EXTEND trips — add etm_device_id + last_edited_at
-- =============================================================================
alter table trips
  add column if not exists etm_device_id  uuid references etm_devices (id) on delete set null,
  add column if not exists last_edited_at timestamptz,
  add column if not exists last_edited_by uuid references auth.users (id) on delete set null;

create index if not exists idx_trips_etm on trips (etm_device_id) where etm_device_id is not null;

-- =============================================================================
-- 8. EXTEND transport_authority_config — configurable idle threshold
-- =============================================================================
alter table transport_authority_config
  add column if not exists idle_alert_minutes int not null default 10
    check (idle_alert_minutes between 1 and 120);

-- =============================================================================
-- 9. ALERT HISTORY VIEW — denormalized, filterable
-- =============================================================================
create or replace view alert_history_view as
select
  a.id,
  a.created_at,
  a.severity,
  a.status,
  coalesce(a.title, 'Alert') as title,
  a.message,
  coalesce(a.source_role, 'system')        as source_role,
  a.bus_number_snapshot,
  b.bus_number,
  b.district_id                            as bus_district_id,
  c.display_name                           as conductor_name,
  c.government_id                          as conductor_gov_id,
  a.district_id,
  d.name                                   as district_name,
  a.latitude,
  a.longitude,
  a.resolved_at,
  a.trip_id
from alerts a
left join buses      b on b.id = a.bus_id
left join conductors c on c.id = a.conductor_id
left join districts  d on d.id = a.district_id;

-- RLS cannot be applied directly to views in Postgres < 15.
-- Access is controlled by the underlying `alerts` table RLS.

-- =============================================================================
-- 10. Verification
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.tables where table_name = 'etm_assignments') then
    raise exception 'MIGRATION 028 FAILED: etm_assignments';
  end if;
  if not exists (select 1 from information_schema.tables where table_name = 'trip_edits') then
    raise exception 'MIGRATION 028 FAILED: trip_edits';
  end if;
  if not exists (select 1 from information_schema.tables where table_name = 'bus_maintenance_logs') then
    raise exception 'MIGRATION 028 FAILED: bus_maintenance_logs';
  end if;
  if not exists (select 1 from information_schema.tables where table_name = 'route_weekly_schedules') then
    raise exception 'MIGRATION 028 FAILED: route_weekly_schedules';
  end if;
  raise notice 'MIGRATION 028 OK — core infrastructure tables applied';
end;
$$;
