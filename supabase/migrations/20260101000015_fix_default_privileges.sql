-- =============================================================================
-- 015: Correct migration 010's revoke, which didn't actually work.
--
-- Verified against the live project: this schema has a default-privilege
-- rule (`pg_default_acl`, defaclrole = postgres, defaclobjtype = 'f') that
-- grants EXECUTE on every newly created function in `public` DIRECTLY to
-- anon/authenticated/service_role at CREATE FUNCTION time — as real,
-- explicit per-role grants, not privileges inherited through the PUBLIC
-- pseudo-role. `revoke all on function ... from public` (migration 010)
-- therefore left the explicit anon/authenticated grants fully intact;
-- confirmed live via:
--   select proacl from pg_proc where proname = 'create_secure_ticket';
--   -- => {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- i.e. `anon` could still call create_secure_ticket after "fixing" this.
--
-- Fix: revoke from the actual roles (anon, authenticated), not `public`,
-- and change the default-privilege rule itself so this can't silently
-- recur the next time any of these functions is `create or replace`'d
-- (which re-triggers the same auto-grant) or a new sensitive RPC is added
-- without remembering this footgun.
-- =============================================================================

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Public-safe RPCs: explicitly re-grant after the blanket revoke below.
revoke execute on function find_nearest_stop(double precision, double precision, int) from anon, authenticated;
grant execute on function find_nearest_stop(double precision, double precision, int) to anon, authenticated;

revoke execute on function list_eligible_buses(uuid, uuid) from anon, authenticated;
grant execute on function list_eligible_buses(uuid, uuid) to anon, authenticated;

-- Authenticated-only RPCs: revoke from anon explicitly (authenticated keeps access).
revoke execute on function create_secure_ticket(uuid, uuid, uuid, int) from anon;
revoke execute on function validate_ticket(text, uuid) from anon;
revoke execute on function depart_stop_and_expire_tickets(uuid, uuid) from anon;
revoke execute on function start_trip(uuid) from anon;
revoke execute on function link_conductor_account(uuid, uuid) from anon;
revoke execute on function reorder_route_stop(uuid, uuid, int) from anon;
revoke execute on function add_route_stop(uuid, uuid) from anon;
revoke execute on function remove_route_stop(uuid, uuid) from anon;
revoke execute on function confirm_schedule_and_create_trip(uuid, uuid) from anon;
