# Scaling & Operations Plan

Five workstreams toward real production readiness: load testing, anonymous
auth lifecycle, rate limiting, multi-tenant schema, and data lifecycle. These
are **not equal in size or urgency** — the plan is ordered by that reality,
not by the order they were asked in. See [Phasing](#phasing) for the
recommended execution order and why.

**Status**: Phase 1 (§1 anonymous cleanup, §2 rate limiting) — **done**,
migrations 016–018. Phase 2 (§4 data lifecycle archival) — **done**,
migration 019. Phase 3 (§3 load testing) — **tooling built and validated at
smoke scale against the live project** (see `load-tests/`); full-scale runs
against a real staging project still pending. Phase 4 (§5 multi-tenant
schema) — deferred, see rationale in §5.

Every phase so far has hit at least one real bug caught only by actually
running things against the live database, not by the SQL/code "looking
right":
- Migration 018: every new function in 016/017 was silently callable by
  `anon`/`authenticated` despite an explicit revoke.
- Migration 020: `find_nearest_stop`/`list_eligible_buses` were left marked
  `STABLE` after migration 016 added a write (rate-limit tracking) inside
  them — PostgREST runs `STABLE` functions in a read-only transaction, so
  every single call failed (`cannot execute INSERT in a read-only
  transaction`). Caught by a k6 smoke test, not code review.
- Anonymous sign-ins were disabled at the project-auth-config level the
  entire time (`external_anonymous_users_enabled: false`) — meaning the
  Passenger app's core zero-login ticket flow had never actually been
  exercised end-to-end against the live project before the load-testing
  smoke run caught it. Fixed via the Management API (with explicit
  confirmation before flipping a project-wide auth setting).

None of these were visible from reading the code or from `tsc`/unit tests —
all three needed a real request against the real project to surface. That's
the actual case for load testing existing as its own phase rather than
being treated as optional.

---

## 1. Anonymous Auth User Lifecycle

**Problem**: `signInAnonymously()` creates a real, permanent `auth.users` row
per passenger visit (that's how zero-login works). Nothing ever deletes
these. At real ridership volumes this table — and `profiles`, via the
`on_auth_user_created` trigger — grows unbounded, almost entirely with
one-visit sessions that never bought a ticket.

**Design**:

- Retention policy:
  - Anonymous user with **zero tickets ever**, older than **48 hours** →
    delete (abandoned session).
  - Anonymous user whose **every** ticket is `EXPIRED`/`CANCELLED` and the
    newest one expired more than **90 days** ago → delete (dispute/support
    window has passed).
  - Anonymous user with any `PAID`/`VALIDATED` ticket → never auto-deleted.
- Mechanism: a `SECURITY DEFINER` SQL function
  `cleanup_stale_anonymous_users()` run on a schedule via **`pg_cron`**
  (available on Supabase, no external service needed) — not an Edge
  Function + Auth Admin API round trip, since `auth.users` is a normal
  Postgres table and `ON DELETE CASCADE` already cleans up `profiles`.
  ```sql
  select cron.schedule('cleanup-anon-users', '0 3 * * *', $$select cleanup_stale_anonymous_users()$$);
  ```
- Safety: ship in **dry-run mode first** (function logs the count/ids it
  *would* delete into a `cleanup_runs` audit table for one week) before
  flipping it to actually delete. This audit table doubles as the ops
  visibility into the job going forward.
- New migration: `districts`-independent, can ship immediately —
  `cleanup_runs` table, `cleanup_stale_anonymous_users()` function,
  `pg_cron` schedule.

**Effort**: Small (~1 migration, well-isolated, low risk). **Do first.**

---

## 2. Rate Limiting

**Problem**: nothing stops a scripted client from hammering
`create_secure_ticket` (ticket-buy spam), `find_nearest_stop` (scraping), or
repeatedly calling `signInAnonymously()` to mint fresh sessions and route
around any per-session limit.

**Design** — two layers, both needed, neither sufficient alone:

**a) Supabase Auth rate limits (project setting, not code)**
Configure explicitly in Dashboard → Auth → Rate Limits — the defaults are
not tuned for a public zero-login flow where anonymous sign-in *is* the main
traffic pattern:
- Anonymous sign-ins: cap per IP (this is the main lever against someone
  scripting thousands of throwaway sessions to buy up all seats on a bus).
- Password sign-in attempts (admin/conductor): tighten from default to stop
  credential stuffing.
This is an **infra checklist item**, not a migration — document it in
`README.md` deployment steps so it isn't silently skipped on a fresh project.

**b) Database-level rate limiting (primary, portable, testable)**
A generic reusable mechanism, enforced in the same layer as the rest of the
security model (defense in depth, no new infra dependency):
```sql
create table rate_limit_events (
  key text not null,
  occurred_at timestamptz not null default now()
);
create index on rate_limit_events (key, occurred_at);

create function enforce_rate_limit(p_key text, p_max_events int, p_window interval)
returns void language plpgsql as $$
declare v_count int;
begin
  select count(*) into v_count from rate_limit_events
  where key = p_key and occurred_at > now() - p_window;
  if v_count >= p_max_events then
    raise exception 'RATE_LIMITED';
  end if;
  insert into rate_limit_events (key) values (p_key);
end;
$$;
```
Called at the top of sensitive RPCs with per-RPC limits:

| RPC | Limit | Key |
|---|---|---|
| `create_secure_ticket` | 10 / 5 min | `auth.uid()` |
| `validate_ticket` | 60 / min | conductor's `auth.uid()` |
| `provision-conductor` (Edge Function) | 20 / hour | admin's `auth.uid()` |
| `find_nearest_stop` / `list_eligible_buses` | 60 / min | `auth.uid()` (or IP if unauthenticated call path is ever added) |

`RATE_LIMITED` gets a `toAppError` mapping like every other RPC error code
— no new error-handling pattern needed on the client.

**c) Edge/CDN layer (recommended, but an infra task, not app code)**
Put Cloudflare (or equivalent) in front of the Supabase custom domain with
rate-limiting rules on `/rest/v1/rpc/*` — catches raw HTTP flood patterns
the DB-level check can't (e.g. before a JWT is even parsed). Document as a
deployment prerequisite; out of scope for this repo's migrations.

**Effort**: Small–medium (1 migration + a few RPC edits + one infra
checklist item). **Do second**, right after anonymous cleanup — both are
cheap and directly reduce the blast radius of the abuse scenarios in
§1 (someone farming anonymous sessions) and this section reinforces it.

---

## 3. Load Testing

**Problem**: correctness under concurrency was verified by *reading* the
code (lock ordering, `FOR UPDATE`) and direct DB queries — never under
actual concurrent load. Also: no established capacity numbers for the
current Supabase plan/tier, so there's no answer to "how many buses/riders
can this handle" today.

**Design**:

- **Tooling**: [k6](https://k6.io) for HTTP/RPC load (scriptable, CI-friendly,
  free) + a small Node harness using the real `@supabase/supabase-js` client
  for Realtime concurrency (k6's WebSocket support doesn't speak the
  Phoenix/Supabase Realtime protocol, so simulating N real conductor/passenger
  connections is more realistic done with the actual client library, run as
  parallel worker processes).
- **Scenarios** (correctness-under-load, not just throughput):
  1. **Ticket purchase burst**: N concurrent anonymous sessions calling
     `create_secure_ticket` against a trip near capacity → assert *exactly*
     `capacity` succeed, the rest get `BUS_FULL`, zero oversell.
  2. **Duplicate validation race**: fire the same QR at `validate_ticket`
     from 2+ concurrent connections → assert exactly one succeeds.
  3. **GPS fan-out**: 1 conductor broadcasting, scale subscriber count
     (100 → 500 → 1000) → measure delivery latency/loss.
  4. **Sustained read load**: `find_nearest_stop`/`list_eligible_buses`/
     `stops_public` at target RPS → establish baseline p95 latency and the
     RPS ceiling for the current instance size.
  5. **Soak test**: 30–60 min at target load → catch connection leaks,
     degradation over time (relevant now that presence has a heartbeat
     timer per conductor — verify it doesn't leak under churn).
- **Environment**: a **staging** Supabase project sized like intended
  production — never run against the live project.
- **Pass/fail thresholds** (starting point, tune after first run):
  p95 RPC latency < 300ms, error rate < 0.1%, **zero** correctness
  violations in scenarios 1–2 (these are hard failures, not "flaky").
- **Cadence**: not on every PR (too heavy/slow) — scheduled nightly against
  staging, and mandatory before any release that touches the RPCs in
  §1 above of `supabase/migrations/`.
- **Deliverable**: `load-tests/` directory (k6 scripts + Node realtime
  harness + a README), and once run, the measured capacity numbers get
  written into `ARCHITECTURE.md` so "how much load can this take" has an
  actual answer instead of a guess.

**Effort**: Medium (new tooling, no schema changes). **Do third** — testing
load against a system that doesn't have rate limiting yet mostly just
measures how fast you can abuse it, so §1/§2 come first.

---

## 4. Data Lifecycle

Overlaps with §1 (anonymous users are one instance of this) but is broader:

| Table | Policy | Mechanism |
|---|---|---|
| `tickets` | Keep full detail 1–2 years (support/audit), archive/drop after | `pg_cron` archival job now; **declarative partitioning by month** once volume justifies it (makes archiving a `DROP PARTITION`, not a `DELETE`) |
| `alerts` | Keep `RESOLVED` 1 year, then archive; never auto-touch `ACTIVE`/`ACKNOWLEDGED` | `pg_cron` job, status-gated |
| `trips` / `trip_stops` / `trip_occupancy` | Much lower volume than tickets (one row per trip, not per ride) — low priority | Defer; revisit if/when volume actually matters |
| `rate_limit_events` (§2) | Purge rows older than the largest configured window (~1 day) | `pg_cron`, runs frequently, keeps this table small by design |
| `cleanup_runs` (§1 audit log) | Keep 1 year | `pg_cron` |
| GPS telemetry | **No lifecycle needed** — Broadcast only, never persisted. This is already correct. |

**Design principle**: centralize all housekeeping as `SECURITY DEFINER`
functions + `pg_cron` schedules, defined in migrations (reproducible,
version-controlled — not manual dashboard cron jobs), each with the same
dry-run-first safety pattern as §1.

**Partitioning**: don't do this speculatively. Recreating `tickets` as a
partitioned table is a real migration with real risk — defer until row
count or query-latency data actually justifies it (rule of thumb: start
planning around 5–10M rows or when `EXPLAIN ANALYZE` on common ticket
queries shows sequential-scan pain). Design the archival *function* now so
there's a lever to pull without a redesign later; don't build the
partitioning infrastructure before it's needed.

**Effort**: Small now (archival jobs, reusing §1's pattern), large later
(partitioning, deferred). **Do fourth**, bundled with §1's migration work
since the mechanism (pg_cron + audit log) is shared.

---

## 5. Multi-Tenant Schema

**Problem**: `stops.district` is a free-text label, not real isolation.
One shared `transport_authority_config` singleton row. There is currently
exactly one implicit tenant.

**Design** (for real multi-district/multi-authority isolation):

- New `districts` table (`id`, `name`, `slug`, `created_at`) — the tenant root.
- Add `district_id` FK to every tenant-scoped table: `stops`, `routes`,
  `buses`, `conductors`, `trips`, `schedules`, `transport_authority_config`
  (becomes one row *per* district instead of a singleton). `tickets`/`alerts`
  stay scoped transitively via their `trip_id`/`bus_id` FK — no direct
  column needed there.
- New helper `current_user_district_id()` (mirrors `current_conductor_id()`)
  reading `profiles.district_id` (new column) — every admin/conductor RLS
  policy gains `and district_id = current_user_district_id()`, so an admin
  from District A structurally cannot see/edit District B's data even
  though `is_admin()` is true. Consider a `is_platform_admin` flag for a
  cross-district operator role.
- Passenger flow stays anonymous/identity-free, so isolation there is
  **filter-based, not RLS-based**: every passenger-facing RPC
  (`find_nearest_stop`, `list_eligible_buses`, etc.) takes an explicit
  `p_district_id` parameter; the app resolves "which district" via a
  city/service-area picker, or by matching geolocation against a
  `service_area` PostGIS polygon per district (`ST_Contains`).
- **Migration path** (this touches nearly every table — treat as its own
  multi-step project phase, not a single migration):
  1. Add nullable `district_id` columns + `districts` table.
  2. Backfill all existing rows to one default district ("Thanjai").
  3. Make columns `NOT NULL`.
  4. Update every RLS policy to add the district predicate.
  5. Update every RPC signature to accept/scope by `district_id`.
  6. Update client wrappers (`packages/supabase-client`) and UI (district
     picker in Passenger, district context in Admin/Conductor) to pass it
     through.

**Effort**: **Large** — realistically 2–3x the size of the entire 47-bug
fix pass just completed, because it touches every table, every RLS policy,
every RPC signature, and every client call site.

**Recommendation**: this is the one item on this list I'd explicitly push
back on doing speculatively. Build it **when there's an actual second
district/customer**, not before — YAGNI applies hard here, and retrofitting
`district_id` onto rows that already have real ticket/trip history later is
strictly easier than it sounds (it's an additive nullable-then-backfill
migration, the same shape as steps 1–3 above) *if* the schema is otherwise
healthy. The one thing worth doing **now, cheaply**, if a second district is
plausible within the next year: keep every new table design reviewed with
"would a `district_id` column fit here later" in mind, so nothing is built
in a way that actively fights this migration when the time comes. Nothing
in the current schema does.

---

## Phasing

| Phase | Work | Why this order |
|---|---|---|
| **1** ✅ done | Anonymous user cleanup (§1) + rate limiting (§2) | Cheap, isolated, directly reduce abuse surface. Do before load testing so you're testing a hardened system, not measuring how fast an open door lets you in. |
| **2** ✅ done | Data lifecycle housekeeping jobs (§4, minus partitioning) | Shares the `pg_cron` + audit-log mechanism just built in Phase 1 — cheap to bundle. |
| **3** 🟡 smoke-validated | Load testing (§3) | Establishes real capacity numbers against the now-hardened system; results directly inform whether/when Phase 4 or partitioning become urgent. Tooling built, all 4 scenarios pass at smoke scale against the live project (2 real bugs found and fixed in the process — see status note above). Full-scale runs (60+ VUs, 30-60min soak, 1000-subscriber fan-out) still need a dedicated staging project per this file's original guidance. |
| **4 (deferred, trigger-based)** | Multi-tenant schema (§5) | Only when a second district is real. Ticket-volume-triggered: `tickets` partitioning (§4 remainder) — only when row count/query latency data says so. |

Phases 1–3 are all things I'd actually build now. Phase 4 I'd explicitly
hold off on until there's a concrete second customer — happy to be
overruled if you already know one's coming, but building tenant isolation
for a hypothetical tenant is exactly the kind of premature abstraction that
tends to guess wrong about the shape multi-tenancy actually needs to take.
