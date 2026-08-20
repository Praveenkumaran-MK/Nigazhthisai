-- =============================================================================
-- 019: Data lifecycle — archive old terminal-state tickets/alerts out of the
-- hot tables, on the same pg_cron + dry-run-first pattern as migration 017.
--
-- Retention:
--   tickets: only VALIDATED/EXPIRED/CANCELLED (terminal states) older than
--            18 months get archived. PAID/CREATED (in-flight) tickets are
--            NEVER touched regardless of age — a ticket sitting in one of
--            those states past its expires_at is an anomaly worth
--            investigating, not archiving away silently.
--   alerts:  only RESOLVED alerts older than 1 year. ACTIVE/ACKNOWLEDGED
--            alerts are NEVER touched by this job at any age.
--
-- Nothing else in the schema derives its state by re-querying historical
-- ticket/alert rows (trip_occupancy is an independently maintained running
-- counter, not recomputed from tickets), so archiving old terminal rows out
-- of the hot tables is safe today. If an admin reporting/history feature is
-- added later that queries ticket/alert history directly, it must read
-- from `tickets` UNION `tickets_archive` (and same for alerts) — noting
-- that here so it isn't a silent surprise for whoever builds that feature.
-- =============================================================================

create table tickets_archive (like tickets including defaults);
alter table tickets_archive add column archived_at timestamptz not null default now();
alter table tickets_archive enable row level security;
create policy tickets_archive_admin_read on tickets_archive for select using (is_admin());

create table alerts_archive (like alerts including defaults);
alter table alerts_archive add column archived_at timestamptz not null default now();
alter table alerts_archive enable row level security;
create policy alerts_archive_admin_read on alerts_archive for select using (is_admin());

-- -----------------------------------------------------------------------------
-- archive_old_tickets: dry-run by default (see the pg_cron schedule below).
-- Insert-then-delete inside one function body is atomic — a row can never
-- end up in neither table nor both.
-- -----------------------------------------------------------------------------
create or replace function archive_old_tickets(
  p_dry_run boolean default true,
  p_older_than interval default interval '18 months'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from tickets
  where status in ('VALIDATED', 'EXPIRED', 'CANCELLED')
    and created_at < now() - p_older_than;

  if not p_dry_run then
    with moved as (
      delete from tickets
      where status in ('VALIDATED', 'EXPIRED', 'CANCELLED')
        and created_at < now() - p_older_than
      returning tickets.*
    )
    insert into tickets_archive
    select moved.*, now() from moved;
  end if;

  insert into cleanup_runs (job_name, dry_run, affected_count)
  values ('archive_old_tickets', p_dry_run, v_count);

  return v_count;
end;
$$;

revoke all on function archive_old_tickets(boolean, interval) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- archive_old_alerts: same shape, RESOLVED-only, 1 year.
-- -----------------------------------------------------------------------------
create or replace function archive_old_alerts(
  p_dry_run boolean default true,
  p_older_than interval default interval '1 year'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from alerts
  where status = 'RESOLVED'
    and created_at < now() - p_older_than;

  if not p_dry_run then
    with moved as (
      delete from alerts
      where status = 'RESOLVED'
        and created_at < now() - p_older_than
      returning alerts.*
    )
    insert into alerts_archive
    select moved.*, now() from moved;
  end if;

  insert into cleanup_runs (job_name, dry_run, affected_count)
  values ('archive_old_alerts', p_dry_run, v_count);

  return v_count;
end;
$$;

revoke all on function archive_old_alerts(boolean, interval) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- purge_old_cleanup_runs: the audit log for every job in this file (and
-- migration 017) is itself unbounded — keep 1 year. Not dry-run-gated: it's
-- an audit log of already-completed runs, low stakes, and its own retention
-- shouldn't require the same ceremony as deleting auth.users/tickets/alerts.
-- -----------------------------------------------------------------------------
create or replace function purge_old_cleanup_runs()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from cleanup_runs where ran_at < now() - interval '1 year';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function purge_old_cleanup_runs() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Self-check: fail this migration loudly instead of silently shipping a
-- privilege leak again (see migration 018's postmortem — a "should be fine"
-- assumption about default privileges was wrong in practice for 4/4 new
-- functions at the time).
-- -----------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'archive_old_tickets(boolean,interval)', 'execute')
     or has_function_privilege('authenticated', 'archive_old_tickets(boolean,interval)', 'execute') then
    raise exception 'archive_old_tickets is callable by anon/authenticated — should be nobody';
  end if;
  if has_function_privilege('anon', 'archive_old_alerts(boolean,interval)', 'execute')
     or has_function_privilege('authenticated', 'archive_old_alerts(boolean,interval)', 'execute') then
    raise exception 'archive_old_alerts is callable by anon/authenticated — should be nobody';
  end if;
  if has_function_privilege('anon', 'purge_old_cleanup_runs()', 'execute')
     or has_function_privilege('authenticated', 'purge_old_cleanup_runs()', 'execute') then
    raise exception 'purge_old_cleanup_runs is callable by anon/authenticated — should be nobody';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Schedules: monthly, 1st of month at 4am UTC (an hour after the anonymous-
-- user cleanup job, to avoid the two overlapping). Both ship dry-run.
-- -----------------------------------------------------------------------------
select cron.schedule(
  'archive-old-tickets',
  '0 4 1 * *',
  $$select archive_old_tickets(p_dry_run => true)$$
);

select cron.schedule(
  'archive-old-alerts',
  '15 4 1 * *',
  $$select archive_old_alerts(p_dry_run => true)$$
);

select cron.schedule(
  'purge-old-cleanup-runs',
  '30 4 1 * *',
  $$select purge_old_cleanup_runs()$$
);
