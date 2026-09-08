// Edge Function: provision-conductor (extended)
//
// Now handles: conductor, driver, inspector, district_admin, master_admin
//
// Security hierarchy:
//   master_admin  can create: district_admin, conductor, driver, inspector
//   district_admin can create: conductor, driver, inspector (in their own district)
//   Neither role can self-promote or create a role above their own.
//
// Deploy: supabase functions deploy provision-conductor

import { createClient } from "npm:@supabase/supabase-js@2";

type ProvisionableRole = "conductor" | "driver" | "inspector" | "district_admin";

interface ProvisionRequest {
  // Who to create
  displayName:       string;
  temporaryPassword: string;
  role:              ProvisionableRole;
  // Required for conductor/driver/inspector
  governmentId?:     string;
  phone?:            string;
  // Required when creating a district_admin (only master_admin can set this)
  district_id?:      string;
}

const ROLE_EMAIL_DOMAINS: Record<ProvisionableRole, string> = {
  conductor:      "conductor.internal",
  driver:         "driver.internal",
  inspector:      "inspector.internal",
  district_admin: "admin.internal",
};

// Which caller roles can create which target roles
const ALLOWED_TO_CREATE: Record<string, ProvisionableRole[]> = {
  master_admin:   ["conductor", "driver", "inspector", "district_admin"],
  admin:          ["conductor", "driver", "inspector"],
};

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
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

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller's session and role
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "INVALID_SESSION" }, 401);
  }

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role, district_id, status")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: "PROFILE_NOT_FOUND" }, 403);
  }

  const callerRole = profile.role as string;
  const allowedToCreate = ALLOWED_TO_CREATE[callerRole];
  if (!allowedToCreate) {
    return jsonResponse({ error: "NOT_AUTHORIZED: caller role cannot provision users" }, 403);
  }

  if (profile.status !== "ACTIVE") {
    return jsonResponse({ error: "ACCOUNT_SUSPENDED" }, 403);
  }

  // Rate limit check
  const { error: rateLimitError } = await callerClient.rpc("check_provisioning_rate_limit");
  if (rateLimitError) {
    const isRateLimit = rateLimitError.message.includes("RATE_LIMITED");
    return jsonResponse({ error: isRateLimit ? "RATE_LIMITED" : rateLimitError.message }, 429);
  }

  let body: ProvisionRequest;
  try {
    body = (await req.json()) as ProvisionRequest;
  } catch {
    return jsonResponse({ error: "INVALID_JSON_BODY" }, 400);
  }

  // Validate required fields
  if (!body.displayName || !body.temporaryPassword || !body.role) {
    return jsonResponse({ error: "INVALID_BODY: displayName, temporaryPassword, role are required" }, 400);
  }

  // Validate role is one the caller is allowed to create
  if (!allowedToCreate.includes(body.role)) {
    return jsonResponse({
      error: `NOT_AUTHORIZED: ${callerRole} cannot create ${body.role}`,
    }, 403);
  }

  // conductor/driver/inspector require a governmentId
  if (["conductor", "driver", "inspector"].includes(body.role) && !body.governmentId) {
    return jsonResponse({ error: "INVALID_BODY: governmentId is required for " + body.role }, 400);
  }

  // district_admin requires district_id (only master_admin can assign any district)
  let targetDistrictId = body.district_id ?? profile.district_id;
  if (body.role === "district_admin") {
    if (!body.district_id) {
      return jsonResponse({ error: "INVALID_BODY: district_id is required for district_admin" }, 400);
    }
    if (callerRole !== "master_admin") {
      return jsonResponse({ error: "NOT_AUTHORIZED: only master_admin can create district_admins" }, 403);
    }
    targetDistrictId = body.district_id;
  }

  // District admin can only provision within their own district
  if (callerRole === "admin") {
    if (targetDistrictId && targetDistrictId !== profile.district_id) {
      return jsonResponse({ error: "NOT_AUTHORIZED: district_admin can only provision in their own district" }, 403);
    }
    targetDistrictId = profile.district_id;
  }

  const emailDomain = ROLE_EMAIL_DOMAINS[body.role];
  const identifier  = body.governmentId ?? body.displayName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const email       = `${identifier.replace(/[^a-z0-9-]/g, "-")}@${emailDomain}`;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Create the Supabase Auth user
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: body.temporaryPassword,
    email_confirm: true,
    user_metadata: {
      display_name:  body.displayName,
      government_id: body.governmentId ?? null,
      role:          body.role,
    },
  });

  if (createError || !created?.user) {
    const isDuplicate = createError?.message?.includes("already been registered");
    return jsonResponse({
      error: isDuplicate ? "EMAIL_ALREADY_EXISTS" : (createError?.message ?? "CREATE_FAILED"),
    }, isDuplicate ? 409 : 400);
  }

  // Update the auto-created profile (role + district + name + phone + status)
  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({
      role:        body.role === "district_admin" ? "admin" : body.role,
      district_id: targetDistrictId ?? null,
      full_name:   body.displayName,
      phone:       body.phone ?? null,
      status:      "ACTIVE",
    })
    .eq("id", created.user.id);

  if (profileUpdateError) {
    // Profile update failed — clean up the auth user to avoid orphaned auth records
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: "PROFILE_UPDATE_FAILED: " + profileUpdateError.message }, 500);
  }

  // For conductor/driver: also insert a conductors row so they can be assigned to trips
  if (body.role === "conductor" || body.role === "driver") {
    const { error: conductorInsertError } = await admin
      .from("conductors")
      .insert({
        user_id:       created.user.id,
        government_id: body.governmentId,
        display_name:  body.displayName,
        phone:         body.phone ?? null,
        district_id:   targetDistrictId ?? null,
        is_active:     true,
      });

    if (conductorInsertError) {
      console.warn("conductors insert failed (non-fatal):", conductorInsertError.message);
    }
  }

  return jsonResponse({
    userId:      created.user.id,
    email,
    role:        body.role,
    district_id: targetDistrictId ?? null,
  }, 200);
});
