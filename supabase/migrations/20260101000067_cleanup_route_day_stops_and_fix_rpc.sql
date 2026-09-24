-- =============================================================================
-- Migration 067: Cleanup Route Day Stops Duplicates and Fix save_route_day_stops RPC
--
-- ROOT CAUSE:
-- 1. When saving the standard schedule (cadence day_of_week = -1), previous RPC version
--    inserted rows into route_stops AND into route_day_stops with day_of_week = -1.
-- 2. When the admin UI opened the stops scheduler, it loaded standard stops from route_stops
--    and day-exception stops from route_day_stops.
-- 3. Any rows in route_day_stops with day_of_week = -1 were appended again to the standard list,
--    doubling the stops from N to 2N (e.g. 4 stops repeating as 8 stops).
-- =============================================================================

-- 1. Clean up invalid standard cadence rows in route_day_stops
-- Standard schedule belongs strictly in public.route_stops.
delete from public.route_day_stops
where day_of_week < 0 or day_of_week > 6;

-- 2. Update save_route_day_stops RPC to strictly separate standard vs day-specific stops
drop function if exists public.save_route_day_stops(uuid, int, jsonb);

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

  if p_day_of_week = -1 then
    -- Standard schedule: strictly targets public.route_stops
    delete from public.route_stops where route_id = p_route_id;
    -- Remove any legacy -1 entries in route_day_stops
    delete from public.route_day_stops where route_id = p_route_id and day_of_week = -1;

    for v_item in select * from jsonb_array_elements(p_stops) loop
      v_stop_id := (v_item->>'stop_id')::uuid;
      v_eta     := nullif(trim(coalesce(v_item->>'expected_arrival_time', v_item->>'eta', '')), '');

      if v_stop_id is not null and not (v_stop_id = any(v_seen_stops)) then
        v_seen_stops := array_append(v_seen_stops, v_stop_id);

        insert into public.route_stops (route_id, stop_id, sequence_order, expected_arrival_time)
        values (p_route_id, v_stop_id, v_idx, v_eta);

        v_idx := v_idx + 1;
      end if;
    end loop;
  else
    -- Day-specific exception: strictly targets public.route_day_stops (0-6)
    delete from public.route_day_stops
    where route_id = p_route_id
      and day_of_week = p_day_of_week;

    for v_item in select * from jsonb_array_elements(p_stops) loop
      v_stop_id := (v_item->>'stop_id')::uuid;
      v_eta     := nullif(trim(coalesce(v_item->>'expected_arrival_time', v_item->>'eta', '')), '');

      if v_stop_id is not null and not (v_stop_id = any(v_seen_stops)) then
        v_seen_stops := array_append(v_seen_stops, v_stop_id);

        insert into public.route_day_stops (route_id, day_of_week, stop_id, sequence_order, expected_arrival_time)
        values (p_route_id, p_day_of_week, v_stop_id, v_idx, v_eta);

        v_idx := v_idx + 1;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

grant execute on function public.save_route_day_stops(uuid, int, jsonb) to authenticated;
