# Current Implementation — Workflow Report

A step-by-step account of what actually happens in the running system today,
for manual cross-check against requirements. Every step below reflects the
**current code** (verified by re-reading the actual files while writing
this, not from memory) — file paths and RPC/table names are exact, so you
can jump straight to the source for anything you want to verify further.

Legend: 🖱️ = user action · → = client call · 🗄️ = database/RPC effect · 👁️ = what you should see

---

## 1. Passenger Workflow

### 1.1 Session start (zero-login)
- App loads → `usePassengerSession` (`apps/passenger/src/hooks/usePassengerSession.ts`) calls `ensurePassengerSession()`, which calls Supabase `auth.signInAnonymously()`.
- 🗄️ Creates a real `auth.users` row (`is_anonymous = true`) and a `profiles` row (role defaults to `passenger`, via the `on_auth_user_created` trigger).
- 👁️ No login screen is ever shown. If this fails (e.g. anonymous sign-in disabled at the project level — see README §21), the app shows a full-screen "Could not connect" error with Retry, not a broken blank page.

### 1.2 Home / search (`HomePage.tsx`)
- 🖱️ On load: browser geolocation is requested (`useGeolocation`). If granted, coordinates go to `useNearestStop` → **`find_nearest_stop` RPC** (PostGIS `<->` KNN query against `stops`).
  - 👁️ A green "Nearest stop: X — Nm away" banner appears. If denied/unavailable/timed out, an amber "Location unavailable — select manually" banner appears instead. Either way the form below is always usable.
- 🖱️ Passenger selects **Route** → fetches `getRouteWithStops` (reads `route_stops` joined to `stops_public`, ordered by `sequence_order`).
  - If the geolocated nearest stop belongs to this route **and** the passenger hasn't manually picked an origin yet, **From** is pre-filled.
- 🖱️ Passenger selects **From** / **To** (must differ) → **Search Buses** button enables → navigates to `/search?routeId=&originStopId=&destStopId=`.

### 1.3 Search results (`SearchResultsPage.tsx`)
- On load: **`list_eligible_buses` RPC** (`p_route_id`, `p_origin_stop_id`).
  - 🗄️ Server-side eligibility rule (not lat/lng-based): a trip qualifies only if `status = 'ACTIVE'` **and** the origin stop's `trip_stops.status` is still `UPCOMING` or `ARRIVED` — i.e. the bus has not yet departed that stop. A bus that's already passed your stop is excluded, full stop.
- In parallel: `getFare()` reads `fare_matrix` for the exact origin/dest pair; stop names fetched from `stops_public` for the route-visualization header.
- 👁️ Header shows a dotted origin→bus-icon→destination strip with the fare. Below, one card per eligible bus: bus number, AC/Non-AC badge, "Currently near: `<current_stop_name>`", fare, live seat count (`capacity − current_passenger_count` from `trip_occupancy`), **Track live** and **Buy ticket** buttons. **Buy ticket** is disabled if `fare === null` (no fare row configured) or seats are full.

### 1.4 Live tracking (`LiveMapPage.tsx`, via "Track live")
- Subscribes to Supabase **Broadcast** on channel `room:route_<routeId>` (GPS, not Postgres — see §19 realtime architecture) via `useRealtimeBusTracking`.
- 👁️ Leaflet map with the route polyline, stop markers, and the bus marker **lerp-animated** between broadcast points (not teleporting) over ~2.5s. A "Waiting for live GPS…" badge shows until the first point arrives; a "Signal delayed" badge shows if telemetry goes stale (>15s).
- A floating bottom sheet shows the bus number/type, live/connecting status, "Currently near `<stop>`", and (tap to expand) the **full ordered stop list** with colored progress dots: filled+ring teal = current stop, solid gray = departed (struck through), outline = upcoming.
- Nothing here requires a ticket — this is public information, viewable by any passenger for any active bus on the route.

### 1.5 Checkout (`CheckoutPage.tsx`, via "Buy ticket")
- 🖱️ Passenger sets passenger count (1–6), sees `transport_authority_config.upi_id` (display-only) and the total.
- 🖱️ **Pay ₹X** → `choosePaymentProvider()` (mock, no real money moves) → on mock success, calls **`create_secure_ticket` RPC** (`p_trip_id, p_origin_stop_id, p_dest_stop_id, p_passenger_count`) — **no fare, status, or UPI value is ever sent by the client.**
- 🗄️ Server-side, in one transaction: verifies an anonymous session exists → checks `is_payments_enabled` → locks & checks the origin `trip_stops` row is still `UPCOMING`/`ARRIVED` (re-validates eligibility, closing a purchase-vs-departure race) → locks & checks the trip is `ACTIVE` → looks up the *authoritative* fare from `fare_matrix` → locks `trip_occupancy` and rejects with `BUS_FULL` if the seats aren't there → generates a random 24-byte QR payload + HMAC-SHA256 signature (secret never leaves the DB) → inserts the ticket as `PAID`, `expires_at = now() + 4h`.
- 👁️ On success, navigates to `/ticket/:id`. On failure (rate-limited, bus full, trip no longer active, config still loading), a specific error message is shown — the Pay button itself is disabled until the payment config has actually loaded, so a fast click can't produce a misleading "unavailable" error.

### 1.6 Ticket screen (`TicketPage.tsx`)
- 👁️ Green LCD-style **live countdown** ("Ticket valid till MM:SS" / "HH:MM:SS") ticking down to `expires_at`, only shown while the ticket is `PAID`/`VALIDATED`.
- Below it, a **boarding-pass card**: navy header with route strip (origin/dest codes + names + dashed line + bus icon), a torn-perforation divider, then a teal body with Bus/Type/Passengers/Fare/Valid-until/Status fields and the **QR code** (`<qr_payload>.<qr_signature>` encoded together — see §1.7 below for why).
- Subscribes to **Postgres Changes** on `tickets` (`UPDATE`, filtered to this ticket id) — so when the conductor validates or a stop departure expires it, the badge/status flips live with no refresh.
- If the ticket is active and the passenger's live GPS comes within 100m of the destination stop, `useGeofenceAlighting` fires a browser notification ("Have you alighted?") — polled, not `watchPosition`, to limit battery drain; never repeats once fired.

### 1.7 Conductor validates the ticket (cross-reference — full detail in §2.6)
- 🗄️ **`validate_ticket` RPC**: the scanned QR string is split into payload/signature; the row is looked up **by payload**, then the **scanned signature** (from the physical QR, not re-read from the same DB row) must match what's stored — this is what makes the check non-tautological. Row-locked (`FOR UPDATE`) so two simultaneous scans of the same ticket can't both succeed. On success: `status → VALIDATED`, `trip_occupancy.current_passenger_count` increments atomically.
- 👁️ Passenger's ticket screen updates to `VALIDATED` live (via the subscription above) with a green "Ticket validated — enjoy your ride!" banner.

### 1.8 Stop departure expires the ticket (cross-reference — full detail in §2.7)
- When the conductor departs the ticket's **destination** stop, `depart_stop_and_expire_tickets` flips any `PAID`/`VALIDATED` ticket for that stop to `EXPIRED` and decrements occupancy for ones that were `VALIDATED`.
- 👁️ Passenger's ticket screen updates live to `EXPIRED` with an info banner ("Trip complete — thanks for riding with us").

### 1.9 My Tickets (`MyTicketsPage.tsx`, bottom nav)
- Plain `select * from tickets` — no manual filtering needed, since RLS (`tickets_owner_read`) already scopes every read to `passenger_session_id = auth.uid()`.
- 👁️ List of every ticket this **browser** has ever bought (tied to the anonymous session in local storage, not an account — closing/clearing the browser loses access to old tickets, which is inherent to the zero-login design, not a bug). Tapping a row opens that ticket's boarding pass.

---

## 2. Conductor Workflow

### 2.1 Provisioning (happens once, from Admin — see §3.5)
- A conductor cannot self-register. Admin creates the login; the conductor receives a synthetic email (`<govt-id>@conductor.internal`) and a one-time temporary password out of band.

### 2.2 Login (`LoginPage.tsx`)
- 🖱️ Government ID + password → `signInConductor()` → Supabase password grant against the synthetic email.
- On success, navigation to `/dashboard` happens only once `useConductorAuth`'s `status` has **settled** to `signed-in` or `unlinked` (not immediately after the sign-in promise resolves) — this avoids a race where an unsettled auth state bounces the user straight back to `/login` after a genuinely successful login.
- 👁️ If the account exists in Supabase Auth but isn't linked to a `conductors` row (`conductors.user_id`), an explicit "not linked — contact your admin" state is shown rather than a silent infinite spinner.

### 2.3 Dashboard (`DashboardPage.tsx`)
- Looks up today's trip for this conductor (`service_date = current_date`, `conductor_id = <mine>`).
- 👁️ "Continue trip" (if `SCHEDULED`/`ACTIVE`) or "No trip scheduled today" if none exists — trips only exist once an admin has confirmed a schedule (see §3.6).

### 2.4 Start service (`TripPage.tsx`, "Start service" button — only shown while `SCHEDULED`)
- 🖱️ Click → **immediately, fire-and-forget**: `navigator.wakeLock.request('screen')` (failure here is caught internally and never blocks GPS — that guarantee is enforced by the call site, not just the hook). In parallel, calls **`start_trip` RPC**.
- 🗄️ `start_trip`: verifies the caller is this trip's conductor, sets `status → ACTIVE`, `started_at = now()`, `current_stop_id` = the route's first stop, and seeds a `trip_occupancy` row (`0 / capacity`).
- Once `status = ACTIVE`, `useGpsTelemetry` activates: `navigator.geolocation.watchPosition` (high accuracy) → throttled **Broadcast** on `room:route_<routeId>` every 3–5s (skips points that haven't moved ≥3m unless a heartbeat is due) + **Presence** tracking (keyed by conductor id, only after the channel reaches `SUBSCRIBED` — not fired blind immediately after `.subscribe()`).
- 👁️ Badge flips to `ACTIVE`; a GPS status line shows `watching` / `denied` / `error` accurately (this used to be unable to ever show `denied` — now fixed and verified live).

### 2.5 Trip in progress — occupancy & stop list
- 👁️ **Occupancy card**: `current_passenger_count / capacity`, live via Postgres Changes on `trip_occupancy`.
- 👁️ **Upcoming stops list**: every stop on the trip with its `trip_stops.status` badge (`UPCOMING`/`ARRIVED`/`DEPARTED`).

### 2.6 🎯 Clicking "Departed" — the exact flow you asked about
This is the sequence from tap to full effect, matching `apps/conductor/src/pages/TripPage.tsx` and `depart_stop_and_expire_tickets` (migration `20260101000013_stop_progression_guard.sql`):

1. **Button visibility**: the "Departed" button renders **only** on the stop where `stop_id === trip.current_stop_id` **and** `status !== 'DEPARTED'` **and** the trip is `ACTIVE`. It does not appear on any other stop — a mis-tap on a later stop is structurally impossible from the UI.
2. 🖱️ Tap → `handleDepart(stopId)` → sets a per-button loading spinner → calls **`departStopAndExpireTickets(supabase, tripId, stopId)`** → **`depart_stop_and_expire_tickets` RPC**.
3. 🗄️ Server, in one transaction:
   a. Confirms the caller is this trip's assigned conductor (`is_conductor_for_trip`).
   b. **Re-checks server-side** that `stopId` really is `trips.current_stop_id` — rejects with `NOT_CURRENT_STOP` otherwise (defense in depth behind the UI-level guard in step 1).
   c. `UPDATE trip_stops SET status='DEPARTED', departure_time=now() WHERE ... AND status IN ('UPCOMING','ARRIVED')` — rejects with `INVALID_STOP_TRANSITION` if it was already departed.
   d. Finds the **next** stop by lowest `sequence_order` greater than the one just departed (gap-tolerant — doesn't assume exact `+1`, so a route with a removed/reordered stop can't accidentally short-circuit).
   e. `UPDATE trips SET current_stop_id = <next stop, or stays put if none>`.
   f. Sums `passenger_count` for every ticket with `dest_stop_id = <this stop>` and `status = 'VALIDATED'` (i.e. people who actually boarded and are getting off here).
   g. `UPDATE tickets SET status='EXPIRED' WHERE dest_stop_id=<this stop> AND status IN ('PAID','VALIDATED')` — this also expires tickets for passengers who **never boarded** (still `PAID`), not just validated ones.
   h. Decrements `trip_occupancy.current_passenger_count` by the sum from (f) — floored at 0.
   i. **If there was no next stop** (this was the last stop on the route): `trips.status → COMPLETED`, `ended_at = now()`.
4. Client: on RPC success, shows a toast ("Stop marked as departed") and **explicitly reloads** trip state (doesn't rely solely on the realtime subscription, though that also fires — see next point).
5. **Realtime fan-out**: the `trips`, `trip_stops`, and `trip_occupancy` tables are all in the `supabase_realtime` publication (migration 011), and `TripPage` subscribes to all three — so if the trip just completed, the conductor's own screen (and any other tab watching this trip) updates within moments, GPS broadcasting stops (the `useGpsTelemetry` hook is `enabled: trip.status === 'ACTIVE'`), and the Depart button disappears everywhere since there's no more `ACTIVE` trip to show it on.
6. Every affected passenger's `TicketPage` (subscribed per-ticket, see §1.6) flips to `EXPIRED` live, at the same moment.

### 2.7 QR Scanner (`ScannerPage.tsx` / `useCameraScanner.ts`, "Scan tickets")
1. On mount, requests camera (`facingMode: environment`). Prefers the native `BarcodeDetector` API; falls back to `@zxing/library` on browsers without it (Safari/Firefox).
2. Each decoded frame calls a **ref-held** result handler (not a stale closure) — this was previously a real bug where the scanner would re-fire the same decode ~50×/sec and show a false "already validated" rejection; now a single scan produces a single result, gated by an in-flight/cooldown guard.
3. 🖱️ Valid QR detected → **`validate_ticket` RPC** (`p_qr_payload` = the raw scanned string `<payload>.<signature>`, `p_trip_id`).
4. 🗄️ Server: confirms caller is this trip's conductor → rate-limit check (60 scans/min/conductor, a safety net not a normal-use limit) → splits payload/signature → row-locks the ticket by payload → **checks the scanned signature against the stored one** (non-tautological, see §1.7) → re-derives from the server-held HMAC secret as a second integrity check → confirms `trip_id` matches → rejects `ALREADY_VALIDATED` / `TICKET_EXPIRED` / `TICKET_CANCELLED` / `TICKET_NOT_PAID` as appropriate → on success, `status → VALIDATED`, `validated_at = now()`, and atomically upserts `trip_occupancy` (+`passenger_count`).
5. 👁️ Green "Ticket accepted — N passenger(s)" or red "Ticket rejected — `<reason>`" banner. Camera keeps running for the next scan (1.5s cooldown between attempts).

### 2.8 Pocket Mode
- 🖱️ Toggle → UI collapses to a pure `#000000` screen (true OLED black, not just dark gray — a deliberate battery-life choice) showing only a tracking-status dot and the SOS control. GPS broadcasting, Presence, and the underlying trip state are **unaffected** — only rendering changes.
- **Documented limitation**: no web/PWA API can guarantee JS keeps running if the OS locks the screen or backgrounds the tab. Pocket Mode maximizes reliability while the screen stays on; it does not claim more than that.

### 2.9 SOS (long-press, available on both the normal trip screen and Pocket Mode)
- 🖱️ Press-and-hold (not a single tap, to prevent accidental triggers) → on release past the hold threshold, inserts directly into `alerts` (`severity='SOS'`, `status='ACTIVE'`) with the conductor's **last known GPS coordinates** — RLS (`alerts_conductor_insert`) restricts this insert to the conductor's own `conductor_id` and current trip.
- 👁️ Toast confirms "SOS sent — Admin has been alerted." The alert appears on Admin's SOS Command Center within moments (Postgres Changes on `alerts`, in the realtime publication since migration 011).

---

## 3. Admin Workflow

### 3.1 Login (`LoginPage.tsx`)
- Standard Supabase email/password. Same settled-status navigation pattern as Conductor login (§2.2) — fixes the same class of race.
- Route protection is **UX-only** at the frontend (`ProtectedRoute`); the real boundary is Postgres RLS via `is_admin()` on every table/RPC — a non-admin authenticated user hitting the API directly gets nothing regardless of what the frontend renders.

### 3.2 Dashboard
- Five live stat cards (Stops/Routes/Buses/Trips in service/Open alerts), each a direct `count`-only query — no fabricated numbers.

### 3.3 CRUD pages (Stops / Routes / Fares / Buses) — one generic pattern
All four (and the pieces of Conductors/Schedules that are plain CRUD) share `ResourceCrudPage` + `useCrudResource`:
- 🖱️ **Add/Edit** opens a form dialog → on submit, a plain `insert`/`update` against the table (RLS: `is_admin()`-gated write policies — every one of these tables denies write to `anon`/`authenticated` non-admins at the database level, not just by hiding the button).
- 🖱️ **Delete** → confirmation dialog → delete.
- Stops specifically: reads from **`stops_public`** (a view decoding the PostGIS `geography` column into plain `{latitude, longitude}` JSON — the raw `stops` table's geometry comes back from PostgREST as unusable WKB hex) but **writes** to the base `stops` table using WKT (`SRID=4326;POINT(lon lat)`), since geography columns need WKT on insert, not JSON.

### 3.4 Route Stops (ordering)
- Reordering (↑/↓), adding, and removing a stop on a route all go through **dedicated RPCs** (`reorder_route_stop`, `add_route_stop`, `remove_route_stop` — migration 012), not raw client-side updates. This exists because the naive two-step "swap sequence_order" approach collided with a unique constraint every time; the RPCs use a deferrable constraint + server-computed ordering instead.

### 3.5 Conductors — "Add conductor"
1. 🖱️ Fill Government ID / Display name / Phone → Create.
2. Client inserts the `conductors` row first (`user_id` still null).
3. Calls the **`provision-conductor` Edge Function** (service-role key lives only there, never in any browser bundle) with a random 12-char temp password → it verifies the caller is really an admin (via the caller's own JWT, before touching anything service-role) → rate-limits to 20 provisions/admin/hour → creates a real Supabase Auth user at `<govt-id>@conductor.internal`.
4. Client calls **`link_conductor_account` RPC** to attach the new `user_id` to the `conductors` row and flips `profiles.role → conductor`.
5. 👁️ A one-time credentials panel shows the synthetic email + temp password to hand to the conductor. If any step after (2) fails, the `conductors` row is deleted again automatically (compensating cleanup) so retry doesn't hit a duplicate-government-ID error.
6. Table shows a **Linked/Not linked** badge per conductor — "Not linked" means step 3/4 never completed for that row.

### 3.6 Schedules → real trips
1. 🖱️ **New schedule** → pick Route, Bus, Duration, then **In 1 hour** / **Tomorrow, same time** / **Later…** (which opens a dedicated calendar/date-time picker immediately, never silently closing the wizard). Saved as `schedules` row, `status='PLANNED'`. Overlapping windows for the same bus are rejected client-side before saving.
2. **Nothing runs automatically from a PLANNED schedule.** 🖱️ Admin must click **Confirm & assign conductor** → pick an active conductor → **Create trip** → **`confirm_schedule_and_create_trip` RPC**.
3. 🗄️ Server: validates the schedule is still `PLANNED`, validates the conductor is active, inserts a real `trips` row (`SCHEDULED`), copies the route's ordered `route_stops` into `trip_stops`, flips the schedule to `CONFIRMED`.
4. 👁️ The assigned conductor sees this trip on their Dashboard (§2.3) — this is the only path by which a trip (other than the seeded demo ones) comes into existence.

### 3.7 CSV Import
- 🖱️ Drag/drop or browse a CSV for Stops / Routes / Fares → parsed client-side (PapaParse) → validated (required columns, non-empty/numeric/range checks — a whitespace-only or out-of-range latitude is now rejected, not silently coerced to `0`) → **preview** shows total/valid/invalid counts with per-row error detail → 🖱️ **Import N rows** → batched inserts (200/batch).
- Fares CSV references stops/routes **by code/number**, resolved to UUIDs server-side at import time; unresolvable rows are reported, not silently dropped.

### 3.8 Live Fleet (`FleetPage.tsx`)
- Subscribes to **Presence** (not historical telemetry — Presence is "who's online right now") on every route's channel simultaneously, keyed by conductor id.
- 👁️ Map with a marker per currently-broadcasting bus + a live sidebar list (bus number, route, conductor, last-seen). A bus that stops broadcasting (trip ended, or app closed) drops off within moments as its presence expires.

### 3.9 SOS Command Center (`AlertsPage.tsx`)
1. Initial load: `listActiveAlerts()`. Then subscribes to **Postgres Changes** on `alerts`.
2. On a new `INSERT` (e.g. a conductor's SOS): deduped against the initial fetch by id → prepended to the list → the panel flashes → if audio was armed (a required one-time "Enable alarm sound" click, since browsers block unprompted audio) and severity is `SOS`, an alarm tone plays via `AudioContext`.
3. 👁️ Each alert card: severity badge, message, bus + conductor, timestamp, and (if geo-tagged) a pin on the map. 🖱️ **Acknowledge** (status → `ACKNOWLEDGED`) and/or **Resolve** (status → `RESOLVED`, removed from the active list).

---

## 4. Cross-Cutting Notes Worth Checking Against Requirements

- **Realtime split**: GPS never touches Postgres (Broadcast only); ticket/trip/occupancy/alert state changes go through Postgres Changes; online/offline status goes through Presence. All three mechanisms require the relevant tables to be in the `supabase_realtime` publication (migration 011) — if you ever add a new realtime-consumed table, it must be added there too, or the subscription silently never fires.
- **Rate limits currently active** (README §21): 10 ticket purchases/5min/passenger, 60 scans/min/conductor, 20 conductor-provisions/hour/admin, 60 stop/bus searches/min/session.
- **Known, documented gaps** (not hidden, see README's Final Audit and the scaling plan): no real payment gateway (mock only, by design), no background Web Push (foreground notifications only), PWA icons are SVG source only (PNGs need generating before app-store-style install polish), multi-tenant/multi-district support is deferred, full-scale load testing needs a dedicated staging project (smoke-tested against the live project so far, not soak-tested).

## 5. Suggested Manual Test Order

1. Admin: log in, confirm dashboard counts match seed data.
2. Admin: create a Stop, a Route, add that stop to it, set a Fare, create a Bus.
3. Admin: create a Schedule for that bus, confirm it with a conductor → verify a trip appears.
4. Conductor: log in, see the new trip, Start service.
5. Passenger: search that route/origin/destination, confirm the bus appears, Track live (confirm marker moves once conductor's GPS is granted), Buy ticket.
6. Conductor: Scan tickets, scan the passenger's QR → confirm occupancy increments and the passenger's ticket flips to VALIDATED live.
7. Conductor: click Departed on the ticket's destination stop → confirm the ticket flips to EXPIRED live on the passenger's screen, and occupancy decrements.
8. Conductor: long-press SOS → confirm it appears instantly on Admin's SOS Command Center.
9. Admin: Acknowledge then Resolve the alert.
