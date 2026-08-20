# Smart Bus Transit Ecosystem — Architecture (Phase 1)

## Repository Tree (target — filled in incrementally across phases)

```text
smart-bus-transit/
├── apps/
│   ├── passenger/            # Zero-login rider PWA (Vite + React)
│   ├── conductor/             # Conductor operations PWA (Vite + React)
│   └── admin/                 # District admin back-office PWA (Vite + React)
├── packages/
│   ├── shared-types/           # Domain types, DB row types, RPC payload types
│   ├── ui/                    # Shared Tailwind component library
│   └── supabase-client/        # Centralized Supabase client + typed helpers
├── supabase/
│   ├── migrations/             # Numbered SQL migrations (schema, RLS, RPCs)
│   ├── functions/              # Edge Functions (secure ticket signing)
│   └── seed.sql                # Demo transit data
├── package.json
├── turbo.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

## Data Flow

```text
Passenger PWA ──(anon)──► Supabase (PostgREST + RPC) ──► PostGIS / tables
Conductor PWA ──(authed)─► Supabase Auth, Broadcast, Presence, RPC, Postgres Changes
Admin PWA ─────(authed)──► Supabase Auth, RPC, Postgres Changes, Storage(optional)
```

GPS telemetry never touches PostgreSQL directly — it flows conductor device →
Broadcast channel `room:route_<route_id>` → subscribed Passenger/Admin clients.
Persistent state (tickets, trips, occupancy, alerts) flows through RPCs backed
by PostgreSQL transactions and is fanned out to clients via Postgres Changes.

## Realtime Architecture

| Concern              | Mechanism              | Channel/table                     |
|-----------------------|------------------------|------------------------------------|
| GPS telemetry (3–5s)  | Realtime Broadcast      | `room:route_<route_id>`            |
| Conductor/bus online  | Realtime Presence       | `room:route_<route_id>` presence   |
| Ticket/trip/occupancy | Postgres Changes        | `tickets`, `trips`, `trip_occupancy` |
| Alerts / SOS          | Postgres Changes        | `alerts`                           |

## Security Model

- RLS enabled on every table. No table is left "open" by default.
- Anonymous (passenger) role: read-only on public transit reference data
  (`stops`, `routes`, `route_stops`, `fare_matrix`, `buses`, `trips` limited
  columns) and can only ever see/create tickets it holds the id/session for.
- Conductor role: authenticated Supabase user mapped 1:1 to a `conductors`
  row; RLS restricts writes to trips/tickets/alerts tied to their own
  `conductor_id` and currently active trip.
- Admin role: authenticated Supabase user with `role = 'admin'` claim
  (stored in `profiles`/JWT custom claim), full CRUD via RLS `USING (is_admin())`.
- All fare computation, ticket creation, ticket validation, occupancy
  mutation and stop-departure/ticket-expiry are implemented as
  `SECURITY DEFINER` PostgreSQL functions (RPCs) — never trusted from the
  browser. Ticket QR payloads are HMAC-signed server-side (Edge Function
  using a secret held only in Supabase function config, never in client code).
- `SUPABASE_SERVICE_ROLE_KEY` and the QR signing secret exist only in
  Supabase project config / Edge Function secrets — never in any `apps/*`
  bundle or `.env` consumed by Vite (`VITE_*` prefix only exposes the
  anon key + URL).

## Key Assumptions (documented per rule 1.1)

1. **Conductor auth** — Supabase Auth requires an email/password or OTP
   identity. Government IDs (e.g. `TN-MTC-8492`) are mapped to a synthetic
   internal email `<govt-id>@conductor.internal` + a Supabase-managed
   password issued by the admin when the conductor profile is created; this
   keeps the "log in with government ID" UX while using real Supabase Auth
   underneath. A separate **dev-only** provider (`packages/supabase-client`)
   allows local login without hitting a real mailer, gated behind
   `import.meta.env.DEV`.
2. **Payments** — a `MockPaymentProvider` simulates a Razorpay-style modal.
   `total_fare` is never trusted from the client; the `create_secure_ticket`
   RPC recomputes fare server-side from `fare_matrix` and rejects mismatches.
3. **QR signing** — implemented via an Edge Function (`supabase/functions/sign-ticket`)
   using HMAC-SHA256 with a server-side secret, since PostgreSQL cannot hold
   secrets outside the DB securely for this purpose as cleanly as an Edge
   Function/`pgsodium`. We use `pgsodium`/`pgcrypto` inside a
   `SECURITY DEFINER` RPC instead, so ticket creation is atomic — see
   Phase 3 SQL. This avoids a second network hop from RPC to Edge Function
   during the transaction.
4. **Background execution** — browsers do not guarantee JS execution while
   the screen is locked/backgrounded. Pocket Mode maximizes foreground
   reliability but cannot promise telemetry continues if the OS suspends the
   tab; this is documented in-app and in the README.
5. **BarcodeDetector** — supported in Chromium-based browsers only as of
   this writing; `@zxing/library` is used as the automatic fallback.

## Phase Tracking

- [x] Phase 1 — Architecture (this file)
- [ ] Phase 2 — Root monorepo config
- [ ] Phase 3 — Supabase (migrations, RLS, RPCs, seed)
- [ ] Phase 4 — Shared packages
- [ ] Phase 5 — Passenger PWA
- [ ] Phase 6 — Conductor PWA
- [ ] Phase 7 — Admin PWA
- [ ] Phase 8 — PWA/offline verification
- [ ] Phase 9 — Testing
- [ ] Phase 10 — Final audit
