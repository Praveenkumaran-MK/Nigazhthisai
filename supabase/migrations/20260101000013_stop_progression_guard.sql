-- =============================================================================
-- 013: depart_stop_and_expire_tickets correctness fixes.
--
-- 1. Enforce that a conductor can only depart the trip's CURRENT stop. The
--    UI previously rendered a "Departed" button on every non-departed stop
--    simultaneously with no server-side ordering check, so a mis-tap on a
--    later stop could complete the trip and force-expire tickets for
--    passengers still on board.
-- 2. Find the "next stop" by sequence order comparison instead of an exact
--    `current_order + 1` match, so a gap in `sequence_order` (which could
--    previously occur after removing a route stop) can no longer cause the
--    function to conclude there is no next stop and mark the trip COMPLETED
--    mid-route.
-- =============================================================================
create or replace function depart_stop_and_expire_tickets(
  p_trip_id uuid,
  p_stop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stop_id uuid;
  v_departed_sequence_order int;
  v_next_stop_id uuid;
  v_alighted_count int;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select current_stop_id into v_current_stop_id from trips where id = p_trip_id;

  if v_current_stop_id is distinct from p_stop_id then
    raise exception 'NOT_CURRENT_STOP: only the trip''s current stop can be departed';
  end if;

  update trip_stops
  set status = 'DEPARTED', departure_time = now()
  where trip_id = p_trip_id and stop_id = p_stop_id
    and status in ('UPCOMING', 'ARRIVED')
  returning sequence_order into v_departed_sequence_order;

  if not found then
    raise exception 'INVALID_STOP_TRANSITION';
  end if;

  -- Gap-tolerant: the next stop is whichever remaining stop has the lowest
  -- sequence_order greater than the one just departed, not necessarily
  -- exactly "+1".
  select stop_id into v_next_stop_id
  from trip_stops
  where trip_id = p_trip_id and sequence_order > v_departed_sequence_order
  order by sequence_order asc
  limit 1;

  update trips set current_stop_id = coalesce(v_next_stop_id, p_stop_id) where id = p_trip_id;

  select coalesce(sum(passenger_count), 0) into v_alighted_count
  from tickets
  where trip_id = p_trip_id and dest_stop_id = p_stop_id and status = 'VALIDATED';

  update tickets
  set status = 'EXPIRED'
  where trip_id = p_trip_id and dest_stop_id = p_stop_id and status in ('PAID', 'VALIDATED');

  if v_alighted_count > 0 then
    update trip_occupancy
    set current_passenger_count = greatest(0, current_passenger_count - v_alighted_count)
    where trip_id = p_trip_id;
  end if;

  if v_next_stop_id is null then
    update trips set status = 'COMPLETED', ended_at = now() where id = p_trip_id;
  end if;
end;
$$;

revoke all on function depart_stop_and_expire_tickets(uuid, uuid) from public;
grant execute on function depart_stop_and_expire_tickets(uuid, uuid) to authenticated;
