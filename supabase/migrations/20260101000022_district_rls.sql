-- =============================================================================
-- 022: District-scoped RLS + master_admin / district_admin helper functions
--
-- Security model after this migration:
--   master_admin  → full read/write across all districts
--   admin         → district-scoped read/write (their profiles.district_id only)
--   conductor     → own trip data only (unchanged from migration 007)
--   passenger     → own tickets only (unchanged)
--
-- All existing `is_admin()` checks still guard writes correctly because
-- master_admin is a separate role value — `is_admin()` returns false for it.
-- We now have three helper functions:
--   is_master_admin()  → role = 'master_admin'
--   is_district_admin()→ role = 'admin' (district-scoped)
--   is_any_admin()     → is_master_admin() OR is_district_admin()
--   my_district_id()   → profiles.district_id for the caller
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper SQL functions (STABLE + SECURITY DEFINER so they are fast and
--    cannot be tricked by session-level search_path manipulation)
-- -----------------------------------------------------------------------------
create or replace function is_master_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'master_admin'
  );
$$;

create or replace function is_district_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Convenience: true when caller is either master_admin or district admin
create or replace function is_any_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('master_admin', 'admin')
  );
$$;

-- Returns the district_id of the current caller's profile.
-- NULL for master_admin (they have no district restriction).
create or replace function my_district_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select district_id from profiles where id = auth.uid();
$$;

-- Overwrite is_admin() to also return true for master_admin so that all
-- existing write policies (migration 007) still protect tables from
-- conductors/passengers, while master_admin gets through.
create or replace function is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'master_admin')
  );
$$;

-- -----------------------------------------------------------------------------
-- GRANTS for new functions
-- -----------------------------------------------------------------------------
revoke all on function is_master_admin()   from public, anon, authenticated;
revoke all on function is_district_admin() from public, anon, authenticated;
revoke all on function is_any_admin()      from public, anon, authenticated;
revoke all on function my_district_id()    from public, anon, authenticated;

grant execute on function is_master_admin()   to authenticated;
grant execute on function is_district_admin() to authenticated;
grant execute on function is_any_admin()      to authenticated;
grant execute on function my_district_id()    to authenticated;

-- -----------------------------------------------------------------------------
-- 2. districts table — master_admin only writes; everyone reads
-- -----------------------------------------------------------------------------
-- Existing policies from migration 021 set districts_admin_write to
-- is_admin() — now that is_admin() includes master_admin this is correct.
-- Explicitly tighten: only master_admin should create/delete districts.
drop policy if exists districts_admin_write  on districts;
drop policy if exists districts_admin_update on districts;
drop policy if exists districts_admin_delete on districts;

create policy districts_master_write  on districts for insert with check (is_master_admin());
create policy districts_master_update on districts for update using (is_master_admin()) with check (is_master_admin());
create policy districts_master_delete on districts for delete using (is_master_admin());

-- -----------------------------------------------------------------------------
-- 3. District-scoped READ policies for stops, routes, buses, conductors
--    Master admin sees everything; district admin sees their own district only.
--    Public passengers still see everything (needed for search).
-- These replace the unconditional `using (true)` public-read policies only
-- for admin-context reads that must be district-scoped.
-- NOTE: Public select policies remain (for passenger search). We add
--    SEPARATE admin-scoped select policies for the admin PWA context.
--    The passenger app reads via `anon`/`authenticated` (passenger role)
--    which hits the public read policies — no change there.
-- -----------------------------------------------------------------------------

-- stops: admin reads their district; passengers read all (existing policy)
-- No change to stops_public_read — passengers need all stops.
-- Admin PWA should filter by district_id client-side using my_district_id().

-- profiles — extend: district admin can read profiles in their own district
drop policy if exists profiles_admin_read   on profiles;
drop policy if exists profiles_admin_update on profiles;

create policy profiles_admin_read on profiles
  for select using (
    id = auth.uid()                     -- own profile
    or is_master_admin()                -- master sees all
    or (                                -- district admin sees own district
      is_district_admin()
      and district_id = my_district_id()
    )
  );

create policy profiles_admin_update on profiles
  for update using (
    is_master_admin()
    or (
      is_district_admin()
      and district_id = my_district_id()
      and role not in ('master_admin', 'admin')  -- district admin cannot elevate privileges
    )
  )
  with check (
    is_master_admin()
    or (
      is_district_admin()
      and district_id = my_district_id()
      and role not in ('master_admin', 'admin')
    )
  );

-- conductors — district admin manages their own conductors only
drop policy if exists conductors_admin_all  on conductors;

create policy conductors_master_all on conductors
  for all using (is_master_admin()) with check (is_master_admin());

create policy conductors_district_admin on conductors
  for all using (
    is_district_admin()
    and district_id = my_district_id()
  )
  with check (
    is_district_admin()
    and district_id = my_district_id()
  );

-- buses — district admin manages their own fleet only
drop policy if exists buses_admin_write  on buses;
drop policy if exists buses_admin_update on buses;
drop policy if exists buses_admin_delete on buses;

create policy buses_master_write on buses
  for insert with check (is_master_admin());
create policy buses_master_update on buses
  for update using (is_master_admin()) with check (is_master_admin());
create policy buses_master_delete on buses
  for delete using (is_master_admin());

create policy buses_district_write on buses
  for insert with check (
    is_district_admin()
    and district_id = my_district_id()
  );
create policy buses_district_update on buses
  for update using (
    is_district_admin()
    and district_id = my_district_id()
  )
  with check (
    is_district_admin()
    and district_id = my_district_id()
  );
create policy buses_district_delete on buses
  for delete using (
    is_district_admin()
    and district_id = my_district_id()
  );

-- stops — district admin manages their district's stops
drop policy if exists stops_admin_write  on stops;
drop policy if exists stops_admin_update on stops;
drop policy if exists stops_admin_delete on stops;

create policy stops_admin_write on stops
  for insert with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );
create policy stops_admin_update on stops
  for update using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  )
  with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );
create policy stops_admin_delete on stops
  for delete using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );

-- routes — district admin manages their district's routes
drop policy if exists routes_admin_write  on routes;
drop policy if exists routes_admin_update on routes;
drop policy if exists routes_admin_delete on routes;

create policy routes_admin_write on routes
  for insert with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );
create policy routes_admin_update on routes
  for update using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  )
  with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );
create policy routes_admin_delete on routes
  for delete using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );

-- schedules — district-scoped
drop policy if exists schedules_admin_write on schedules;

create policy schedules_admin_write on schedules
  for all using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  )
  with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );

-- alerts — passenger SOS insert policy (new in this migration)
create policy alerts_passenger_insert on alerts
  for insert with check (
    -- Passenger can file SOS tied to their anonymous session
    (source_role = 'passenger' and passenger_id = auth.uid() and conductor_id is null)
  );

-- -----------------------------------------------------------------------------
-- 4. New RPC: get_my_district — lets the admin PWA know which district the
--    logged-in admin is scoped to, without a raw profiles read.
-- -----------------------------------------------------------------------------
create or replace function get_my_district()
returns districts
language sql stable security definer
set search_path = public
as $$
  select d.* from districts d
  join profiles p on p.district_id = d.id
  where p.id = auth.uid();
$$;

revoke all on function get_my_district() from public, anon, authenticated;
grant execute on function get_my_district() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------
do $$
begin
  -- Verify is_master_admin exists and is callable
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_master_admin'
  ) then
    raise exception 'MIGRATION 022 FAILED: is_master_admin() not found';
  end if;

  -- Verify alerts_passenger_insert policy exists
  if not exists (
    select 1 from pg_policies
    where tablename = 'alerts' and policyname = 'alerts_passenger_insert'
  ) then
    raise exception 'MIGRATION 022 FAILED: alerts_passenger_insert policy not found';
  end if;

  raise notice 'MIGRATION 022 OK — district-scoped RLS applied';
end;
$$;
