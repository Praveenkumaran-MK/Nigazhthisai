# Load Testing

Part of the [scaling/operations plan](../SCALING_AND_OPERATIONS_PLAN.md), Phase 3.

## ⚠️ Read this before running anything

**These scripts create real data and place real load.** `ticket-purchase-burst.js`
creates real `auth.users` (anonymous) and real `tickets` rows. It calls the
*actual* `create_secure_ticket`/`validate_ticket` RPCs — not a mock — against
whatever `K6_SUPABASE_URL` points at.

**Never point these at a project you can't afford to disrupt or pollute.**
The scaling plan calls for a dedicated staging Supabase project, sized like
production, for exactly this reason. If you don't have one yet and are
tempted to run these against the one project this app currently uses:
understand that a burst test intentionally tries to oversell a bus's
capacity and hammer the ticket/validation RPCs concurrently — on a shared
project this can pollute real admin-visible data (tickets, anonymous users)
and will count against that project's Realtime connection limits and
compute. Run the **smoke** scale (`K6_VUS=2 K6_ITERATIONS=2`) first, always,
regardless of target — see [Smoke-test first](#smoke-test-first-mandatory).

## What's here

```text
load-tests/
├── k6/                          # HTTP/RPC load — needs the k6 binary
│   ├── lib/auth.js                # anonymous sign-in / conductor+admin login helpers
│   ├── ticket-purchase-burst.js   # Scenario 1 — correctness under concurrency, not just throughput
│   ├── duplicate-validation-race.js # Scenario 2 — double-scan race
│   ├── sustained-read-load.js     # Scenario 4 (also used for Scenario 5 soak, via env var)
│   └── README is this file
└── realtime-harness/            # GPS Broadcast fan-out — needs real @supabase/supabase-js,
    │                               k6 doesn't speak the Phoenix/Realtime protocol
    ├── package.json
    └── gps-fanout.js               # Scenario 3
```

## Prerequisites

- **k6**: not installed in this environment. Install per your OS —
  `winget install k6.k6` / `choco install k6` / `brew install k6` / see
  https://grafana.com/docs/k6/latest/set-up/install-k6/
- **Realtime harness**: `cd realtime-harness && npm install`
- A target project's `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (reuse the
  root `.env` values if you're consciously accepting the risk above), plus:
  - A **conductor** login (government ID + password) with an **ACTIVE** trip
    assigned, for `duplicate-validation-race.js`.
  - That trip's `bus_id` capacity should be small (e.g. temporarily set to 2
    via Admin → Buses) so `ticket-purchase-burst.js` can prove the `BUS_FULL`
    boundary without needing hundreds of VUs.

## Smoke-test first (mandatory)

Before any real-scale run, prove the script itself is correct at trivial
scale — this catches script bugs (wrong endpoint, bad payload, expired test
trip) without generating real load:

```bash
K6_SUPABASE_URL=https://<ref>.supabase.co \
K6_SUPABASE_ANON_KEY=<anon-key> \
K6_TRIP_ID=<a real ACTIVE trip id> \
K6_ORIGIN_STOP_ID=<a real stop id on that trip, not yet departed> \
K6_DEST_STOP_ID=<a different real stop id further down the route> \
k6 run --vus 2 --iterations 2 k6/ticket-purchase-burst.js
```

Only after that passes cleanly should VUs/iterations/duration be scaled up
toward the real scenario numbers described in each script's header comment.

## Scenarios & pass/fail thresholds

| Script | Proves | Threshold |
|---|---|---|
| `ticket-purchase-burst.js` | Exactly `capacity` tickets succeed for a near-full trip; the rest get `BUS_FULL`. **Zero oversell is a hard pass/fail, not a percentile.** | `oversell_count == 0` (custom metric); p95 RPC latency < 300ms |
| `duplicate-validation-race.js` | Firing the same QR at `validate_ticket` from concurrent connections lets exactly one succeed. | `double_validation_count == 0` (hard fail if nonzero) |
| `sustained-read-load.js` | Baseline capacity/latency for `find_nearest_stop`/`list_eligible_buses`/`stops_public` reads. Pass `K6_DURATION=45m K6_VUS=50` for the Scenario 5 soak variant. | p95 < 300ms, error rate < 0.1%, no degradation over the run (check the trend, not just the final aggregate) |
| `realtime-harness/gps-fanout.js` | Broadcast delivery latency/loss as subscriber count scales (100/500/1000). | Documented in the script's own summary output — no hard threshold yet (first run establishes the baseline) |

## Running

```bash
# HTTP/RPC scenarios (k6)
k6 run k6/ticket-purchase-burst.js
k6 run k6/duplicate-validation-race.js
k6 run k6/sustained-read-load.js
K6_DURATION=45m K6_VUS=50 k6 run k6/sustained-read-load.js   # soak variant

# Realtime fan-out (Node)
cd realtime-harness
node gps-fanout.js --subscribers=100
node gps-fanout.js --subscribers=500
node gps-fanout.js --subscribers=1000
```

## Cleanup after a real (non-smoke) run

Ticket-purchase-burst and duplicate-validation-race create real anonymous
auth users and tickets. The migration-017 cleanup job will eventually sweep
the anonymous users (they'll have no `PAID`/`VALIDATED` tickets after the
test trip cycles, once tickets expire) — but if you need it gone
immediately for a clean admin dashboard, either wait for the 48h abandoned-
session window or manually run
`select cleanup_stale_anonymous_users(p_dry_run => false);` (see README §21
in the repo root for the caution that applies to running that for real).
