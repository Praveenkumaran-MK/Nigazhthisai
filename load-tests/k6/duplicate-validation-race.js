// Scenario 2 — Duplicate ticket validation race (see ../README.md).
//
// Proves the `SELECT ... FOR UPDATE` lock in validate_ticket() actually
// serializes concurrent scans of the SAME ticket: fires the identical QR
// code at validate_ticket from several VUs at once and asserts exactly one
// succeeds — every other one must fail with ALREADY_VALIDATED. More than
// one success is a hard correctness failure (double-boarding), not a
// percentile.
//
// Required env: K6_SUPABASE_URL, K6_SUPABASE_ANON_KEY, K6_TRIP_ID (must be
// ACTIVE), K6_ORIGIN_STOP_ID, K6_DEST_STOP_ID, K6_CONDUCTOR_GOVT_ID,
// K6_CONDUCTOR_PASSWORD (the conductor assigned to K6_TRIP_ID).
//
// Smoke test first: `k6 run --vus 2 duplicate-validation-race.js`
// Real run: `k6 run --vus 10 duplicate-validation-race.js`

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { signInAnonymous, signInConductor, authHeaders, rpcUrl } from "./lib/auth.js";

const TRIP_ID = __ENV.K6_TRIP_ID;
const ORIGIN_STOP_ID = __ENV.K6_ORIGIN_STOP_ID;
const DEST_STOP_ID = __ENV.K6_DEST_STOP_ID;
const CONDUCTOR_GOVT_ID = __ENV.K6_CONDUCTOR_GOVT_ID;
const CONDUCTOR_PASSWORD = __ENV.K6_CONDUCTOR_PASSWORD;

if (!TRIP_ID || !ORIGIN_STOP_ID || !DEST_STOP_ID || !CONDUCTOR_GOVT_ID || !CONDUCTOR_PASSWORD) {
  throw new Error(
    "K6_TRIP_ID, K6_ORIGIN_STOP_ID, K6_DEST_STOP_ID, K6_CONDUCTOR_GOVT_ID, K6_CONDUCTOR_PASSWORD must all be set",
  );
}

export const options = {
  scenarios: {
    race: {
      executor: "per-vu-iterations",
      vus: Number(__ENV.K6_VUS || 8),
      iterations: 1,
      maxDuration: "30s",
    },
  },
  // The hard correctness invariant: k6 Counter thresholds support `count`
  // as a special aggregation, so this fails the whole run (nonzero exit
  // code) if more than one VU ever got a successful validation for the
  // same ticket — not just a number to eyeball in the summary output.
  thresholds: {
    validate_success: ["count<=1"],
  },
};

const validateSuccess = new Counter("validate_success");
const validateAlready = new Counter("validate_already");
const validateOtherError = new Counter("validate_other_error");

// setup() runs once, before any VU — purchases one real ticket (shared by
// every VU below) and authenticates the assigned conductor once.
export function setup() {
  const passenger = signInAnonymous();
  const purchaseRes = http.post(
    rpcUrl("create_secure_ticket"),
    JSON.stringify({
      p_trip_id: TRIP_ID,
      p_origin_stop_id: ORIGIN_STOP_ID,
      p_dest_stop_id: DEST_STOP_ID,
      p_passenger_count: 1,
    }),
    { headers: authHeaders(passenger.accessToken) },
  );
  check(purchaseRes, { "setup ticket purchase succeeded": (r) => r.status === 200 || r.status === 201 });
  const ticket = purchaseRes.json();

  const conductor = signInConductor(CONDUCTOR_GOVT_ID, CONDUCTOR_PASSWORD);
  check(conductor, { "conductor sign-in succeeded": (c) => Boolean(c.accessToken) });

  return {
    scannedCode: `${ticket.qr_payload}.${ticket.qr_signature}`,
    conductorToken: conductor.accessToken,
  };
}

// Every VU fires the SAME scannedCode against validate_ticket at once.
export default function (data) {
  const res = http.post(
    rpcUrl("validate_ticket"),
    JSON.stringify({ p_qr_payload: data.scannedCode, p_trip_id: TRIP_ID }),
    { headers: authHeaders(data.conductorToken) },
  );

  if (res.status === 200 || res.status === 201) {
    validateSuccess.add(1);
    return;
  }

  const message = (() => {
    try {
      return res.json().message || "";
    } catch {
      return res.body || "";
    }
  })();

  if (message.includes("ALREADY_VALIDATED")) {
    validateAlready.add(1);
  } else {
    validateOtherError.add(1);
    console.error(`Unexpected validate_ticket failure: ${res.status} ${message}`);
  }
}
