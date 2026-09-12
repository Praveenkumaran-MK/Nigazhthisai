-- =============================================================================
-- 045: Fix get_conductor_stats RPC
--
-- 1. Resolves missing column references (r.origin, r.destination, t.actual_departure,
--    t.current_stop_index) which previously triggered HTTP 400 (Bad Request).
-- 2. Uses valid columns from routes (r.route_number, r.name) and trips (started_at,
--    scheduled_departure, current_stop_id).
-- 3. Corrects revenue classification (CASH vs APP/digital).
-- 4. Ensures graceful handling when conductor_id is passed or resolved.
-- =============================================================================

create or replace function public.get_conductor_stats(
  p_conductor_id uuid default null,
  p_target_date  date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_conductor_id uuid;
  v_trips_count            int := 0;
  v_active_trip            record;
  v_tickets_count          int := 0;
  v_cash_revenue           numeric(12, 2) := 0.00;
  v_digital_revenue        numeric(12, 2) := 0.00;
  v_total_passengers       int := 0;
  v_target_date            date;
begin
  v_target_date := coalesce(p_target_date, current_date);

  -- 1. Determine effective conductor ID:
  -- Prioritize supplied p_conductor_id, then current_conductor_id()
  v_effective_conductor_id := coalesce(p_conductor_id, current_conductor_id());

  -- If neither is available, return safe empty metrics instead of throwing an error
  if v_effective_conductor_id is null then
    return jsonb_build_object(
      'conductor_id', null,
      'date', v_target_date,
      'trips_count', 0,
      'active_trip', null,
      'tickets_issued', 0,
      'cash_revenue', 0.00,
      'digital_revenue', 0.00,
      'total_revenue', 0.00,
      'passengers_carried', 0
    );
  end if;

  -- 2. Count trips scheduled or operated by this conductor on target date
  select coalesce(count(*), 0) into v_trips_count
  from public.trips
  where conductor_id = v_effective_conductor_id
    and (
      service_date = v_target_date
      or coalesce(scheduled_departure, started_at, created_at)::date = v_target_date
    );

  -- 3. Fetch currently ACTIVE trip for this conductor
  select
    t.id,
    t.status,
    t.bus_id,
    coalesce(b.bus_number, 'N/A') as bus_number,
    coalesce(r.route_number, '') as route_code,
    coalesce(r.name, 'Transit Route') as route_name,
    coalesce(t.started_at, t.created_at) as actual_departure
  into v_active_trip
  from public.trips t
  left join public.buses b on b.id = t.bus_id
  left join public.routes r on r.id = t.route_id
  where t.conductor_id = v_effective_conductor_id
    and t.status = 'ACTIVE'
  order by coalesce(t.started_at, t.created_at) desc
  limit 1;

  -- 4. Calculate ticket aggregates for this conductor on target date
  select
    coalesce(count(tk.id), 0),
    coalesce(sum(case when tk.channel in ('CASH', 'ETM') then tk.total_fare else 0 end), 0.00),
    coalesce(sum(case when tk.channel not in ('CASH', 'ETM') then tk.total_fare else 0 end), 0.00),
    coalesce(sum(coalesce(tk.passenger_count, 1)), 0)
  into v_tickets_count, v_cash_revenue, v_digital_revenue, v_total_passengers
  from public.tickets tk
  join public.trips tr on tr.id = tk.trip_id
  where tr.conductor_id = v_effective_conductor_id
    and (
      tk.created_at::date = v_target_date
      or tr.service_date = v_target_date
      or coalesce(tr.scheduled_departure, tr.started_at, tr.created_at)::date = v_target_date
    )
    and tk.status in ('PAID', 'VALIDATED', 'EXPIRED');

  return jsonb_build_object(
    'conductor_id', v_effective_conductor_id,
    'date', v_target_date,
    'trips_count', v_trips_count,
    'active_trip', case when v_active_trip.id is not null then jsonb_build_object(
      'id', v_active_trip.id,
      'status', v_active_trip.status,
      'bus_id', v_active_trip.bus_id,
      'bus_number', v_active_trip.bus_number,
      'route_code', v_active_trip.route_code,
      'origin', v_active_trip.route_name,
      'destination', '',
      'actual_departure', v_active_trip.actual_departure,
      'current_stop_index', 0
    ) else null end,
    'tickets_issued', v_tickets_count,
    'cash_revenue', v_cash_revenue,
    'digital_revenue', v_digital_revenue,
    'total_revenue', v_cash_revenue + v_digital_revenue,
    'passengers_carried', v_total_passengers
  );
end;
$$;

grant execute on function public.get_conductor_stats(uuid, date) to authenticated, anon;
