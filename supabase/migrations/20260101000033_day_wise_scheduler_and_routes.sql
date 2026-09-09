-- =============================================================================
-- 033: Day-Wise Route Scheduler & Route Enhancements
--   • routes.code, routes.is_active columns
--   • route_day_stops (custom day-specific stop sequences with fallback to route_stops)
--   • RPC save_route_day_schedule
-- =============================================================================

alter table routes
  add column if not exists code text,
  add column if not exists is_active boolean not null default true;

-- Backfill codes if null
update routes
set code = upper(replace(substr(route_number, 1, 8), ' ', '-'))
where code is null;

-- route_day_stops: enables configuring custom stop sequences for specific days of week
-- (day_of_week: -1 for default/standard, 0 for Sun, 1 for Mon ... 6 for Sat)
create table if not exists route_day_stops (
  id              uuid        primary key default gen_random_uuid(),
  route_id        uuid        not null references routes(id) on delete cascade,
  day_of_week     int         not null check (day_of_week between -1 and 6), -- -1 = DEFAULT/STANDARD
  stop_id         uuid        not null references stops(id) on delete restrict,
  sequence_order  int         not null,
  created_at      timestamptz not null default now(),
  unique (route_id, day_of_week, sequence_order)
);

create index if not exists idx_route_day_stops_lookup on route_day_stops(route_id, day_of_week, sequence_order);

alter table route_day_stops enable row level security;

create policy route_day_stops_read on route_day_stops
  for select using (true);

create policy route_day_stops_admin_all on route_day_stops
  for all
  using (is_any_admin())
  with check (is_any_admin());

alter publication supabase_realtime add table route_day_stops;

-- RPC to save entire day-wise stops sequence atomically
create or replace function save_route_day_stops(
  p_route_id    uuid,
  p_day_of_week int,
  p_stop_ids    uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idx int;
  v_stop_id uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can modify route stop sequences';
  end if;

  -- Remove existing stops for this route and day
  delete from route_day_stops
  where route_id = p_route_id
    and day_of_week = p_day_of_week;

  -- Also update standard route_stops if modifying default (-1)
  if p_day_of_week = -1 then
    delete from route_stops where route_id = p_route_id;
    v_idx := 1;
    foreach v_stop_id in array p_stop_ids loop
      insert into route_stops (route_id, stop_id, sequence_order)
      values (p_route_id, v_stop_id, v_idx);
      v_idx := v_idx + 1;
    end loop;
  end if;

  -- Insert new sequence
  v_idx := 1;
  foreach v_stop_id in array p_stop_ids loop
    insert into route_day_stops (route_id, day_of_week, stop_id, sequence_order)
    values (p_route_id, p_day_of_week, v_stop_id, v_idx);
    v_idx := v_idx + 1;
  end loop;

  return true;
end;
$$;
