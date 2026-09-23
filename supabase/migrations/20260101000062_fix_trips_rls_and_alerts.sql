-- =============================================================================
-- 062: FIX TRIPS RLS COLUMN GRANT + cancel_trip RPC + ALERTS INSERT GRANT
-- =============================================================================
-- Fixes three production errors:
--
--   BUG A (403): Admin "Cancel Trip" fails — PATCH trips blocked because
--     last_edited_at is not in the column-level grant from migration 010.
--
--   BUG B (403): Conductor "End Shift" direct-fallback PATCH fails — ended_at
--     is not in the column-level grant from migration 010.
--
--   BUG C (403): Admin trips table DELETE blocked — direct REST delete not
--     allowed (must go through SECURITY DEFINER RPC).
--
--   BUG D (400): Idle & Alerts page POST /alerts fails — migration 060 only
--     granted SELECT on alerts to authenticated; no INSERT/UPDATE grant exists.
--     Also ensures source_role + district_id + title columns exist on alerts.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PHASE 1 — Widen `trips` column-level UPDATE grant
-- Migration 010 restricted authenticated to: status, current_stop_id only.
-- We need to also allow: ended_at, last_edited_at, gps_last_updated_at,
-- current_latitude, current_longitude, schedule_adherence.
-- These are the only additional fields mutated by legitimate client operations.
-- All structural fields (route_id, bus_id, conductor_id, district_id, etc.)
-- remain off-limits for direct client writes (go through SECURITY DEFINER RPCs).
-- -----------------------------------------------------------------------------
revoke update on public.trips from authenticated;

grant update (
  status,
  current_stop_id,
  ended_at,
  last_edited_at,
  last_edited_by,
  gps_last_updated_at,
  current_latitude,
  current_longitude,
  schedule_adherence
) on public.trips to authenticated;

-- -----------------------------------------------------------------------------
-- PHASE 2 — cancel_trip SECURITY DEFINER RPC
-- Replaces the raw .update({ status: "CANCELLED" }) call in TripsPage.tsx.
-- Includes district isolation, state guard, and integrated audit log.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_trip(
  p_trip_id uuid,
  p_reason   text default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip    trips;
  v_old_status text;
begin
  -- 1. Auth check
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can cancel trips';
  end if;

  -- 2. Load trip
  select * into v_trip from trips where id = p_trip_id;
  if not found then
    raise exception 'NOT_FOUND: trip % does not exist', p_trip_id;
  end if;

  -- 3. State guard — can only cancel SCHEDULED or PLANNED trips
  if v_trip.status not in ('SCHEDULED', 'PLANNED') then
    raise exception 'INVALID_STATE: trip is in % status and cannot be cancelled (only SCHEDULED or PLANNED trips can be cancelled)', v_trip.status;
  end if;

  -- 4. District isolation for district admins
  if is_district_admin() then
    if v_trip.district_id is null or v_trip.district_id <> my_district_id() then
      raise exception 'FORBIDDEN: district admin can only cancel trips in their own district';
    end if;
  end if;

  v_old_status := v_trip.status;

  -- 5. Cancel trip
  update trips
  set status         = 'CANCELLED',
      last_edited_at = now(),
      last_edited_by = auth.uid()
  where id = p_trip_id
  returning * into v_trip;

  -- 6. Integrated audit log (non-fatal if trip_edits doesn't have the column yet)
  begin
    insert into trip_edits (trip_id, edited_by, field_name, old_value, new_value, reason)
    values (p_trip_id, auth.uid(), 'status', v_old_status, 'CANCELLED',
            coalesce(p_reason, 'Trip cancelled by administrator before dispatch'));
  exception when others then
    -- non-fatal — audit log failure should never block the cancel operation
    null;
  end;

  return v_trip;
end;
$$;

revoke all on function public.cancel_trip(uuid, text) from public, anon;
grant execute on function public.cancel_trip(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- PHASE 3 — delete_trip SECURITY DEFINER RPC
-- Replaces raw .delete() in TripsPage.tsx handleDeleteTrip.
-- Guards against FK violations and active trips; gives a clear error message.
-- -----------------------------------------------------------------------------
create or replace function public.delete_trip(
  p_trip_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip trips;
  v_ticket_count bigint;
begin
  -- 1. Auth
  if not is_any_admin() then
    raise exception 'FORBIDDEN: only administrators can delete trips';
  end if;

  -- 2. Load trip
  select * into v_trip from trips where id = p_trip_id;
  if not found then
    raise exception 'NOT_FOUND: trip % does not exist', p_trip_id;
  end if;

  -- 3. State guard — cannot delete ACTIVE or COMPLETED trips
  if v_trip.status in ('ACTIVE', 'COMPLETED') then
    raise exception 'INVALID_STATE: cannot permanently delete a trip in % status. Use Cancel Trip instead.', v_trip.status;
  end if;

  -- 4. District isolation
  if is_district_admin() then
    if v_trip.district_id is null or v_trip.district_id <> my_district_id() then
      raise exception 'FORBIDDEN: district admin can only delete trips in their own district';
    end if;
  end if;

  -- 5. Check for passenger tickets (FK guard)
  select count(*) into v_ticket_count from tickets where trip_id = p_trip_id;
  if v_ticket_count > 0 then
    raise exception 'CONSTRAINT_VIOLATION: this trip has % passenger ticket(s) attached. Use "Cancel Trip" to preserve the audit trail instead of permanent deletion.', v_ticket_count;
  end if;

  -- 6. Delete dependent rows first (no cascade on these FK refs)
  delete from trip_stops  where trip_id = p_trip_id;
  delete from trip_edits  where trip_id = p_trip_id;
  delete from trip_occupancy where trip_id = p_trip_id;

  -- 7. Delete trip
  delete from trips where id = p_trip_id;
end;
$$;

revoke all on function public.delete_trip(uuid) from public, anon;
grant execute on function public.delete_trip(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- PHASE 4 — Fix alerts table grants and schema
-- Migration 060 only granted SELECT on alerts. The admin Idle Scanner does
-- direct INSERT into alerts — this requires INSERT + UPDATE grants and a
-- matching RLS policy allowing admin writes.
-- -----------------------------------------------------------------------------

-- Ensure columns inserted by AlertsPage.tsx and check_idle_buses() exist
alter table public.alerts
  add column if not exists title        text,
  add column if not exists district_id  uuid references public.districts (id) on delete set null,
  add column if not exists source_role  text default 'system'
    check (source_role in ('passenger', 'conductor', 'system', 'admin')),
  add column if not exists bus_number_snapshot text;

-- Grant DML (INSERT + UPDATE for status changes like ACKNOWLEDGE/RESOLVE)
grant insert, update on public.alerts to authenticated;

-- Drop any conflicting insert/write policies then recreate cleanly
drop policy if exists alerts_admin_insert on public.alerts;
drop policy if exists alerts_admin_write  on public.alerts;

-- Extend the existing all-access admin policy to cover INSERT/UPDATE
-- (alerts_admin_all already uses FOR ALL, but re-create to be explicit)
drop policy if exists alerts_admin_all on public.alerts;
create policy alerts_admin_all on public.alerts
  for all
  using (is_any_admin())
  with check (is_any_admin());

-- Ensure conductor insert policy still exists
drop policy if exists alerts_conductor_insert on public.alerts;
create policy alerts_conductor_insert on public.alerts
  for insert
  with check (
    conductor_id = current_conductor_id()
    and (trip_id is null or is_conductor_for_trip(trip_id))
  );

-- -----------------------------------------------------------------------------
-- VERIFICATION
-- -----------------------------------------------------------------------------
do $$
begin
  -- Verify cancel_trip function was created
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cancel_trip'
  ) then
    raise exception 'MIGRATION 062 FAILED: cancel_trip function not found';
  end if;

  -- Verify delete_trip function was created
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_trip'
  ) then
    raise exception 'MIGRATION 062 FAILED: delete_trip function not found';
  end if;

  raise notice 'MIGRATION 062 OK — trips column grant widened, cancel_trip + delete_trip RPCs created, alerts grants fixed';
end;
$$;
