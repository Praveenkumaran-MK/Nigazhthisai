-- =============================================================================
-- 061: SAFE CRUD OPERATIONS, LIFECYCLE MANAGEMENT & PHONE NUMBER FIXES
-- =============================================================================
-- Resolves:
--   1. Conductor phone update bug (column "phone_number" does not exist -> "phone")
--   2. District admin profile update missing phone number parameter
--   3. Foreign key constraint errors (23503) on deleting stops, buses, routes
--   4. Adds is_active to stops and updates stops_public view
--   5. Adds safe lifecycle deletion RPCs: delete_bus_safe, delete_stop_safe, delete_route_safe
--   6. Adds upsert_fare_matrix_entry RPC for conflict-free fare management
--   7. Normalizes RLS update/delete policies for records where district_id IS NULL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FIX update_conductor_profile RPC
--    Corrects column name: conductors table column is 'phone', NOT 'phone_number'.
-- -----------------------------------------------------------------------------
create or replace function public.update_conductor_profile(
  p_conductor_id  uuid,
  p_display_name  text,
  p_phone_number  text,
  p_government_id text,
  p_is_active     boolean default true
)
returns public.conductors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conductor public.conductors;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can edit conductor profiles';
  end if;

  select * into v_conductor
  from public.conductors
  where id = p_conductor_id;

  if not found then
    raise exception 'NOT_FOUND: Conductor % not found', p_conductor_id;
  end if;

  if is_district_admin() and v_conductor.district_id is not null and v_conductor.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: cannot edit conductor belonging to another district';
  end if;

  update public.conductors
  set display_name   = coalesce(nullif(trim(p_display_name), ''), display_name),
      phone          = coalesce(nullif(trim(p_phone_number), ''), phone),
      government_id  = coalesce(nullif(trim(p_government_id), ''), government_id),
      is_active      = coalesce(p_is_active, is_active),
      updated_at     = now()
  where id = p_conductor_id
  returning * into v_conductor;

  return v_conductor;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. UPGRADE update_district_admin_profile RPC
--    Adds p_phone parameter and updates profiles.phone.
-- -----------------------------------------------------------------------------
drop function if exists public.update_district_admin_profile(uuid, text, uuid, boolean, text);
drop function if exists public.update_district_admin_profile(uuid, text, uuid, boolean);

create or replace function public.update_district_admin_profile(
  p_user_id      uuid,
  p_display_name text,
  p_district_id  uuid,
  p_is_active    boolean default true,
  p_role         text    default null,
  p_phone        text    default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles;
  v_target_role text;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can modify admin user profiles';
  end if;

  select role into v_target_role from public.profiles where id = p_user_id;

  if (p_role = 'master_admin' or v_target_role = 'master_admin') and not is_master_admin() then
    raise exception 'FORBIDDEN: Only master administrators can modify master admin roles';
  end if;

  update public.profiles
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      full_name    = coalesce(nullif(trim(p_display_name), ''), full_name),
      district_id  = p_district_id,
      role         = coalesce(nullif(trim(p_role), ''), role),
      phone        = coalesce(nullif(trim(p_phone), ''), phone),
      status       = case when p_is_active = false then 'INACTIVE' else 'ACTIVE' end,
      updated_at   = now()
  where id = p_user_id
  returning * into v_admin;

  if not found then
    raise exception 'NOT_FOUND: Profile % not found', p_user_id;
  end if;

  return v_admin;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. EXTEND stops TABLE WITH is_active & UPDATE stops_public VIEW
-- -----------------------------------------------------------------------------
alter table public.stops add column if not exists is_active boolean not null default true;

drop view if exists public.stops_public cascade;

create view public.stops_public
with (security_invoker = true)
as
select
  id,
  name,
  code,
  district,
  json_build_object(
    'latitude', st_y(location::geometry),
    'longitude', st_x(location::geometry)
  ) as location,
  created_at,
  updated_at,
  district_id,
  is_active
from public.stops;

grant select on public.stops_public to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. SAFE BUS DELETION RPC (delete_bus_safe)
--    Dual-mode: cleans up unreferenced draft buses or gracefully decommissions
--    historical fleet vehicles to preserve audit and ticket integrity.
-- -----------------------------------------------------------------------------
create or replace function public.delete_bus_safe(p_bus_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus public.buses;
  v_has_active_trip boolean;
  v_has_history boolean;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can delete or decommission buses';
  end if;

  select * into v_bus from public.buses where id = p_bus_id;
  if not found then
    raise exception 'BUS_NOT_FOUND: Bus % does not exist', p_bus_id;
  end if;

  -- Guard: District Admin scope
  if is_district_admin() and v_bus.district_id is not null and v_bus.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: You can only manage buses belonging to your assigned district';
  end if;

  -- 1. Check for live active trips
  select exists (
    select 1 from public.trips where bus_id = p_bus_id and status = 'ACTIVE'
  ) into v_has_active_trip;

  if v_has_active_trip then
    raise exception 'ACTIVE_TRIP: Cannot delete bus % because it is currently operating an active trip in transit.', v_bus.bus_number;
  end if;

  -- 2. Clear un-started future schedules and planned empty trips
  delete from public.schedules where bus_id = p_bus_id and scheduled_start > now();
  delete from public.trips
  where bus_id = p_bus_id
    and status = 'SCHEDULED'
    and not exists (select 1 from public.tickets where trip_id = trips.id);

  -- 3. Release route assignment
  update public.buses set route_id = null where id = p_bus_id;

  -- 4. Check if bus has historical trips or tickets
  select (
    exists(select 1 from public.trips where bus_id = p_bus_id)
    or exists(select 1 from public.tickets where bus_id = p_bus_id)
  ) into v_has_history;

  if v_has_history then
    -- Decommission vehicle: remove from active dispatch while preserving ticket/trip audit
    update public.buses
    set is_active = false,
        status = 'DECOMMISSIONED',
        updated_at = now()
    where id = p_bus_id;

    return jsonb_build_object(
      'success', true,
      'mode', 'decommissioned',
      'bus_id', p_bus_id,
      'bus_number', v_bus.bus_number,
      'message', 'Bus has operational history. It was safely decommissioned and unlinked from future schedules.'
    );
  else
    -- Pure hard delete for test/draft buses with zero operational history
    delete from public.schedules where bus_id = p_bus_id;
    delete from public.alerts where bus_id = p_bus_id;
    delete from public.buses where id = p_bus_id;

    return jsonb_build_object(
      'success', true,
      'mode', 'deleted',
      'bus_id', p_bus_id,
      'bus_number', v_bus.bus_number,
      'message', 'Bus was cleanly deleted from the database.'
    );
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. SAFE STOP DELETION RPC (delete_stop_safe)
--    Unlinks from route sequences and fares; decommissions if historical tickets exist.
-- -----------------------------------------------------------------------------
create or replace function public.delete_stop_safe(p_stop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop public.stops;
  v_has_active_trip boolean;
  v_has_history boolean;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can delete or decommission stops';
  end if;

  select * into v_stop from public.stops where id = p_stop_id;
  if not found then
    raise exception 'STOP_NOT_FOUND: Stop % does not exist', p_stop_id;
  end if;

  -- Guard: District Admin scope
  if is_district_admin() and v_stop.district_id is not null and v_stop.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: You can only manage stops belonging to your assigned district';
  end if;

  -- 1. Check for active trips currently using this stop
  select exists (
    select 1 from public.trips t
    join public.trip_stops ts on ts.trip_id = t.id
    where ts.stop_id = p_stop_id and t.status = 'ACTIVE'
  ) into v_has_active_trip;

  if v_has_active_trip then
    raise exception 'ACTIVE_TRIP: Cannot delete stop "%" because an active transit trip is currently serving it.', v_stop.name;
  end if;

  -- 2. Safely unlink from active route definitions and fare matrices
  delete from public.route_day_stops where stop_id = p_stop_id;
  delete from public.route_stops where stop_id = p_stop_id;
  delete from public.fare_matrix where origin_stop_id = p_stop_id or dest_stop_id = p_stop_id;
  update public.trips set current_stop_id = null where current_stop_id = p_stop_id;

  -- 3. Check if historical tickets or trip logs reference this stop
  select (
    exists(select 1 from public.tickets where origin_stop_id = p_stop_id or dest_stop_id = p_stop_id)
    or exists(select 1 from public.trip_stops where stop_id = p_stop_id)
  ) into v_has_history;

  if v_has_history then
    update public.stops
    set is_active = false,
        updated_at = now()
    where id = p_stop_id;

    return jsonb_build_object(
      'success', true,
      'mode', 'decommissioned',
      'stop_id', p_stop_id,
      'stop_name', v_stop.name,
      'message', 'Stop was deactivated and unlinked from all route corridors and fares. Historical ticket records preserved.'
    );
  else
    delete from public.stops where id = p_stop_id;

    return jsonb_build_object(
      'success', true,
      'mode', 'deleted',
      'stop_id', p_stop_id,
      'stop_name', v_stop.name,
      'message', 'Stop was cleanly deleted from the database.'
    );
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. SAFE ROUTE DELETION RPC (delete_route_safe)
--    Unlinks assigned buses, clears schedules/fares; decommissions if historical trips exist.
-- -----------------------------------------------------------------------------
create or replace function public.delete_route_safe(p_route_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route public.routes;
  v_has_active_trip boolean;
  v_has_history boolean;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can delete routes';
  end if;

  select * into v_route from public.routes where id = p_route_id;
  if not found then
    raise exception 'ROUTE_NOT_FOUND: Route % does not exist', p_route_id;
  end if;

  -- Guard: District Admin scope
  if is_district_admin() and v_route.district_id is not null and v_route.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: You can only manage routes belonging to your assigned district';
  end if;

  -- 1. Check for active trips on this route
  select exists (
    select 1 from public.trips where route_id = p_route_id and status = 'ACTIVE'
  ) into v_has_active_trip;

  if v_has_active_trip then
    raise exception 'ACTIVE_TRIP: Cannot delete route % because buses are currently active on this corridor.', v_route.route_number;
  end if;

  -- 2. Release buses assigned to this route
  update public.buses set route_id = null where route_id = p_route_id;

  -- 3. Clear schedules and route configuration
  delete from public.schedules where route_id = p_route_id;
  delete from public.route_weekly_schedules where route_id = p_route_id;
  delete from public.route_day_stops where route_id = p_route_id;
  delete from public.route_stops where route_id = p_route_id;
  delete from public.fare_matrix where route_id = p_route_id;
  delete from public.trips
  where route_id = p_route_id
    and status = 'SCHEDULED'
    and not exists (select 1 from public.tickets where trip_id = trips.id);

  -- 4. Check if route has historical trips
  select exists(select 1 from public.trips where route_id = p_route_id) into v_has_history;

  if v_has_history then
    update public.routes
    set is_active = false,
        updated_at = now()
    where id = p_route_id;

    return jsonb_build_object(
      'success', true,
      'mode', 'decommissioned',
      'route_id', p_route_id,
      'route_number', v_route.route_number,
      'message', 'Route deactivated and removed from active operations. Historical trip logs preserved.'
    );
  else
    delete from public.routes where id = p_route_id;

    return jsonb_build_object(
      'success', true,
      'mode', 'deleted',
      'route_id', p_route_id,
      'route_number', v_route.route_number,
      'message', 'Route was cleanly deleted from the database.'
    );
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. ATOMIC FARE MATRIX UPSERT RPC (upsert_fare_matrix_entry)
-- -----------------------------------------------------------------------------
create or replace function public.upsert_fare_matrix_entry(
  p_route_id         uuid,
  p_origin_stop_id   uuid,
  p_dest_stop_id     uuid,
  p_flat_fare_amount numeric
)
returns public.fare_matrix
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.fare_matrix;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can configure route fares';
  end if;

  if p_origin_stop_id = p_dest_stop_id then
    raise exception 'INVALID_ARGUMENT: Origin and destination stops cannot be the same.';
  end if;

  if p_flat_fare_amount < 0 then
    raise exception 'INVALID_ARGUMENT: Fare amount cannot be negative.';
  end if;

  insert into public.fare_matrix (
    route_id,
    origin_stop_id,
    dest_stop_id,
    flat_fare_amount,
    created_at,
    updated_at
  ) values (
    p_route_id,
    p_origin_stop_id,
    p_dest_stop_id,
    p_flat_fare_amount,
    now(),
    now()
  )
  on conflict (route_id, origin_stop_id, dest_stop_id)
  do update set
    flat_fare_amount = excluded.flat_fare_amount,
    updated_at = now()
  returning * into v_entry;

  return v_entry;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. NORMALIZE RLS POLICIES FOR NULL district_id ROWS
-- -----------------------------------------------------------------------------
-- stops
drop policy if exists stops_admin_update on public.stops;
drop policy if exists stops_admin_delete on public.stops;

create policy stops_admin_update on public.stops
  for update
  using (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  )
  with check (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  );

create policy stops_admin_delete on public.stops
  for delete
  using (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  );

-- routes
drop policy if exists routes_admin_update on public.routes;
drop policy if exists routes_admin_delete on public.routes;

create policy routes_admin_update on public.routes
  for update
  using (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  )
  with check (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  );

create policy routes_admin_delete on public.routes
  for delete
  using (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  );

-- buses
drop policy if exists buses_district_update on public.buses;
drop policy if exists buses_district_delete on public.buses;

create policy buses_district_update on public.buses
  for update
  using (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  )
  with check (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  );

create policy buses_district_delete on public.buses
  for delete
  using (
    is_master_admin()
    or (is_district_admin() and (district_id = my_district_id() or district_id is null or my_district_id() is null))
  );

-- -----------------------------------------------------------------------------
-- 9. PERMISSION GRANTS
-- -----------------------------------------------------------------------------
revoke execute on function public.update_conductor_profile(uuid, text, text, text, boolean) from anon;
revoke execute on function public.update_district_admin_profile(uuid, text, uuid, boolean, text, text) from anon;
revoke execute on function public.delete_bus_safe(uuid) from anon;
revoke execute on function public.delete_stop_safe(uuid) from anon;
revoke execute on function public.delete_route_safe(uuid) from anon;
revoke execute on function public.upsert_fare_matrix_entry(uuid, uuid, uuid, numeric) from anon;

grant execute on function public.update_conductor_profile(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.update_district_admin_profile(uuid, text, uuid, boolean, text, text) to authenticated;
grant execute on function public.delete_bus_safe(uuid) to authenticated;
grant execute on function public.delete_stop_safe(uuid) to authenticated;
grant execute on function public.delete_route_safe(uuid) to authenticated;
grant execute on function public.upsert_fare_matrix_entry(uuid, uuid, uuid, numeric) to authenticated;
