-- Migration 20260101000070: Filter list_eligible_buses to strictly only conductor-scanned active trips
-- Only trips with status = 'ACTIVE', conductor_id IS NOT NULL, and started_at IS NOT NULL are returned to passengers.

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
    and t.conductor_id is not null
    and t.started_at is not null
    and ts_origin.status in ('UPCOMING', 'ARRIVED')
  order by b.bus_number;
$$;

revoke all on function list_eligible_buses(uuid, uuid) from public;
grant  execute on function list_eligible_buses(uuid, uuid) to anon, authenticated;
