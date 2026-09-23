-- =============================================================================
-- Migration 065: Fix Route Stops Permissions and Robust save_route_day_stops
--
-- ROOT CAUSE OF "duplicate key value violates unique constraint route_stops_route_id_stop_id_key":
-- 1. Migration 060 revoked privileges and only granted SELECT on route_stops and route_day_stops.
-- 2. Direct client `.delete().eq("route_id", ...)` calls were blocked by missing DELETE grants.
-- 3. The subsequent `.insert(...)` attempted to insert stops that were never deleted, violating
--    the unique constraint (route_id, stop_id).
-- 4. In addition, the save_route_day_stops RPC lacked internal stop deduplication.
-- =============================================================================

-- 1. Table Grants for route_stops and route_day_stops
grant all on public.route_stops to authenticated;
grant select on public.route_stops to anon;

grant all on public.route_day_stops to authenticated;
grant select on public.route_day_stops to anon;

-- 2. RLS Policies for route_stops
drop policy if exists route_stops_admin_all on public.route_stops;
drop policy if exists route_stops_admin_write on public.route_stops;
drop policy if exists route_stops_admin_update on public.route_stops;
drop policy if exists route_stops_admin_delete on public.route_stops;

create policy route_stops_admin_all on public.route_stops
  for all using (is_any_admin()) with check (is_any_admin());

-- Ensure public can read route_stops
drop policy if exists route_stops_public_read on public.route_stops;
create policy route_stops_public_read on public.route_stops
  for select using (true);

-- 3. RLS Policies for route_day_stops
drop policy if exists route_day_stops_admin_all on public.route_day_stops;
create policy route_day_stops_admin_all on public.route_day_stops
  for all using (is_any_admin()) with check (is_any_admin());

drop policy if exists route_day_stops_read on public.route_day_stops;
create policy route_day_stops_read on public.route_day_stops
  for select using (true);

-- 4. Robust save_route_day_stops with stop deduplication
drop function if exists public.save_route_day_stops(uuid, int, jsonb);
drop function if exists public.save_route_day_stops(uuid, int, uuid[]);

create or replace function public.save_route_day_stops(
  p_route_id    uuid,
  p_day_of_week int,
  p_stops       jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_idx int := 1;
  v_stop_id uuid;
  v_eta text;
  v_seen_stops uuid[] := '{}';
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can modify route stop sequences';
  end if;

  -- Remove existing day stops for this route & day
  delete from public.route_day_stops
  where route_id = p_route_id
    and day_of_week = p_day_of_week;

  -- If standard schedule (-1), also clean up default route_stops
  if p_day_of_week = -1 then
    delete from public.route_stops where route_id = p_route_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_stops) loop
    v_stop_id := (v_item->>'stop_id')::uuid;
    v_eta     := nullif(trim(coalesce(v_item->>'expected_arrival_time', v_item->>'eta', '')), '');

    -- Deduplicate stops to prevent unique constraint violation (route_id, stop_id)
    if v_stop_id is not null and not (v_stop_id = any(v_seen_stops)) then
      v_seen_stops := array_append(v_seen_stops, v_stop_id);

      insert into public.route_day_stops (route_id, day_of_week, stop_id, sequence_order, expected_arrival_time)
      values (p_route_id, p_day_of_week, v_stop_id, v_idx, v_eta);

      if p_day_of_week = -1 then
        insert into public.route_stops (route_id, stop_id, sequence_order, expected_arrival_time)
        values (p_route_id, v_stop_id, v_idx, v_eta);
      end if;

      v_idx := v_idx + 1;
    end if;
  end loop;

  return true;
end;
$$;

grant execute on function public.save_route_day_stops(uuid, int, jsonb) to authenticated;
