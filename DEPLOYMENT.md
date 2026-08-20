# Deployment — Vercel & Render

## There is no separate backend to deploy

Supabase **is** the backend — Postgres/PostGIS, Auth, Realtime, and the
`provision-conductor` Edge Function are already live at your project URL,
deployed via `supabase db push` / `supabase functions deploy`, not via
Render or Vercel. Neither platform touches your database. What they host is
the **three static frontend builds** (`apps/passenger`, `apps/conductor`,
`apps/admin`) — plain HTML/CSS/JS that talks to Supabase directly from the
browser. Each is its own deployment/project; there's nothing shared to
stand up between them beyond the Supabase project both already point at.

---

## Credentials — what goes where

This is the part worth being precise about, because getting it wrong in
either direction is bad: too little and the app can't start, too much and
you leak something.

| Variable | Where it lives | Why |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel/Render env, **all 3 apps** | Frontend-safe by design — the client needs it to reach Supabase at all. |
| `VITE_SUPABASE_ANON_KEY` | Vercel/Render env, **all 3 apps** | Also frontend-safe by design. This key can only do what your RLS policies allow it to do (see `supabase/migrations/...007_rls.sql`) — it is *meant* to be public and end up in the JS bundle. It is not a secret in the way an API key normally is. |
| `VITE_MOCK_UPI_ID` | Vercel/Render env, **passenger only** | Display-only string shown in the mock checkout UI. Not sensitive. |
| `VITE_ADMIN_SUPPORT_EMAIL` | Vercel/Render env, **admin only** | Display-only. Not sensitive. |
| `VITE_MAPTILER_KEY` | Vercel/Render env, optional, any app | Only needed if you swap off the free OpenStreetMap tile server. Leave blank otherwise. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Supabase Edge Function secrets only** (`supabase secrets set`) | Full RLS-bypass privilege. Never put this in Vercel, Render, or any `VITE_`-prefixed variable — that would ship it to every visitor's browser. It's already correctly scoped to the `provision-conductor` function and nowhere else in this codebase. |
| Admin/conductor **passwords** | Nowhere in code or config | These are real Supabase Auth credentials, not build config. See the rotation note below. |

**Rule of thumb**: if a variable is prefixed `VITE_`, it is compiled directly into the public JS bundle by Vite — anyone can read it from the browser. Everything in this repo that's prefixed `VITE_` was deliberately designed to be safe under that assumption (the anon key relies on RLS, not secrecy). Anything that must stay secret (the service-role key, the ticket-signing HMAC secret) was deliberately kept *out* of the `VITE_` namespace and out of these three apps entirely.

### Before you flip this from demo to real production

- **Rotate the demo admin/conductor passwords** I generated during testing (`admin@transit.gov`, `TN-MTC-8492`) — they're sitting in your Supabase project's Auth right now and were shared in this chat. Reset them from the Supabase Dashboard → Authentication → Users, or just delete those test accounts and provision real ones from the Admin app.
- **Configure Supabase Auth rate limits** (README §21) — anonymous sign-ins per IP especially, since that's the passenger app's entire identity model.
- **Set `Site URL` and additional Redirect URLs`** in Supabase Dashboard → Authentication → URL Configuration to your real deployed domains once you have them (see below).

---

## Option A: Vercel (recommended if you want one provider for all three)

Vercel has native Turborepo detection, but to avoid depending on its
auto-detection guessing the right workspace, set each project up with
**explicit overrides** — deterministic, no magic:

For each app (repeat 3×, as **three separate Vercel projects** pointed at the same GitHub repo):

1. **New Project** → import `Praveenkumaran-MK/Nigazhthisai`.
2. **Root Directory**: leave as the repo root (`.`) — do *not* set it to `apps/passenger`, since the build needs the workspace packages (`@sbt/ui`, `@sbt/shared-types`, `@sbt/supabase-client`) resolved from the monorepo root.
3. **Framework Preset**: "Other" (so Vercel doesn't try to auto-configure).
4. **Build Command** (override):
   - Passenger: `npx turbo run build --filter=@sbt/passenger`
   - Conductor: `npx turbo run build --filter=@sbt/conductor`
   - Admin: `npx turbo run build --filter=@sbt/admin`
5. **Output Directory** (override): `apps/passenger/dist` (or `apps/conductor/dist` / `apps/admin/dist`)
6. **Install Command**: `npm install` (default is fine)
7. **Environment Variables**: add the ones from the table above for that specific app.
8. Deploy. Give the project a name like `transit-passenger` so the three don't collide (`transit-passenger.vercel.app`, etc.), or attach custom subdomains later.

The `vercel.json` at the repo root already handles SPA client-side routing (`/ticket/:id`, `/search`, etc. won't 404 on refresh) — it applies to all three projects since the rewrite destination is relative to whichever project's own output directory is being served.

---

## Option B: Render

**Fast path**: click **New +** → **Blueprint**, point it at this repo — `render.yaml` at the root provisions all three static sites in one pass with the SPA rewrite rule already configured. I wrote that file but couldn't run it against a live Render account from here to confirm the exact schema still matches Render's current Blueprint spec, so if any field gets rejected, fall back to the manual steps below (and it's worth cross-checking [render.com/docs/blueprint-spec](https://render.com/docs/blueprint-spec) if so).

**Manual path** (also what to do per-app if the Blueprint needs tweaking):

1. **New +** → **Static Site** → connect `Praveenkumaran-MK/Nigazhthisai`.
2. **Root Directory**: leave blank (repo root) — same monorepo-resolution reason as Vercel.
3. **Build Command**:
   - Passenger: `npm install && npx turbo run build --filter=@sbt/passenger`
   - Conductor: `npm install && npx turbo run build --filter=@sbt/conductor`
   - Admin: `npm install && npx turbo run build --filter=@sbt/admin`
4. **Publish Directory**: `apps/passenger/dist` (or the matching app's `dist`).
5. **Environment Variables**: same table as above, for that app.
6. **Redirects/Rewrites** tab → add a rule: Source `/*` → Destination `/index.html` → Action **Rewrite** (not Redirect). Without this, refreshing on any route other than `/` 404s — client-side routing needs every path to fall through to `index.html`.
7. Repeat for the other two apps as separate Static Sites.

---

## After all three are live

1. **Supabase → Authentication → URL Configuration**: set `Site URL` to one of your real domains and add the other two under "Redirect URLs" (matters more once you add any OAuth/magic-link flow later; harmless to set now regardless).
2. **Smoke test each app** against its real deployed URL — the checklist in `WORKFLOWS.md` §5 ("Suggested Manual Test Order") is the same 9-step flow, just pointed at production URLs instead of `localhost`.
3. **PWA install check**: open each deployed URL on a phone and confirm the install prompt appears. If it doesn't, it's almost certainly the missing PNG icons (README §13) — the repo ships SVG sources only; generate `icon-192.png`/`icon-512.png` for each app before this matters for real users.
4. Revisit `SCALING_AND_OPERATIONS_PLAN.md` before real traffic — the rate limits and anonymous-cleanup job are already live on the Supabase side, but load testing (Phase 3) was only smoke-tested against this one project, not soak-tested at production scale.
