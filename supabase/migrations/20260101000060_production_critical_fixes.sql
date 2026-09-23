-- =============================================================================
-- 060: PRODUCTION CRITICAL FIXES — Security, RLS, Data Integrity, Performance
-- =============================================================================
-- Covers:
--   PHASE 1 — GRANT/REVOKE: Strip anon access from admin/conductor-only RPCs
--   PHASE 2 — RLS HARDENING: Fix overly-permissive or missing policies
--   PHASE 3 — DATA INTEGRITY: Missing indexes, constraints, FK gaps
--   PHASE 4 — RPC AUTH GUARDS: Add caller-ownership checks to vulnerable RPCs
--   PHASE 5 — IDEMPOTENCY ENFORCEMENT: Ticket duplicate prevention
--   PHASE 6 — SEARCH-PATH HARDENING: Protect remaining SECURITY INVOKER fn
--   PHASE 7 — REALTIME SAFETY: Remove sensitive tables from publication
-- =============================================================================

-- PHASE 1 — REVOKE anon EXECUTE FROM ADMIN/CONDUCTOR-ONLY RPCs
revoke execute on function public.admin_advance_trip_stop(uuid, uuid) from anon;
revoke execute on function public.delete_admin_user(uuid) from anon;
revoke execute on function public.delete_conductor(uuid) from anon;
revoke execute on function public.delete_district(uuid) from anon;
revoke execute on function public.create_district_admin_user(text, text, text, uuid) from anon;
revoke execute on function public.get_revenue_analytics(uuid, text, text, text) from anon;
revoke execute on function public.compute_route_demand_analytics() from anon;
revoke execute on function public.compute_route_demand_analytics(uuid, date) from anon;
revoke execute on function public.evaluate_trip_schedule_adherence(uuid, double precision, double precision, double precision, timestamptz) from anon;
revoke execute on function public.evaluate_all_active_trips_adherence() from anon;
revoke execute on function public.get_conductor_stats(uuid, date) from anon;
revoke execute on function public.log_maintenance_entry(text, uuid, text, int, text) from anon;
revoke execute on function public.depart_stop_and_expire_tickets(uuid, uuid) from anon;
revoke execute on function public.validate_ticket(text, uuid) from anon;
revoke execute on function public.validate_ticket_by_pnr(text, uuid) from anon;
revoke execute on function public.validate_ticket_by_pnr(uuid, text) from anon;
revoke execute on function public.end_trip(uuid, text) from anon;
revoke execute on function public.audit_trip_revenue_leakage(uuid, int) from anon;
revoke execute on function public.update_district_admin_profile(uuid, text, uuid, boolean, text) from anon;

-- Re-grant only to authenticated
grant execute on function public.validate_ticket(text, uuid) to authenticated;
grant execute on function public.validate_ticket_by_pnr(text, uuid) to authenticated;
grant execute on function public.validate_ticket_by_pnr(uuid, text) to authenticated;
grant execute on function public.end_trip(uuid, text) to authenticated;
grant execute on function public.depart_stop_and_expire_tickets(uuid, uuid) to authenticated;
grant execute on function public.admin_advance_trip_stop(uuid, uuid) to authenticated;
grant execute on function public.delete_admin_user(uuid) to authenticated;
grant execute on function public.delete_conductor(uuid) to authenticated;
grant execute on function public.delete_district(uuid) to authenticated;
grant execute on function public.get_revenue_analytics(uuid, text, text, text) to authenticated;
grant execute on function public.compute_route_demand_analytics() to authenticated;
grant execute on function public.compute_route_demand_analytics(uuid, date) to authenticated;
grant execute on function public.evaluate_all_active_trips_adherence() to authenticated;
grant execute on function public.evaluate_trip_schedule_adherence(uuid, double precision, double precision, double precision, timestamptz) to authenticated;
grant execute on function public.get_conductor_stats(uuid, date) to authenticated;
grant execute on function public.log_maintenance_entry(text, uuid, text, int, text) to authenticated;
grant execute on function public.update_district_admin_profile(uuid, text, uuid, boolean, text) to authenticated;
grant execute on function public.audit_trip_revenue_leakage(uuid, int) to authenticated;

-- PHASE 2 — RLS HARDENING

-- 2a. app_secrets: Deny all direct client access
drop policy if exists app_secrets_admin_read on app_secrets;
drop policy if exists app_secrets_read on app_secrets;
drop policy if exists app_secrets_write on app_secrets;
create policy app_secrets_no_direct_access on app_secrets
  for all using (false) with check (false);

-- 2b. rate_limit_events: Deny all direct client access
drop policy if exists rate_limit_events_admin on rate_limit_events;
drop policy if exists rate_limit_read on rate_limit_events;
create policy rate_limit_events_deny_direct on rate_limit_events
  for all using (false) with check (false);

-- 2c. cleanup_runs: Admin read only
drop policy if exists cleanup_runs_admin on cleanup_runs;
drop policy if exists cleanup_runs_read on cleanup_runs;
create policy cleanup_runs_admin_read on cleanup_runs
  for select using (is_any_admin());
create policy cleanup_runs_deny_write on cleanup_runs
  for all using (false) with check (false);

-- 2d. transport_authority_config: Master admin only writes
drop policy if exists tac_admin_write on transport_authority_config;
drop policy if exists tac_admin_update on transport_authority_config;
create policy tac_master_write on transport_authority_config
  for insert with check (is_master_admin());
create policy tac_master_update on transport_authority_config
  for update using (is_master_admin()) with check (is_master_admin());

-- 2e. gps_logs: Conductor insert, admin read, conductor self-read
drop policy if exists gps_logs_conductor_insert on gps_logs;
drop policy if exists gps_logs_admin_read on gps_logs;
drop policy if exists gps_logs_public_read on gps_logs;
create policy gps_logs_conductor_insert on gps_logs
  for insert with check (
    conductor_id = current_conductor_id()
    and (trip_id is null or is_conductor_for_trip(trip_id))
  );
create policy gps_logs_admin_read on gps_logs
  for select using (is_any_admin());
create policy gps_logs_conductor_self_read on gps_logs
  for select using (conductor_id = current_conductor_id());

-- 2f. trip_edits: Admin read only, deny writes
drop policy if exists trip_edits_admin on trip_edits;
drop policy if exists trip_edits_read on trip_edits;
create policy trip_edits_admin_read on trip_edits
  for select using (is_any_admin());
create policy trip_edits_deny_write on trip_edits
  for all using (false) with check (false);

-- 2g. razorpay_orders: Passenger-scoped read, no direct writes
drop policy if exists razorpay_orders_passenger_read on razorpay_orders;
drop policy if exists razorpay_orders_admin_read on razorpay_orders;
drop policy if exists razorpay_orders_write on razorpay_orders;
create policy razorpay_orders_passenger_read on razorpay_orders
  for select using (passenger_id = auth.uid());
create policy razorpay_orders_admin_read on razorpay_orders
  for select using (is_any_admin());
create policy razorpay_orders_deny_write on razorpay_orders
  for all using (false) with check (false);

-- 2h. alerts_archive / tickets_archive: Admin read only
drop policy if exists alerts_archive_admin on alerts_archive;
drop policy if exists tickets_archive_admin on tickets_archive;
create policy alerts_archive_admin_read on alerts_archive
  for select using (is_any_admin());
create policy tickets_archive_admin_read on tickets_archive
  for select using (is_any_admin());
create policy alerts_archive_deny_write on alerts_archive
  for all using (false) with check (false);
create policy tickets_archive_deny_write on tickets_archive
  for all using (false) with check (false);

-- 2i. trip_seat_segments: Admin read only, deny writes
drop policy if exists trip_seat_segments_admin on trip_seat_segments;
drop policy if exists trip_seat_segments_public on trip_seat_segments;
drop policy if exists trip_seat_segments_read on trip_seat_segments;
create policy trip_seat_segments_admin_read on trip_seat_segments
  for select using (is_any_admin());
create policy trip_seat_segments_deny_write on trip_seat_segments
  for all using (false) with check (false);

-- PHASE 3 — DATA INTEGRITY: Missing indexes and constraints

create unique index if not exists uq_tickets_idempotency_key
  on tickets (idempotency_key) where idempotency_key is not null;

create unique index if not exists uq_tickets_pnr
  on tickets (pnr) where pnr is not null;

create unique index if not exists uq_active_trip_per_bus_per_date
  on trips (bus_id, service_date) where status in ('SCHEDULED', 'ACTIVE');

create unique index if not exists uq_active_trip_per_conductor
  on trips (conductor_id, service_date)
  where status in ('SCHEDULED', 'ACTIVE') and conductor_id is not null;

create unique index if not exists uq_active_etm_assignment
  on etm_assignments (etm_device_id) where unassigned_at is null;

create unique index if not exists uq_route_day_stops_seq
  on route_day_stops (route_id, day_of_week, sequence_order);

create index if not exists idx_tickets_trip_status
  on tickets (trip_id, status);

create index if not exists idx_tickets_session_status
  on tickets (passenger_session_id, status);

create index if not exists idx_alerts_trip_status
  on alerts (trip_id, status) where trip_id is not null;

create index if not exists idx_razorpay_orders_passenger_status
  on razorpay_orders (passenger_id, status) where passenger_id is not null;

create index if not exists idx_complaints_trip
  on complaints (trip_id) where trip_id is not null;

create index if not exists idx_trip_ratings_ticket
  on trip_ratings (ticket_id);

create unique index if not exists uq_razorpay_payment_ticket
  on razorpay_orders (razorpay_payment_id) where razorpay_payment_id is not null;

-- PHASE 4 — RPC AUTH GUARDS

create or replace function public.transfer_missed_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ticket      tickets;
  v_curr_trip   trips;
  v_next_trip   trips;
  v_next_bus    buses;
  v_new_sig     text;
  v_hmac_key    text;
  v_old_trip_id uuid;
  v_caller_id   uuid;
begin
  v_caller_id := auth.uid();
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND: Specified ticket does not exist';
  end if;
  if not is_any_admin() then
    if v_ticket.passenger_session_id::text <> coalesce(v_caller_id::text, '') then
      raise exception 'NOT_AUTHORIZED: You do not own this ticket';
    end if;
  end if;
  if v_ticket.status = 'VALIDATED' then
    raise exception 'ALREADY_VALIDATED: Boarded tickets cannot be transferred';
  end if;
  if v_ticket.status not in ('PAID', 'CREATED') then
    raise exception 'INVALID_TICKET_STATUS: Only active unboarded tickets can be transferred';
  end if;
  if coalesce(v_ticket.transfer_count, 0) >= 1 then
    raise exception 'MAX_TRANSFERS_EXCEEDED: This ticket has already been transferred';
  end if;
  select * into v_curr_trip from trips where id = v_ticket.trip_id;
  if v_curr_trip is null then
    raise exception 'TRIP_NOT_FOUND: Current trip not found';
  end if;
  select t.* into v_next_trip
  from trips t
  where t.route_id = v_curr_trip.route_id
    and t.id <> v_curr_trip.id
    and t.status in ('SCHEDULED', 'ACTIVE')
  order by case when t.status = 'ACTIVE' then 0 else 1 end,
           t.scheduled_departure asc
  limit 1;
  if v_next_trip is null then
    raise exception 'NO_NEXT_TRIP: No alternative buses scheduled on this route';
  end if;
  select * into v_next_bus from buses where id = v_next_trip.bus_id;
  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  if v_hmac_key is null or length(v_hmac_key) = 0 then
    raise exception 'SYSTEM_ERROR: QR HMAC key not configured';
  end if;
  v_new_sig := encode(
    extensions.hmac(v_ticket.qr_payload || '|' || v_next_trip.id::text, v_hmac_key, 'sha256'),
    'hex'
  );
  v_old_trip_id := v_ticket.trip_id;
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
    'ticket_id',      v_ticket.id,
    'pnr',            v_ticket.pnr,
    'old_trip_id',    v_old_trip_id,
    'new_trip_id',    v_next_trip.id,
    'new_bus_id',     v_next_trip.bus_id,
    'new_bus_number', v_next_bus.bus_number,
    'route_id',       v_curr_trip.route_id,
    'transfer_count', v_ticket.transfer_count,
    'transferred_at', v_ticket.transferred_at
  );
end;
$fn$;

revoke all on function public.transfer_missed_ticket(uuid) from public, anon;
grant execute on function public.transfer_missed_ticket(uuid) to authenticated;

create or replace function public.get_conductor_stats(
  p_conductor_id uuid default null,
  p_target_date  date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conductor_id  uuid;
  v_trips_count   int := 0;
  v_tickets_count int := 0;
  v_revenue       numeric(14,2) := 0;
  v_avg_rating    numeric(3,2);
begin
  if is_any_admin() then
    v_conductor_id := coalesce(p_conductor_id, current_conductor_id());
  elsif is_conductor() then
    v_conductor_id := current_conductor_id();
    if p_conductor_id is not null and p_conductor_id <> v_conductor_id then
      raise exception 'FORBIDDEN: Conductors can only view their own statistics';
    end if;
  else
    raise exception 'FORBIDDEN: Only conductors and administrators can access conductor stats';
  end if;
  if v_conductor_id is null then
    raise exception 'CONDUCTOR_NOT_FOUND: No conductor profile linked to this account';
  end if;
  select count(*) into v_trips_count
  from trips
  where conductor_id = v_conductor_id
    and service_date = p_target_date
    and status in ('ACTIVE', 'COMPLETED');
  select coalesce(count(tk.id), 0), coalesce(sum(tk.total_fare), 0)
  into v_tickets_count, v_revenue
  from tickets tk
  join trips tr on tr.id = tk.trip_id
  where tr.conductor_id = v_conductor_id
    and tr.service_date = p_target_date
    and tk.status in ('PAID', 'VALIDATED', 'EXPIRED');
  select avg(r.rating) into v_avg_rating
  from trip_ratings r
  join trips tr on tr.id = r.trip_id
  where tr.conductor_id = v_conductor_id
    and tr.service_date = p_target_date;
  return jsonb_build_object(
    'conductor_id',  v_conductor_id,
    'target_date',   p_target_date,
    'trips_count',   v_trips_count,
    'tickets_count', v_tickets_count,
    'total_revenue', v_revenue,
    'avg_rating',    v_avg_rating
  );
end;
$fn$;

revoke all on function public.get_conductor_stats(uuid, date) from public, anon;
grant execute on function public.get_conductor_stats(uuid, date) to authenticated;

-- PHASE 5 — SEARCH-PATH HARDENING
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;
grant usage on schema public to anon, authenticated;

-- PHASE 6 — REALTIME SAFETY
alter publication supabase_realtime drop table if exists razorpay_orders;

-- PHASE 7 — COLUMN CHECK CONSTRAINTS

-- Normalize buses.status before adding constraint
update public.buses
set status = 'ACTIVE'
where status is null or status not in ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED');

alter table public.buses
  add constraint chk_buses_status
    check (status in ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'))
    not valid;
alter table public.buses validate constraint chk_buses_status;

-- Normalize trips.schedule_adherence before adding constraint
update public.trips
set schedule_adherence = 'ON_TIME'
where schedule_adherence is null
   or schedule_adherence not in ('ON_TIME', 'EARLY', 'LATE', 'VERY_LATE');

alter table public.trips
  add constraint chk_trips_schedule_adherence
    check (schedule_adherence in ('ON_TIME', 'EARLY', 'LATE', 'VERY_LATE'))
    not valid;
alter table public.trips validate constraint chk_trips_schedule_adherence;

-- Normalize trip_stops.adherence_status
update public.trip_stops
set adherence_status = 'ON_TIME'
where adherence_status is null
   or adherence_status not in ('ON_TIME', 'EARLY', 'LATE', 'VERY_LATE');

alter table public.trip_stops
  add constraint chk_trip_stops_adherence_status
    check (adherence_status in ('ON_TIME', 'EARLY', 'LATE', 'VERY_LATE'))
    not valid;
alter table public.trip_stops validate constraint chk_trip_stops_adherence_status;

-- PHASE 8 — PROFILE STATUS GUARD (Suspended users cannot call RPCs)
create or replace function public.is_conductor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'conductor'
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'master_admin')
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  );
$$;

create or replace function public.is_master_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'master_admin'
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  );
$$;

create or replace function public.is_district_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
    and district_id is not null
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  );
$$;

create or replace function public.is_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or is_master_admin();
$$;

-- PHASE 9 — TABLE GRANTS FOR POSTGREST
grant select on public.stops                      to authenticated, anon;
grant select on public.routes                     to authenticated, anon;
grant select on public.route_stops                to authenticated, anon;
grant select on public.fare_matrix                to authenticated, anon;
grant select on public.buses                      to authenticated, anon;
grant select on public.trips                      to authenticated, anon;
grant select on public.trip_stops                 to authenticated, anon;
grant select on public.trip_occupancy             to authenticated, anon;
grant select on public.schedules                  to authenticated, anon;
grant select on public.districts                  to authenticated, anon;
grant select on public.route_weekly_schedules     to authenticated, anon;
grant select on public.route_day_stops            to authenticated, anon;
grant select on public.system_feature_flags       to authenticated, anon;
grant select on public.transport_authority_config to authenticated, anon;
grant select on public.tickets                    to authenticated;
grant select on public.alerts                     to authenticated;
grant select on public.alert_messages             to authenticated;
grant select on public.conductors                 to authenticated;
grant select on public.profiles                   to authenticated;
grant select on public.complaints                 to authenticated;
grant select on public.etm_devices                to authenticated;
grant select on public.etm_assignments            to authenticated;
grant select on public.trip_ratings               to authenticated;
grant select on public.trip_edits                 to authenticated;
grant select on public.bus_maintenance_logs       to authenticated;
grant select on public.etm_maintenance_logs       to authenticated;
grant select on public.passenger_emergency_chats  to authenticated;
grant select on public.passenger_emergency_messages to authenticated;
grant select on public.gps_logs                   to authenticated;
grant select on public.razorpay_orders            to authenticated;
grant select on public.cleanup_runs               to authenticated;
grant select on public.tickets_archive            to authenticated;
grant select on public.alerts_archive             to authenticated;
grant select on public.trip_seat_segments         to authenticated;
revoke all on public.app_secrets       from public, anon, authenticated;
revoke all on public.rate_limit_events from public, anon, authenticated;

-- =============================================================================
-- END OF MIGRATION 060
-- =============================================================================
