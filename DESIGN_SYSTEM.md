# Design System — Transit Suite

Shared visual language for the Passenger, Conductor, and Admin PWAs. Every
token and component below lives in `packages/ui` and is consumed by all
three apps, so a change here propagates everywhere.

---

## 1. Tokens

Defined once in [`packages/ui/tailwind-preset.cjs`](packages/ui/tailwind-preset.cjs);
each app's `tailwind.config.ts` extends it via `presets: [...]`.

| Role | Token | Hex |
|---|---|---|
| Primary (structure, headers, CTA ground) | `navy-600` | `#0D2A5D` |
| Accent (active state, indicators, progress) | `brand-500` | `#D97F00` |
| **Amber for text on light surfaces** | `brand-ink` | `#8F5000` |
| Dark surface | `surface-dark` | `#0A1F45` |
| Deep surface | `surface-deep` | `#071735` |
| Light canvas | `canvas-light` | `#F8FAFC` |
| Dark canvas | `canvas-dark` | `#050E1F` |
| **OLED canvas (Conductor only)** | `canvas-oled` | `#000000` |
| Muted text | `slate-500` / `slate-400` | `#64748B` / `#94A3B8` |

### The two ambers — read this before using `brand-500` on text

| Pair | Ratio | Verdict |
|---|---|---|
| `#D97F00` on white | **2.99:1** | ✗ fails AA for text |
| white on `#D97F00` | **2.99:1** | ✗ fails AA for text |
| `navy-900` on `#D97F00` | **6.3:1** | ✓ AA, near-AAA |
| `#D97F00` on `navy-600` | 4.7:1 | ✓ AA |
| `brand-ink` on white | 6.5:1 | ✓ AA |
| white on `navy-600` | 14:1 | ✓ AAA |

`brand-500` is for **non-text** use on light surfaces — fills, icons,
borders, progress bars, focus rings, large display type — where WCAG's 3:1
threshold for UI components and graphical objects applies. For amber body
text on a light background use **`brand-ink`**. Amber-filled buttons and
active nav pills use **`text-navy-900`**, never white.

> Full AAA (7:1) is not reachable for small text on `#D97F00` in any
> combination. The palette is AAA on its navy/white pairings and AA on its
> amber pairings; that's the honest ceiling for this accent color.

### `canvas-oled` is not a style choice

The Conductor app sets `bg-canvas-oled` (true `#000000`) rather than
`canvas-dark`, because it runs for a full shift on a phone and OLED black
draws measurably less power — the same reason Pocket Mode is pure black.
Passenger and Admin use the softer `canvas-dark`.

---

## 2. Branding

### `BrandLogo`
[`packages/ui/src/components/BrandLogo.tsx`](packages/ui/src/components/BrandLogo.tsx)

```tsx
<BrandLogo />                                   // mark, navy
<BrandLogo variant="lockup" tone="light" />     // mark + wordmark, for navy surfaces
<BrandLogo variant="lockup-stacked" />          // splash/hero
```

⚠️ **The SVG in this file is a hand-built geometric reconstruction of the
supplied raster logo, not the brand master.** To install the real artwork,
replace the `<path>` geometry inside `LogoMark` (keep the `0 0 64 64`
viewBox) — `AppHeader`, `LogoLoader`, favicons, and app icons all derive
from it, so that one file is the only edit needed.

### `AppHeader`
[`packages/ui/src/components/AppHeader.tsx`](packages/ui/src/components/AppHeader.tsx)

One header for all three apps. Variants: `navy` (gradient + dot texture),
`glass`, `plain`. Slots: `leading`, `title`, `subtitle`, `actions`, and
`children` for content below the header row (search fields, route strips,
progress).

Responsive behavior is handled inside the component so branding stays
consistent: the mark steps 28px → 36px at `sm`, and in lockup mode the
wordmark is suppressed below `sm` so long titles can't collide with the
actions slot on a 360px screen.

---

## 3. Motion components

All motion is `transform`/`opacity` only (GPU-composited, no layout
thrash), uses `cubic-bezier(0.4, 0, 0.2, 1)`, and is disabled under
`prefers-reduced-motion` — see the media query at the bottom of
[`packages/ui/src/styles.css`](packages/ui/src/styles.css).

### `LogoLoader`
Replaces generic spinners. The logo skeleton draws itself via
`stroke-dashoffset` while the amber pin pulses.

```tsx
<LogoLoader size="lg" label="Loading route…" tone="light" />
```

Two implementation notes: the mark is *fill*-based and fills can't be
stroke-drawn, so the loader traces a separate single-stroke skeleton of the
same geometry — if you replace the logo, update that path too. And the path
carries `pathLength={1}`, so the dash animation is length-independent and
needs no JS measurement.

`LoadingState` already uses it, which rebrands most loading surfaces across
all three apps automatically.

### `TransitBusRunner`
A bus travelling a road, driven by real progress.

```tsx
<TransitBusRunner
  label="Route progress"
  progress={42}
  stops={[{ label: "Big Temple", atPercent: 33, done: true }]}
/>
<TransitBusRunner indeterminate />   // screen transitions
```

The amber fill uses `scaleX` from a left origin; the bus rides the right
edge of a full-width layer translated by `progress - 100`%. Because that
layer is exactly the track's width, a percentage translate resolves to a
percentage of the track — so the bus lands precisely on target without ever
animating `left`/`width`.

**In the apps it is driven by real data, never decoration**: on the
passenger live map and the conductor trip screen, progress comes from
`trip_stops` ordering — the same source the bus-eligibility rules use, so
the bar can never disagree with the stop list beside it.

### Hero scenes
`CommuterHero` (Passenger home), `ConductorHero` (Conductor trip screen),
`FleetCommandHero` (Admin dashboard) — in
[`packages/ui/src/components/HeroScenes.tsx`](packages/ui/src/components/HeroScenes.tsx).

**These are isometric SVG + CSS 3D, not WebGL.** That was deliberate:
Three.js/Spline adds ~600KB per bundle, and running a GL context on the
Conductor trip screen works directly against that app's battery
requirement. These render instantly, work offline, and cost nothing.

If you want real 3D later, `IsoStage` takes an `overlay` slot — mount a
`<Spline scene=… />` or Three.js canvas there and the SVG beneath becomes
the loading / no-WebGL fallback automatically, with no call-site changes:

```tsx
<CommuterHero overlay={<Spline scene="https://…" />} />
```

---

## 4. Where each piece is used

| Surface | Components |
|---|---|
| Passenger home | `AppHeader` (navy, wordmark) + `CommuterHero` |
| Passenger search | `AppHeader` + `RouteVisualization` on a `glass-surface` panel |
| Passenger live map | `AppHeader` + `TransitBusRunner` (real stop progression) |
| Passenger ticket | `BoardingPassCard` + `TicketCountdown` |
| Conductor login | `BrandLogo` lockup on OLED black |
| Conductor trip | `AppHeader` (sticky) + `TransitBusRunner` + `ConductorHero` (pre-service) |
| Admin sidebar | `BrandLogo` lockup on `navy-depth`; active item = amber pill, navy text |
| Admin dashboard | `FleetCommandHero` with live fleet counts |
| All loading states | `LogoLoader` via `LoadingState` |

---

## 5. Verification

Every screen above was rendered in a real browser at 375px (phone) and
1280px (desktop) and checked for horizontal overflow and console errors —
all clean. `npm run typecheck` and `npm run test` pass.

Reproduce with the audit script in the session scratchpad, or manually:
```bash
npm run dev   # 5173 passenger · 5174 conductor · 5175 admin
```

### Known gaps
- **PNG app icons** still need generating from the SVG sources
  (`apps/*/public/icons/icon.svg`) for iOS install polish — see README §13.
- The logo is a reconstruction until the real vector is dropped in (§2).
