# 🧭 Nigazhthisai (நிகழ்திசை) — Comprehensive Role-Based User Guide

Welcome to **Nigazhthisai (நிகழ்திசை)** — the next-generation Smart Public Transit and Fleet Management Ecosystem. Nigazhthisai connects commuters, on-board transit crews, depot dispatchers, and state-level transit authorities into a synchronized, real-time transportation network.

This guide provides a structured, step-by-step operational walkthrough for **all 4 ecosystem roles**:

1. 🚶 **Passenger / Commuter** (Rider app — zero-login, live tracking, ticketing, alighting alerts, SOS)
2. 🎫 **Conductor / On-Board Operator** (Crew app — GPS telemetry, QR ticket scanner, cash POS, stop progression, SOS)
3. 🏢 **District Administrator / Depot Manager** (Depot app — fleet monitoring, alerts dispatch, scheduling, revenue, complaints)
4. 🌐 **Master Administrator / Apex State Authority** (State command — multi-district governance, RBAC, CSV bulk import, global settings)

---

## 📑 Table of Contents

- [1. System Overview \& Access Matrix](#1-system-overview--access-matrix)
- [2. Role 1: Passenger / Commuter Guide](#2-role-1-passenger--commuter-guide)
  - [2.1 Launching the App (Zero-Login Frictionless Onboarding)](#21-launching-the-app-zero-login-frictionless-onboarding)
  - [2.2 Discovering Routes \& Nearest Bus Stops (PostGIS Integration)](#22-discovering-routes--nearest-bus-stops-postgis-integration)
  - [2.3 Searching Direction-Aware Eligible Buses](#23-searching-direction-aware-eligible-buses)
  - [2.4 Live Real-Time Interactive Map Tracking](#24-live-real-time-interactive-map-tracking)
  - [2.5 Digital Ticket Booking \& Instant Checkout](#25-digital-ticket-booking--instant-checkout)
  - [2.6 Boarding Pass, Real-Time Countdown \& Live Validation](#26-boarding-pass-real-time-countdown--live-validation)
  - [2.7 Destination Geofence \& Alighting Notifications](#27-destination-geofence--alighting-notifications)
  - [2.8 In-Transit Emergency SOS \& 2-Way Dispatch Chat](#28-in-transit-emergency-sos--2-way-dispatch-chat)
  - [2.9 Post-Trip Rating, Grievance Filing \& Ticket History](#29-post-trip-rating-grievance-filing--ticket-history)
- [3. Role 2: Conductor / On-Board Operator Guide](#3-role-2-conductor--on-board-operator-guide)
  - [3.1 Crew Login \& Duty Dashboard Overview](#31-crew-login--duty-dashboard-overview)
  - [3.2 Pre-Trip Physical Bus QR Verification](#32-pre-trip-physical-bus-qr-verification)
  - [3.3 Starting Service \& Telemetry Broadcast Activation](#33-starting-service--telemetry-broadcast-activation)
  - [3.4 In-Trip Operations: Passenger Occupancy \& Adherence](#34-in-trip-operations-passenger-occupancy--adherence)
  - [3.5 Scanning Mobile QR Tickets \& PNR Fallback](#35-scanning-mobile-qr-tickets--pnr-fallback)
  - [3.6 On-Bus Cash Ticketing (Mobile POS Terminal)](#36-on-bus-cash-ticketing-mobile-pos-terminal)
  - [3.7 Sequential Stop Progression \& Ticket Expiration ("Departed" Flow)](#37-sequential-stop-progression--ticket-expiration-departed-flow)
  - [3.8 Ending Ride \& Shift Anywhere (Bus QR Re-Scan)](#38-ending-ride--shift-anywhere-bus-qr-re-scan)
  - [3.9 Pocket Mode (OLED Power-Saving Technology)](#39-pocket-mode-oled-power-saving-technology)
  - [3.10 Conductor Emergency SOS, Helplines \& Dispatch Protocol](#310-conductor-emergency-sos-helplines--dispatch-protocol)
- [4. Role 3: District Administrator / Depot Manager Guide](#4-role-3-district-administrator--depot-manager-guide)
  - [4.1 Logging into the District Admin Portal](#41-logging-into-the-district-admin-portal)
  - [4.2 Real-Time Operational Dashboard](#42-real-time-operational-dashboard)
  - [4.3 Live District Fleet Tracking (Presence Map)](#43-live-district-fleet-tracking-presence-map)
  - [4.4 SOS Command Center \& Audio-Visual Siren Dispatch](#44-sos-command-center--audio-visual-siren-dispatch)
  - [4.5 Transit Network Configuration (Stops, Routes \& Route Stops)](#45-transit-network-configuration-stops-routes--route-stops)
  - [4.6 Fleet Registry \& Accessibility Settings (Buses)](#46-fleet-registry--accessibility-settings-buses)
  - [4.7 Fare Matrix Management](#47-fare-matrix-management)
  - [4.8 Conductor Provisioning \& Credential Management](#48-conductor-provisioning--credential-management)
  - [4.9 Scheduling Matrix, Recurring Templates \& Trip Dispatch](#49-scheduling-matrix-recurring-templates--trip-dispatch)
  - [4.10 Revenue Analytics \& Official PDF Statement Export](#410-revenue-analytics--official-pdf-statement-export)
  - [4.11 Citizen Grievance Redressal Workflow](#411-citizen-grievance-redressal-workflow)
  - [4.12 Fleet Maintenance Work Orders \& Bus QR Generation](#412-fleet-maintenance-work-orders--bus-qr-generation)
- [5. Role 4: Master Administrator / Apex State Authority Guide](#5-role-4-master-administrator--apex-state-authority-guide)
  - [5.1 Elevated Master Access \& Cross-District State Overview](#51-elevated-master-access--cross-district-state-overview)
  - [5.2 Regional District Governance \& Territorial Setup](#52-regional-district-governance--territorial-setup)
  - [5.3 Enterprise Role-Based Access Control (RBAC) \& User Governance](#53-enterprise-role-based-access-control-rbac--user-governance)
  - [5.4 Enterprise CSV Bulk Import Engine (Stops, Routes, Fares)](#54-enterprise-csv-bulk-import-engine-stops-routes-fares)
  - [5.5 Central System Settings, Feature Toggles \& Payment Kill-Switch](#55-central-system-settings-feature-toggles--payment-kill-switch)
- [6. The Operational Rhythm: A Day in the Life (Collaborative Flow)](#6-the-operational-rhythm-a-day-in-the-life-collaborative-flow)
- [7. Operational Troubleshooting, Edge Cases \& FAQs](#7-operational-troubleshooting-edge-cases--faqs)

---

## 1. System Overview & Access Matrix

Nigazhthisai is built as three independent Progressive Web Applications (PWAs) operating over a shared PostgreSQL/PostGIS database with real-time WebSocket subscriptions.

| Role | Application | Access Level | Primary Authentication | Core Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **1. Passenger** | `apps/passenger`<br>(Default Port: `5173`) | Public Commuter | **Zero-Login** (Instant anonymous cryptographic session) | Stop discovery, live bus tracking, QR ticket purchase, in-transit emergency SOS, trip rating & grievance filing |
| **2. Conductor** | `apps/conductor`<br>(Default Port: `5174`) | Field Crew / Bus Operator | **Government ID + Password** (`<id>@conductor.internal`) | High-accuracy GPS beacon broadcasting, physical bus QR verification, QR ticket scanning, cash ticketing, stop departure progression, emergency SOS |
| **3. District Admin** | `apps/admin`<br>(Default Port: `5175`) | District Transit Operations | **District Admin Email + Password** (Scoped to district) | Depot fleet dispatch, real-time fleet map, SOS emergency triage & live chat, stops/routes/buses/fares CRUD, conductor provisioning, schedules creation, revenue reports |
| **4. Master Admin** | `apps/admin`<br>(Default Port: `5175`) | Apex State Authority (`master_admin`) | **Master Admin Email + Password** (Global state-wide access) | Multi-district creation & assignment, administrative user governance, enterprise CSV bulk data imports, system settings, global payment kill-switch |

---

## 2. Role 1: Passenger / Commuter Guide

The **Passenger PWA** delivers a modern, app-store-quality transit experience directly in the mobile browser without requiring any login, registration forms, or personal identification.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. Open App     │ ──> │ 2. Select Stop  │ ──> │ 3. Track Bus    │ ──> │ 4. Buy Ticket   │
│ (Zero Login)    │     │ & View Routes   │     │ (Live Lerp Map) │     │ (Instant Mock)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                 │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐             ▼
│ 7. Rate & File  │ <── │ 6. Destination  │ <── │ 5. Board & Show │ <───────────┘
│ Grievance       │     │ Alighting Alert │     │ Boarding Pass   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 2.1 Launching the App (Zero-Login Frictionless Onboarding)
1. Navigate to the Passenger application URL in any modern mobile or desktop browser.
2. The system invokes `usePassengerSession`, automatically generating an anonymous Supabase session (`is_anonymous = true`).
3. **Language Selection**: Tap the language switcher at the top right of the screen to switch seamlessly between **English** and **தமிழ் (Tamil)** at any point.

> [!NOTE]
> All tickets purchased during your session remain safely tied to your browser's local storage session. No phone number, OTP, or password is ever demanded.

---

### 2.2 Discovering Routes & Nearest Bus Stops (PostGIS Integration)
1. Upon loading the Home Screen (`HomePage.tsx`), the browser requests Geolocation permission:
   - **Permission Granted**: The app executes a PostGIS KNN geospatial query (`find_nearest_stop` RPC) using your device's latitude and longitude.
   - **Nearest Stop Banner**: A prominent green banner displays: *"Nearest stop: [Stop Name] — [X]m away"*.
   - **Auto-Fill**: If available, your **From (Origin)** stop is automatically populated with this nearest stop.
   - **Permission Denied / Unavailable**: A polite amber banner informs you that manual selection is available. You can tap the **Detect Location** button at any time to re-trigger GPS detection.
2. **Select Destination**: Tap the **To (Destination)** dropdown and choose where you want to travel.
3. **Swap Stops**: Use the vertical swap button ($\updownarrow$) between the Origin and Destination fields to reverse your route direction instantly.

---

### 2.3 Searching Direction-Aware Eligible Buses
1. With Origin and Destination selected, tap the **Search Buses** button.
2. You will be redirected to the **Search Results Screen** (`SearchResultsPage.tsx`).
3. Behind the scenes, Nigazhthisai runs the server-side `list_eligible_buses` RPC:
   - **Directionality Guard**: Only active trips traveling in your direction are returned.
   - **Strict Departure Guard**: A bus is included **only if** the bus has *not yet departed* your origin stop (its status at your stop is still `UPCOMING` or `ARRIVED`). Buses that have already passed your stop are strictly excluded to avoid boarding disappointment.
4. Each bus card displays:
   - **Bus Number & Type Badge** (e.g., `TN-29-N-1234` · `AC` or `NON_AC`).
   - **Wheelchair Accessibility Indicator** (showing if the bus has ramp/low-floor boarding).
   - **Current Location**: *"Currently near [Stop Name]"*.
   - **Live Occupancy / Available Seats**: Live capacity remaining (e.g., `18 seats available`).
   - **Ticket Price**: Exact calculated fare from the authoritative `fare_matrix`.
   - **Action Buttons**: **Track Live** and **Buy Ticket**.

---

### 2.4 Live Real-Time Interactive Map Tracking
1. Tap **Track Live** on any bus card to open the **Live Tracking Screen** (`LiveMapPage.tsx`).
2. The screen opens an interactive Leaflet map rendering:
   - The route's complete polyline geometry.
   - Distinct stop markers along the journey.
   - A pulsing bus marker that updates in real time.
3. **Smooth Lerp Animation**: The bus marker does not abruptly teleport across coordinates; it uses linear interpolation (lerp) over ~2.5 seconds to glide smoothly between conductor telemetry pings.
4. **Signal Health Badges**:
   - 🟢 **Live**: Fresh telemetry received within the last 15 seconds.
   - 🟡 **Signal Delayed**: If the bus is in a poor cellular zone and no GPS ping has arrived for >15s.
   - ⚪ **Waiting for Live GPS**: If the conductor has started the trip but the first GPS coordinate is pending.
5. **Interactive Stop Progress Sheet**: Expand the bottom drawer to view all stops on the route:
   - 🟢 **Current Stop**: Filled teal ring indicating the bus's present stop.
   - ⚪ **Upcoming Stops**: Outlined circles showing pending stops.
   - 🔘 **Departed Stops**: Solid gray circles with strikethrough text for stops already cleared.

---

### 2.5 Digital Ticket Booking & Instant Checkout
1. From the Search Results screen, tap **Buy Ticket** on your chosen bus.
2. On the **Checkout Screen** (`CheckoutPage.tsx`):
   - **Select Passenger Count**: Adjust between `1` and `6` passengers using the `+` and `-` buttons.
   - **Concession Category**: Select applicable concession (`General / Normal`, `Student`, `Senior Citizen`, `Specially Abled`).
   - **Total Fare**: Displays the authoritative total fare calculated securely on the server.
   - **Transport Authority UPI ID**: Displays the authority's verified Virtual Payment Address.
3. Tap **Pay ₹X (Simulated UPI)**:
   - The app verifies server-side that the bus is still `ACTIVE` and has not departed your origin stop.
   - It re-locks seats atomically via `create_secure_ticket` RPC so buses cannot be overbooked.
   - A cryptographically signed 24-byte QR payload with HMAC-SHA256 signature is minted.
4. On success, the app immediately redirects you to your digital **Boarding Pass**.

---

### 2.6 Boarding Pass, Real-Time Countdown & Live Validation
1. The **Ticket Screen** (`TicketPage.tsx`) presents your digital boarding pass:
   - **Live LCD Expiration Countdown**: A high-visibility digital clock showing the exact minutes and seconds remaining until ticket expiration.
   - **Boarding Pass Visuals**: An authentic transit card featuring route origin/destination codes, perforation dividers, passenger count, total fare paid, and vehicle registration.
   - **Cryptographic QR Code**: Encodes `<qr_payload>.<qr_signature>` for the conductor to scan.
2. **Live Conductor Scan Synchronization**:
   - When the conductor scans your QR code on the bus, your ticket page receives an instant WebSocket update from PostgreSQL without needing to refresh.
   - The status changes dynamically from `PAID` ➔ `VALIDATED`.
   - A cheerful banner appears: *"Ticket validated — enjoy your ride!"*

---

### 2.7 Destination Geofence & Alighting Notifications
1. While your trip is active, the app engages `useGeofenceAlighting`.
2. As your bus enters within **100 meters** of your booked destination stop, the application fires an automated browser audio-visual alert:
   - 🔔 *"Approaching Destination: Please prepare to alight at [Stop Name]!"*
3. When the conductor clicks "Departed" at your destination stop, the ticket status automatically transitions to `EXPIRED`, and the occupancy is freed up for incoming passengers.

---

### 2.8 In-Transit Emergency SOS & 2-Way Dispatch Chat
1. While holding an active ticket, if any medical, safety, or harassment situation occurs on board, tap the red **Emergency Assistance / SOS Chat** button.
2. The app invokes the `start_emergency_chat` RPC:
   - An immediate high-priority alert (`severity: 'SOS'`, `source_role: 'passenger'`) is dispatched to the District Depot Command Center with your exact bus and trip details.
   - A dedicated 2-way emergency messaging drawer opens directly on your screen.
3. You can chat live with depot dispatchers to describe the emergency (e.g., *"Medical emergency in seat 14"*, *"Lost bag left behind"*).
4. **Unread Badge & Audio Alert**: Whenever the control room sends a reply, a pulsing alert banner appears at the top of your boarding pass with a direct *"Control Room Responded — View Chat"* prompt.

---

### 2.9 Post-Trip Rating, Grievance Filing & Ticket History
1. **Trip Rating**: When your ticket reaches `EXPIRED` status, a 5-Star rating widget unlocks on the ticket page. You can rate your trip experience and submit comments to help improve transit quality.
2. **Filing Grievances (`/grievance`)**:
   - Open the **Grievances** tab from the bottom navigation.
   - Select a Complaint Category: `Cleanliness`, `Driver Behavior`, `Overcrowding`, `Safety`, `Overcharging`, or `Other`.
   - Select the affected trip from your recent tickets list.
   - Enter your description and optional contact details (phone/email).
   - Tap **Submit Grievance**. You receive an official tracking reference number immediately.
3. **Ticket History (`/my-tickets`)**:
   - Tap **My Tickets** in the bottom bar to view all active, validated, and past expired tickets purchased on this device. Tap any ticket to view its full boarding pass or receipt.

---

## 3. Role 2: Conductor / On-Board Operator Guide

The **Conductor PWA** serves as the on-bus operations terminal. It functions as both the transit vehicle's real-time GPS telemetry beacon and the mobile point-of-sale (POS) validator.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. Login with   │ ──> │ 2. Scan Physical│ ──> │ 3. Tap "Start   │ ──> │ 4. Realtime GPS │
│ Govt ID & PIN   │     │ Bus Dashboard QR│     │ Service"        │     │ Telemetry Active│
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                 │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐             ▼
│ 8. RE-SCAN BUS  │ <── │ 7. Tap "Depart" │ <── │ 6. Issue Cash   │ <───│ 5. Scan Mobile  │
│ QR = END SHIFT! │     │ at Each Stop    │     │ Tickets (POS)   │     │ Passenger QRs   │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 3.1 Crew Login & Duty Dashboard Overview
1. Open the Conductor application on your mobile device (`apps/conductor`).
2. Enter your **Government Employee ID** (e.g., `COND-7842`) and **Password**.
   *(Authentication is resolved against `<government_id>@conductor.internal`)*.
3. Tap **Sign In**. Once authenticated, you land on your **Shift Dashboard** (`DashboardPage.tsx`).
4. **Shift Overview Cards**:
   - **Trips Assigned Today**: Count of scheduled services for your shift.
   - **Tickets Issued**: Cumulative tickets validated or issued on this shift.
   - **Passengers Carried**: Total passenger volume transported.
   - **Cash vs Digital Revenue**: Breakdown of total collections.
   - **Privacy Shield (Eye Icon)**: Tap the eye icon next to revenue metrics to mask monetary values when passengers are standing near your device.
   - **Network Status**: A live green/amber badge confirms if your device is currently online or in offline fallback mode.

---

### 3.2 Pre-Trip Physical Bus QR Verification
To guarantee that conductors are physically present on the correct designated vehicle:
1. Locate your assigned trip in the **Assigned Trips** list on the dashboard.
2. Tap the **Verify Vehicle & Start Trip** button.
3. A camera scanner modal opens (`BusQrScannerModal.tsx`).
4. Point your camera at the laminated **Bus QR Plate** affixed to the bus dashboard or windscreen.
5. The system performs an instant cryptographic verification matching the bus's UUID against your assigned schedule.
6. Once verified with a green checkmark, the **Start Service** button unlocks.

---

### 3.3 Starting Service & Telemetry Broadcast Activation
1. Tap the green **Start Service** button.
2. The application executes the `start_trip` RPC and activates two critical mobile background subsystems:
   - **Screen Wake Lock**: Invokes `navigator.wakeLock.request('screen')` to prevent the device from sleeping or timing out during your trip.
   - **High-Accuracy GPS Telemetry Broadcaster**: `useGpsTelemetry` activates your device's high-precision GPS.
3. **Real-Time Telemetry Broadcasting**:
   - Your location is transmitted every **3 to 5 seconds** to the Supabase Broadcast room `room:route_<routeId>`.
   - Data points with less than 3 meters movement are throttled to save bandwidth and battery.
   - Conductor presence is announced to the depot dispatchers via Supabase Presence.
4. **Live Status Header**: The dashboard badge switches to 🟢 **ACTIVE**, and the GPS telemetry indicator confirms `Broadcasting Live GPS`.

---

### 3.4 In-Trip Operations: Passenger Occupancy & Adherence
1. **Live Occupancy Card**: Displays real-time on-board load (e.g., `34 / 52 Passengers (65%)`).
   - Increments automatically when passenger tickets are scanned or cash tickets are issued.
   - Decrements automatically when you depart a stop where passengers alight.
2. **Schedule Adherence Indicator**: Displays your operational status relative to the planned timetable:
   - 🟢 **ON TIME**
   - 🔴 **DELAYED (+X min)** (calculated dynamically against stop distance and expected arrival)
   - 🔵 **EARLY**

---

### 3.5 Scanning Mobile QR Tickets & PNR Fallback
1. Tap the **Scan Tickets** button or open the `/scanner` screen.
2. **Camera Scanning Mode**:
   - Direct the camera at the passenger's digital boarding pass QR code.
   - The scanner supports native `BarcodeDetector` with ZXing fallback.
   - Built-in debounce guards prevent duplicate scans within 1.5 seconds.
3. **Atomic Verification**: The app calls the `validate_ticket` RPC:
   - Verifies the cryptographic HMAC-SHA256 signature.
   - Checks that the ticket belongs to *this* route and trip.
   - Confirms the passenger has not already boarded.
4. **Visual & Audio Feedback**:
   - ✅ **Accepted (Green)**: Rings a success chime, showing passenger count and concession type (e.g., *"Accepted: 2 Passengers · Student Concession"*). Occupancy increments automatically.
   - ❌ **Rejected (Red)**: Displays the explicit reason (e.g., *"Already Validated"*, *"Ticket Expired"*, or *"Invalid Trip/Bus"*).
5. **Damaged Screen / PNR Fallback**:
   - If a passenger's phone screen is cracked, unreadable, or out of battery:
   - Tap the **Keyboard (PNR)** tab on the scanner screen.
   - Enter the 6-character alphanumeric PNR code printed beneath their QR code and tap **Validate PNR**.

---

### 3.6 On-Bus Cash Ticketing (Mobile POS Terminal)
For walk-in passengers without smartphones or digital payment access:
1. Tap the **Issue Cash Ticket** button on the active trip dashboard.
2. A streamlined POS modal opens:
   - **Origin Stop**: Automatically defaults to your bus's current stop.
   - **Destination Stop**: Select the passenger's destination from the dropdown.
   - **Passenger Count**: Choose number of travelers (`1` to `6`).
   - **Concession Category**: Select `Normal`, `Student`, `Senior Citizen`, or `Disabled`.
3. The app instantly computes the exact fare based on the official fare matrix.
4. Collect the cash from the passenger and tap **Confirm & Print / Issue Ticket**.
5. A receipt dialog displays the newly generated ticket with its unique PNR, total amount collected, and a scannable QR code. The trip's cash revenue and passenger count update immediately.

---

### 3.7 Sequential Stop Progression & Ticket Expiration ("Departed" Flow)
Nigazhthisai enforces an exact, non-skippable progression along the route:

```
[Stop 1: Dep. ✓] ──> [Stop 2: CURRENT] ──(Tap "Departed")──> [Stop 3: UPCOMING]
                           │
                           ▼
               1. Mark Stop 2 DEPARTED
               2. Advance Current Stop to Stop 3
               3. Expire tickets destined for Stop 2
               4. Decrement on-board occupancy
```

1. In the **Upcoming Stops** list on the dashboard, the **Departed** button is visible **only on the stop that matches `current_stop_id`**. It cannot be tapped for future stops.
2. When the bus completes passenger boarding and pulls away from the stop, tap **Departed**.
3. The app executes the atomic `depart_stop_and_expire_tickets` RPC:
   - Marks this stop as `DEPARTED` with the exact current timestamp.
   - Automatically advances the bus's `current_stop_id` to the next stop in sequence.
   - Searches all active tickets on this trip with destination equal to this stop, and transitions their status to `EXPIRED`.
   - Decrements the bus's occupancy count by the exact number of passengers getting off.
   - Signals the affected passengers' phones via WebSocket to notify them that their trip has completed.
4. **Final Terminus Stop**: When you tap "Departed" at the route's final terminus stop, the system automatically marks the entire trip as **COMPLETED**, turns off GPS telemetry broadcasting, releases the wake lock, and returns your dashboard to shift summary mode.

---

### 3.8 Ending Ride & Shift Anywhere (Bus QR Re-Scan)
Nigazhthisai empowers conductors to conclude their service and end their shift **wherever the vehicle is physically located** simply by scanning the vehicle's Bus QR plate again.

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│ Conductor on ACTIVE Trip       │ ──────> │ Re-Scans Physical Bus QR Plate │
│ (Anywhere along the route)     │         │ (Via Dashboard or Scanner Page)│
└────────────────────────────────┘         └────────────────────────────────┘
                                                           │
                                                           ▼
┌────────────────────────────────┐         ┌────────────────────────────────┐
│ • Realtime GPS Telemetry Stops │ <────── │ System Executes end_trip RPC:  │
│ • On-board Occupancy Zeroes    │         │ • Trip Status -> COMPLETED     │
│ • Remaining Tickets EXPIRED    │         │ • Screen Wake Lock Released    │
└────────────────────────────────┘         └────────────────────────────────┘
```

Conductors can execute this re-scan via two intuitive paths:

#### Option A: From the Active Trip Dashboard
1. On the **Shift Dashboard** (`DashboardPage.tsx`), locate the **Active Shift Service** card.
2. Tap the red **Scan Bus QR to End Shift →** button.
3. The camera scanner opens in **End Shift Mode** (`BusQrScannerModal.tsx`).
4. Aim your camera at the laminated bus dashboard QR plate (or enter the bus number in manual mode).
5. The system performs cryptographic verification matching the bus's UUID against your active trip.
6. Upon match:
   - Device delivers a haptic completion vibration (`[150ms, 70ms, 150ms]`).
   - The trip status immediately transitions to `COMPLETED`, recording `ended_at = now()`.
   - Continuous GPS broadcasting shuts down immediately.
   - Screen wake lock is released.
   - Any unexpired active passenger tickets on board are cleanly marked `EXPIRED`.
   - A **Shift & Ride Completed** dialog appears with an official summary of total tickets issued, passengers transported, and revenue collected.
   - Tap **Sign Out of Shift** to conclude duty and log out directly, or tap **Return to Dashboard** if you have another trip scheduled.

#### Option B: Directly While Scanning Tickets (`/trip/:tripId/scan` or `/scan`)
1. If you are holding the camera scanner checking passenger tickets:
2. Direct the camera at the vehicle's dashboard QR plate (or re-scan after arriving late at the depot).
3. The scanner intelligently recognizes that this is a **Bus QR plate** (even if the trip ended late or the session expired) and will **never** mistake it for an expired passenger ticket.
4. An **"End Shift & Complete Ride?"** confirmation dialog opens:
   - Displays: *"You scanned the QR plate for Bus #[bus_number]. Would you like to end this ride, stop GPS broadcasting, and complete your shift?"*
   - If the bus arrived late or the session was already completed, it displays: *"Vehicle Session Concluded — Bus #[bus_number]. Would you like to sign out now?"*
5. Tap **✓ End Shift & Sign Out Now**:
   - Executes `endTrip` instantly (stops live GPS broadcasting, marks active tickets expired, resets occupancy).
   - Cleanly signs the conductor out and returns to the Login screen.
   - Or tap **End Ride Only (Stay Logged In)** to return to the conductor dashboard.

---

### 3.9 Pocket Mode (OLED Power-Saving Technology)
To conserve mobile battery during long shifts while keeping GPS beacons operational:
1. Tap the **Pocket Mode** button on your dashboard.
2. The display collapses into a pure `#000000` (true OLED black) minimal screen:
   - High-contrast green pulsing dot indicating `GPS Telemetry Active`.
   - Bus number, route, and current stop indicator.
   - Prominent **Emergency SOS** trigger.
3. In Pocket Mode, screen power consumption drops by up to 80% on OLED/AMOLED devices, while background geolocation broadcasts and Presence heartbeats continue uninterrupted.
4. Tap **Exit Pocket Mode** at any time to return to full dashboard controls.

---

### 3.10 Conductor Emergency SOS, Helplines & Dispatch Protocol
1. **Triggering SOS**:
   - To prevent accidental triggers, the **Emergency SOS** button requires a **press-and-hold (long-press)** of 2 seconds.
   - Upon release past the threshold, an immediate `CRITICAL SOS` alert is published with your exact GPS coordinates, bus number, and timestamp.
2. An **Emergency Dispatch Modal** opens with 3 dedicated operational tabs:
   - 📞 **Helpline**: Single-tap emergency calling to:
     - `108` — Emergency Ambulance Service
     - `100` — Police Control Room
     - `101` — Fire & Rescue
     - `Depot Dispatch` — District Depot Emergency Desk
   - 💬 **Live Dispatch Chat**: Real-time 2-way messaging directly with district depot dispatchers. You can type situational reports (e.g., *"Engine breakdown near bypass junction; need replacement bus"*).
   - 📋 **Safety Guide**: Standard operating procedures for road accidents, electrical fires, passenger medical emergencies, and unruly passenger de-escalation.

---

## 4. Role 3: District Administrator / Depot Manager Guide

The **District Admin PWA** (`apps/admin`) is the central operational nervous system for depot supervisors, traffic controllers, and district managers. All views and database records are strictly scoped to the administrator's assigned transit district.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Live Monitoring │     │ SOS Dispatch &  │     │ Schedule Matrix │
│ (All Buses Map) │     │ Incident Siren  │     │ & Trip Dispatch │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
┌─────────────────────────────────────────────────────────────────┐
│               District Admin Operations Portal                  │
└─────────────────────────────────────────────────────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Transit Master  │     │ Conductor Crew  │     │ Revenue Reports │
│ CRUD & Fares    │     │ Provisioning    │     │ & PDF Export    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 4.1 Logging into the District Admin Portal
1. Open the Admin Portal URL (`apps/admin`) in a desktop or tablet browser.
2. Enter your authorized administrator credentials (e.g., `admin.krishnagiri@transit.gov`) and password.
3. Tap **Sign In**.
4. The system validates your role (`admin`) and binds your session to your assigned **District ID**.
5. The sidebar displays your district branding and role label: `DISTRICT ADMIN`.

---

### 4.2 Real-Time Operational Dashboard
The main Dashboard (`/dashboard`) provides a live, unified overview of depot performance:
- **Fleet in Service**: Active buses currently on the road.
- **Scheduled Trips Today**: Trips planned, active, or completed.
- **Active Passengers**: Aggregate passenger count across all running district buses.
- **Today's Gross Revenue**: Real-time cumulative revenue (digital + cash).
- **Open Incidents / SOS Alerts**: Live count of active alerts requiring supervisor attention.
- **Real-Time Occupancy Distribution**: Live chart showing seat availability across the fleet.

---

### 4.3 Live District Fleet Tracking (Presence Map)
1. Open **Live Monitoring** (`/fleet`) from the left navigation.
2. An interactive full-screen map tracks every bus actively broadcasting within your district.
3. Unlike historical polling, this screen uses **Supabase Realtime Presence**:
   - Each bus marker reflects live coordinates, heading, and speed.
   - When a conductor starts a service, their bus marker appears automatically.
   - When a trip ends or the app goes offline, the marker automatically times out and vanishes.
4. **Bus Inspector Drawer**: Click on any bus icon on the map to inspect:
   - Assigned Conductor name and direct phone number.
   - Vehicle registration number and wheelchair accessibility status.
   - Route name, origin, terminus, and current active stop.
   - Schedule adherence (e.g., `+4 min delay`).

---

### 4.4 SOS Command Center & Audio-Visual Siren Dispatch
1. Open **Idle & Alerts** (`/alerts`) from the navigation.
2. **Arming the Alarm**:
   - Modern browsers restrict audio from playing without user gesture.
   - Click the **Enable Alarm Sound** banner once upon opening the command center.
3. **Incoming Incident Response**:
   - When any Conductor triggers SOS or any Passenger initiates Emergency Chat:
   - A pulsing red card appears at the top of the alerts queue.
   - An audible alert tone sounds through your control room workstation.
   - The interactive incident map centers on the emergency's exact GPS coordinates.
4. **Live 2-Way Emergency Chat**:
   - Click **Open Chat** on any passenger or conductor emergency card.
   - Dispatchers can message the person in distress directly, confirming that help is en route.
5. **Incident Resolution Lifecycle**:
   - Tap **Acknowledge**: Updates status from `ACTIVE` to `ACKNOWLEDGED` (silences audio alarm and notifies other dispatchers that this case is under triage).
   - Tap **Resolve**: Marks incident as `RESOLVED`, adding resolution notes to the permanent safety audit log.

---

### 4.5 Transit Network Configuration (Stops, Routes & Route Stops)
#### Managing Stops (`/stops`)
1. View all public bus stops registered in your district.
2. Tap **Add Stop**:
   - Enter Stop Name (in English & Tamil, e.g., `Hosur Bus Stand / ஓசூர் பேருந்து நிலையம்`).
   - Enter unique Stop Code (e.g., `HSR-BS-01`).
   - Provide Latitude and Longitude coordinates (automatically encoded into PostGIS WKT `POINT(lon lat)`).
3. Tap **Save Stop**.

#### Managing Routes (`/routes`)
1. View all configured routes connecting stops.
2. Tap **Add Route**:
   - Enter Route Number (e.g., `202-A`).
   - Enter Route Name (e.g., `Hosur Central to Electronic City`).
   - Set Distance (km) and estimated duration.
3. Tap **Save Route**.

#### Configuring Ordered Route Stops (`/route-stops`)
1. Select a route from the dropdown to inspect its stop sequence.
2. **Add Stop to Route**: Select any registered stop and insert it at the desired sequence index.
3. **Reorder Stops**: Use the **Move Up ($\uparrow$)** and **Move Down ($\downarrow$)** buttons.
   *(Nigazhthisai utilizes dedicated server-side reordering RPCs (`reorder_route_stop`) with deferrable constraints to prevent sequence collision errors).*
4. **Remove Stop**: Tap the trash icon to remove a stop from the route.

---

### 4.6 Fleet Registry & Accessibility Settings (Buses)
1. Open **Buses Fleet** (`/buses`).
2. Displays all physical vehicles allocated to your district depot.
3. Tap **Add Bus**:
   - **Bus Number**: Enter fleet identification (e.g., `BUS-104`).
   - **Registration Number**: State RTO number (e.g., `TN-70-N-9821`).
   - **Bus Type**: Select `AC` or `NON_AC`.
   - **Seating Capacity**: Total passenger capacity (e.g., `48`).
   - **Wheelchair Accessible**: Toggle ON if the vehicle features low-floor kneeling or boarding ramps.
4. Tap **Save Bus**.

---

### 4.7 Fare Matrix Management
1. Open **Fares Matrix** (`/fares`).
2. View and set fare pricing for travel between any origin and destination stop pairs on your routes.
3. Tap **Add Fare Rule**:
   - Select Route.
   - Select Origin Stop and Destination Stop.
   - Enter **Flat Fare Amount (₹)** (e.g., `25.00`).
4. Tap **Save Fare**. The passenger and conductor ticketing calculators immediately adopt the new rate.

---

### 4.8 Conductor Provisioning & Credential Management
1. Open **Conductors Directory** (`/conductors`).
2. Shows all registered on-board crew members with their account linking status.
3. **Add New Conductor**:
   - Tap **Add Conductor**.
   - Enter **Government Employee ID** (e.g., `COND-9102`).
   - Enter **Display Name** (e.g., `Murugan K`).
   - Enter **10-Digit Mobile Phone Number** (mandatory for emergency duty communications).
   - Tap **Create Conductor**.
4. **Behind the Scenes**:
   - The app calls the secure `provision-conductor` Edge Function using the admin's JWT.
   - Generates a synthetic internal account: `COND-9102@conductor.internal`.
   - Mints a secure one-time temporary password.
   - Links the profile via `link_conductor_account` RPC.
5. **Issued Credentials Modal**: A modal displays the conductor's login ID and temporary password. Copy and hand these credentials to the conductor during shift briefing.

---

### 4.9 Scheduling Matrix, Recurring Templates & Trip Dispatch
Trips do not run spontaneously; they are generated through the **Schedules Matrix** (`/schedules`):

```
┌──────────────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐
│ 1. Plan Schedule         │ ───> │ 2. Assign Conductor      │ ───> │ 3. Executable Trip       │
│ (Route + Bus + Time)     │      │ & Confirm Schedule       │      │ Created for Conductor    │
│ Status: PLANNED          │      │ Status: CONFIRMED        │      │ Status: SCHEDULED        │
└──────────────────────────┘      └──────────────────────────┘      └──────────────────────────┘
```

1. **Step 1: Create a Schedule**:
   - Open `/schedules` and tap **New Schedule**.
   - Select **Route**, **Bus**, and **Duration (hours)**.
   - Set Departure Time: Choose quick presets (*In 1 hour*, *Tomorrow, same time*) or pick an exact calendar date and time.
   - The system checks client-side for conflicting bus assignments.
   - Saved as a `schedules` row with status `PLANNED`.
2. **Step 2: Confirm Schedule & Dispatch Trip**:
   - In the schedules table, locate the `PLANNED` schedule.
   - Tap **Confirm & Assign Conductor**.
   - Choose an available active conductor from the dropdown.
   - Tap **Create Trip**.
3. **Server Execution**:
   - Invokes `confirm_schedule_and_create_trip` RPC.
   - Validates conductor availability.
   - Creates a live `trips` entry (`status: 'SCHEDULED'`).
   - Copies the route's stops into `trip_stops`.
   - Flips schedule status to `CONFIRMED`.
   - The trip immediately surfaces on that conductor's mobile dashboard for duty execution!
4. **Weekly Schedule Templates**:
   - Switch to the **Weekly Templates** tab.
   - Set up recurring master timetables (e.g., Route 202-A departs every Monday through Friday at 07:30 AM).

---

### 4.10 Revenue Analytics & Official PDF Statement Export
1. Open **Tickets & Revenue** (`/revenue`).
2. **Filterable Analytics Engine**:
   - Filter by Date Range: Last 7 Days, 30 Days, 90 Days, or Custom Date Picker.
   - Group By: `Day`, `Bus`, `Route`, `Concession Type`, or `Payment Method (Cash vs App)`.
3. **Visual Charts & Breakdown**:
   - View gross earnings, ticket volume, average ticket value, and cash vs digital split.
4. **Official PDF Export**:
   - Tap **Download PDF Statement**.
   - The app uses client-side `jsPDF` and `autoTable` to compile an official, formatted District Transit Revenue Statement complete with summary header, tabular breakdown, and audit metadata.

---

### 4.11 Citizen Grievance Redressal Workflow
1. Open **Complaints & Grievance** (`/complaints`).
2. View all citizen complaints submitted through the Passenger PWA.
3. Each complaint card displays:
   - Category badge (`SAFETY`, `CLEANLINESS`, `DRIVER_BEHAVIOR`, `OVERCROWDING`, `OVERCHARGING`).
   - Associated Bus Number, Trip ID, and Conductor Name.
   - Passenger's contact phone/email and submission timestamp.
4. **Investigation & Status Lifecycle**:
   - Change status from `OPEN` ➔ `IN_REVIEW` while depot staff investigates.
   - Once resolved (e.g., bus sent for deep cleaning, driver counseled), set status to `RESOLVED` with internal resolution notes.
   - If frivolous or duplicate, set to `DISMISSED`.

---

### 4.12 Fleet Maintenance Work Orders & Bus QR Generation
#### Fleet Maintenance Logs (`/maintenance`)
1. Track repair work, tire changes, engine overhauls, and inspections.
2. Tap **New Maintenance Entry**:
   - Select Bus.
   - Select Status: `UNDER_MAINTENANCE`, `AWAITING_PARTS`, or `REPAIRED_AVAILABLE`.
   - Enter detailed mechanic notes and cost estimates.
3. Tap **Log Entry**. Buses marked `UNDER_MAINTENANCE` are highlighted to prevent accidental trip scheduling.

#### Bus QR Code Printing (`/bus-qr`)
1. Open **Bus QR Codes** (`/bus-qr`).
2. Displays all fleet buses and their unique cryptographic vehicle QR payloads.
3. Tap **Generate QR** for any bus without an active plate.
4. Tap **Print Bus QR Plate**:
   - Opens a print-ready window with the bus registration number, depot title, and scannable verification QR code.
   - Laminate and affix this printout to the corresponding bus's dashboard for conductor check-in.

---

## 5. Role 4: Master Administrator / Apex State Authority Guide

The **Master Admin** role provides apex governance across the entire multi-district transit network. Master Admins possess state-wide supervisory jurisdiction, access to enterprise CSV bulk data loaders, RBAC user provisioning, and global system configuration.

```
┌─────────────────────────────────────────────────────────────────┐
│              Master Admin Apex Governance Console               │
└─────────────────────────────────────────────────────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Multi-District  │     │ Administrative  │     │ Enterprise CSV  │
│ Creation & Geo  │     │ RBAC Provision  │     │ Bulk Importer   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Global System Settings  │
                    │ & Payment Kill-Switch   │
                    └─────────────────────────┘
```

### 5.1 Elevated Master Access & Cross-District State Overview
1. Log into the Admin portal with Master credentials (`role = 'master_admin'`).
2. The sidebar displays the distinctive gold branding: `NIGAZHTHISAI MASTER`.
3. In addition to standard operational modules, the **Master Control** section unlocks:
   - 🌐 **Districts** (`/districts`)
   - 👥 **Users & Roles** (`/admin-users`)
   - ⚙️ **System Settings** (`/system-settings`)
   - ☁️ **CSV Import** (`/import`)
4. **State-Wide Visibility**: In tables and dashboards, Master Admins are not restricted to one district; they can filter by any district across the state or select **All Districts** for macro analytics.

---

### 5.2 Regional District Governance & Territorial Setup
1. Open **Districts** (`/districts`).
2. View all regional transport districts (e.g., *Krishnagiri, Dharmapuri, Salem, Coimbatore, Chennai Central*).
3. Each district card lists total active fleet count, registered conductors, and assigned District Administrator.
4. **Create a New District**:
   - Tap **Add District**.
   - Enter **District Name** (e.g., `Madurai Metro`).
   - Enter unique **District Code** (e.g., `MDU`).
   - Enter **State / Region** (defaults to `Tamil Nadu`).
   - Tap **Create District**.
5. Once created, transit routes, buses, and personnel can be assigned to the new territory.

---

### 5.3 Enterprise Role-Based Access Control (RBAC) & User Governance
1. Open **Users & Roles** (`/admin-users`).
2. Manage all administrative staff with access to the Nigazhthisai backend.
3. **Provisioning a District Administrator**:
   - Tap **Add Administrator**.
   - Enter Administrator Name (e.g., `S. Ramanathan`).
   - Enter official government email (e.g., `admin.madurai@transit.gov`).
   - Enter mobile phone number.
   - Assign their jurisdiction: Select the corresponding **District**.
   - Set temporary master password.
   - Tap **Create Admin User**.
4. **Role Elevation & Suspension**:
   - Edit any existing administrator's profile.
   - Elevate a trusted user from `admin` ➔ `master_admin` or demote if reassigned.
   - Toggle account status between `ACTIVE` and `SUSPENDED` to immediately revoke portal access.

---

### 5.4 Enterprise CSV Bulk Import Engine (Stops, Routes, Fares)
To onboard thousands of stops, routes, and fare matrices without manual data entry:
1. Open **CSV Import** (`/import`).
2. Select the **Entity Type** to import:
   - 📍 **Stops**: Columns `name, code, latitude, longitude, district_name`
   - 🛣️ **Routes**: Columns `route_number, name, origin, destination, distance_km`
   - 💰 **Fare Matrix**: Columns `route_number, origin_stop_code, dest_stop_code, flat_fare_amount`
3. **Upload File**: Drag and drop your `.csv` file onto the drop zone or click **Browse File**.
4. **Client-Side Validation & Preview (PapaParse)**:
   - The engine validates every row before touching the database.
   - Verifies required headers, numeric coordinate bounds, and non-empty values.
   - Highlights valid rows in green and displays specific per-row syntax errors in red.
5. **UUID Code Resolution**:
   - For Fare Matrix imports, the engine automatically resolves human-readable stop codes (`HSR-01`) and route numbers (`202-A`) into their internal database UUIDs.
6. **Batched Transactional Insertion**:
   - Tap **Import Valid Rows**.
   - Inserts records in safe atomic batches of **200 rows per transaction**.
   - A completion summary confirms total successfully imported rows.

---

### 5.5 Central System Settings, Feature Toggles & Payment Kill-Switch
1. Open **System Settings** (`/system-settings`).
2. **Authority Information**:
   - Update official Transport Authority Name (e.g., `Tamil Nadu State Transport Corporation — TNSTC`).
   - Configure Public Helpline Phone Number and Official Support Email.
3. **Payment Gateway Configuration & Emergency Kill-Switch**:
   - **Master Authority UPI VPA**: Set the state transit bank account UPI ID (e.g., `tnstc-transit@sbi`).
   - 🛑 **Global Payment Kill-Switch (`is_payments_enabled`)**:
     - Toggle to `OFF` during banking downtime, maintenance windows, or natural disaster transit relief.
     - When disabled, passengers cannot make payments, and the mobile checkout notifies riders that fare collection is temporarily suspended or free of charge.
4. **State-Wide Entity Counters**:
   - Live system health metrics displaying total active districts, registered fleet vehicles, active conductors, total routes, stops, and lifetime tickets issued.

---

## 6. The Operational Rhythm: A Day in the Life (Collaborative Flow)

To understand how all 4 roles collaborate seamlessly, consider the operational lifecycle of a single transit day:

```
[06:00 AM] 🌐 Master Admin
└── Verifies global payment gateway is online and reviews system health.

[06:30 AM] 🏢 District Admin
└── Reviews daily schedule matrix, assigns Conductor Murugan to Bus TN-29-104 on Route 202-A, and dispatches the trip.

[07:00 AM] 🎫 Conductor Murugan
└── Arrives at depot, logs in with Govt ID, boards Bus TN-29-104, scans the dashboard QR plate, taps "Start Service", and enables Pocket Mode.

[07:15 AM] 🚶 Commuter Ananya
└── Opens passenger app at home with zero login, sees Bus TN-29-104 gliding smoothly on the live map, books an AC ticket for ₹25 via UPI, and walks to the stop.

[07:22 AM] 🎫 Conductor & 🚶 Commuter Interaction
└── Bus pulls up. Ananya boards and shows her digital boarding pass. Conductor Murugan scans her QR code. Conductor's phone chimes green; Ananya's screen updates to VALIDATED live.

[07:24 AM] 🎫 Conductor
└── Bus leaves stop. Conductor Murugan taps "Departed". Occupancy locks in, and the bus advances toward the next stop.

[07:45 AM] 🏢 District Admin
└── Monitors all 45 district buses gliding across the Live Fleet map. Notices an SOS notification from another bus, answers the live chat, and coordinates road assistance.

[07:55 AM] 🚶 Commuter Ananya
└── Ananya's phone vibrates with a Geofence Notification: "Approaching Electronic City — prepare to alight!". She steps off safely.

[07:56 AM] 🎫 Conductor Murugan
└── Taps "Departed" at Electronic City. Ananya's ticket flips to EXPIRED; on-board occupancy decrements by 1 seat. Ananya rates the trip 5 stars.

[06:00 PM] 🏢 District Admin & 🌐 Master Admin
└── District Admin exports the daily revenue PDF statement. Master Admin reviews state-wide transit volume across all regional districts.
```

---

## 7. Operational Troubleshooting, Edge Cases & FAQs

### ❓ Passenger FAQs
- **Q: What happens if I accidentally close my browser tab after buying a ticket?**
  - **A**: Simply reopen the passenger app URL in the same browser. Your active ticket and countdown timer will reload automatically from your persistent local session.
- **Q: Why does the app say "No eligible buses found"?**
  - **A**: Nigazhthisai excludes buses that have already passed your origin stop. A bus will only appear if it is actively running and has not yet departed your boarding stop.
- **Q: Does live map tracking require me to buy a ticket first?**
  - **A**: No. Live bus tracking is completely public and available for any traveler on any route.

### ❓ Conductor FAQs
- **Q: What if a passenger's phone screen is shattered or dirty and the QR code cannot scan?**
  - **A**: Tap the **Keyboard (PNR)** icon at the top of the scanner screen. Enter the 6-character PNR code printed beneath their QR code to validate manually.
- **Q: Does Pocket Mode stop transmitting GPS?**
  - **A**: No! Pocket Mode only blacks out the display pixels to save battery. The high-accuracy GPS telemetry and Presence beacon continue broadcasting normally.
- **Q: Why can't I click "Departed" on Stop #4?**
  - **A**: Nigazhthisai strictly enforces sequential stop progression. The "Departed" button is unlocked **only** for the stop matching `current_stop_id`. You must depart stops in order.

### ❓ District & Master Admin FAQs
- **Q: Why is there no sound when an SOS alert arrives on the Admin screen?**
  - **A**: Modern browsers require user interaction before playing audio. Click the **"Enable Alarm Sound"** button once whenever you open the `/alerts` page.
- **Q: Can a conductor register their own account?**
  - **A**: No. To maintain strict transit security, conductors cannot self-register. They must be provisioned by a District Admin or Master Admin via the Conductors Directory.
- **Q: What happens if the CSV import has invalid coordinates?**
  - **A**: The PapaParse client validator rejects rows with invalid coordinates during the preview phase before database insertion, displaying the exact row number and error description for correction.

---

*Nigazhthisai (நிகழ்திசை) Smart Transit Ecosystem — Documentation v2.6. Crafted for efficiency, accessibility, and passenger safety.*
