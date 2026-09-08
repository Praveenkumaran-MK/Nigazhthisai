-- =============================================================================
-- 025: Seat-segment availability + Operational Alerts + list_eligible_buses
--      improvement + operational alert RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. trip_seat_segments — per-stop-pair occupancy matrix.
--    Enables accurate available_seats calculation when a passenger boards
--    mid-route: available = capacity - MAX(segment occupancy between origin→dest)
--    Seeded when start_trip() is called (one row per consecutive stop pair).
-- -----------------------------------------------------------------------------
create table if not exists trip_seat_segments (
  trip_id        uuid    not null references trips  (id) on delete cascade,
  from_stop_id   uuid    not null references stops  (id) on delete restrict,
  to_stop_id     uuid    not null references stops  (id) on delete restrict,
  sequence_order int     not null,
  occupied_seats int     not null default 0 check (occupied_seats >= 0),
  primary key (trip_id, from_stop_id, to_stop_id),
  check (from_stop_id <> to_stop_id)
);

create index if not exists idx_seat_segments_trip on trip_seat_segments (trip_id, sequence_order);

alter table trip_seat_segments enable row level security;
-- Public can read (needed for seat availability display)
create policy seat_segments_public_read on trip_seat_segments for select using (true);
-- Only RPCs (SECURITY DEFINER) write
create policy seat_segments_admin_write on trip_seat_segments
  for all using (is_any_admin()) with check (is_any_admin());

-- -----------------------------------------------------------------------------
-- 2. Update start_trip to seed trip_seat_segments
-- -----------------------------------------------------------------------------
create or replace function start_trip(p_trip_id uuid)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip          trips;
  v_first_stop_id uuid;
  v_capacity      int;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select stop_id into v_first_stop_id from trip_stops
  where trip_id = p_trip_id order by sequence_order asc limit 1;

  select b.capacity into v_capacity
  from trips t join buses b on b.id = t.bus_id
  where t.id = p_trip_id;

  update trips
  set status = 'ACTIVE', started_at = now(), current_stop_id = v_first_stop_id
  where id = p_trip_id and status = 'SCHEDULED'
  returning * into v_trip;

  if v_trip is null then
    raise exception 'INVALID_TRIP_STATE';
  end if;

  -- Seed trip_occupancy
  insert into trip_occupancy (trip_id, current_passenger_count, capacity)
  values (p_trip_id, 0, v_capacity)
  on conflict (trip_id) do nothing;

  -- Seed trip_seat_segments: one row per consecutive stop pair
  insert into trip_seat_segments (trip_id, from_stop_id, to_stop_id, sequence_order, occupied_seats)
  select
    p_trip_id,
    ts1.stop_id as from_stop_id,
    ts2.stop_id as to_stop_id,
    ts1.sequence_order,
    0
  from trip_stops ts1
  join trip_stops ts2
    on ts2.trip_id = ts1.trip_id
    and ts2.sequence_order = ts1.sequence_order + 1
  where ts1.trip_id = p_trip_id
  on conflict (trip_id, from_stop_id, to_stop_id) do nothing;

  return v_trip;
end;
$$;

revoke all on function start_trip(uuid) from public, anon, authenticated;
grant  execute on function start_trip(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Helper: get origin and destination segment range for a booking
--    (used by create_secure_ticket and issue_cash_ticket to lock segments)
-- -----------------------------------------------------------------------------
create or replace function get_segment_range(
  p_trip_id        uuid,
  p_origin_stop_id uuid,
  p_dest_stop_id   uuid
)
returns table (from_stop_id uuid, to_stop_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  -- Returns all consecutive segments between origin and destination stop
  select tss.from_stop_id, tss.to_stop_id
  from trip_seat_segments tss
  where tss.trip_id = p_trip_id
    and tss.sequence_order >=
        (select sequence_order from trip_stops
         where trip_id = p_trip_id and stop_id = p_origin_stop_id)
    and tss.sequence_order <
        (select sequence_order from trip_stops
         where trip_id = p_trip_id and stop_id = p_dest_stop_id)
  order by tss.sequence_order;
$$;

-- -----------------------------------------------------------------------------
-- 4. Update list_eligible_buses to use segment-based available_seats
--    Must DROP first because return table columns changed (added wheelchair + district_id)
-- -----------------------------------------------------------------------------
drop function if exists list_eligible_buses(uuid, uuid);

create or replace function list_eligible_buses(
  p_route_id       uuid,
  p_origin_stop_id uuid
)
returns table (
  trip_id           uuid,
  bus_id            uuid,
  bus_number        text,
  bus_type          bus_type,
  capacity          int,
  current_stop_id   uuid,
  current_stop_name text,
  available_seats   int,
  is_wheelchair_accessible boolean,
  district_id       uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id                        as trip_id,
    b.id                        as bus_id,
    b.bus_number,
    b.type                      as bus_type,
    b.capacity,
    t.current_stop_id,
    cs.name                     as current_stop_name,
    -- Available seats = capacity minus the MAX occupied segment in the passenger's travel range
    -- (conservative: if any segment between origin and next stops is full, show 0)
    greatest(
      0,
      b.capacity - coalesce(
        (select max(tss.occupied_seats)
         from trip_seat_segments tss
         where tss.trip_id = t.id
           and tss.sequence_order >=
               (select sequence_order from trip_stops
                where trip_id = t.id and stop_id = p_origin_stop_id)
        ),
        -- Fallback to simple occupancy counter if segment table not seeded
        coalesce(o.current_passenger_count, 0)
      )
    )                           as available_seats,
    b.is_wheelchair_accessible,
    b.district_id
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
$$;

revoke all on function list_eligible_buses(uuid, uuid) from public, anon, authenticated;
grant  execute on function list_eligible_buses(uuid, uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. check_idle_buses: pg_cron operational alert function.
--    Inserts a BUS_IDLE alert for any ACTIVE trip whose GPS hasn't updated
--    in the last 10 minutes (conductor may be in dead zone or have crashed).
-- -----------------------------------------------------------------------------
create or replace function check_idle_buses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
begin
  for v_trip in
    select t.id as trip_id, t.bus_id, t.district_id, b.bus_number,
           t.conductor_id
    from trips t
    join buses b on b.id = t.bus_id
    where t.status = 'ACTIVE'
      and t.gps_last_updated_at < now() - interval '10 minutes'
      -- Skip if there's already an active BUS_IDLE alert for this trip
      and not exists (
        select 1 from alerts a
        where a.trip_id = t.id
          and a.severity::text = 'WARNING'
          and a.status <> 'RESOLVED'
          and a.created_at > now() - interval '30 minutes'
      )
  loop
    insert into alerts (
      trip_id, conductor_id, bus_id, district_id, severity, status,
      title, message, source_role
    ) values (
      v_trip.trip_id, v_trip.conductor_id, v_trip.bus_id, v_trip.district_id,
      'WARNING', 'ACTIVE',
      'Bus Idle Alert',
      'Bus ' || v_trip.bus_number || ' has not sent a GPS update in 10+ minutes.',
      'conductor'
    );
  end loop;
end;
$$;

-- Add gps_last_updated_at to trips if not yet present (for idle tracking)
alter table trips
  add column if not exists gps_last_updated_at timestamptz;

-- Index for the idle check
create index if not exists idx_trips_gps_updated on trips (gps_last_updated_at)
  where status = 'ACTIVE';

-- Also add title column to alerts for richer alert cards
alter table alerts
  add column if not exists title   text,
  add column if not exists message text;

-- Schedule the idle-bus check every 5 minutes (requires pg_cron extension)
-- This is wrapped in a DO block so it doesn't fail if pg_cron isn't enabled yet.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'check-idle-buses',
      '*/5 * * * *',
      'select check_idle_buses()'
    );
    raise notice 'pg_cron job check-idle-buses scheduled';
  else
    raise notice 'pg_cron not enabled — check_idle_buses() must be called manually or scheduled externally';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Verification
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables where table_name = 'trip_seat_segments'
  ) then
    raise exception 'MIGRATION 025 FAILED: trip_seat_segments not found';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'trips' and column_name = 'gps_last_updated_at'
  ) then
    raise exception 'MIGRATION 025 FAILED: trips.gps_last_updated_at not found';
  end if;

  raise notice 'MIGRATION 025 OK — seat segments + idle alerts + updated list_eligible_buses applied';
end;
$$;
