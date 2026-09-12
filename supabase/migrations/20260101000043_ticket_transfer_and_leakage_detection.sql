-- =============================================================================
-- 043: Ticket Transfer Logic, Revenue Leakage Detection & Demand Analytics
-- Fulfills:
--   1. Ticket Transfer Logic: Automatic transfer to next bus on missed bus
--   2. Revenue Integrity & Leakage Detection: Compares tickets vs onboard headcount
--   3. Demand Analysis & Bus Suggestion Engine: Computes stop/route demand & suggests buses
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend tickets table with transfer audit columns
-- -----------------------------------------------------------------------------
alter table tickets
  add column if not exists transfer_count int not null default 0,
  add column if not exists original_trip_id uuid references trips (id) on delete set null,
  add column if not exists transferred_at timestamptz;

-- -----------------------------------------------------------------------------
-- 2. RPC: transfer_missed_ticket
--    Allows passenger to transfer a paid ticket if they missed their bus.
--    Finds the next upcoming bus on the exact same route.
--    Prevents abuse (max 1 transfer per ticket).
-- -----------------------------------------------------------------------------
create or replace function transfer_missed_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket        tickets;
  v_curr_trip     trips;
  v_next_trip     trips;
  v_next_bus      buses;
  v_new_sig       text;
  v_hmac_key      text;
  v_old_trip_id   uuid;
begin
  -- 1. Fetch and lock ticket
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND: Specified ticket does not exist';
  end if;

  -- 2. Verify status: can only transfer an unvalidated PAID ticket
  if v_ticket.status = 'VALIDATED' then
    raise exception 'ALREADY_VALIDATED: Boarded tickets cannot be transferred';
  end if;
  if v_ticket.status = 'CANCELLED' then
    raise exception 'TICKET_CANCELLED: Cancelled tickets cannot be transferred';
  end if;

  -- 3. Abuse prevention: only 1 transfer allowed per ticket
  if coalesce(v_ticket.transfer_count, 0) >= 1 then
    raise exception 'MAX_TRANSFERS_EXCEEDED: This ticket has already been transferred to another bus';
  end if;

  -- 4. Get current trip details
  select * into v_curr_trip from trips where id = v_ticket.trip_id;
  if v_curr_trip is null then
    raise exception 'TRIP_NOT_FOUND: Current trip not found';
  end if;

  -- 5. Find next eligible trip strictly on the exact same route!
  select t.* into v_next_trip
  from trips t
  where t.route_id = v_curr_trip.route_id
    and t.id <> v_curr_trip.id
    and t.status in ('SCHEDULED', 'ACTIVE')
  order by
    case when t.status = 'ACTIVE' then 0 else 1 end,
    t.scheduled_departure asc
  limit 1;

  if v_next_trip is null then
    raise exception 'NO_NEXT_TRIP: No alternative buses currently scheduled on this route';
  end if;

  select * into v_next_bus from buses where id = v_next_trip.bus_id;

  -- 6. Recalculate HMAC signature for the new trip
  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  if v_hmac_key is null or length(v_hmac_key) = 0 then
    v_hmac_key := 'default_nigazhthisai_qr_secret_key_2026';
  end if;

  v_new_sig := encode(
    extensions.hmac(v_ticket.qr_payload || '|' || v_next_trip.id::text, v_hmac_key, 'sha256'),
    'hex'
  );

  v_old_trip_id := v_ticket.trip_id;

  -- 7. Update ticket record
  update tickets
  set original_trip_id = coalesce(original_trip_id, v_old_trip_id),
      trip_id          = v_next_trip.id,
      bus_id           = v_next_trip.bus_id,
      qr_signature     = v_new_sig,
      transfer_count   = coalesce(transfer_count, 0) + 1,
      transferred_at   = now(),
      expires_at       = greatest(expires_at, now() + interval '3 hours')
  where id = v_ticket.id
  returning * into v_ticket;

  return jsonb_build_object(
    'ticket_id',         v_ticket.id,
    'pnr',               v_ticket.pnr,
    'old_trip_id',       v_old_trip_id,
    'new_trip_id',       v_next_trip.id,
    'new_bus_id',        v_next_trip.bus_id,
    'new_bus_number',    v_next_bus.bus_number,
    'route_id',          v_curr_trip.route_id,
    'transfer_count',    v_ticket.transfer_count,
    'transferred_at',    v_ticket.transferred_at
  );
end;
$$;

revoke all on function transfer_missed_ticket(uuid) from public, anon;
grant execute on function transfer_missed_ticket(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. RPC: audit_trip_revenue_leakage
--    Compares validated tickets against actual onboard passenger headcount.
--    Triggers REVENUE FRAUD ALERT if headcount > tickets by threshold.
-- -----------------------------------------------------------------------------
create or replace function audit_trip_revenue_leakage(
  p_trip_id             uuid,
  p_physical_headcount  int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip               trips;
  v_bus                buses;
  v_validated_count    int;
  v_occupancy_count    int;
  v_headcount_to_check int;
  v_mismatch_diff      int;
  v_alert_id           uuid := null;
  v_threshold          int := 3; -- Alert if mismatch >= 3 un-ticketed passengers
begin
  select * into v_trip from trips where id = p_trip_id;
  if v_trip is null then
    raise exception 'TRIP_NOT_FOUND: Trip does not exist';
  end if;

  select * into v_bus from buses where id = v_trip.bus_id;

  -- 1. Count validated passengers for this trip
  select coalesce(sum(passenger_count), 0) into v_validated_count
  from tickets
  where trip_id = p_trip_id and status = 'VALIDATED';

  -- 2. Get current occupancy counter
  select current_passenger_count into v_occupancy_count
  from trip_occupancy
  where trip_id = p_trip_id;

  v_occupancy_count := coalesce(v_occupancy_count, 0);

  -- Use physical headcount if provided by inspector/conductor, else use occupancy counter
  v_headcount_to_check := coalesce(p_physical_headcount, v_occupancy_count);
  v_mismatch_diff      := v_headcount_to_check - v_validated_count;

  -- 3. If physical onboard count exceeds validated tickets by threshold, trigger alert!
  if v_mismatch_diff >= v_threshold then
    insert into alerts (
      trip_id,
      bus_id,
      conductor_id,
      district_id,
      severity,
      status,
      title,
      message,
      source_role
    ) values (
      p_trip_id,
      v_trip.bus_id,
      v_trip.conductor_id,
      v_bus.district_id,
      'WARNING',
      'ACTIVE',
      'REVENUE FRAUD ALERT: Un-ticketed Passengers Detected',
      format('Audit detected %s passengers onboard Bus #%s, but only %s valid tickets exist. Possible revenue leakage of %s passenger fares.',
        v_headcount_to_check, coalesce(v_bus.bus_number, 'Unknown'), v_validated_count, v_mismatch_diff),
      'system'
    )
    returning id into v_alert_id;
  end if;

  return jsonb_build_object(
    'trip_id',            p_trip_id,
    'bus_number',         v_bus.bus_number,
    'validated_tickets',  v_validated_count,
    'onboard_headcount',  v_headcount_to_check,
    'mismatch_diff',      v_mismatch_diff,
    'alert_triggered',    (v_alert_id is not null),
    'alert_id',           v_alert_id
  );
end;
$$;

revoke all on function audit_trip_revenue_leakage(uuid, int) from public, anon;
grant execute on function audit_trip_revenue_leakage(uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. RPC: compute_route_demand_analytics
--    Computes stop and route demand from tickets and suggests additional buses.
-- -----------------------------------------------------------------------------
create or replace function compute_route_demand_analytics(
  p_route_id    uuid default null,
  p_target_date date default current_date
)
returns table (
  route_id                  uuid,
  route_number              text,
  route_name                text,
  total_passengers          bigint,
  total_trips               bigint,
  busiest_origin_stop       text,
  busiest_origin_count      bigint,
  busiest_dest_stop         text,
  busiest_dest_count        bigint,
  avg_trip_utilization_pct  numeric,
  surge_detected            boolean,
  suggested_additional_buses int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with route_stats as (
    select
      r.id as r_id,
      r.route_number as r_num,
      r.name as r_name,
      coalesce(sum(tk.passenger_count), 0) as total_pax,
      count(distinct t.id) as trip_cnt,
      coalesce(avg(b.capacity), 50) as avg_cap
    from routes r
    left join trips t on t.route_id = r.id and t.created_at::date = p_target_date
    left join buses b on b.id = t.bus_id
    left join tickets tk on tk.trip_id = t.id and tk.status in ('PAID', 'VALIDATED')
    where (p_route_id is null or r.id = p_route_id)
    group by r.id, r.route_number, r.name
  ),
  origin_ranks as (
    select
      r.id as r_id,
      s.name as stop_name,
      sum(tk.passenger_count) as pax_count,
      row_number() over (partition by r.id order by sum(tk.passenger_count) desc) as rn
    from routes r
    join trips t on t.route_id = r.id and t.created_at::date = p_target_date
    join tickets tk on tk.trip_id = t.id and tk.status in ('PAID', 'VALIDATED')
    join stops s on s.id = tk.origin_stop_id
    group by r.id, s.name
  ),
  dest_ranks as (
    select
      r.id as r_id,
      s.name as stop_name,
      sum(tk.passenger_count) as pax_count,
      row_number() over (partition by r.id order by sum(tk.passenger_count) desc) as rn
    from routes r
    join trips t on t.route_id = r.id and t.created_at::date = p_target_date
    join tickets tk on tk.trip_id = t.id and tk.status in ('PAID', 'VALIDATED')
    join stops s on s.id = tk.dest_stop_id
    group by r.id, s.name
  )
  select
    rs.r_id,
    rs.r_num,
    rs.r_name,
    rs.total_pax,
    rs.trip_cnt,
    coalesce(o.stop_name, 'None'),
    coalesce(o.pax_count, 0),
    coalesce(d.stop_name, 'None'),
    coalesce(d.pax_count, 0),
    round(
      case
        when rs.trip_cnt > 0 and rs.avg_cap > 0 then
          least(100.0, (rs.total_pax::numeric / (rs.trip_cnt * rs.avg_cap)::numeric) * 100.0)
        else 0.0
      end, 1
    ) as avg_utilization,
    (case
      when rs.trip_cnt > 0 and rs.avg_cap > 0 and (rs.total_pax::numeric / (rs.trip_cnt * rs.avg_cap)::numeric) >= 0.85 then true
      when rs.trip_cnt = 0 and rs.total_pax > 40 then true
      else false
    end) as surge_flag,
    (case
      when rs.trip_cnt > 0 and (rs.total_pax::numeric / (rs.trip_cnt * rs.avg_cap)::numeric) >= 0.85 then
        greatest(1, ceil((rs.total_pax - (rs.trip_cnt * rs.avg_cap * 0.85)) / 50.0)::int)
      when rs.trip_cnt = 0 and rs.total_pax > 40 then 1
      else 0
    end) as add_buses
  from route_stats rs
  left join origin_ranks o on o.r_id = rs.r_id and o.rn = 1
  left join dest_ranks d on d.r_id = rs.r_id and d.rn = 1
  order by rs.total_pax desc;
end;
$$;

revoke all on function compute_route_demand_analytics(uuid, date) from public, anon;
grant execute on function compute_route_demand_analytics(uuid, date) to authenticated;
