-- =============================================================================
-- 020: Fix a real, verified-live bug from migration 016.
--
-- find_nearest_stop and list_eligible_buses were kept `STABLE` when
-- migration 016 added a rate-limit check inside them. `enforce_rate_limit()`
-- does `INSERT INTO rate_limit_events` — a side effect. PostgREST executes
-- STABLE/IMMUTABLE functions inside a READ ONLY transaction (an
-- optimization that assumes no writes happen), so every call to either
-- function failed with:
--   {"code":"25006","message":"cannot execute INSERT in a read-only transaction"}
-- Confirmed live via a direct RPC call and via a k6 smoke test (both
-- caught 100% failure) before this fix; both pass afterward — this was not
-- a hypothetical, it would have broken passenger stop/bus search entirely.
--
-- Fix: these functions are no longer side-effect-free, so they can no
-- longer be marked STABLE — dropping the modifier makes them VOLATILE
-- (Postgres's default), which is now the honest, correct classification.
-- =============================================================================

create or replace function find_nearest_stop(
  p_latitude double precision,
  p_longitude double precision,
  p_limit int default 1
)
returns table (
  stop_id uuid,
  name text,
  code text,
  district text,
  distance_meters double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    perform enforce_rate_limit('nearest-stop:' || auth.uid()::text, 60, interval '1 minute');
  end if;

  return query
  select
    s.id as stop_id,
    s.name,
    s.code,
    s.district,
    st_distance(s.location, st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography) as distance_meters
  from stops s
  order by s.location <-> st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography
  limit greatest(1, least(p_limit, 20));
end;
$$;

revoke all on function find_nearest_stop(double precision, double precision, int) from public, anon, authenticated;
grant execute on function find_nearest_stop(double precision, double precision, int) to anon, authenticated;

create or replace function list_eligible_buses(
  p_route_id uuid,
  p_origin_stop_id uuid
)
returns table (
  trip_id uuid,
  bus_id uuid,
  bus_number text,
  bus_type bus_type,
  capacity int,
  current_stop_id uuid,
  current_stop_name text,
  available_seats int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    perform enforce_rate_limit('eligible-buses:' || auth.uid()::text, 60, interval '1 minute');
  end if;

  return query
  select
    t.id as trip_id,
    b.id as bus_id,
    b.bus_number,
    b.type as bus_type,
    b.capacity,
    t.current_stop_id,
    cs.name as current_stop_name,
    coalesce(b.capacity - o.current_passenger_count, b.capacity) as available_seats
  from trips t
  join buses b on b.id = t.bus_id
  join trip_stops ts_origin
    on ts_origin.trip_id = t.id and ts_origin.stop_id = p_origin_stop_id
  left join stops cs on cs.id = t.current_stop_id
  left join trip_occupancy o on o.trip_id = t.id
  where t.route_id = p_route_id
    and t.status = 'ACTIVE'
    and ts_origin.status in ('UPCOMING', 'ARRIVED')
  order by b.bus_number;
end;
$$;

revoke all on function list_eligible_buses(uuid, uuid) from public, anon, authenticated;
grant execute on function list_eligible_buses(uuid, uuid) to anon, authenticated;

-- Self-check: both must still work for anon/authenticated (they're
-- genuinely public-safe RPCs, unlike the ones in migration 018).
do $$
begin
  if not has_function_privilege('anon', 'find_nearest_stop(double precision,double precision,int)', 'execute') then
    raise exception 'anon lost execute on find_nearest_stop — should still have it';
  end if;
  if not has_function_privilege('anon', 'list_eligible_buses(uuid,uuid)', 'execute') then
    raise exception 'anon lost execute on list_eligible_buses — should still have it';
  end if;
end $$;
