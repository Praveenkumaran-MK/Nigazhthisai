-- =============================================================================
-- 035: Ensure payment_method and concession_type exist on tickets & fix grouping
-- =============================================================================

alter table tickets
  add column if not exists payment_method text default 'APP',
  add column if not exists concession_type text default 'NORMAL';

-- Re-create get_revenue_analytics with robust column fallbacks and explicit grouping
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
    v_start_ts := p_start_date::timestamptz;
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

  -- 1. GROUP BY BUS
  if p_group_by in ('bus', 'buses') then
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
      join trips tr on tr.id = tk.trip_id
      join buses b on b.id = tr.bus_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (v_effective_district is null or tk.district_id = v_effective_district)
      group by b.id, b.bus_number, b.type
      order by total_revenue desc
    ) t;

  -- 2. GROUP BY ROUTE
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

  -- 3. GROUP BY CONCESSION
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

  -- 4. GROUP BY PAYMENT METHOD
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

  -- 5. DEFAULT GROUP BY DAY
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
    'start_date',    v_start_ts,
    'end_date',      v_end_ts,
    'group_by',      p_group_by,
    'district_id',   v_effective_district,
    'total_revenue', v_total_revenue,
    'total_tickets', v_total_tickets,
    'breakdown',     v_breakdown
  );
end;
$$;
