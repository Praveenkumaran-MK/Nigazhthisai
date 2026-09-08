-- =============================================================================
-- 021: Multi-district schema
-- Introduces a first-class `districts` table and attaches a district_id FK to
-- every entity that must be district-scoped: stops, routes, buses, conductors,
-- schedules.  Also adds the `master_admin` role so the governance hierarchy
-- (State Authority → District Admin) can be expressed in RLS (migration 022).
-- Profiles gain district_id (null = master_admin / cross-district access).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New enum value — must come before any table that references it.
--    Postgres requires that ADD VALUE runs outside a transaction block when
--    the enum is used by existing rows; here it is safe because no profiles
--    row yet has role = 'master_admin'.
-- -----------------------------------------------------------------------------
alter type user_role add value if not exists 'master_admin';
alter type user_role add value if not exists 'driver';
alter type user_role add value if not exists 'inspector';

-- -----------------------------------------------------------------------------
-- 2. districts — state-level authority creates districts; each district admin
--    is scoped to exactly one.
-- -----------------------------------------------------------------------------
create table if not exists districts (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  code        text        not null unique,   -- short code, e.g. 'TUP', 'CHE', 'CBE'
  state       text        not null default 'Tamil Nadu',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger districts_set_updated_at
  before update on districts
  for each row execute function set_updated_at();

-- RLS immediately — admin writes, public can read district names (needed for
-- the passenger district filter and admin dropdowns).
alter table districts enable row level security;
create policy districts_public_read  on districts for select using (true);
create policy districts_admin_write  on districts for insert with check (is_admin());
create policy districts_admin_update on districts for update using (is_admin()) with check (is_admin());
create policy districts_admin_delete on districts for delete using (is_admin());

-- -----------------------------------------------------------------------------
-- 3. Extend profiles with district_id and extra identity fields.
--    district_id = NULL  → master_admin (state-wide access)
--    district_id = <id>  → district-scoped admin / conductor / driver / inspector
-- -----------------------------------------------------------------------------
alter table profiles
  add column if not exists district_id  uuid        references districts (id) on delete set null,
  add column if not exists full_name    text,
  add column if not exists phone        text,
  add column if not exists status       text        not null default 'ACTIVE'
                                          check (status in ('ACTIVE', 'SUSPENDED', 'INACTIVE'));

-- -----------------------------------------------------------------------------
-- 4. Attach district_id to core operational tables.
--    All FKs are nullable so existing seed data doesn't break — districts can
--    be backfilled.  Once a district is assigned, the column is meaningful.
-- -----------------------------------------------------------------------------

-- stops
alter table stops
  add column if not exists district_id uuid references districts (id) on delete set null;

-- routes
alter table routes
  add column if not exists district_id uuid references districts (id) on delete set null;

-- buses
alter table buses
  add column if not exists district_id          uuid    references districts (id) on delete set null,
  add column if not exists is_active            boolean not null default true,
  add column if not exists is_wheelchair_accessible boolean not null default false,
  add column if not exists registration_number  text,
  -- Bus QR identity fields (used by Migration 029 in full, pre-declared here
  -- so the column exists for any interim manual inserts)
  add column if not exists bus_qr_payload       text,
  add column if not exists bus_qr_signature     text,
  add column if not exists qr_generated_at      timestamptz;

-- conductors
alter table conductors
  add column if not exists district_id uuid references districts (id) on delete set null;

-- schedules
alter table schedules
  add column if not exists district_id uuid references districts (id) on delete set null;

-- trips (denormalized for fast fleet-monitor queries that filter by district)
alter table trips
  add column if not exists district_id uuid references districts (id) on delete set null;

-- tickets (denormalized for revenue queries filtered by district)
alter table tickets
  add column if not exists district_id uuid references districts (id) on delete set null,
  add column if not exists channel     text not null default 'APP'
                                         check (channel in ('APP', 'CASH')),
  add column if not exists pnr         text unique;

-- alerts (know the district for SOS dispatch routing)
alter table alerts
  add column if not exists district_id  uuid references districts (id) on delete set null,
  add column if not exists source_role  text not null default 'conductor'
                                          check (source_role in ('conductor', 'passenger')),
  add column if not exists passenger_id uuid references auth.users (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 5. Indexes for the new FK columns (district lookups are in every list query)
-- -----------------------------------------------------------------------------
create index if not exists idx_stops_district        on stops        (district_id);
create index if not exists idx_routes_district       on routes       (district_id);
create index if not exists idx_buses_district        on buses        (district_id);
create index if not exists idx_conductors_district   on conductors   (district_id);
create index if not exists idx_schedules_district    on schedules    (district_id);
create index if not exists idx_trips_district        on trips        (district_id);
create index if not exists idx_tickets_district      on tickets      (district_id);
create index if not exists idx_alerts_district       on alerts       (district_id);
create index if not exists idx_profiles_district     on profiles     (district_id);
create index if not exists idx_tickets_pnr           on tickets      (pnr);

-- -----------------------------------------------------------------------------
-- 6. Seed Tamil Nadu districts (idempotent)
-- -----------------------------------------------------------------------------
insert into districts (name, code) values
  ('Tiruppur',     'TUP'),
  ('Chennai',      'CHE'),
  ('Coimbatore',   'CBE'),
  ('Madurai',      'MDU'),
  ('Salem',        'SLM'),
  ('Trichy',       'TRY'),
  ('Erode',        'ERD'),
  ('Tirunelveli',  'TVL')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 7. Verification (fails the migration if schema is wrong)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'district_id'
  ) then
    raise exception 'MIGRATION 021 FAILED: profiles.district_id not found';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'buses' and column_name = 'is_wheelchair_accessible'
  ) then
    raise exception 'MIGRATION 021 FAILED: buses.is_wheelchair_accessible not found';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_name = 'districts'
  ) then
    raise exception 'MIGRATION 021 FAILED: districts table not found';
  end if;

  raise notice 'MIGRATION 021 OK — multi-district schema applied';
end;
$$;
