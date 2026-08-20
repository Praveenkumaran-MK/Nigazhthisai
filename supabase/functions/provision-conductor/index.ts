// Edge Function: provision-conductor
//
// Why this exists: `auth.users` cannot be inserted into directly from SQL on
// hosted Supabase — creating an Auth user requires the Admin API, which
// requires the SERVICE_ROLE_KEY. That key must never reach the browser, so
// this step runs server-side in an Edge Function instead of a client RPC.
// The Admin PWA calls this function (with the admin's own user JWT) to
// create a conductor's login. After this returns, the Admin PWA calls the
// `link_conductor_account` RPC (see migrations/...008_functions.sql) to
// attach the new auth user id to the `conductors` row.
//
// Deploy: supabase functions deploy provision-conductor
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the platform — no `secrets set` needed for those.

import { createClient } from "npm:@supabase/supabase-js@2";

interface ProvisionRequest {
  governmentId: string;
  displayName: string;
  temporaryPassword: string;
}

const SYNTHETIC_EMAIL_DOMAIN = "conductor.internal";

// Every response — including error responses — must carry these, and the
// browser's CORS preflight (OPTIONS) must be answered explicitly. The Admin
// PWA calls this function directly from the browser with a POST + JSON body
// + Authorization header, which triggers a preflight; without these headers
// the browser blocks the real request before it reaches this code at all,
// surfacing to fetch() callers as an opaque "Failed to fetch" with no
// server-side error to debug.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "AUTH_REQUIRED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller is an authenticated admin before using the powerful
  // service-role client. We do this with a scoped client bound to the
  // caller's own JWT, checking their profile role.
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "INVALID_SESSION" }, 401);
  }

  const { data: profile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role !== "admin") {
    return jsonResponse({ error: "NOT_AUTHORIZED" }, 403);
  }

  // 20 conductor accounts / admin / hour — see migration 016. Uses the
  // caller's own scoped client so the rate-limit key is always the caller's
  // real auth.uid(), never client-supplied.
  const { error: rateLimitError } = await callerClient.rpc("check_provisioning_rate_limit");
  if (rateLimitError) {
    return jsonResponse({ error: rateLimitError.message.includes("RATE_LIMITED") ? "RATE_LIMITED" : rateLimitError.message }, 429);
  }

  let body: ProvisionRequest;
  try {
    body = (await req.json()) as ProvisionRequest;
  } catch {
    return jsonResponse({ error: "INVALID_JSON_BODY" }, 400);
  }
  if (!body.governmentId || !body.displayName || !body.temporaryPassword) {
    return jsonResponse({ error: "INVALID_BODY" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const email = `${body.governmentId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}@${SYNTHETIC_EMAIL_DOMAIN}`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: body.temporaryPassword,
    email_confirm: true,
    user_metadata: { government_id: body.governmentId, display_name: body.displayName },
  });

  if (createError || !created?.user) {
    return jsonResponse({ error: createError?.message ?? "CREATE_FAILED" }, 400);
  }

  return jsonResponse({ userId: created.user.id, email }, 200);
});
