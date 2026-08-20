// Scenario 4 (baseline read capacity) and Scenario 5 (soak, via
// K6_DURATION/K6_VUS) — see ../README.md.
//
// Establishes p95 latency and error-rate baselines for the read-heavy RPCs
// every passenger session calls on every search: find_nearest_stop,
// list_eligible_buses, and a plain stops_public REST read. Also the soak
// test: run this for 30-60 minutes to catch degradation over time
// (connection leaks, presence-heartbeat accumulation, etc.) rather than
// just a short burst.
//
// Required env: K6_SUPABASE_URL, K6_SUPABASE_ANON_KEY, K6_ROUTE_ID (any
// real route id), K6_ORIGIN_STOP_ID (a stop on that route).
//
// Baseline run:  k6 run k6/sustained-read-load.js
// Soak variant:  K6_DURATION=45m K6_VUS=50 k6 run k6/sustained-read-load.js

import http from "k6/http";
import { check, sleep } from "k6";
import { signInAnonymous, authHeaders } from "./lib/auth.js";

const SUPABASE_URL = __ENV.K6_SUPABASE_URL;
const ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY;
const ROUTE_ID = __ENV.K6_ROUTE_ID;
const ORIGIN_STOP_ID = __ENV.K6_ORIGIN_STOP_ID;

if (!ROUTE_ID || !ORIGIN_STOP_ID) {
  throw new Error("K6_ROUTE_ID and K6_ORIGIN_STOP_ID must be set");
}

const DURATION = __ENV.K6_DURATION || "2m";
const VUS = Number(__ENV.K6_VUS || 20);

export const options = {
  scenarios: {
    sustained_read: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.001"], // < 0.1% error rate
  },
};

// One anonymous session per VU, established lazily on each VU's first
// iteration and reused after that (k6 has no per-VU setup hook; each VU
// runs as an independent JS VM, so this module-level variable is private
// per-VU, not shared/racy across VUs). Mirrors the real app
// (ensurePassengerSession() runs once, not per-request) and keeps this
// test's load dominated by the reads it's meant to measure, not auth calls.
let session = null;

export default function () {
  if (!session) {
    session = signInAnonymous();
  }

  const nearestRes = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/find_nearest_stop`,
    JSON.stringify({ p_latitude: 10.787, p_longitude: 79.1378, p_limit: 1 }),
    { headers: authHeaders(session.accessToken), tags: { name: "find_nearest_stop" } },
  );
  check(nearestRes, { "find_nearest_stop ok": (r) => r.status === 200 });

  const eligibleRes = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/list_eligible_buses`,
    JSON.stringify({ p_route_id: ROUTE_ID, p_origin_stop_id: ORIGIN_STOP_ID }),
    { headers: authHeaders(session.accessToken), tags: { name: "list_eligible_buses" } },
  );
  check(eligibleRes, { "list_eligible_buses ok": (r) => r.status === 200 });

  const stopsRes = http.get(`${SUPABASE_URL}/rest/v1/stops_public?select=id,name&limit=20`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.accessToken}` },
    tags: { name: "stops_public" },
  });
  check(stopsRes, { "stops_public ok": (r) => r.status === 200 });

  // 2s, not 1s: migration 016 rate-limits find_nearest_stop/list_eligible_buses
  // at 60/min per session. At 1s this test would start tripping its own
  // RATE_LIMITED responses once a VU has run for a minute, confounding
  // "read-capacity baseline" with "did we hit our own rate limiter" — 2s
  // keeps every VU at ~30 calls/min/endpoint, comfortably under that budget.
  sleep(2);
}
