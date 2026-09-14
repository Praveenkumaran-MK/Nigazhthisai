-- =============================================================================
-- Migration: 20260101000050_end_trip_with_bus_qr.sql
-- Description: Adds end_trip RPC allowing conductors to end an active trip / shift
--              wherever they are by scanning the bus QR code again.
--              Also safely expires remaining tickets and resets on-board occupancy.
-- =============================================================================

create or replace function public.end_trip(
  p_trip_id uuid,
  p_bus_qr  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus_id        uuid;
  v_status        trip_status;
  v_bus_number    text;
begin
  -- 1. Authorization: caller must be assigned conductor or an admin
  if not is_conductor_for_trip(p_trip_id) and not is_any_admin() then
    raise exception 'NOT_AUTHORIZED: You are not assigned to this trip';
  end if;

  -- 2. Fetch trip info
  select t.bus_id, t.status, b.bus_number
  into v_bus_id, v_status, v_bus_number
  from trips t
  left join buses b on b.id = t.bus_id
  where t.id = p_trip_id;

  if v_bus_id is null then
    raise exception 'TRIP_NOT_FOUND: Trip does not exist';
  end if;

  -- If trip is already completed, return idempotently
  if v_status = 'COMPLETED' then
    return jsonb_build_object(
      'success', true,
      'trip_id', p_trip_id,
      'status', 'COMPLETED',
      'already_completed', true,
      'bus_number', v_bus_number
    );
  end if;

  -- 3. Verify Bus QR code if provided
  if p_bus_qr is not null and trim(p_bus_qr) <> '' then
    perform verify_bus_qr(p_bus_qr, v_bus_id);
  end if;

  -- 4. Mark trip as COMPLETED
  update trips
  set status = 'COMPLETED',
      ended_at = now()
  where id = p_trip_id;

  -- 5. Mark any current ARRIVED stop as DEPARTED
  update trip_stops
  set status = 'DEPARTED',
      departure_time = coalesce(departure_time, now())
  where trip_id = p_trip_id and status = 'ARRIVED';

  -- 6. Expire any remaining active/paid/validated tickets for this trip
  update tickets
  set status = 'EXPIRED'
  where trip_id = p_trip_id
    and status in ('PAID', 'VALIDATED');

  -- 7. Reset live occupancy to 0
  update trip_occupancy
  set current_passenger_count = 0
  where trip_id = p_trip_id;

  return jsonb_build_object(
    'success', true,
    'trip_id', p_trip_id,
    'status', 'COMPLETED',
    'ended_at', now(),
    'bus_number', v_bus_number
  );
end;
$$;

revoke all on function public.end_trip(uuid, text) from public;
grant execute on function public.end_trip(uuid, text) to authenticated, anon;
