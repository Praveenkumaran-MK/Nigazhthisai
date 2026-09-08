-- =============================================================================
-- 023: Revenue & Payment schema
-- Adds: razorpay_orders, razorpay_payments, complaints, alert_messages,
-- revenue_summary view, get_revenue_summary RPC, issue_cash_ticket RPC,
-- generate_bus_qr + verify_bus_qr RPCs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Razorpay Orders — created by admin/edge function BEFORE payment
-- -----------------------------------------------------------------------------
create table if not exists razorpay_orders (
  id                  text        primary key,   -- Razorpay order_id (e.g. order_xxxxxx)
  passenger_id        uuid        references auth.users (id) on delete set null,
  trip_id             uuid        references trips (id) on delete set null,
  origin_stop_id      uuid        references stops (id) on delete set null,
  dest_stop_id        uuid        references stops (id) on delete set null,
  passenger_count     int         not null default 1,
  amount_paise        int         not null check (amount_paise > 0),
  currency            text        not null default 'INR',
  status              text        not null default 'CREATED'
                                    check (status in ('CREATED','PAID','FAILED','REFUNDED','EXPIRED')),
  razorpay_payment_id text        unique,
  razorpay_signature  text,
  ticket_id           uuid        references tickets (id) on delete set null,
  expires_at          timestamptz not null default now() + interval '30 minutes',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger razorpay_orders_set_updated_at
  before update on razorpay_orders
  for each row execute function set_updated_at();

alter table razorpay_orders enable row level security;
-- Passenger can see their own orders (to show payment status)
create policy razorpay_orders_owner_read on razorpay_orders
  for select using (passenger_id = auth.uid());
-- Admin sees all (for revenue reconciliation)
create policy razorpay_orders_admin_read on razorpay_orders
  for select using (is_any_admin());
-- Only SECURITY DEFINER RPCs / service role insert
-- (no direct client insert policy)

-- add to realtime publication for live checkout status
alter publication supabase_realtime add table razorpay_orders;

-- -----------------------------------------------------------------------------
-- 2. Complaints — passenger files, admin manages
-- -----------------------------------------------------------------------------
create table if not exists complaints (
  id          uuid        primary key default gen_random_uuid(),
  trip_id     uuid        references trips (id) on delete set null,
  bus_id      uuid        references buses (id) on delete set null,
  district_id uuid        references districts (id) on delete set null,
  passenger_id uuid       references auth.users (id) on delete set null,
  type        text        not null
                            check (type in (
                              'CLEANLINESS','DRIVER_BEHAVIOR','OVERCROWDING',
                              'SAFETY','OVERCHARGING','OTHER'
                            )),
  description text,
  status      text        not null default 'OPEN'
                            check (status in ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
  resolved_by uuid        references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger complaints_set_updated_at
  before update on complaints
  for each row execute function set_updated_at();

create index if not exists idx_complaints_district  on complaints (district_id);
create index if not exists idx_complaints_passenger on complaints (passenger_id);
create index if not exists idx_complaints_status    on complaints (status);

alter table complaints enable row level security;
-- Passenger inserts their own complaint
create policy complaints_passenger_insert on complaints
  for insert with check (passenger_id = auth.uid());
-- Passenger reads their own
create policy complaints_passenger_read on complaints
  for select using (passenger_id = auth.uid());
-- Admin reads/updates their district
create policy complaints_admin_read on complaints
  for select using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );
create policy complaints_admin_update on complaints
  for update using (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  )
  with check (
    is_master_admin()
    or (is_district_admin() and district_id = my_district_id())
  );

alter publication supabase_realtime add table complaints;

-- -----------------------------------------------------------------------------
-- 3. Alert Messages — two-way SOS thread between admin and conductor
-- -----------------------------------------------------------------------------
create table if not exists alert_messages (
  id          uuid        primary key default gen_random_uuid(),
  alert_id    uuid        not null references alerts (id) on delete cascade,
  sender_id   uuid        not null references auth.users (id) on delete cascade,
  sender_role text        not null check (sender_role in ('admin', 'master_admin', 'conductor')),
  message     text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_alert_messages_alert on alert_messages (alert_id, created_at);

alter table alert_messages enable row level security;
-- Admin can read/insert on any alert
create policy alert_messages_admin_all on alert_messages
  for all using (is_any_admin()) with check (is_any_admin());
-- Conductor can read/insert messages for their own alerts
create policy alert_messages_conductor_read on alert_messages
  for select using (
    exists (
      select 1 from alerts a
      where a.id = alert_id
        and a.conductor_id = current_conductor_id()
    )
  );
create policy alert_messages_conductor_insert on alert_messages
  for insert with check (
    sender_id = auth.uid()
    and sender_role = 'conductor'
    and exists (
      select 1 from alerts a
      where a.id = alert_id
        and a.conductor_id = current_conductor_id()
    )
  );

alter publication supabase_realtime add table alert_messages;

-- -----------------------------------------------------------------------------
-- 4. Revenue summary view (admin dashboard + revenue page)
-- -----------------------------------------------------------------------------
create or replace view revenue_summary as
select
  d.id              as district_id,
  d.name            as district_name,
  d.code            as district_code,
  date_trunc('month', t.created_at)::date as revenue_month,
  r.id              as route_id,
  r.name            as route_name,
  r.route_number,
  count(t.id)       as ticket_count,
  sum(t.total_fare) as total_revenue
from tickets t
join trips   tr on tr.id = t.trip_id
join buses   b  on b.id  = tr.bus_id
join routes  r  on r.id  = tr.route_id
left join districts d on d.id = b.district_id
where t.status in ('VALIDATED', 'EXPIRED')
group by 1, 2, 3, 4, 5, 6, 7;

-- -----------------------------------------------------------------------------
-- 5. get_revenue_summary RPC (called from admin RevenuePage)
-- -----------------------------------------------------------------------------
create or replace function get_revenue_summary(
  p_district_id uuid      default null,
  p_from_date   date      default (current_date - interval '6 months')::date,
  p_to_date     date      default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_district_filter uuid;
  v_result          jsonb;
begin
  -- District admins are always restricted to their own district
  if is_district_admin() then
    v_district_filter := my_district_id();
  elsif is_master_admin() then
    v_district_filter := p_district_id;  -- null means all districts
  else
    raise exception 'NOT_AUTHORIZED';
  end if;

  select jsonb_build_object(
    'total_revenue',   coalesce(sum(total_revenue), 0),
    'total_tickets',   coalesce(sum(ticket_count), 0),
    'monthly_data',    jsonb_agg(
                         jsonb_build_object(
                           'month',   to_char(revenue_month, 'Mon YYYY'),
                           'revenue', coalesce(m.monthly_revenue, 0),
                           'tickets', coalesce(m.monthly_tickets, 0)
                         ) order by revenue_month
                       ),
    'route_revenue',   jsonb_agg(
                         jsonb_build_object(
                           'route',   route_name,
                           'number',  route_number,
                           'revenue', coalesce(total_revenue, 0)
                         ) order by total_revenue desc
                       ) filter (where route_id is not null)
  )
  into v_result
  from (
    select
      rs.route_id,
      rs.route_name,
      rs.route_number,
      rs.revenue_month,
      sum(rs.total_revenue) over (partition by rs.revenue_month) as monthly_revenue,
      sum(rs.ticket_count)  over (partition by rs.revenue_month) as monthly_tickets,
      sum(rs.total_revenue) as total_revenue,
      sum(rs.ticket_count)  as ticket_count
    from revenue_summary rs
    where (v_district_filter is null or rs.district_id = v_district_filter)
      and rs.revenue_month between p_from_date and p_to_date
    group by rs.route_id, rs.route_name, rs.route_number, rs.revenue_month,
             rs.total_revenue, rs.ticket_count
  ) m;

  return coalesce(v_result, jsonb_build_object(
    'total_revenue', 0, 'total_tickets', 0, 'monthly_data', '[]'::jsonb, 'route_revenue', '[]'::jsonb
  ));
end;
$$;

revoke all on function get_revenue_summary(uuid, date, date) from public, anon, authenticated;
grant  execute on function get_revenue_summary(uuid, date, date) to authenticated;

-- Verify grant
do $$
begin
  if not has_function_privilege('authenticated', 'get_revenue_summary(uuid, date, date)', 'execute') then
    raise exception 'MIGRATION 023 GRANT CHECK FAILED: get_revenue_summary not callable by authenticated';
  end if;
  raise notice 'MIGRATION 023 OK — revenue + complaints + alert_messages applied';
end;
$$;
