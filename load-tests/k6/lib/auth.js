// Auth helpers for k6 scripts — raw HTTP against Supabase's GoTrue REST API,
// since k6 scripts don't have access to npm packages like @supabase/supabase-js.
// This mirrors exactly what packages/supabase-client/src/auth.ts does through
// the real client, just expressed as direct HTTP calls.
//
// IMPORTANT: verify these against a --vus 2 --iterations 2 smoke run before
// trusting them at scale (see ../README.md) — GoTrue's exact anonymous
// sign-in response shape isn't pinned to a version here.

import http from "k6/http";
import { check } from "k6";

const SUPABASE_URL = __ENV.K6_SUPABASE_URL;
const ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("K6_SUPABASE_URL and K6_SUPABASE_ANON_KEY must be set");
}

const baseHeaders = {
  apikey: ANON_KEY,
  "Content-Type": "application/json",
};

/**
 * Mirrors ensurePassengerSession() — establishes a real anonymous auth.users
 * row and returns its access token, for calling passenger-facing RPCs as a
 * distinct simulated rider per VU/iteration.
 */
export function signInAnonymous() {
  const res = http.post(`${SUPABASE_URL}/auth/v1/signup`, JSON.stringify({ data: {} }), {
    headers: baseHeaders,
  });
  check(res, {
    "anonymous sign-in succeeded": (r) => r.status === 200,
  });
  const body = res.json();
  return {
    accessToken: body.access_token,
    userId: body.user && body.user.id,
  };
}

/** Mirrors signInConductor() — real password grant against the synthetic conductor email. */
export function signInConductor(governmentId, password) {
  const email = `${governmentId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}@conductor.internal`;
  return passwordSignIn(email, password);
}

/** Mirrors signInAdmin() — same grant type, admin's real email/password. */
export function signInAdmin(email, password) {
  return passwordSignIn(email, password);
}

function passwordSignIn(email, password) {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    { headers: baseHeaders },
  );
  check(res, { "password sign-in succeeded": (r) => r.status === 200 });
  const body = res.json();
  return { accessToken: body.access_token, userId: body.user && body.user.id };
}

/** Authorization + apikey headers for an authenticated RPC/REST call. */
export function authHeaders(accessToken) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export function rpcUrl(fnName) {
  return `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
}
