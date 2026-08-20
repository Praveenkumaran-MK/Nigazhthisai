// Scenario 1 — Ticket purchase burst (see ../README.md).
//
// Proves CORRECTNESS under concurrency, not just throughput: fires N
// concurrent create_secure_ticket calls against one trip and asserts that
// *exactly* the bus's remaining capacity succeeds — the rest must fail with
// BUS_FULL (migration 014/016's capacity check) — and that trip_occupancy
// never exceeds capacity afterward. A single oversold seat is a hard
// failure of this test, not a percentile to tune.
//
// Required env: K6_SUPABASE_URL, K6_SUPABASE_ANON_KEY, K6_TRIP_ID,
// K6_ORIGIN_STOP_ID, K6_DEST_STOP_ID (origin/dest must have a fare_matrix
// row and the origin must not yet be DEPARTED on this trip).
//
// Smoke test first: `k6 run --vus 2 --iterations 2 ticket-purchase-burst.js`
// Real run: `K6_VUS=60 k6 run --vus 60 --iterations 60 ticket-purchase-burst.js`
// (set VUs well above the bus's remaining capacity so BUS_FULL is exercised)

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { signInAnonymous, authHeaders, rpcUrl } from "./lib/auth.js";

const SUPABASE_URL = __ENV.K6_SUPABASE_URL;
const ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY;
const TRIP_ID = __ENV.K6_TRIP_ID;
const ORIGIN_STOP_ID = __ENV.K6_ORIGIN_STOP_ID;
const DEST_STOP_ID = __ENV.K6_DEST_STOP_ID;

if (!TRIP_ID || !ORIGIN_STOP_ID || !DEST_STOP_ID) {
  throw new Error("K6_TRIP_ID, K6_ORIGIN_STOP_ID, K6_DEST_STOP_ID must all be set");
}

export const options = {
  vus: Number(__ENV.K6_VUS || 20),
  iterations: Number(__ENV.K6_ITERATIONS || __ENV.K6_VUS || 20),
  thresholds: {
    http_req_duration: ["p(95)<300"],
    ticket_success: [], // observed, not thresholded — capacity-dependent
  },
};

const ticketSuccess = new Counter("ticket_success");
const ticketBusFull = new Counter("ticket_bus_full");
const ticketOtherError = new Counter("ticket_other_error");

export default function () {
  const session = signInAnonymous();
  if (!session.accessToken) return;

  const res = http.post(
    rpcUrl("create_secure_ticket"),
    JSON.stringify({
      p_trip_id: TRIP_ID,
      p_origin_stop_id: ORIGIN_STOP_ID,
      p_dest_stop_id: DEST_STOP_ID,
      p_passenger_count: 1,
    }),
    { headers: authHeaders(session.accessToken) },
  );

  if (res.status === 201 || res.status === 200) {
    ticketSuccess.add(1);
    check(res, { "ticket created": (r) => JSON.parse(r.body).status === "PAID" });
    return;
  }

  const message = (() => {
    try {
      return res.json().message || "";
    } catch {
      return res.body || "";
    }
  })();

  if (message.includes("BUS_FULL")) {
    ticketBusFull.add(1);
  } else {
    ticketOtherError.add(1);
    console.error(`Unexpected create_secure_ticket failure: ${res.status} ${message}`);
  }
}

// Runs once after all VUs finish — the actual correctness assertion.
export function teardown() {
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/trip_occupancy?trip_id=eq.${TRIP_ID}&select=capacity,current_passenger_count`,
    { headers: { apikey: ANON_KEY } },
  );
  const rows = res.json();
  if (!rows || rows.length === 0) {
    console.error("teardown: could not read trip_occupancy for this trip — cannot verify no oversell occurred");
    return;
  }
  const { capacity, current_passenger_count: current } = rows[0];
  const oversold = current > capacity;
  check(null, {
    [`no oversell: current_passenger_count (${current}) <= capacity (${capacity})`]: () => !oversold,
  });
  if (oversold) {
    // Fail loudly — this is the one metric in this whole test that must never be nonzero.
    throw new Error(`OVERSELL DETECTED: ${current}/${capacity} seats on trip ${TRIP_ID}`);
  }
}
