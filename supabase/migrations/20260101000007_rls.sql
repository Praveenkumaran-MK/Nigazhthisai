-- =============================================================================
-- 007: Row Level Security — helper functions + policies for every table.
-- Passengers authenticate via Supabase ANONYMOUS auth (real auth.uid(), no
-- credentials shown). Conductors/Admins are full Supabase Auth users whose
-- role lives in `profiles.role`.
-- =============================================================================

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_conductor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'conductor'
  );
$$;

create or replace function current_conductor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from conductors where user_id = auth.uid();
$$;

-- True when the caller is the conductor assigned to the given trip.
create or replace function is_conductor_for_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from trips t
    join conductors c on c.id = t.conductor_id
    where t.id = p_trip_id and c.user_id = auth.uid()
  );
$$;

-- =============================================================================
-- stops / routes / route_stops / fare_matrix / buses — public read, admin write
-- =============================================================================
alter table stops enable row level security;
create policy stops_public_read on stops for select using (true);
create policy stops_admin_write on stops for insert with check (is_admin());
create policy stops_admin_update on stops for update using (is_admin()) with check (is_admin());
create policy stops_admin_delete on stops for delete using (is_admin());

alter table routes enable row level security;
create policy routes_public_read on routes for select using (true);
create policy routes_admin_write on routes for insert with check (is_admin());
create policy routes_admin_update on routes for update using (is_admin()) with check (is_admin());
create policy routes_admin_delete on routes for delete using (is_admin());

alter table route_stops enable row level security;
create policy route_stops_public_read on route_stops for select using (true);
create policy route_stops_admin_write on route_stops for insert with check (is_admin());
create policy route_stops_admin_update on route_stops for update using (is_admin()) with check (is_admin());
create policy route_stops_admin_delete on route_stops for delete using (is_admin());

alter table fare_matrix enable row level security;
create policy fare_matrix_public_read on fare_matrix for select using (true);
create policy fare_matrix_admin_write on fare_matrix for insert with check (is_admin());
create policy fare_matrix_admin_update on fare_matrix for update using (is_admin()) with check (is_admin());
create policy fare_matrix_admin_delete on fare_matrix for delete using (is_admin());

alter table buses enable row level security;
create policy buses_public_read on buses for select using (true);
create policy buses_admin_write on buses for insert with check (is_admin());
create policy buses_admin_update on buses for update using (is_admin()) with check (is_admin());
create policy buses_admin_delete on buses for delete using (is_admin());

-- =============================================================================
-- conductors — admin full access; a conductor may read (not write) their own row
-- =============================================================================
alter table conductors enable row level security;
create policy conductors_admin_all on conductors for all using (is_admin()) with check (is_admin());
create policy conductors_self_read on conductors for select using (user_id = auth.uid());

-- =============================================================================
-- profiles — a user may read their own profile; admin may read all
-- =============================================================================
alter table profiles enable row level security;
create policy profiles_self_read on profiles for select using (id = auth.uid());
create policy profiles_admin_read on profiles for select using (is_admin());
create policy profiles_admin_update on profiles for update using (is_admin()) with check (is_admin());

-- =============================================================================
-- transport_authority_config — public can read only whether payments are
-- enabled + display UPI id (needed to render the mock checkout); admin writes.
-- =============================================================================
alter table transport_authority_config enable row level security;
create policy tac_public_read on transport_authority_config for select using (true);
create policy tac_admin_write on transport_authority_config for insert with check (is_admin());
create policy tac_admin_update on transport_authority_config for update using (is_admin()) with check (is_admin());

-- =============================================================================
-- trips — public read (needed for bus search/live map); conductor may update
-- only their own active trip; admin full access.
-- =============================================================================
alter table trips enable row level security;
create policy trips_public_read on trips for select using (true);
create policy trips_admin_write on trips for insert with check (is_admin());
create policy trips_admin_delete on trips for delete using (is_admin());
create policy trips_update on trips for update
  using (is_admin() or is_conductor_for_trip(id))
  with check (is_admin() or is_conductor_for_trip(id));

-- =============================================================================
-- trip_stops — public read (progression is public transit info); mutated
-- only via the depart_stop_and_expire_tickets() SECURITY DEFINER RPC, so no
-- direct client write policy is granted beyond admin.
-- =============================================================================
alter table trip_stops enable row level security;
create policy trip_stops_public_read on trip_stops for select using (true);
create policy trip_stops_admin_write on trip_stops for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- trip_occupancy — public read (passenger UI shows available seats); writes
-- only via RPCs (SECURITY DEFINER bypasses RLS) or admin.
-- =============================================================================
alter table trip_occupancy enable row level security;
create policy trip_occupancy_public_read on trip_occupancy for select using (true);
create policy trip_occupancy_admin_write on trip_occupancy for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- schedules — public read; admin write
-- =============================================================================
alter table schedules enable row level security;
create policy schedules_public_read on schedules for select using (true);
create policy schedules_admin_write on schedules for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- tickets — a passenger may only see their own tickets (by anonymous
-- auth.uid()); a conductor may see tickets for trips they operate (needed to
-- reconcile scans); admin sees all. All writes go through RPCs.
-- =============================================================================
alter table tickets enable row level security;
create policy tickets_owner_read on tickets for select using (passenger_session_id = auth.uid());
create policy tickets_conductor_read on tickets for select using (is_conductor_for_trip(trip_id));
create policy tickets_admin_read on tickets for select using (is_admin());
-- No direct INSERT/UPDATE policy for passenger/conductor roles: ticket
-- creation and validation are exclusively performed by the SECURITY DEFINER
-- RPCs create_secure_ticket() and validate_ticket(), which run with elevated
-- privilege and enforce every business rule server-side.
create policy tickets_admin_write on tickets for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- alerts — conductors may insert alerts for their own active trip; conductors
-- may read alerts for their own trip; admin has full access. Passengers have
-- no access to alerts.
-- =============================================================================
alter table alerts enable row level security;
create policy alerts_admin_all on alerts for all using (is_admin()) with check (is_admin());
create policy alerts_conductor_insert on alerts for insert
  with check (
    conductor_id = current_conductor_id()
    and (trip_id is null or is_conductor_for_trip(trip_id))
  );
create policy alerts_conductor_read on alerts for select
  using (conductor_id = current_conductor_id());
