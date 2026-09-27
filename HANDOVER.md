# Project Handover & System Architecture Documentation
**System Name:** Nigalthisai (நிகழ்த்திசை) - Smart Bus Transit Ecosystem  
**Target Audience:** New Project Owner, Lead Architects, Full-Stack Engineers & Maintainers  
**Repository Architecture:** Turborepo Monorepo (TypeScript, React 18, Vite, Tailwind CSS, Supabase / PostgreSQL / PostGIS)  
**Date of Handover:** September 2026  

---

## 1. Executive Summary & Handover Statement

This document serves as the formal architectural blueprint and operational handover manual for the **Nigalthisai** Smart Bus Transit platform.

Nigalthisai is a modern, full-stack, state-wide intelligent transit ecosystem designed and developed for public bus transportation in Tamil Nadu (covering Chennai, Coimbatore, Salem, Madurai, Tiruppur, Thanjavur, Trichy, Erode, and Krishnagiri).

The platform consists of:
1. **Passenger Web App / PWA** (`apps/passenger`): A zero-login transit application offering GPS auto-detection of nearest terminals, dynamic corridor search, conductor-verified live bus tracking, cryptographically signed QR tickets, and destination geofencing.
2. **Conductor Web App / PWA** (`apps/conductor`): A mission-critical operational tool for bus conductors featuring secure login, physical bus QR code scanning for shift initiation, high-frequency GPS telemetry broadcasting, camera-based ticket validation, cash ticket issuing, and real-time occupancy management.
3. **Admin & Superadmin Control Center** (`apps/admin`): An executive command center supporting multi-district regional administrators and a state-wide Master Admin (Superadmin). Features live feature-switch management, real-time fleet radar, demand/surge intelligence, timetable dispatches, and complete CRUD across all transit assets.
4. **Shared Monorepo Packages** (`packages/*`): Domain schemas (`shared-types`), unified UI design system (`ui`), and the centralized Supabase API and Realtime integration library (`supabase-client`).
5. **Backend Database Infrastructure** (`supabase/`): PostgreSQL with PostGIS extensions, row-level security (RLS) on all tables, and security-definer RPC stored procedures for all mission-critical operations.

---

## 2. Core Architectural Philosophy: 100% Softcoded & Zero Mocks

> [!IMPORTANT]
> **The Golden Rule for Incoming Maintainers:**
> **EVERYTHING MUST BE 100% DYNAMIC AND DATABASE-DRIVEN (SOFTCODED). NO HARDCODED OR SIMULATED DATA IS ALLOWED ANYWHERE IN THIS CODEBASE.**

1. **No Mock/Synthetic Buses**: Under no circumstances should frontend components fabricate simulated bus departures (e.g. `dep-100C`, mock ETAs, or fake seat numbers). If zero active buses exist on a corridor, the system must honestly display `0 RUNNING` and a live empty state waiting for a conductor.
2. **The Conductor Scan Invariant**: A bus trip is **ONLY** live/active when an authenticated conductor physically scans the assigned bus QR code. In the database, this sets `status = 'ACTIVE'`, `started_at = NOW()`, and `conductor_id = auth.uid()`. Any trip where `conductor_id IS NULL` is an unscanned administrative shell and is never shown to passengers.
3. **Dynamic Jurisdictions**: Districts, routes, stops, and fares must never be hardcoded into static `<select>` dropdowns or constants. They are loaded dynamically from the Supabase `districts`, `routes`, `stops`, and `fare_matrix` tables.

---

## 3. High-Level System Architecture

```mermaid
graph TD
    subgraph Client Layer (React 18 + Vite PWAs)
        P[Passenger App<br/>apps/passenger<br/>Port 5173]
        C[Conductor App<br/>apps/conductor<br/>Port 5174]
        A[Admin & Superadmin Dashboard<br/>apps/admin<br/>Port 5175]
    end

    subgraph Shared Monorepo Packages
        ST[packages/shared-types<br/>Domain Types & Contracts]
        UI[packages/ui<br/>Tailwind Design System]
        SC[packages/supabase-client<br/>Client, RPCs & Subscriptions]
    end

    subgraph Backend & Infrastructure (Supabase Platform)
        AUTH[Supabase Auth<br/>JWT & Roles: anon, conductor, admin, master_admin]
        DB[(PostgreSQL + PostGIS<br/>Spatial Queries & RLS)]
        RT[Supabase Realtime<br/>Broadcast & Postgres Changes]
        RPC[Stored Procedures<br/>start_trip, verify_bus_qr, end_trip, etc.]
    end

    P --> ST
    P --> UI
    P --> SC
    C --> ST
    C --> UI
    C --> SC
    A --> ST
    A --> UI
    A --> SC

    SC --> AUTH
    SC --> DB
    SC --> RT
    SC --> RPC
```

---

## 4. Repository Structure & Workspace Layout

```text
Nigazhthisai/
├── apps/
│   ├── passenger/                # Passenger progressive web application
│   │   ├── src/
│   │   │   ├── components/       # Passenger-specific UI (BusPipelineTracker, LangToggle, etc.)
│   │   │   ├── hooks/            # useGeolocation, useNearestStop, useEligibleBuses
│   │   │   ├── pages/            # HomePage, SearchResultsPage, LiveMapPage, CheckoutPage, TicketPage
│   │   │   └── lib/              # i18n localization, Supabase instance
│   │   └── vite.config.ts        # Configured on port 5173, PWA service worker enabled
│   │
│   ├── conductor/                # Conductor operational terminal PWA
│   │   ├── src/
│   │   │   ├── components/       # BusQrScannerModal, TicketScannerModal, EmergencySosModal
│   │   │   ├── hooks/            # useGpsWatcher, useConductorPresence, useWakeLock
│   │   │   ├── pages/            # DashboardPage, LoginPage, HistoryPage
│   │   │   └── lib/              # QR crypto, audio signals, offline cache
│   │   └── vite.config.ts        # Configured on port 5174
│   │
│   └── admin/                    # Executive Mission Control & District Admin
│       ├── src/
│       │   ├── components/       # AdminControlCenter, AppShell, CRUD generic dialogs
│       │   ├── hooks/            # useAdminAuth, useFeatureFlags, useCrudResource
│       │   ├── pages/            # DashboardPage, RoutesPage, BusesPage, TripsPage, AdminUsersPage
│       │   └── lib/              # CSV importers, i18n, Supabase instance
│       └── vite.config.ts        # Configured on port 5175
│
├── packages/
│   ├── shared-types/             # Single source of truth for TypeScript interfaces (Trip, Bus, Stop, Ticket)
│   ├── supabase-client/          # Typed functions for all Supabase tables, PostGIS RPCs, and Realtime channels
│   └── ui/                       # Shared UI design system (Button, DataTable, Modal, StatCard, Toast)
│
├── supabase/
│   ├── migrations/               # 70+ SQL migrations (Schema, PostGIS, RLS, RPCs, pg_cron)
│   └── functions/                # Edge Functions (provision-conductor, HMAC ticket signer)
│
├── turbo.json                    # Turborepo task pipeline configuration
├── package.json                  # Root monorepo workspace definition
└── .env                          # Root environment configuration (shared across all apps)
```

---

## 5. Detailed Application Breakdown

### 5.1 Passenger Application (`apps/passenger`)
- **Authentication**: Zero-login. Uses Supabase anonymous authentication (`anon` key).
- **Location Detection**: Calls browser `navigator.geolocation` and executes PostGIS RPC `find_nearest_stop(p_latitude, p_longitude, 1)`. Automatically populates origin terminal and updates district.
- **Corridor Search**: Checks both `route_stops` (fixed sequences) and `route_day_stops` (daily custom stops) to match origin and destination terminals.
- **Conductor-Verified Active Buses**: Queries `trips` table with strict filters:
  `status = 'ACTIVE' AND conductor_id IS NOT NULL AND started_at IS NOT NULL`.
- **Live Countdown**: Subscribes to Supabase Realtime changes on `trips` table + executes a 15-second polling tick to update GPS ETA countdowns in real-time.
- **Ticketing & Passes**: Generates cryptographically secure tickets stored in the `tickets` table. Includes destination geofence monitoring to notify passengers when approaching their alighting stop.

### 5.2 Conductor Application (`apps/conductor`)
- **Authentication**: Government Conductor ID / Phone + Password credentials bound to the `conductors` table.
- **Assigned Rosters**: Queries `trips` table for today's `conductor_id = auth.uid()`.
- **Shift Initiation & QR Scan**: Conductor must scan the physical vehicle QR code. App executes `verify_bus_qr` and `start_trip` RPC:
  - Verifies conductor assignment and vehicle UUID.
  - Updates `trips.status = 'ACTIVE'` and `trips.started_at = NOW()`.
  - Seeds `trip_occupancy` counter.
  - Activates continuous GPS watcher and acquires screen WakeLock.
- **Cash & Digital Ticketing**: Issues cash tickets via `create_cash_ticket` RPC and validates passenger QR codes using camera BarcodeDetector/ZXing.
- **Alighting & Stop Progression**: Conductors record stop arrivals, automatically expiring single-journey tickets whose destination has been reached via `depart_stop_and_expire_tickets` RPC.
- **Shift End**: Conductor scans bus QR and invokes `end_trip` RPC, terminating GPS broadcast, resetting vehicle availability, and marking `trips.status = 'COMPLETED'`.

### 5.3 Admin & Superadmin Dashboard (`apps/admin`)
- **Role Hierarchy**:
  - **Master Admin (Superadmin)**: State-wide command authority. Can toggle system feature switches, provision district admins, modify system settings, and inspect all districts.
  - **District Admin**: Scoped to their assigned district jurisdiction (`profiles.district_id`).
- **Admin Control Center**: Allows Master Admin to toggle accessibility of any module (Live Monitoring, Fares, Trips, etc.) for normal admins. Toggles write directly to the `system_feature_flags` table in Supabase and update route guards dynamically.
- **Live Demand & Surge Intelligence**: Powered by `compute_route_demand_analytics` RPC. Analyzes passenger boarding/alighting counts from the `tickets` table, identifies peak corridors, and calculates capacity utilization percentages.
- **Dynamic CRUD**: Standardized through `ResourceCrudPage`, supporting search, multi-district filtering, pagination, and transactional database modifications.

---

## 6. Database & Security Model (Supabase / PostgreSQL)

### 6.1 Core Database Tables
| Table | Description | Primary Key | Key Foreign Keys |
| :--- | :--- | :--- | :--- |
| `districts` | Transit regions (Chennai, Salem, Coimbatore, etc.) | `id` (UUID) | None |
| `stops` | Physical bus stops and terminals with PostGIS `location` | `id` (UUID) | `district_id` |
| `routes` | Transit route definitions | `id` (UUID) | `district_id` |
| `route_stops` | Ordered sequence of stops defining a route | `id` (UUID) | `route_id`, `stop_id` |
| `buses` | Registered transit fleet vehicles | `id` (UUID) | `district_id`, `depot_id` |
| `conductors` | Operating transit personnel | `id` (UUID) | `user_id`, `district_id` |
| `trips` | Scheduled and active journeys | `id` (UUID) | `route_id`, `bus_id`, `conductor_id` |
| `trip_stops` | Progression milestones for a specific trip | `id` (UUID) | `trip_id`, `stop_id` |
| `trip_occupancy` | Live headcount and passenger capacity | `trip_id` (UUID) | `trip_id` |
| `tickets` | Passenger travel passes and single-ride tickets | `id` (UUID) | `trip_id`, `origin_stop_id`, `dest_stop_id` |
| `alerts` | SOS emergency signals and operational alerts | `id` (UUID) | `trip_id`, `bus_id` |
| `system_feature_flags` | Superadmin dynamic module permission switches | `feature_key` (Text) | None |
| `profiles` | User metadata and role assignments (`admin`, `master_admin`) | `id` (UUID) | `auth.users.id`, `district_id` |

### 6.2 Key Stored Procedures & RPCs
- **`start_trip(p_trip_id UUID, p_bus_qr TEXT)`**: Security-definer function that verifies conductor authorization and vehicle QR, sets status to `ACTIVE`, and seeds occupancy.
- **`end_trip(p_trip_id UUID, p_bus_qr TEXT)`**: Finalizes shift, marks trip `COMPLETED`, and releases assigned bus.
- **`verify_bus_qr(p_qr_string TEXT, p_bus_id UUID)`**: Validates scanned QR payload against assigned vehicle registration.
- **`find_nearest_stop(p_latitude FLOAT, p_longitude FLOAT, p_limit INT)`**: PostGIS spatial function computing spherical distance against transit stops catalog.
- **`compute_route_demand_analytics(p_route_id UUID, p_target_date DATE)`**: Aggregates booking volume, peak stops, and utilization loads per corridor.
- **`list_eligible_buses(p_route_id UUID, p_origin_stop_id UUID)`**: Queries active buses that have not yet passed the passenger's origin stop, strictly enforcing `conductor_id IS NOT NULL`.

---

## 7. Local Development & Deployment Guide

### 7.1 Prerequisites
- **Node.js**: Version 20.x or higher
- **npm**: Version 10.x or higher
- **Supabase Account**: Accessible PostgreSQL project with PostGIS extension enabled

### 7.2 Initial Setup
```bash
# 1. Clone repository
git clone https://github.com/Praveenkumaran-MK/Nigazhthisai.git
cd Nigazhthisai

# 2. Install monorepo dependencies
npm install

# 3. Environment configuration
cp .env.example .env
```

Edit `.env` in the project root:
```env
VITE_SUPABASE_URL=https://<your-supabase-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni...
VITE_ADMIN_SUPPORT_EMAIL=admin@nigazhthisai.com
VITE_MOCK_UPI_ID=transport@tnstc
```

### 7.3 Development Commands
```bash
# Run all three apps concurrently
npm run dev

# Run individual apps
npm run dev:passenger   # http://localhost:5173
npm run dev:conductor   # http://localhost:5174
npm run dev:admin       # http://localhost:5175
```

### 7.4 Quality Assurance & Build Verification
```bash
# TypeScript compilation across all 6 packages
npm run typecheck

# Unit & integration tests
npm run test

# Production bundle compilation
npm run build
```

### 7.5 Production Deployment
The monorepo uses independent Vite build outputs:
- **Passenger PWA**: Root Directory: `apps/passenger`, Build Command: `npm run build:passenger`, Output Directory: `dist`
- **Conductor PWA**: Root Directory: `apps/conductor`, Build Command: `npm run build:conductor`, Output Directory: `dist`
- **Admin Dashboard**: Root Directory: `apps/admin`, Build Command: `npm run build:admin`, Output Directory: `dist`

Deployable directly to **Vercel**, **Netlify**, or **Cloudflare Pages**. All three apps share the single Supabase backend.

---

## 8. Handover Checklist & Verification Matrix

- [x] **Zero Mock Data**: Verified that passenger app, conductor app, and admin dashboard contain zero simulated bus generators.
- [x] **Conductor QR Scanning Enforced**: Verified that trips only transition to `ACTIVE` and display to passengers after physical QR scan.
- [x] **District Dynamic Scoping**: Verified that selecting Salem, Coimbatore, Chennai, or Thanjavur dynamically scopes all metrics, routes, and buses.
- [x] **TypeScript Compliance**: Verified that `npm run typecheck` completes with zero errors across all 6 packages.
- [x] **Automated Test Suite**: Verified that `npm run test` passes 100% of unit tests.
- [x] **Production Bundle**: Verified that `npm run build` creates optimized production bundles for all 3 applications.
- [x] **Git Repository State**: Clean working tree on branch `main`, synchronized with both `origin` and `upstream`.

---

**Handover Approved by:** Antigravity AI Engineering Assistant  
**Repository:** [Nigazhthisai on GitHub](https://github.com/Praveenkumaran-MK/Nigazhthisai.git)
