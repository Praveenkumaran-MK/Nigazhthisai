-- =============================================================================
-- 040: Routes ETA, Live Pipeline Tracking Support, Analytics & Fixes
--   1. Add expected_arrival_time & eta_offset_minutes to route_stops & route_day_stops
--   2. Add expected_arrival_time & actual_arrival_time to trip_stops
--   3. Overload save_route_day_stops to support ETAs
--   4. Update get_revenue_analytics to support district grouping
--   5. Fix validate_ticket_by_pnr column reference bug (origin_stop_id / dest_stop_id)
-- =============================================================================

-- 1. Route stops ETA columns
alter table public.route_stops
  add column if not exists expected_arrival_time text,
  add column if not exists eta_offset_minutes int;

alter table public.route_day_stops
  add column if not exists expected_arrival_time text,
  add column if not exists eta_offset_minutes int;

-- 2. Trip stops ETA & actual arrival columns
alter table public.trip_stops
  add column if not exists expected_arrival_time timestamptz,
  add column if not exists actual_arrival_time timestamptz;

-- 3. Robust save_route_day_stops supporting stop objects with ETA
drop function if exists public.save_route_day_stops(uuid, int, uuid[]);
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
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can modify route stop sequences';
  end if;

  -- Remove existing day stops for this route & day
  delete from public.route_day_stops
  where route_id = p_route_id
    and day_of_week = p_day_of_week;

  -- If standard schedule (-1), also update default route_stops
  if p_day_of_week = -1 then
    delete from public.route_stops where route_id = p_route_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_stops) loop
    v_stop_id := (v_item->>'stop_id')::uuid;
    v_eta     := nullif(trim(coalesce(v_item->>'expected_arrival_time', v_item->>'eta', '')), '');

    if v_stop_id is not null then
      insert into public.route_day_stops (route_id, day_of_week, stop_id, sequence_order, expected_arrival_time)
      values (p_route_id, p_day_of_week, v_stop_id, v_idx, v_eta);

      if p_day_of_week = -1 then
        insert into public.route_stops (route_id, stop_id, sequence_order, expected_arrival_time)
        values (p_route_id, v_stop_id, v_idx, v_eta);
      end if;

      v_idx := v_idx + 1;
    end if;
  end loop;

  return true;
end;
$$;

grant execute on function public.save_route_day_stops(uuid, int, jsonb) to authenticated;

-- Legacy array overload for backwards-compatibility
create or replace function public.save_route_day_stops(
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
  v_json jsonb := '[]'::jsonb;
  v_id uuid;
begin
  foreach v_id in array p_stop_ids loop
    v_json := v_json || jsonb_build_object('stop_id', v_id);
  end loop;
  return public.save_route_day_stops(p_route_id, p_day_of_week, v_json);
end;
$$;

grant execute on function public.save_route_day_stops(uuid, int, uuid[]) to authenticated;

-- 4. Fix validate_ticket_by_pnr: correct column names to origin_stop_id and dest_stop_id
create or replace function public.validate_ticket_by_pnr(
  p_trip_id uuid,
  p_pnr     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket      tickets;
  v_trip        trips;
  v_from_name   text;
  v_to_name     text;
begin
  if not (is_conductor() or is_any_admin()) then
    raise exception 'FORBIDDEN: Only active conductors can validate passenger tickets';
  end if;

  if p_pnr is null or trim(p_pnr) = '' then
    raise exception 'INVALID_INPUT: PNR cannot be empty';
  end if;

  -- 1. Row lock on ticket to prevent simultaneous validation race
  select * into v_ticket
  from tickets
  where pnr = upper(trim(p_pnr))
  for update;

  if not found then
    raise exception 'NOT_FOUND: Ticket with PNR % not found', upper(trim(p_pnr));
  end if;

  -- 2. Verify payment status
  if v_ticket.status not in ('PAID', 'VALIDATED') then
    raise exception 'INVALID_STATUS: Ticket % is unpaid or invalid (status: %)', v_ticket.pnr, v_ticket.status;
  end if;

  -- 3. Prevent double validation
  if v_ticket.is_validated or v_ticket.status = 'VALIDATED' then
    return jsonb_build_object(
      'success',        false,
      'error_code',     'ALREADY_VALIDATED',
      'message',        'Ticket was already validated at ' || to_char(coalesce(v_ticket.validated_at, now()), 'HH12:MI AM'),
      'pnr',            v_ticket.pnr,
      'validated_at',   v_ticket.validated_at,
      'passenger_count', v_ticket.passenger_count
    );
  end if;

  -- 4. Trip match check (if trip specified)
  if p_trip_id is not null and v_ticket.trip_id <> p_trip_id then
    return jsonb_build_object(
      'success',        false,
      'error_code',     'WRONG_TRIP',
      'message',        'Ticket is booked for a different bus trip',
      'pnr',            v_ticket.pnr
    );
  end if;

  -- 5. Execute validation atomically
  update tickets
  set is_validated = true,
      validated_at = now(),
      validated_by = auth.uid(),
      status       = 'VALIDATED',
      updated_at   = now()
  where id = v_ticket.id;

  -- Correct columns: origin_stop_id and dest_stop_id
  select name into v_from_name from stops where id = v_ticket.origin_stop_id;
  select name into v_to_name   from stops where id = v_ticket.dest_stop_id;

  return jsonb_build_object(
    'success',         true,
    'pnr',             v_ticket.pnr,
    'passenger_count', v_ticket.passenger_count,
    'total_fare',      v_ticket.total_fare,
    'from_stop',       coalesce(v_from_name, 'Origin Stop'),
    'to_stop',         coalesce(v_to_name, 'Destination Stop'),
    'validated_at',    now(),
    'message',         'Ticket validated successfully'
  );
end;
$$;

grant execute on function public.validate_ticket_by_pnr(uuid, text) to authenticated;

-- 5. Enhanced get_revenue_analytics supporting District Grouping
create or replace function public.get_revenue_analytics(
  p_district_id  uuid default null,
  p_start_date   text default null,
  p_end_date     text default null,
  p_group_by     text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_district uuid;
  v_start_ts           timestamptz;
  v_end_ts             timestamptz;
  v_total_revenue      numeric := 0;
  v_total_tickets      int := 0;
  v_breakdown          jsonb := '[]'::jsonb;
begin
  -- Enforce Tenant Security
  if is_master_admin() then
    v_effective_district := p_district_id;
  elsif is_district_admin() then
    v_effective_district := my_district_id();
    if v_effective_district is null then
      raise exception 'FORBIDDEN: Admin account is not associated with any district';
    end if;
  else
    raise exception 'FORBIDDEN: Only administrators can view revenue analytics';
  end if;

  -- Parse dates with safe fallbacks
  if p_start_date is not null and trim(p_start_date) <> '' then
    v_start_ts := (p_start_date || ' 00:00:00+00')::timestamptz;
  else
    v_start_ts := now() - interval '30 days';
  end if;

  if p_end_date is not null and trim(p_end_date) <> '' then
    if length(trim(p_end_date)) = 10 then
      v_end_ts := (p_end_date || ' 23:59:59.999+00')::timestamptz;
    else
      v_end_ts := p_end_date::timestamptz;
    end if;
  else
    v_end_ts := now();
  end if;

  -- Overall aggregate KPIs
  select
    coalesce(sum(total_fare), 0),
    count(id)
  into
    v_total_revenue,
    v_total_tickets
  from tickets
  where status in ('PAID', 'VALIDATED')
    and created_at >= v_start_ts
    and created_at <= v_end_ts
    and (v_effective_district is null or district_id = v_effective_district);

  -- 1. GROUP BY DISTRICT (Master Admin comparison)
  if p_group_by in ('district', 'districts') then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_breakdown
    from (
      select
        d.id::text as group_key,
        coalesce(d.name, 'Unknown District') as label,
        d.code as district_code,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      join districts d on d.id = tk.district_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by d.id, d.name, d.code
      order by total_revenue desc
    ) t;

  -- 2. GROUP BY BUS
  elsif p_group_by in ('bus', 'buses') then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_breakdown
    from (
      select
        b.id::text as group_key,
        coalesce(b.bus_number, 'Unknown Bus') as label,
        coalesce(b.bus_number, 'Unknown') as bus_number,
        coalesce(b.type::text, 'STANDARD') as bus_type,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      join buses b on b.id = tk.bus_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by b.id, b.bus_number, b.type
      order by total_revenue desc
    ) t;

  -- 3. GROUP BY ROUTE
  elsif p_group_by in ('route', 'routes') then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_breakdown
    from (
      select
        r.id::text as group_key,
        r.name as label,
        coalesce(r.code, r.route_number) as route_code,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      join trips tr on tr.id = tk.trip_id
      join routes r on r.id = tr.route_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by r.id, r.name, coalesce(r.code, r.route_number)
      order by total_revenue desc
    ) t;

  -- 4. GROUP BY CONCESSION
  elsif p_group_by in ('concession', 'concessions') then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_breakdown
    from (
      select
        coalesce(tk.concession_type, 'NORMAL') as group_key,
        case
          when coalesce(tk.concession_type, 'NORMAL') = 'STUDENT' then 'Student Concession (50%)'
          when coalesce(tk.concession_type, 'NORMAL') = 'SENIOR_CITIZEN' then 'Senior Citizen (50%)'
          when coalesce(tk.concession_type, 'NORMAL') = 'FREEDOM_FIGHTER' then 'Freedom Fighter (100% Free)'
          when coalesce(tk.concession_type, 'NORMAL') = 'MONTHLY_PASS' then 'Monthly Pass Holder'
          else 'Standard / Full Fare'
        end as label,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by coalesce(tk.concession_type, 'NORMAL')
      order by total_revenue desc
    ) t;

  -- 5. GROUP BY PAYMENT METHOD
  elsif p_group_by in ('payment_method', 'payment', 'channel') then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_breakdown
    from (
      select
        coalesce(tk.payment_method, tk.channel, 'APP') as group_key,
        case
          when coalesce(tk.payment_method, tk.channel, 'APP') = 'CASH' then 'In-Bus Cash Collection'
          when coalesce(tk.payment_method, tk.channel, 'APP') = 'UPI' then 'UPI / QR Payment'
          when coalesce(tk.payment_method, tk.channel, 'APP') = 'CARD' then 'Debit / Credit Card'
          else 'App Digital Payment (Razorpay)'
        end as label,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by coalesce(tk.payment_method, tk.channel, 'APP')
      order by total_revenue desc
    ) t;

  -- 6. DEFAULT GROUP BY DAY
  else
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_breakdown
    from (
      select
        to_char(date_trunc('day', tk.created_at), 'YYYY-MM-DD') as group_key,
        to_char(date_trunc('day', tk.created_at), 'Mon DD, YYYY') as label,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from tickets tk
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by date_trunc('day', tk.created_at)
      order by date_trunc('day', tk.created_at) desc
    ) t;
  end if;

  return jsonb_build_object(
    'district_id',   v_effective_district,
    'start_date',    v_start_ts,
    'end_date',      v_end_ts,
    'group_by',      p_group_by,
    'total_revenue', v_total_revenue,
    'total_tickets', v_total_tickets,
    'breakdown',     v_breakdown
  );
end;
$$;

grant execute on function public.get_revenue_analytics(uuid, text, text, text) to authenticated;
