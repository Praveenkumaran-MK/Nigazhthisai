-- =============================================================================
-- 029: Production RPCs for 13-Feature Expansion
--   • assign_etm & unassign_etm
--   • edit_trip (with audit logging in trip_edits)
--   • update_conductor_profile & update_district_admin_profile
--   • get_conductor_stats (tickets, revenue, trips for dashboard)
--   • get_revenue_analytics (breakdown by day/bus/route/payment/concession)
--   • validate_ticket_by_pnr (manual fallback for scanner)
--   • generate_passenger_cash_ticket (on-board ticket issuance by conductor)
--   • log_maintenance_entry (bus and ETM maintenance tracking)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ETM ASSIGNMENT RPCs
-- -----------------------------------------------------------------------------
create or replace function assign_etm(
  p_etm_device_id  uuid,
  p_conductor_id   uuid default null,
  p_bus_id         uuid default null,
  p_trip_id        uuid default null,
  p_notes          text default null
)
returns etm_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id     uuid;
  v_district_id  uuid;
  v_assignment   etm_assignments;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can assign ETM devices';
  end if;

  v_admin_id := auth.uid();

  -- Resolve district_id from ETM or Admin
  select district_id into v_district_id
  from etm_devices
  where id = p_etm_device_id;

  if not found then
    raise exception 'NOT_FOUND: ETM device % does not exist', p_etm_device_id;
  end if;

  if is_district_admin() and v_district_id is not null and v_district_id <> my_district_id() then
    raise exception 'FORBIDDEN: cannot assign ETM from another district';
  end if;

  -- 1. Close any existing active assignment for this ETM device
  update etm_assignments
  set unassigned_at = now(),
      unassigned_by = v_admin_id,
      notes = coalesce(notes || ' | Reassigned', 'Auto-closed for reassignment')
  where etm_device_id = p_etm_device_id
    and unassigned_at is null;

  -- 2. If assigning to conductor or bus, close any other active device assignments for them
  if p_conductor_id is not null then
    update etm_assignments
    set unassigned_at = now(),
        unassigned_by = v_admin_id
    where conductor_id = p_conductor_id
      and unassigned_at is null;
  end if;

  if p_bus_id is not null then
    update etm_assignments
    set unassigned_at = now(),
        unassigned_by = v_admin_id
    where bus_id = p_bus_id
      and unassigned_at is null;
  end if;

  -- 3. Create the new assignment record
  insert into etm_assignments (
    etm_device_id,
    conductor_id,
    bus_id,
    trip_id,
    district_id,
    assigned_by,
    assigned_at,
    notes
  ) values (
    p_etm_device_id,
    p_conductor_id,
    p_bus_id,
    p_trip_id,
    coalesce(v_district_id, my_district_id()),
    v_admin_id,
    now(),
    p_notes
  )
  returning * into v_assignment;

  -- 4. Sync current state back to etm_devices
  update etm_devices
  set assigned_conductor_id = p_conductor_id,
      assigned_bus_id       = p_bus_id,
      last_synced_at        = now(),
      status                = 'ACTIVE'
  where id = p_etm_device_id;

  -- 5. If trip is specified, update trip
  if p_trip_id is not null then
    update trips
    set etm_device_id = p_etm_device_id
    where id = p_trip_id;
  end if;

  return v_assignment;
end;
$$;

create or replace function unassign_etm(
  p_etm_device_id  uuid,
  p_notes          text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can unassign ETM devices';
  end if;

  v_admin_id := auth.uid();

  -- Close active assignment
  update etm_assignments
  set unassigned_at = now(),
      unassigned_by = v_admin_id,
      notes = case when p_notes is not null then coalesce(notes || ' | ' || p_notes, p_notes) else notes end
  where etm_device_id = p_etm_device_id
    and unassigned_at is null;

  -- Clear device fields
  update etm_devices
  set assigned_conductor_id = null,
      assigned_bus_id       = null,
      last_synced_at        = now()
  where id = p_etm_device_id;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. TRIP EDITING RPC (with audit log in trip_edits)
-- -----------------------------------------------------------------------------
create or replace function edit_trip(
  p_trip_id              uuid,
  p_route_id             uuid        default null,
  p_bus_id               uuid        default null,
  p_conductor_id         uuid        default null,
  p_scheduled_departure  timestamptz default null,
  p_scheduled_arrival    timestamptz default null,
  p_reason               text        default null
)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip       trips;
  v_admin_id   uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can edit trips';
  end if;

  v_admin_id := auth.uid();

  select * into v_trip
  from trips
  where id = p_trip_id;

  if not found then
    raise exception 'NOT_FOUND: Trip % not found', p_trip_id;
  end if;

  -- Only editable if not in progress or completed
  if v_trip.status not in ('SCHEDULED', 'PLANNED') then
    raise exception 'INVALID_STATE: Trip is currently in % status and cannot be edited', v_trip.status;
  end if;

  -- District authorization check
  if is_district_admin() and v_trip.district_id is not null and v_trip.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: cannot edit trip from another district';
  end if;

  -- Audit log each changed field
  if p_route_id is not null and p_route_id is distinct from v_trip.route_id then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'route_id', v_trip.route_id::text, p_route_id::text, p_reason);
  end if;

  if p_bus_id is not null and p_bus_id is distinct from v_trip.bus_id then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'bus_id', v_trip.bus_id::text, p_bus_id::text, p_reason);
  end if;

  if p_conductor_id is not null and p_conductor_id is distinct from v_trip.conductor_id then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'conductor_id', v_trip.conductor_id::text, p_conductor_id::text, p_reason);
  end if;

  if p_scheduled_departure is not null and p_scheduled_departure is distinct from v_trip.scheduled_departure then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'scheduled_departure', v_trip.scheduled_departure::text, p_scheduled_departure::text, p_reason);
  end if;

  if p_scheduled_arrival is not null and p_scheduled_arrival is distinct from v_trip.scheduled_arrival then
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, v_admin_id, 'scheduled_arrival', v_trip.scheduled_arrival::text, p_scheduled_arrival::text, p_reason);
  end if;

  -- Apply updates to trips table
  update trips
  set route_id            = coalesce(p_route_id, route_id),
      bus_id              = coalesce(p_bus_id, bus_id),
      conductor_id        = coalesce(p_conductor_id, conductor_id),
      scheduled_departure = coalesce(p_scheduled_departure, scheduled_departure),
      scheduled_arrival   = coalesce(p_scheduled_arrival, scheduled_arrival),
      last_edited_at      = now(),
      last_edited_by      = v_admin_id
  where id = p_trip_id
  returning * into v_trip;

  return v_trip;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. CONDUCTOR & ADMIN PROFILE UPDATE RPCs
-- -----------------------------------------------------------------------------
create or replace function update_conductor_profile(
  p_conductor_id   uuid,
  p_display_name   text,
  p_phone_number   text,
  p_government_id  text,
  p_is_active      boolean default true
)
returns conductors
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conductor conductors;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can edit conductor profiles';
  end if;

  select * into v_conductor
  from conductors
  where id = p_conductor_id;

  if not found then
    raise exception 'NOT_FOUND: Conductor % not found', p_conductor_id;
  end if;

  if is_district_admin() and v_conductor.district_id is not null and v_conductor.district_id <> my_district_id() then
    raise exception 'FORBIDDEN: cannot edit conductor belonging to another district';
  end if;

  update conductors
  set display_name   = coalesce(nullif(trim(p_display_name), ''), display_name),
      phone_number   = coalesce(nullif(trim(p_phone_number), ''), phone_number),
      government_id  = coalesce(nullif(trim(p_government_id), ''), government_id),
      is_active      = coalesce(p_is_active, is_active),
      updated_at     = now()
  where id = p_conductor_id
  returning * into v_conductor;

  return v_conductor;
end;
$$;

create or replace function update_district_admin_profile(
  p_user_id      uuid,
  p_display_name text,
  p_district_id  uuid,
  p_is_active    boolean default true
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin profiles;
begin
  if not is_master_admin() then
    raise exception 'FORBIDDEN: only master administrators can edit admin user roles';
  end if;

  update profiles
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      full_name    = coalesce(nullif(trim(p_display_name), ''), full_name),
      district_id  = p_district_id,
      status       = case when p_is_active = false then 'INACTIVE' else 'ACTIVE' end,
      updated_at   = now()
  where id = p_user_id
  returning * into v_admin;

  if not found then
    raise exception 'NOT_FOUND: Profile % not found', p_user_id;
  end if;

  return v_admin;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. CONDUCTOR STATS RPC (for live dashboard)
-- -----------------------------------------------------------------------------
create or replace function get_conductor_stats(
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
begin
  -- If called by conductor, enforce self-lookup
  if current_conductor_id() is not null then
    v_effective_conductor_id := current_conductor_id();
  elsif is_any_admin() then
    v_effective_conductor_id := p_conductor_id;
  else
    raise exception 'UNAUTHORIZED: must be conductor or admin to view conductor stats';
  end if;

  if v_effective_conductor_id is null then
    raise exception 'PARAM_REQUIRED: conductor_id is required';
  end if;

  -- 1. Trips count on target date
  select count(*) into v_trips_count
  from trips
  where conductor_id = v_effective_conductor_id
    and scheduled_departure::date = p_target_date;

  -- 2. Active trip
  select t.id, t.status, t.bus_id, b.bus_number, r.route_code, r.origin, r.destination,
         t.actual_departure, t.current_stop_index
  into v_active_trip
  from trips t
  left join buses b on b.id = t.bus_id
  left join routes r on r.id = t.route_id
  where t.conductor_id = v_effective_conductor_id
    and t.status = 'IN_PROGRESS'
  order by t.actual_departure desc
  limit 1;

  -- 3. Tickets & Revenue aggregated for conductor trips on target date
  select
    coalesce(count(tk.id), 0),
    coalesce(sum(case when tk.payment_method = 'CASH' or tk.channel = 'ETM' then tk.fare else 0 end), 0.00),
    coalesce(sum(case when tk.payment_method <> 'CASH' and tk.channel <> 'ETM' then tk.fare else 0 end), 0.00),
    coalesce(sum(tk.passenger_count), 0)
  into v_tickets_count, v_cash_revenue, v_digital_revenue, v_total_passengers
  from tickets tk
  join trips tr on tr.id = tk.trip_id
  where tr.conductor_id = v_effective_conductor_id
    and (tk.created_at::date = p_target_date or tr.scheduled_departure::date = p_target_date)
    and tk.status in ('PAID', 'VALIDATED', 'EXPIRED');

  return jsonb_build_object(
    'conductor_id', v_effective_conductor_id,
    'date', p_target_date,
    'trips_count', v_trips_count,
    'active_trip', case when v_active_trip.id is not null then jsonb_build_object(
      'id', v_active_trip.id,
      'status', v_active_trip.status,
      'bus_id', v_active_trip.bus_id,
      'bus_number', v_active_trip.bus_number,
      'route_code', v_active_trip.route_code,
      'origin', v_active_trip.origin,
      'destination', v_active_trip.destination,
      'actual_departure', v_active_trip.actual_departure,
      'current_stop_index', v_active_trip.current_stop_index
    ) else null end,
    'tickets_issued', v_tickets_count,
    'cash_revenue', v_cash_revenue,
    'digital_revenue', v_digital_revenue,
    'total_revenue', v_cash_revenue + v_digital_revenue,
    'passengers_carried', v_total_passengers
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. REVENUE ANALYTICS RPC
-- -----------------------------------------------------------------------------
create or replace function get_revenue_analytics(
  p_district_id  uuid default null,
  p_start_date   date default (current_date - interval '30 days')::date,
  p_end_date     date default current_date,
  p_group_by     text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_district_id uuid;
  v_total_revenue         numeric(14, 2) := 0.00;
  v_total_tickets         int := 0;
  v_breakdown             jsonb;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can access revenue analytics';
  end if;

  if is_district_admin() then
    v_effective_district_id := my_district_id();
  else
    v_effective_district_id := p_district_id;
  end if;

  -- 1. Grand totals
  select
    coalesce(sum(tk.fare), 0.00),
    coalesce(count(tk.id), 0)
  into v_total_revenue, v_total_tickets
  from tickets tk
  where tk.created_at::date between p_start_date and p_end_date
    and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
    and (v_effective_district_id is null or tk.district_id = v_effective_district_id);

  -- 2. Breakdown by dimension
  if p_group_by = 'day' then
    select coalesce(jsonb_agg(d order by d->>'group_key' asc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', tk.created_at::date::text,
        'label', to_char(tk.created_at::date, 'YYYY-MM-DD'),
        'total_revenue', coalesce(sum(tk.fare), 0.00),
        'tickets_count', count(tk.id),
        'cash_revenue', coalesce(sum(case when tk.payment_method = 'CASH' or tk.channel = 'ETM' then tk.fare else 0 end), 0.00),
        'digital_revenue', coalesce(sum(case when tk.payment_method <> 'CASH' and tk.channel <> 'ETM' then tk.fare else 0 end), 0.00)
      ) as d
      from tickets tk
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by tk.created_at::date
    ) s;

  elsif p_group_by = 'bus' then
    select coalesce(jsonb_agg(d order by (d->>'total_revenue')::numeric desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', b.id::text,
        'label', coalesce(b.bus_number, 'Unknown Bus'),
        'bus_number', b.bus_number,
        'bus_type', b.bus_type,
        'total_revenue', coalesce(sum(tk.fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      join trips tr on tr.id = tk.trip_id
      left join buses b on b.id = tr.bus_id
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by b.id, b.bus_number, b.bus_type
    ) s;

  elsif p_group_by = 'route' then
    select coalesce(jsonb_agg(d order by (d->>'total_revenue')::numeric desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', r.id::text,
        'label', coalesce(r.route_code || ' (' || r.origin || ' → ' || r.destination || ')', 'Unknown Route'),
        'route_code', r.route_code,
        'origin', r.origin,
        'destination', r.destination,
        'total_revenue', coalesce(sum(tk.fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      left join routes r on r.id = tk.route_id
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by r.id, r.route_code, r.origin, r.destination
    ) s;

  elsif p_group_by = 'concession' then
    select coalesce(jsonb_agg(d order by (d->>'tickets_count')::int desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', coalesce(tk.concession_type, 'NONE'),
        'label', coalesce(tk.concession_type, 'NONE'),
        'total_revenue', coalesce(sum(tk.fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by coalesce(tk.concession_type, 'NONE')
    ) s;

  else -- default / payment_method
    select coalesce(jsonb_agg(d order by (d->>'total_revenue')::numeric desc), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'group_key', coalesce(tk.payment_method, 'UNKNOWN'),
        'label', coalesce(tk.payment_method, 'UNKNOWN'),
        'total_revenue', coalesce(sum(tk.fare), 0.00),
        'tickets_count', count(tk.id)
      ) as d
      from tickets tk
      where tk.created_at::date between p_start_date and p_end_date
        and tk.status in ('PAID', 'VALIDATED', 'EXPIRED')
        and (v_effective_district_id is null or tk.district_id = v_effective_district_id)
      group by coalesce(tk.payment_method, 'UNKNOWN')
    ) s;
  end if;

  return jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'group_by', p_group_by,
    'district_id', v_effective_district_id,
    'total_revenue', v_total_revenue,
    'total_tickets', v_total_tickets,
    'breakdown', coalesce(v_breakdown, '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. VALIDATE TICKET BY PNR (Manual fallback for conductor scanner)
-- -----------------------------------------------------------------------------
create or replace function validate_ticket_by_pnr(
  p_pnr     text,
  p_trip_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket       tickets;
  v_conductor_id uuid;
  v_normalized_pnr text;
  v_origin_stop  stops;
  v_dest_stop    stops;
begin
  if not is_conductor() and not is_any_admin() then
    raise exception 'FORBIDDEN: only conductors or admins can validate tickets';
  end if;

  v_conductor_id := current_conductor_id();
  v_normalized_pnr := upper(trim(p_pnr));

  -- Search ticket by PNR or Ticket UUID prefix
  select * into v_ticket
  from tickets
  where upper(pnr) = v_normalized_pnr
     or id::text ilike v_normalized_pnr || '%'
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'TICKET_NOT_FOUND',
      'message', 'No ticket matches the provided PNR code or ID'
    );
  end if;

  -- Guard: Trip check if specified
  if p_trip_id is not null and v_ticket.trip_id is distinct from p_trip_id then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'WRONG_TRIP',
      'message', 'Ticket is for a different trip',
      'ticket_id', v_ticket.id,
      'ticket_trip_id', v_ticket.trip_id
    );
  end if;

  -- Guard: Already validated check
  if v_ticket.status = 'VALIDATED' then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'ALREADY_VALIDATED',
      'message', 'Ticket has already been validated at ' || coalesce(to_char(v_ticket.validated_at, 'HH24:MI:SS'), 'earlier'),
      'ticket_id', v_ticket.id,
      'validated_at', v_ticket.validated_at
    );
  end if;

  if v_ticket.status = 'EXPIRED' then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'EXPIRED',
      'message', 'Ticket has expired',
      'ticket_id', v_ticket.id
    );
  end if;

  if v_ticket.status = 'CANCELLED' then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'CANCELLED',
      'message', 'Ticket was cancelled and is invalid',
      'ticket_id', v_ticket.id
    );
  end if;

  -- Mark as validated
  update tickets
  set status                    = 'VALIDATED',
      validated_at              = now(),
      validated_by_conductor_id = v_conductor_id
  where id = v_ticket.id
  returning * into v_ticket;

  -- Fetch stop details for rich response
  select * into v_origin_stop from stops where id = v_ticket.origin_stop_id;
  select * into v_dest_stop from stops where id = v_ticket.dest_stop_id;

  return jsonb_build_object(
    'valid', true,
    'ticket_id', v_ticket.id,
    'pnr', v_ticket.pnr,
    'status', v_ticket.status,
    'fare', v_ticket.fare,
    'passenger_count', v_ticket.passenger_count,
    'concession_type', coalesce(v_ticket.concession_type, 'NONE'),
    'origin_stop_name', coalesce(v_origin_stop.name, 'Origin'),
    'dest_stop_name', coalesce(v_dest_stop.name, 'Destination'),
    'validated_at', v_ticket.validated_at,
    'payment_method', v_ticket.payment_method
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. GENERATE PASSENGER CASH / ON-BOARD TICKET (Conductor issued)
-- -----------------------------------------------------------------------------
create or replace function generate_passenger_cash_ticket(
  p_trip_id         uuid,
  p_origin_stop_id  uuid,
  p_dest_stop_id    uuid,
  p_passenger_count int  default 1,
  p_concession_type text default 'NONE'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conductor_id  uuid;
  v_trip          trips;
  v_route_id      uuid;
  v_bus_id        uuid;
  v_district_id   uuid;
  v_fare_per_pax  numeric(10, 2);
  v_discount_pct  numeric(5, 2) := 0.00;
  v_total_fare    numeric(10, 2);
  v_pnr           text;
  v_ticket        tickets;
  v_config        transport_authority_config;
  v_hmac_key      text;
  v_qr_payload    text;
  v_qr_signature  text;
begin
  if not is_conductor() and not is_any_admin() then
    raise exception 'FORBIDDEN: only conductors or admins can issue cash tickets';
  end if;

  v_conductor_id := current_conductor_id();

  -- Get trip details
  select * into v_trip from trips where id = p_trip_id;
  if not found then
    raise exception 'NOT_FOUND: trip % not found', p_trip_id;
  end if;

  v_route_id    := v_trip.route_id;
  v_bus_id      := v_trip.bus_id;
  v_district_id := v_trip.district_id;

  -- Calculate fare from stop ordering
  select calculate_fare(v_route_id, p_origin_stop_id, p_dest_stop_id)
  into v_fare_per_pax;

  if v_fare_per_pax is null or v_fare_per_pax <= 0 then
    v_fare_per_pax := 20.00; -- fallback minimum fare
  end if;

  -- Apply concession discount
  case upper(p_concession_type)
    when 'STUDENT'         then v_discount_pct := 50.00;
    when 'SENIOR'          then v_discount_pct := 50.00;
    when 'MONTHLY_PASS'    then v_discount_pct := 75.00;
    when 'FREEDOM_FIGHTER' then v_discount_pct := 100.00;
    else                        v_discount_pct := 0.00;
  end case;

  v_total_fare := round((v_fare_per_pax * p_passenger_count) * (1.0 - v_discount_pct / 100.0), 2);

  -- Generate 8-char PNR
  v_pnr := 'ETM' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  -- Get HMAC key for signing
  select * into v_config from transport_authority_config limit 1;
  v_hmac_key := coalesce(v_config.qr_hmac_secret, 'default-dev-secret-key-change-in-prod');

  -- Insert ticket directly in VALIDATED status with CASH payment
  insert into tickets (
    trip_id,
    route_id,
    district_id,
    origin_stop_id,
    dest_stop_id,
    passenger_count,
    concession_type,
    fare,
    status,
    payment_method,
    channel,
    pnr,
    validated_at,
    validated_by_conductor_id,
    expires_at
  ) values (
    p_trip_id,
    v_route_id,
    v_district_id,
    p_origin_stop_id,
    p_dest_stop_id,
    p_passenger_count,
    p_concession_type,
    v_total_fare,
    'VALIDATED',
    'CASH',
    'ETM',
    v_pnr,
    now(),
    v_conductor_id,
    now() + interval '8 hours'
  )
  returning * into v_ticket;

  -- Generate signed QR payload
  v_qr_payload := jsonb_build_object(
    'tid',  v_ticket.id,
    'pnr',  v_ticket.pnr,
    'trp',  v_ticket.trip_id,
    'org',  v_ticket.origin_stop_id,
    'dst',  v_ticket.dest_stop_id,
    'pax',  v_ticket.passenger_count,
    'fre',  v_ticket.fare,
    'cnc',  v_ticket.concession_type,
    'exp',  extract(epoch from v_ticket.expires_at)::bigint,
    'iat',  extract(epoch from now())::bigint
  )::text;

  v_qr_signature := encode(
    hmac(v_qr_payload::bytea, v_hmac_key::bytea, 'sha256'),
    'hex'
  );

  update tickets
  set qr_payload   = v_qr_payload,
      qr_signature = v_qr_signature
  where id = v_ticket.id;

  -- Create payment record
  insert into payments (
    ticket_id,
    district_id,
    amount,
    currency,
    status,
    payment_method,
    paid_at
  ) values (
    v_ticket.id,
    v_district_id,
    v_total_fare,
    'INR',
    'SUCCESS',
    'CASH',
    now()
  );

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'pnr', v_ticket.pnr,
    'trip_id', v_ticket.trip_id,
    'fare', v_ticket.fare,
    'passenger_count', v_ticket.passenger_count,
    'concession_type', v_ticket.concession_type,
    'status', 'VALIDATED',
    'qr_payload', v_qr_payload,
    'qr_signature', v_qr_signature,
    'created_at', v_ticket.created_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. MAINTENANCE LOGGING RPC
-- -----------------------------------------------------------------------------
create or replace function log_maintenance_entry(
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
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can log maintenance events';
  end if;

  v_admin_id := auth.uid();

  if upper(p_resource_type) = 'BUS' then
    select district_id into v_district_id from buses where id = p_resource_id;
    if not found then
      raise exception 'NOT_FOUND: Bus % not found', p_resource_id;
    end if;

    if is_district_admin() and v_district_id is not null and v_district_id <> my_district_id() then
      raise exception 'FORBIDDEN: cannot log maintenance for bus in another district';
    end if;

    insert into bus_maintenance_logs (
      bus_id,
      district_id,
      status,
      notes,
      updated_by
    ) values (
      p_resource_id,
      coalesce(v_district_id, my_district_id()),
      upper(p_status),
      p_notes,
      v_admin_id
    )
    returning id into v_entry_id;

    -- Update bus status
    update buses
    set status     = case
                       when upper(p_status) in ('OPERATIONAL') then 'ACTIVE'
                       when upper(p_status) in ('UNDER_MAINTENANCE', 'OUT_OF_SERVICE') then 'MAINTENANCE'
                       when upper(p_status) = 'DECOMMISSIONED' then 'INACTIVE'
                       else status
                     end,
        updated_at = now()
    where id = p_resource_id;

  elsif upper(p_resource_type) = 'ETM' then
    select district_id into v_district_id from etm_devices where id = p_resource_id;
    if not found then
      raise exception 'NOT_FOUND: ETM device % not found', p_resource_id;
    end if;

    if is_district_admin() and v_district_id is not null and v_district_id <> my_district_id() then
      raise exception 'FORBIDDEN: cannot log maintenance for ETM in another district';
    end if;

    insert into etm_maintenance_logs (
      etm_device_id,
      district_id,
      status,
      battery_level,
      notes,
      updated_by
    ) values (
      p_resource_id,
      coalesce(v_district_id, my_district_id()),
      upper(p_status),
      p_battery_level,
      p_notes,
      v_admin_id
    )
    returning id into v_entry_id;

    -- Update ETM status
    update etm_devices
    set status        = upper(p_status),
        battery_level = coalesce(p_battery_level, battery_level),
        last_synced_at = now(),
        updated_at    = now()
    where id = p_resource_id;

  else
    raise exception 'INVALID_PARAM: resource_type must be BUS or ETM';
  end if;

  return v_entry_id;
end;
$$;
