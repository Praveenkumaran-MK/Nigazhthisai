-- =============================================================================
-- 018: Close a real, live privilege leak on every function added in
-- migrations 016/017.
--
-- Verified against the live project: despite migration 015's `ALTER DEFAULT
-- PRIVILEGES FOR ROLE postgres ... REVOKE EXECUTE ON FUNCTIONS FROM anon,
-- authenticated`, every function created AFTER that migration still ended
-- up with an explicit PUBLIC execute grant:
--   select proacl from pg_proc where proname = 'check_provisioning_rate_limit';
--   -- => {=X/postgres, postgres=X/postgres, service_role=X/postgres, authenticated=X/postgres}
--                ^^^^^^ bare role name = PUBLIC
-- Any authenticated OR anonymous session could therefore call
-- cleanup_stale_anonymous_users(p_dry_run => false) directly — a real,
-- exploitable mass-account-deletion path — plus call enforce_rate_limit()
-- with an arbitrary key to grief another user's rate limit, and
-- purge_rate_limit_events() to blow away rate-limit history and defeat
-- migration 016 entirely. All confirmed live via has_function_privilege()
-- before this migration; all confirmed closed after.
--
-- The exact mechanism wasn't worth fully reverse-engineering under time
-- pressure — what's applied here is the pattern already proven to work on
-- the original 9 sensitive functions (migrations 008/010/012/013/014),
-- every one of which is clean: an explicit `revoke ... from public`
-- immediately after each `create or replace function`, every time,
-- regardless of what any default-privilege ALTER claims should already be
-- the case. That per-function revoke is now the load-bearing mechanism,
-- not the default-privilege ALTER — the ALTER below is kept as defense in
-- depth, not as the primary fix.
-- =============================================================================

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

revoke all on function enforce_rate_limit(text, int, interval) from public, anon, authenticated;

revoke all on function check_provisioning_rate_limit() from public, anon, authenticated;
grant execute on function check_provisioning_rate_limit() to authenticated;

revoke all on function cleanup_stale_anonymous_users(boolean) from public, anon, authenticated;

revoke all on function purge_rate_limit_events() from public, anon, authenticated;

-- Re-verify (fails the migration loudly if any of these regress instead of
-- silently shipping a broken grant again).
do $$
begin
  if has_function_privilege('anon', 'cleanup_stale_anonymous_users(boolean)', 'execute') then
    raise exception 'anon can still call cleanup_stale_anonymous_users after revoke';
  end if;
  if has_function_privilege('authenticated', 'cleanup_stale_anonymous_users(boolean)', 'execute') then
    raise exception 'authenticated can still call cleanup_stale_anonymous_users after revoke';
  end if;
  if has_function_privilege('anon', 'enforce_rate_limit(text,int,interval)', 'execute') then
    raise exception 'anon can still call enforce_rate_limit after revoke';
  end if;
  if has_function_privilege('anon', 'purge_rate_limit_events()', 'execute') then
    raise exception 'anon can still call purge_rate_limit_events after revoke';
  end if;
  if has_function_privilege('anon', 'check_provisioning_rate_limit()', 'execute') then
    raise exception 'anon can still call check_provisioning_rate_limit after revoke';
  end if;
end $$;
