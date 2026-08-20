-- =============================================================================
-- 012: Atomic route-stop ordering RPCs.
--
-- Previously the Admin UI mutated `route_stops.sequence_order` directly with
-- two sequential client-side UPDATE calls to swap two rows — which always
-- collided with the `unique(route_id, sequence_order)` constraint (the first
-- UPDATE sets row A to row B's still-held value) and failed silently because
-- the caller never checked the error. "Add stop" also computed the next
-- order from `stops.length + 1` on a client-cached list, which collides
-- with an existing order whenever the list has a gap (e.g. after a removal).
--
-- Fix: make the constraint deferrable, and do every mutation inside a single
-- SECURITY DEFINER function (one transaction) with the constraint check
-- deferred to the end of the statement.
-- =============================================================================

alter table route_stops drop constraint route_stops_route_id_sequence_order_key;
alter table route_stops add constraint route_stops_route_id_sequence_order_key
  unique (route_id, sequence_order) deferrable initially immediate;

-- -----------------------------------------------------------------------------
-- reorder_route_stop: swap a stop's position with its immediate neighbor.
-- p_direction: -1 to move earlier, +1 to move later.
-- -----------------------------------------------------------------------------
create or replace function reorder_route_stop(
  p_route_id uuid,
  p_stop_id uuid,
  p_direction int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_order int;
  v_neighbor_stop_id uuid;
  v_neighbor_order int;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_direction not in (-1, 1) then
    raise exception 'INVALID_DIRECTION';
  end if;

  select sequence_order into v_current_order
  from route_stops where route_id = p_route_id and stop_id = p_stop_id;

  if v_current_order is null then
    raise exception 'STOP_NOT_ON_ROUTE';
  end if;

  select stop_id, sequence_order into v_neighbor_stop_id, v_neighbor_order
  from route_stops
  where route_id = p_route_id and sequence_order = v_current_order + p_direction;

  if v_neighbor_stop_id is null then
    raise exception 'NO_ADJACENT_STOP';
  end if;

  set constraints route_stops_route_id_sequence_order_key deferred;

  update route_stops set sequence_order = v_neighbor_order where route_id = p_route_id and stop_id = p_stop_id;
  update route_stops set sequence_order = v_current_order where route_id = p_route_id and stop_id = v_neighbor_stop_id;
end;
$$;

revoke all on function reorder_route_stop(uuid, uuid, int) from public;
grant execute on function reorder_route_stop(uuid, uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- add_route_stop: append a stop, computing the next order server-side so a
-- stale/gapped client-side list can never collide with an existing row.
-- -----------------------------------------------------------------------------
create or replace function add_route_stop(
  p_route_id uuid,
  p_stop_id uuid
)
returns route_stops
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_order int;
  v_row route_stops;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if exists (select 1 from route_stops where route_id = p_route_id and stop_id = p_stop_id) then
    raise exception 'STOP_ALREADY_ON_ROUTE';
  end if;

  select coalesce(max(sequence_order), 0) + 1 into v_next_order
  from route_stops where route_id = p_route_id;

  insert into route_stops (route_id, stop_id, sequence_order)
  values (p_route_id, p_stop_id, v_next_order)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function add_route_stop(uuid, uuid) from public;
grant execute on function add_route_stop(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- remove_route_stop: delete, then resequence the remainder to stay
-- contiguous (1..N with no gaps) — gaps are what let depart_stop_and_expire_
-- tickets end a trip early when it looked for an exact `sequence_order + 1`
-- match (see migration 013 for the additional gap-tolerant fix there).
-- -----------------------------------------------------------------------------
create or replace function remove_route_stop(
  p_route_id uuid,
  p_stop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  delete from route_stops where route_id = p_route_id and stop_id = p_stop_id;

  set constraints route_stops_route_id_sequence_order_key deferred;

  with ranked as (
    select id, row_number() over (order by sequence_order) as rn
    from route_stops
    where route_id = p_route_id
  )
  update route_stops rs
  set sequence_order = ranked.rn
  from ranked
  where rs.id = ranked.id;
end;
$$;

revoke all on function remove_route_stop(uuid, uuid) from public;
grant execute on function remove_route_stop(uuid, uuid) to authenticated;
