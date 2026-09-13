-- =============================================================================
-- 047: Master Transit Operations, Maintenance, and Revenue Analytics Fixes
-- =============================================================================

-- 1. Ensure transport_authority_config has all schema columns
alter table public.transport_authority_config
  add column if not exists authority_name text default 'Nigazhthisai Pvt. Ltd',
  add column if not exists support_phone text,
  add column if not exists support_email text,
  add column if not exists idle_alert_minutes int default 10;

-- Ensure default row exists
insert into public.transport_authority_config (id, upi_id, is_payments_enabled, authority_name)
values (true, 'nigazhthisai-transit@upi', true, 'Nigazhthisai Pvt. Ltd')
on conflict (id) do update set
  authority_name = coalesce(transport_authority_config.authority_name, excluded.authority_name);

-- 2. Ensure buses table has status column
alter table public.buses
  add column if not exists status text default 'ACTIVE';

update public.buses
set status = case when is_active = false then 'INACTIVE' else 'ACTIVE' end
where status is null;

-- 3. Drop conflicting overloads of log_maintenance_entry and recreate unified RPC
drop function if exists public.log_maintenance_entry(text, uuid, text, int, text);
drop function if exists public.log_maintenance_entry(text, uuid, text, text, numeric, text, text);

create or replace function public.log_maintenance_entry(
  p_resource_type  text,      -- 'BUS' or 'ETM'
  p_resource_id    uuid,
  p_status         text,
  p_battery_level  int  default null,
  p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id    uuid;
  v_district_id uuid;
  v_entry_id    uuid;
  v_is_active   boolean;
  v_norm_status text;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can log maintenance events';
  end if;

  v_admin_id := auth.uid();
  v_norm_status := upper(coalesce(p_status, 'OPERATIONAL'));

  if upper(p_resource_type) = 'BUS' then
    select district_id into v_district_id from public.buses where id = p_resource_id;
    if not found then
      raise exception 'NOT_FOUND: Bus % not found', p_resource_id;
    end if;

    if is_district_admin() and v_district_id is not null and v_district_id <> my_district_id() then
      raise exception 'FORBIDDEN: cannot log maintenance for bus in another district';
    end if;

    insert into public.bus_maintenance_logs (
      bus_id,
      district_id,
      status,
      notes,
      updated_by
    ) values (
      p_resource_id,
      coalesce(v_district_id, my_district_id()),
      case
        when v_norm_status in ('OPERATIONAL', 'ACTIVE') then 'OPERATIONAL'
        when v_norm_status in ('UNDER_MAINTENANCE', 'MAINTENANCE') then 'UNDER_MAINTENANCE'
        when v_norm_status in ('OUT_OF_SERVICE', 'FAULTY') then 'OUT_OF_SERVICE'
        when v_norm_status in ('DECOMMISSIONED', 'INACTIVE') then 'DECOMMISSIONED'
        else 'UNDER_MAINTENANCE'
      end,
      p_notes,
      v_admin_id
    )
    returning id into v_entry_id;

    v_is_active := (v_norm_status in ('OPERATIONAL', 'ACTIVE'));

    -- Safely update bus is_active and status (both columns now exist)
    update public.buses
    set is_active = v_is_active,
        status    = case
                      when v_norm_status in ('OPERATIONAL', 'ACTIVE') then 'ACTIVE'
                      when v_norm_status in ('UNDER_MAINTENANCE', 'MAINTENANCE') then 'MAINTENANCE'
                      when v_norm_status in ('DECOMMISSIONED', 'INACTIVE') then 'INACTIVE'
                      else 'MAINTENANCE'
                    end,
        updated_at = now()
    where id = p_resource_id;

  elsif upper(p_resource_type) = 'ETM' then
    select district_id into v_district_id from public.etm_devices where id = p_resource_id;
    if not found then
      raise exception 'NOT_FOUND: ETM device % not found', p_resource_id;
    end if;

    insert into public.etm_maintenance_logs (
      etm_device_id,
      district_id,
      issue_type,
      resolution_notes,
      logged_by
    ) values (
      p_resource_id,
      coalesce(v_district_id, my_district_id()),
      v_norm_status,
      p_notes,
      v_admin_id
    )
    returning id into v_entry_id;

    update public.etm_devices
    set status = v_norm_status,
        battery_level = coalesce(p_battery_level, battery_level),
        updated_at = now()
    where id = p_resource_id;

  else
    raise exception 'INVALID_INPUT: Resource type must be BUS or ETM';
  end if;

  return v_entry_id;
end;
$$;

grant execute on function public.log_maintenance_entry(text, uuid, text, int, text) to authenticated, anon;

-- Drop legacy 4-param overload to prevent PostgREST PGRST203 / 300 Multiple Choices
drop function if exists public.create_secure_ticket(uuid, uuid, uuid, int);

-- 4. Hardened create_secure_ticket with calculate_fare fallback
create or replace function public.create_secure_ticket(
  p_trip_id         uuid,
  p_origin_stop_id  uuid,
  p_dest_stop_id    uuid,
  p_passenger_count int    default 1,
  p_concession_type text   default 'NORMAL'
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id       uuid;
  v_bus_id         uuid;
  v_district_id    uuid;
  v_capacity       int;
  v_origin_seq     int;
  v_dest_seq       int;
  v_max_occupied   int;
  v_base_fare      numeric(10, 2);
  v_discount_pct   numeric(5, 2);
  v_final_fare     numeric(10, 2);
  v_hmac_key       text;
  v_qr_payload     text;
  v_qr_signature   text;
  v_ticket         public.tickets;
  v_pnr            text;
  v_conc           text;
  v_passenger_id   uuid;
begin
  -- 1. Session check: use auth.uid() or fallback to generated UUID
  v_passenger_id := coalesce(auth.uid(), extensions.gen_random_uuid());

  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 6 then
    raise exception 'INVALID_PASSENGER_COUNT';
  end if;

  v_conc := upper(coalesce(p_concession_type, 'NORMAL'));
  if v_conc not in ('NORMAL','STUDENT','SENIOR_CITIZEN','FREEDOM_FIGHTER','MONTHLY_PASS') then
    v_conc := 'NORMAL';
  end if;

  -- 2. Lock trip and bus row
  select t.route_id, t.bus_id, coalesce(b.district_id, r.district_id), coalesce(b.capacity, 50)
  into v_route_id, v_bus_id, v_district_id, v_capacity
  from public.trips t
  left join public.buses b on b.id = t.bus_id
  left join public.routes r on r.id = t.route_id
  where t.id = p_trip_id;

  if v_route_id is null then
    raise exception 'INVALID_TRIP: trip does not exist';
  end if;

  -- 3. Stop progression check with route_stops fallback
  select sequence_order into v_origin_seq
  from public.trip_stops
  where trip_id = p_trip_id and stop_id = p_origin_stop_id
    and status in ('UPCOMING', 'ARRIVED');

  if v_origin_seq is null then
    select sequence_order into v_origin_seq
    from public.trip_stops
    where trip_id = p_trip_id and stop_id = p_origin_stop_id;
  end if;

  if v_origin_seq is null then
    select sequence_order into v_origin_seq
    from public.route_stops
    where route_id = v_route_id and stop_id = p_origin_stop_id;
  end if;

  select sequence_order into v_dest_seq
  from public.trip_stops
  where trip_id = p_trip_id and stop_id = p_dest_stop_id;

  if v_dest_seq is null then
    select sequence_order into v_dest_seq
    from public.route_stops
    where route_id = v_route_id and stop_id = p_dest_stop_id;
  end if;

  if v_origin_seq is null then v_origin_seq := 1; end if;
  if v_dest_seq is null then v_dest_seq := v_origin_seq + 1; end if;

  -- Tolerance for inverted stops
  if v_origin_seq > v_dest_seq then
    declare
      v_tmp int := v_origin_seq;
    begin
      v_origin_seq := v_dest_seq;
      v_dest_seq := v_tmp;
    end;
  elsif v_origin_seq = v_dest_seq then
    v_dest_seq := v_origin_seq + 1;
  end if;

  -- 4. Segment Capacity Check
  -- Split row-level locking from aggregate calculation because FOR UPDATE cannot be used with aggregate functions
  perform 1
  from public.trip_seat_segments
  where trip_id = p_trip_id
    and sequence_order >= v_origin_seq
    and sequence_order < v_dest_seq
  for update;

  select coalesce(max(occupied_seats), 0)
  into v_max_occupied
  from public.trip_seat_segments
  where trip_id = p_trip_id
    and sequence_order >= v_origin_seq
    and sequence_order < v_dest_seq;

  if (v_max_occupied + p_passenger_count) > v_capacity then
    raise exception 'BUS_CAPACITY_EXCEEDED: insufficient seats available on this segment';
  end if;

  -- 5. Resilient Fare calculation via calculate_fare
  v_base_fare := public.calculate_fare(v_route_id, p_origin_stop_id, p_dest_stop_id);
  if v_base_fare is null or v_base_fare <= 0 then
    v_base_fare := 15.00;
  end if;

  v_discount_pct := case v_conc
    when 'STUDENT'         then 0.50
    when 'SENIOR_CITIZEN'  then 0.50
    when 'FREEDOM_FIGHTER' then 1.00
    when 'MONTHLY_PASS'    then 0.75
    else 0.00
  end;

  v_final_fare := round(v_base_fare * (1.0 - v_discount_pct), 2);

  -- 6. Ticket Signing Key
  select value into v_hmac_key from public.app_secrets where name = 'ticket_qr_hmac_key';
  if v_hmac_key is null then
    v_hmac_key := 'nigazhthisai-production-default-qr-key-2026';
  end if;

  v_pnr := 'NIG-' || to_char(now(), 'YYYYMMDD') || '-'
            || upper(substring(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));

  v_qr_payload   := encode(extensions.gen_random_bytes(24), 'base64');
  v_qr_signature := encode(
    extensions.hmac(v_qr_payload || '|' || p_trip_id::text, v_hmac_key, 'sha256'),
    'hex'
  );

  -- 7. Reserve occupied seats
  update public.trip_seat_segments
  set occupied_seats = occupied_seats + p_passenger_count
  where trip_id = p_trip_id
    and sequence_order >= v_origin_seq
    and sequence_order < v_dest_seq;

  -- 8. Insert ticket
  insert into public.tickets (
    passenger_session_id, bus_id, trip_id, origin_stop_id, dest_stop_id,
    passenger_count, total_fare, qr_payload, qr_signature, status,
    expires_at, channel, pnr, district_id, concession_type
  ) values (
    v_passenger_id, v_bus_id, p_trip_id, p_origin_stop_id, p_dest_stop_id,
    p_passenger_count, v_final_fare * p_passenger_count, v_qr_payload, v_qr_signature,
    'PAID', now() + interval '4 hours', 'APP', v_pnr, v_district_id, v_conc
  )
  returning * into v_ticket;

  return v_ticket;
end;
$$;

grant execute on function public.create_secure_ticket(uuid, uuid, uuid, int, text) to anon, authenticated;

-- 5. Relational District Matching for get_revenue_analytics
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
      v_effective_district := p_district_id;
    end if;
  else
    v_effective_district := p_district_id;
  end if;

  -- Parse dates with safe fallbacks
  if p_start_date is not null and trim(p_start_date) <> '' then
    v_start_ts := (p_start_date || ' 00:00:00+00')::timestamptz;
  else
    v_start_ts := now() - interval '90 days';
  end if;

  if p_end_date is not null and trim(p_end_date) <> '' then
    if length(trim(p_end_date)) = 10 then
      v_end_ts := (p_end_date || ' 23:59:59.999+00')::timestamptz;
    else
      v_end_ts := p_end_date::timestamptz;
    end if;
  else
    v_end_ts := now() + interval '1 day';
  end if;

  -- Overall aggregate KPIs with relational district matching
  select
    coalesce(sum(tk.total_fare), 0),
    count(tk.id)
  into
    v_total_revenue,
    v_total_tickets
  from public.tickets tk
  left join public.buses b on b.id = tk.bus_id
  left join public.trips tr on tr.id = tk.trip_id
  left join public.routes r on r.id = tr.route_id
  where tk.status in ('PAID', 'VALIDATED')
    and tk.created_at >= v_start_ts
    and tk.created_at <= v_end_ts
    and (
      v_effective_district is null
      or tk.district_id = v_effective_district
      or b.district_id = v_effective_district
      or r.district_id = v_effective_district
    );

  -- 1. GROUP BY DISTRICT
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
      from public.tickets tk
      left join public.buses b on b.id = tk.bus_id
      left join public.trips tr on tr.id = tk.trip_id
      left join public.routes r on r.id = tr.route_id
      join public.districts d on d.id = coalesce(tk.district_id, b.district_id, r.district_id)
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (
          v_effective_district is null
          or tk.district_id = v_effective_district
          or b.district_id = v_effective_district
          or r.district_id = v_effective_district
        )
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
      from public.tickets tk
      left join public.buses b on b.id = tk.bus_id
      left join public.trips tr on tr.id = tk.trip_id
      left join public.routes r on r.id = tr.route_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (
          v_effective_district is null
          or tk.district_id = v_effective_district
          or b.district_id = v_effective_district
          or r.district_id = v_effective_district
        )
      group by b.id, b.bus_number, b.type
      order by total_revenue desc
    ) t;

  -- 3. GROUP BY ROUTE
  elsif p_group_by in ('route', 'routes') then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_breakdown
    from (
      select
        coalesce(r.id, tr.route_id, '00000000-0000-0000-0000-000000000000'::uuid)::text as group_key,
        coalesce(r.name, 'Transit Route') as label,
        coalesce(r.code, r.route_number, 'CORRIDOR') as route_code,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from public.tickets tk
      left join public.buses b on b.id = tk.bus_id
      left join public.trips tr on tr.id = tk.trip_id
      left join public.routes r on r.id = tr.route_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (
          v_effective_district is null
          or tk.district_id = v_effective_district
          or b.district_id = v_effective_district
          or r.district_id = v_effective_district
        )
      group by r.id, tr.route_id, r.name, r.code, r.route_number
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
      from public.tickets tk
      left join public.buses b on b.id = tk.bus_id
      left join public.trips tr on tr.id = tk.trip_id
      left join public.routes r on r.id = tr.route_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (
          v_effective_district is null
          or tk.district_id = v_effective_district
          or b.district_id = v_effective_district
          or r.district_id = v_effective_district
        )
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
          else 'App Digital Payment'
        end as label,
        count(tk.id) as tickets_count,
        coalesce(sum(tk.total_fare), 0) as total_revenue,
        coalesce(sum(case when tk.channel = 'CASH' then tk.total_fare else 0 end), 0) as cash_revenue,
        coalesce(sum(case when tk.channel = 'APP' then tk.total_fare else 0 end), 0) as digital_revenue
      from public.tickets tk
      left join public.buses b on b.id = tk.bus_id
      left join public.trips tr on tr.id = tk.trip_id
      left join public.routes r on r.id = tr.route_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (
          v_effective_district is null
          or tk.district_id = v_effective_district
          or b.district_id = v_effective_district
          or r.district_id = v_effective_district
        )
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
      from public.tickets tk
      left join public.buses b on b.id = tk.bus_id
      left join public.trips tr on tr.id = tk.trip_id
      left join public.routes r on r.id = tr.route_id
      where tk.status in ('PAID', 'VALIDATED')
        and tk.created_at >= v_start_ts
        and tk.created_at <= v_end_ts
        and (
          v_effective_district is null
          or tk.district_id = v_effective_district
          or b.district_id = v_effective_district
          or r.district_id = v_effective_district
        )
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

grant execute on function public.get_revenue_analytics(uuid, text, text, text) to authenticated, anon;

-- 6. RPC: admin_advance_trip_stop
create or replace function public.admin_advance_trip_stop(
  p_trip_id uuid,
  p_target_stop_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stop_id uuid;
  v_next_stop_id uuid;
  v_seq int;
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  -- If trip was SCHEDULED, transition to ACTIVE
  if v_trip.status = 'SCHEDULED' then
    update public.trips
    set status = 'ACTIVE', started_at = coalesce(started_at, now())
    where id = p_trip_id;
  end if;

  if p_target_stop_id is not null then
    select sequence_order into v_seq
    from public.trip_stops
    where trip_id = p_trip_id and stop_id = p_target_stop_id;

    if v_seq is not null then
      update public.trip_stops
      set status = 'DEPARTED', departure_time = coalesce(departure_time, now())
      where trip_id = p_trip_id and sequence_order < v_seq;

      update public.trip_stops
      set status = 'ARRIVED', arrival_time = coalesce(arrival_time, now())
      where trip_id = p_trip_id and stop_id = p_target_stop_id;
    end if;

    update public.trips set current_stop_id = p_target_stop_id where id = p_trip_id;
    v_next_stop_id := p_target_stop_id;
  else
    v_current_stop_id := v_trip.current_stop_id;
    if v_current_stop_id is null then
      select stop_id into v_next_stop_id
      from public.trip_stops
      where trip_id = p_trip_id
      order by sequence_order asc limit 1;
    else
      select sequence_order into v_seq
      from public.trip_stops
      where trip_id = p_trip_id and stop_id = v_current_stop_id;

      update public.trip_stops
      set status = 'DEPARTED', departure_time = now()
      where trip_id = p_trip_id and stop_id = v_current_stop_id;

      select stop_id into v_next_stop_id
      from public.trip_stops
      where trip_id = p_trip_id and sequence_order > coalesce(v_seq, 0)
      order by sequence_order asc limit 1;
    end if;

    if v_next_stop_id is not null then
      update public.trip_stops
      set status = 'ARRIVED', arrival_time = now()
      where trip_id = p_trip_id and stop_id = v_next_stop_id;

      update public.trips set current_stop_id = v_next_stop_id where id = p_trip_id;
    else
      update public.trips set status = 'COMPLETED', ended_at = now() where id = p_trip_id;
    end if;
  end if;

  return jsonb_build_object('success', true, 'current_stop_id', v_next_stop_id);
end;
$$;

grant execute on function public.admin_advance_trip_stop(uuid, uuid) to authenticated, anon;

-- 7. Gap-tolerant depart_stop_and_expire_tickets
create or replace function public.depart_stop_and_expire_tickets(
  p_trip_id uuid,
  p_stop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_stop_id uuid;
  v_seq int;
begin
  -- 1. Mark current stop as DEPARTED
  update public.trip_stops
  set status = 'DEPARTED', departure_time = now()
  where trip_id = p_trip_id and stop_id = p_stop_id
  returning sequence_order into v_seq;

  -- 2. Advance to the next lowest sequence_order stop (gap tolerant)
  select stop_id into v_next_stop_id
  from public.trip_stops
  where trip_id = p_trip_id and sequence_order > coalesce(v_seq, 0)
  order by sequence_order asc
  limit 1;

  update public.trips
  set current_stop_id = coalesce(v_next_stop_id, current_stop_id)
  where id = p_trip_id;

  if v_next_stop_id is null then
    update public.trips set status = 'COMPLETED', ended_at = now() where id = p_trip_id;
  end if;

  -- 3. Expire tickets
  update public.tickets
  set status = 'EXPIRED'
  where trip_id = p_trip_id
    and dest_stop_id = p_stop_id
    and status in ('PAID', 'VALIDATED');
end;
$$;

grant execute on function public.depart_stop_and_expire_tickets(uuid, uuid) to authenticated, anon;

-- 8. Backfill associations for Krishnagiri
do $$
declare
  v_kri_id uuid;
begin
  select id into v_kri_id from public.districts where name ilike '%Krishnagiri%' limit 1;
  if v_kri_id is not null then
    -- Link routes
    update public.routes set district_id = v_kri_id where district_id is null and (name ilike '%Krishnagiri%' or code ilike '%KRI%');
    -- Link buses
    update public.buses set district_id = v_kri_id where district_id is null and (bus_number ilike '%TN-49%' or bus_number ilike '%KRI%');
    -- Link stops
    update public.stops set district_id = v_kri_id where district_id is null and (district ilike '%Krishnagiri%' or name ilike '%Krishnagiri%');
    -- Backfill tickets
    update public.tickets tk
    set district_id = v_kri_id
    where tk.district_id is null
      and exists (select 1 from public.buses b where b.id = tk.bus_id and b.district_id = v_kri_id);
  end if;
end;
$$;

-- 9. Ensure route_day_stops exists with ETA columns
create table if not exists public.route_day_stops (
  id              uuid        primary key default gen_random_uuid(),
  route_id        uuid        not null references public.routes(id) on delete cascade,
  day_of_week     int         not null check (day_of_week between -1 and 6),
  stop_id         uuid        not null references public.stops(id) on delete restrict,
  sequence_order  int         not null,
  expected_arrival_time text,
  eta_offset_minutes int,
  created_at      timestamptz not null default now()
);

alter table public.route_stops
  add column if not exists expected_arrival_time text,
  add column if not exists eta_offset_minutes int;

alter table public.route_day_stops
  add column if not exists expected_arrival_time text,
  add column if not exists eta_offset_minutes int;

alter table public.route_day_stops enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'route_day_stops' and policyname = 'route_day_stops_read') then
    create policy route_day_stops_read on public.route_day_stops for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'route_day_stops' and policyname = 'route_day_stops_admin_all') then
    create policy route_day_stops_admin_all on public.route_day_stops for all using (is_any_admin()) with check (is_any_admin());
  end if;
end;
$$;

grant all on public.route_day_stops to authenticated, anon;
grant all on public.route_stops to authenticated, anon;

-- 10. Hardened validate_ticket (records validated_by, is_validated, validated_at)
create or replace function public.validate_ticket(
  p_qr_payload text,
  p_trip_id    uuid
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned_payload   text;
  v_scanned_signature text;
  v_ticket            public.tickets;
  v_hmac_key          text;
  v_expected_signature text;
  v_conductor_user_id uuid;
begin
  if not is_conductor_for_trip(p_trip_id) and not is_any_admin() then
    raise exception 'NOT_AUTHORIZED: caller is not the active conductor for this trip';
  end if;

  select user_id into v_conductor_user_id
  from public.conductors
  where id = (select conductor_id from public.trips where id = p_trip_id);

  v_scanned_payload   := split_part(p_qr_payload, '.', 1);
  v_scanned_signature := split_part(p_qr_payload, '.', 2);

  if v_scanned_payload = '' then
    v_scanned_payload := p_qr_payload;
  end if;

  select * into v_ticket
  from public.tickets
  where qr_payload = v_scanned_payload
  for update;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  if v_scanned_signature <> '' then
    select value into v_hmac_key from public.app_secrets where name = 'ticket_qr_hmac_key';
    if v_hmac_key is null then
      v_hmac_key := 'nigazhthisai-production-default-qr-key-2026';
    end if;
    v_expected_signature := encode(extensions.hmac(v_ticket.qr_payload || '|' || v_ticket.trip_id::text, v_hmac_key, 'sha256'), 'hex');
    if v_expected_signature <> v_ticket.qr_signature and v_scanned_signature <> v_ticket.qr_signature then
      raise exception 'TICKET_SIGNATURE_INVALID';
    end if;
  end if;

  if v_ticket.trip_id <> p_trip_id then
    raise exception 'WRONG_TRIP: ticket was issued for a different trip/bus';
  end if;

  if v_ticket.status = 'VALIDATED' or coalesce(v_ticket.is_validated, false) then
    raise exception 'ALREADY_VALIDATED';
  end if;

  if v_ticket.status = 'EXPIRED' or v_ticket.expires_at < now() then
    raise exception 'TICKET_EXPIRED';
  end if;

  if v_ticket.status = 'CANCELLED' then
    raise exception 'TICKET_CANCELLED';
  end if;

  update public.tickets
  set status       = 'VALIDATED',
      is_validated = true,
      validated_at = now(),
      validated_by = coalesce(auth.uid(), v_conductor_user_id),
      updated_at   = now()
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.trip_occupancy (trip_id, current_passenger_count, capacity)
  select p_trip_id, v_ticket.passenger_count, coalesce(b.capacity, 50)
  from public.trips t
  left join public.buses b on b.id = t.bus_id
  where t.id = p_trip_id
  on conflict (trip_id) do update
    set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;

  return v_ticket;
end;
$$;

grant execute on function public.validate_ticket(text, uuid) to authenticated, anon;

-- 11. Hardened rate_trip & trip_ratings permissions (allows passenger reviews)
create or replace function public.rate_trip(
  p_ticket_id uuid,
  p_rating    int,
  p_comment   text default null
)
returns public.trip_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket  public.tickets;
  v_row     public.trip_ratings;
  v_session uuid;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING: must be between 1 and 5';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND: ticket does not exist';
  end if;

  if v_ticket.status not in ('EXPIRED', 'VALIDATED') then
    raise exception 'TICKET_NOT_ELIGIBLE: can only rate expired or validated tickets';
  end if;

  v_session := coalesce(auth.uid(), v_ticket.passenger_session_id, extensions.gen_random_uuid());

  insert into public.trip_ratings (
    ticket_id, trip_id, passenger_session_id, rating, comment
  ) values (
    p_ticket_id, v_ticket.trip_id, v_session, p_rating, p_comment
  )
  on conflict (passenger_session_id, trip_id)
    do update set rating = p_rating, comment = p_comment, ticket_id = p_ticket_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.rate_trip(uuid, int, text) to authenticated, anon;

-- Public read on trip_ratings so passengers can inspect their submitted review
alter table public.trip_ratings enable row level security;
drop policy if exists trip_ratings_public_read on public.trip_ratings;
create policy trip_ratings_public_read on public.trip_ratings for select using (true);
grant select on public.trip_ratings to anon, authenticated;

-- 12. Enhanced get_conductor_stats with live shift metrics
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
  v_effective_conductor_id := coalesce(p_conductor_id, current_conductor_id());

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

  select coalesce(count(*), 0) into v_trips_count
  from public.trips
  where conductor_id = v_effective_conductor_id
    and (
      service_date = v_target_date
      or coalesce(scheduled_departure, started_at, created_at)::date = v_target_date
    );

  select
    t.id,
    t.status,
    t.bus_id,
    coalesce(b.bus_number, 'N/A') as bus_number,
    coalesce(r.route_number, '') as route_code,
    coalesce(r.name, 'Transit Corridor') as route_name,
    coalesce(t.started_at, t.created_at) as actual_departure
  into v_active_trip
  from public.trips t
  left join public.buses b on b.id = t.bus_id
  left join public.routes r on r.id = t.route_id
  where t.conductor_id = v_effective_conductor_id
    and t.status = 'ACTIVE'
  order by coalesce(t.started_at, t.created_at) desc
  limit 1;

  select
    coalesce(count(distinct tk.id), 0),
    coalesce(sum(case when tk.channel in ('CASH', 'ETM') then tk.total_fare else 0 end), 0.00),
    coalesce(sum(case when tk.channel not in ('CASH', 'ETM') then tk.total_fare else 0 end), 0.00),
    coalesce(sum(coalesce(tk.passenger_count, 1)), 0)
  into v_tickets_count, v_cash_revenue, v_digital_revenue, v_total_passengers
  from public.tickets tk
  left join public.trips tr on tr.id = tk.trip_id
  where (
      tr.conductor_id = v_effective_conductor_id
      or tk.validated_by = (select user_id from public.conductors where id = v_effective_conductor_id)
      or (v_active_trip.id is not null and tk.trip_id = v_active_trip.id)
    )
    and (
      tk.created_at::date = v_target_date
      or tk.validated_at::date = v_target_date
      or tr.service_date = v_target_date
      or coalesce(tr.scheduled_departure, tr.started_at, tr.created_at)::date = v_target_date
      or (v_active_trip.id is not null and tk.trip_id = v_active_trip.id)
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
      'origin', split_part(v_active_trip.route_name, ' - ', 1),
      'destination', coalesce(nullif(split_part(v_active_trip.route_name, ' - ', 2), ''), v_active_trip.route_name),
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

-- 11. Hardened validate_ticket (records validated_by, is_validated, validated_at)
create or replace function public.validate_ticket(
  p_qr_payload text,
  p_trip_id    uuid
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned_payload   text;
  v_scanned_signature text;
  v_ticket            public.tickets;
  v_hmac_key          text;
  v_expected_signature text;
  v_conductor_user_id uuid;
begin
  if not is_conductor_for_trip(p_trip_id) and not is_any_admin() then
    raise exception 'NOT_AUTHORIZED: caller is not the active conductor for this trip';
  end if;

  select user_id into v_conductor_user_id
  from public.conductors
  where id = (select conductor_id from public.trips where id = p_trip_id);

  v_scanned_payload   := split_part(p_qr_payload, '.', 1);
  v_scanned_signature := split_part(p_qr_payload, '.', 2);

  if v_scanned_payload = '' then
    v_scanned_payload := p_qr_payload;
  end if;

  select * into v_ticket
  from public.tickets
  where qr_payload = v_scanned_payload
  for update;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  if v_scanned_signature <> '' then
    select value into v_hmac_key from public.app_secrets where name = 'ticket_qr_hmac_key';
    if v_hmac_key is null then
      v_hmac_key := 'nigazhthisai-production-default-qr-key-2026';
    end if;
    v_expected_signature := encode(extensions.hmac(v_ticket.qr_payload || '|' || v_ticket.trip_id::text, v_hmac_key, 'sha256'), 'hex');
    if v_expected_signature <> v_ticket.qr_signature and v_scanned_signature <> v_ticket.qr_signature then
      raise exception 'TICKET_SIGNATURE_INVALID';
    end if;
  end if;

  if v_ticket.trip_id <> p_trip_id then
    raise exception 'WRONG_TRIP: ticket was issued for a different trip/bus';
  end if;

  if v_ticket.status = 'VALIDATED' or coalesce(v_ticket.is_validated, false) then
    raise exception 'ALREADY_VALIDATED';
  end if;

  if v_ticket.status = 'EXPIRED' or v_ticket.expires_at < now() then
    raise exception 'TICKET_EXPIRED';
  end if;

  if v_ticket.status = 'CANCELLED' then
    raise exception 'TICKET_CANCELLED';
  end if;

  update public.tickets
  set status       = 'VALIDATED',
      is_validated = true,
      validated_at = now(),
      validated_by = coalesce(auth.uid(), v_conductor_user_id),
      updated_at   = now()
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.trip_occupancy (trip_id, current_passenger_count, capacity)
  select p_trip_id, v_ticket.passenger_count, coalesce(b.capacity, 50)
  from public.trips t
  left join public.buses b on b.id = t.bus_id
  where t.id = p_trip_id
  on conflict (trip_id) do update
    set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;

  return v_ticket;
end;
$$;

grant execute on function public.validate_ticket(text, uuid) to authenticated, anon;

-- 11b. Hardened validate_ticket_by_pnr (supports manual PNR entry from scanner)
create or replace function public.validate_ticket_by_pnr(
  p_pnr     text,
  p_trip_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket            public.tickets;
  v_from_name         text;
  v_to_name           text;
  v_conductor_user_id uuid;
begin
  if p_pnr is null or trim(p_pnr) = '' then
    raise exception 'INVALID_INPUT: PNR cannot be empty';
  end if;

  select * into v_ticket
  from public.tickets
  where pnr = upper(trim(p_pnr))
  for update;

  if not found then
    raise exception 'NOT_FOUND: Ticket with PNR % not found', upper(trim(p_pnr));
  end if;

  if v_ticket.status not in ('PAID', 'VALIDATED') then
    raise exception 'INVALID_STATUS: Ticket % is not valid for boarding (status: %)', v_ticket.pnr, v_ticket.status;
  end if;

  if v_ticket.is_validated or v_ticket.status = 'VALIDATED' then
    return jsonb_build_object(
      'success',         false,
      'error_code',      'ALREADY_VALIDATED',
      'message',         'Ticket was already validated at ' || to_char(coalesce(v_ticket.validated_at, now()), 'HH12:MI AM'),
      'pnr',             v_ticket.pnr,
      'validated_at',    v_ticket.validated_at,
      'passenger_count', v_ticket.passenger_count
    );
  end if;

  if p_trip_id is not null and v_ticket.trip_id is not null and v_ticket.trip_id <> p_trip_id then
    return jsonb_build_object(
      'success',         false,
      'error_code',      'WRONG_TRIP',
      'message',         'Ticket is booked for a different bus trip',
      'pnr',             v_ticket.pnr
    );
  end if;

  v_conductor_user_id := auth.uid();
  if v_conductor_user_id is null and p_trip_id is not null then
    select conductor_id into v_conductor_user_id from public.trips where id = p_trip_id;
  end if;

  update public.tickets
  set is_validated = true,
      validated_at = now(),
      validated_by = coalesce(auth.uid(), v_conductor_user_id),
      status       = 'VALIDATED',
      updated_at   = now()
  where id = v_ticket.id
  returning * into v_ticket;

  if p_trip_id is not null then
    insert into public.trip_occupancy (trip_id, current_passenger_count, capacity)
    select p_trip_id, v_ticket.passenger_count, coalesce(b.capacity, 50)
    from public.trips t
    left join public.buses b on b.id = t.bus_id
    where t.id = p_trip_id
    on conflict (trip_id) do update
      set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;
  end if;

  select name into v_from_name from public.stops where id = v_ticket.origin_stop_id;
  select name into v_to_name   from public.stops where id = v_ticket.dest_stop_id;

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

create or replace function public.validate_ticket_by_pnr(
  p_trip_id uuid,
  p_pnr     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.validate_ticket_by_pnr(p_pnr, p_trip_id);
end;
$$;

grant execute on function public.validate_ticket_by_pnr(text, uuid) to authenticated, anon;
grant execute on function public.validate_ticket_by_pnr(uuid, text) to authenticated, anon;

-- 12. Hardened rate_trip & trip_ratings permissions (allows passenger reviews)
create or replace function public.rate_trip(
  p_ticket_id uuid,
  p_rating    int,
  p_comment   text default null
)
returns public.trip_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket  public.tickets;
  v_row     public.trip_ratings;
  v_session uuid;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING: must be between 1 and 5';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND: ticket does not exist';
  end if;

  if v_ticket.status not in ('EXPIRED', 'VALIDATED') then
    raise exception 'TICKET_NOT_ELIGIBLE: can only rate expired or validated tickets';
  end if;

  v_session := coalesce(auth.uid(), v_ticket.passenger_session_id, extensions.gen_random_uuid());

  insert into public.trip_ratings (
    ticket_id, trip_id, passenger_session_id, rating, comment
  ) values (
    p_ticket_id, v_ticket.trip_id, v_session, p_rating, p_comment
  )
  on conflict (passenger_session_id, trip_id)
    do update set rating = p_rating, comment = p_comment, ticket_id = p_ticket_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.rate_trip(uuid, int, text) to authenticated, anon;

-- Public read on trip_ratings so passengers can inspect their submitted review
alter table public.trip_ratings enable row level security;
drop policy if exists trip_ratings_public_read on public.trip_ratings;
create policy trip_ratings_public_read on public.trip_ratings for select using (true);
grant select on public.trip_ratings to anon, authenticated;

-- 13. Grants for RLS helper functions (prevents 42501 permission denied)
grant execute on function public.my_district_id() to authenticated, anon;
grant execute on function public.is_district_admin() to authenticated, anon;
grant execute on function public.is_master_admin() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_conductor() to authenticated, anon;

-- 15. Ensure alert_severity enum contains HIGH as well to prevent casting errors
alter type public.alert_severity add value if not exists 'HIGH';

-- 16. Route demand analytics computation
create or replace function public.compute_route_demand_analytics(
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
    from public.routes r
    left join public.trips t on t.route_id = r.id and t.created_at::date = coalesce(p_target_date, current_date)
    left join buses b on b.id = t.bus_id
    left join public.tickets tk on tk.trip_id = t.id and tk.status in ('PAID', 'VALIDATED')
    where (p_route_id is null or r.id = p_route_id)
    group by r.id, r.route_number, r.name
  ),
  origin_ranks as (
    select
      r.id as r_id,
      s.name as stop_name,
      sum(tk.passenger_count) as pax_count,
      row_number() over (partition by r.id order by sum(tk.passenger_count) desc) as rn
    from public.routes r
    join public.trips t on t.route_id = r.id and t.created_at::date = coalesce(p_target_date, current_date)
    join public.tickets tk on tk.trip_id = t.id and tk.status in ('PAID', 'VALIDATED')
    join public.stops s on s.id = tk.origin_stop_id
    group by r.id, s.name
  ),
  dest_ranks as (
    select
      r.id as r_id,
      s.name as stop_name,
      sum(tk.passenger_count) as pax_count,
      row_number() over (partition by r.id order by sum(tk.passenger_count) desc) as rn
    from public.routes r
    join public.trips t on t.route_id = r.id and t.created_at::date = coalesce(p_target_date, current_date)
    join public.tickets tk on tk.trip_id = t.id and tk.status in ('PAID', 'VALIDATED')
    join public.stops s on s.id = tk.dest_stop_id
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

-- 0-argument overload so calling supabase.rpc("compute_route_demand_analytics") works without body
create or replace function public.compute_route_demand_analytics()
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
  return query select * from public.compute_route_demand_analytics(null, current_date);
end;
$$;

grant execute on function public.compute_route_demand_analytics(uuid, date) to authenticated, anon;
grant execute on function public.compute_route_demand_analytics() to authenticated, anon;

-- 18. Automated Continuous GPS Stop Tracking (Arrival & Departure Progression)
create or replace function public.auto_advance_trip_on_gps()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_trip_status       text;
  v_curr_stop         record;
  v_dist_meters       numeric;
begin
  if new.trip_id is null or new.latitude is null or new.longitude is null then
    return new;
  end if;

  select status into v_trip_status from public.trips where id = new.trip_id;
  if v_trip_status <> 'ACTIVE' then
    return new;
  end if;

  -- Find the current stop or first upcoming/arrived stop
  select ts.id as trip_stop_id, ts.stop_id, ts.sequence_order, ts.status,
         st_y(s.location::geometry) as lat,
         st_x(s.location::geometry) as lon
  into v_curr_stop
  from public.trip_stops ts
  join public.stops s on s.id = ts.stop_id
  where ts.trip_id = new.trip_id
    and ts.status in ('UPCOMING', 'ARRIVED')
  order by ts.sequence_order asc
  limit 1;

  if not found then
    return new;
  end if;

  -- Calculate distance in meters using Haversine formula
  v_dist_meters := 6371000 * 2 * asin(sqrt(
    power(sin(radians(new.latitude - v_curr_stop.lat) / 2), 2) +
    cos(radians(v_curr_stop.lat)) * cos(radians(new.latitude)) *
    power(sin(radians(new.longitude - v_curr_stop.lon) / 2), 2)
  ));

  -- 1. If within 150m and status is UPCOMING, mark stop as ARRIVED
  if v_dist_meters <= 150 and v_curr_stop.status = 'UPCOMING' then
    update public.trip_stops
    set status = 'ARRIVED',
        arrival_time = coalesce(arrival_time, now())
    where id = v_curr_stop.trip_stop_id;

    update public.trips
    set current_stop_id = v_curr_stop.stop_id,
        updated_at = now()
    where id = new.trip_id;

  -- 2. If stop was already ARRIVED and bus has moved away (> 200m), auto-depart
  elsif v_dist_meters > 200 and v_curr_stop.status = 'ARRIVED' then
    perform public.depart_stop_and_expire_tickets(new.trip_id, v_curr_stop.stop_id);
  end if;

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists trg_auto_advance_trip_on_gps on public.gps_logs;
create trigger trg_auto_advance_trip_on_gps
  after insert on public.gps_logs
  for each row execute function public.auto_advance_trip_on_gps();

-- 19. Reload PostgREST schema cache
notify pgrst, 'reload schema';



