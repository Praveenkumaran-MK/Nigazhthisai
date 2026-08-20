-- =============================================================================
-- 017: pg_cron-scheduled housekeeping — anonymous auth user cleanup and
-- rate_limit_events purging.
--
-- Every job here follows the same safety pattern: a dry-run mode that only
-- COUNTS/LOGS what it would do, shipped as the default, with a documented,
-- deliberate step to flip it to actually delete (see README). This matters
-- most for the anonymous-user job, since auth.users deletion is irreversible.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

create table cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  ran_at timestamptz not null default now(),
  dry_run boolean not null,
  affected_count int not null
);
alter table cleanup_runs enable row level security;
create policy cleanup_runs_admin_read on cleanup_runs for select using (is_admin());
-- No insert/update/delete policies for any client role — only written by
-- the SECURITY DEFINER functions below (and the service role).

-- -----------------------------------------------------------------------------
-- cleanup_stale_anonymous_users: deletes (or, in dry-run mode, just counts)
-- anonymous auth.users rows that are either:
--   (a) never used to buy a ticket, older than 48 hours (abandoned session), or
--   (b) every ticket they ever held is EXPIRED/CANCELLED, and the newest one
--       expired more than 90 days ago (support/dispute window has passed).
-- ON DELETE CASCADE on profiles.id -> auth.users.id (migration 003) cleans
-- up the matching profiles row automatically.
--
-- Ships DRY-RUN by default (see the pg_cron schedule below, `p_dry_run =>
-- true`). To enable real deletion, an operator must deliberately update the
-- cron job — see README "Anonymous user cleanup" for the exact command.
-- -----------------------------------------------------------------------------
create or replace function cleanup_stale_anonymous_users(p_dry_run boolean default true)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with candidates as (
    select u.id
    from auth.users u
    where u.is_anonymous is true
      and (
        (u.created_at < now() - interval '48 hours'
         and not exists (select 1 from tickets t where t.passenger_session_id = u.id))
        or
        (not exists (
           select 1 from tickets t
           where t.passenger_session_id = u.id
             and t.status not in ('EXPIRED', 'CANCELLED')
         )
         and exists (select 1 from tickets t where t.passenger_session_id = u.id)
         and (select max(t.expires_at) from tickets t where t.passenger_session_id = u.id) < now() - interval '90 days')
      )
  )
  select count(*) into v_count from candidates;

  if not p_dry_run then
    delete from auth.users where id in (select id from candidates);
  end if;

  insert into cleanup_runs (job_name, dry_run, affected_count)
  values ('cleanup_stale_anonymous_users', p_dry_run, v_count);

  return v_count;
end;
$$;

revoke all on function cleanup_stale_anonymous_users(boolean) from anon, authenticated;
-- No grant to authenticated either — this runs only via pg_cron (as the
-- job owner) or manually by a service-role/dashboard SQL session.

select cron.schedule(
  'cleanup-stale-anonymous-users',
  '0 3 * * *', -- daily, 3am UTC — low-traffic window
  $$select cleanup_stale_anonymous_users(p_dry_run => true)$$
);

-- -----------------------------------------------------------------------------
-- purge_rate_limit_events: rate_limit_events (migration 016) is a sliding-
-- window table — rows older than the largest configured window (currently
-- 1 hour, from check_provisioning_rate_limit) are pure dead weight. Purge
-- frequently so this table never grows large. Safe to run live (not
-- dry-run-gated) — these rows have no downstream meaning once expired.
-- -----------------------------------------------------------------------------
create or replace function purge_rate_limit_events()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from rate_limit_events where occurred_at < now() - interval '1 day';
  get diagnostics v_count = row_count;

  insert into cleanup_runs (job_name, dry_run, affected_count)
  values ('purge_rate_limit_events', false, v_count);

  return v_count;
end;
$$;

revoke all on function purge_rate_limit_events() from anon, authenticated;

select cron.schedule(
  'purge-rate-limit-events',
  '0 * * * *', -- hourly
  $$select purge_rate_limit_events()$$
);
