# Nigalthisai (நிகழ்த்திசை) - Smart Bus Transit Ecosystem

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.1-ef4444.svg)](https://turbo.build/repo)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20PostGIS-3ecf8e.svg)](https://supabase.com/)

A full-stack, state-wide intelligent transit monorepo containing three independent Progressive Web Applications (Passenger, Conductor, Admin/Superadmin) powered by a unified Supabase/PostgreSQL/PostGIS backend.

---

## 1. Monorepo Applications & Packages

```text
Nigazhthisai/
├── apps/
│   ├── passenger/          # Zero-login Rider PWA (GPS auto-detection, live tracking, QR ticketing)
│   ├── conductor/          # Operational Conductor PWA (Vehicle QR verification, GPS broadcast, ticketing)
│   └── admin/              # Executive Mission Control & Superadmin (Feature toggles, fleet radar, analytics)
│
├── packages/
│   ├── shared-types/       # Canonical TypeScript domain types & DB schemas
│   ├── supabase-client/    # Typed client, RPC wrappers, and Realtime subscription helpers
│   └── ui/                 # Unified design system & Tailwind UI component library
│
└── supabase/
    ├── migrations/         # 70+ SQL migrations (Schema, PostGIS spatial queries, RLS, RPCs)
    └── functions/          # Secure Edge Functions (conductor provisioning, HMAC signing)
```

---

## 2. Key Documentation

- **[HANDOVER.md](./HANDOVER.md)**: **The Definitive Handover & Ownership Transfer Manual** (Architecture, data flow, invariants, database schema, and operational checklist).
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Technical deep-dive on PostGIS spatial queries, Realtime subscriptions, and security model.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)**: Production deployment instructions for Vercel, Netlify, and Supabase.
- **[USER_GUIDE.md](./USER_GUIDE.md)**: End-to-end operational user manual for Passengers, Conductors, and District Admins.

---

## 3. Core Principles & Architecture

1. **100% Softcoded / Zero Mock Data**: No hardcoded bus numbers, fake station departures, or static lists. All metrics, routes, and trips are computed directly from the PostgreSQL database.
2. **Conductor-Scanned Active Buses Only**: A trip only appears as live active to passengers once an authenticated conductor scans the bus QR code via the conductor app (`start_trip` RPC). Unassigned or unscanned trips are never shown as active.
3. **High-Precision PostGIS Geolocation**: Spatial distance calculations using `find_nearest_stop` RPC accurately identify nearest transit hubs and corridor stops.
4. **Role-Based Security & RLS**: Strict Row-Level Security on every database table, separating anonymous riders, verified conductors, regional admins, and the Superadmin.

---

## 4. Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- A Supabase project with PostGIS enabled

### Installation
```bash
# 1. Clone repository
git clone https://github.com/Praveenkumaran-MK/Nigazhthisai.git
cd Nigazhthisai

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
```

Ensure `.env` contains your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Running Locally
```bash
# Run all applications concurrently
npm run dev

# Or run individual apps:
npm run dev:passenger   # http://localhost:5173
npm run dev:conductor   # http://localhost:5174
npm run dev:admin       # http://localhost:5175
```

### Quality Checks & Build
```bash
# Run TypeScript typechecks across all 6 packages
npm run typecheck

# Run unit and integration tests
npm run test

# Compile production bundles
npm run build
```

---

## 5. License & Handover

This codebase is licensed under the MIT License. Ownership and maintenance rights transferred September 2026.
