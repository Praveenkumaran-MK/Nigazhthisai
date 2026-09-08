// Edge Function: verify-payment
//
// Purpose: Verify a Razorpay payment signature server-side (HMAC-SHA256)
// BEFORE creating a ticket. Without this, any attacker who reverse-engineers
// the client code could POST a fake success payload and get free tickets.
//
// Flow:
//   1. Passenger completes payment in Razorpay checkout
//   2. Client receives: razorpay_order_id, razorpay_payment_id, razorpay_signature
//   3. Client POSTs all three (+ trip/stop context) to THIS function
//   4. We verify: HMAC-SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET) == signature
//   5. Only on success → call create_secure_ticket RPC with the passenger's JWT
//   6. Return the ticket record
//
// Deploy:  supabase functions deploy verify-payment
// Secrets: supabase secrets set RAZORPAY_KEY_SECRET=<live/test secret>

import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encode as encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

interface VerifyPaymentRequest {
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
  // Ticket creation context (mirrors create_secure_ticket args)
  trip_id:             string;
  origin_stop_id:      string;
  dest_stop_id:        string;
  passenger_count:     number;
}

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

async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(`${orderId}|${paymentId}`);
  const signatureBytes = await crypto.subtle.sign("HMAC", key, data);
  const expected = new TextDecoder().decode(encodeHex(new Uint8Array(signatureBytes)));
  // Constant-time compare to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
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

  const supabaseUrl       = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const razorpaySecret    = Deno.env.get("RAZORPAY_KEY_SECRET");
  const razorpayTestMode  = Deno.env.get("RAZORPAY_TEST_MODE") === "true";

  if (!razorpaySecret) {
    console.error("RAZORPAY_KEY_SECRET not configured");
    return jsonResponse({ error: "SERVER_MISCONFIGURED" }, 500);
  }

  // Validate the caller's session
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "INVALID_SESSION" }, 401);
  }

  let body: VerifyPaymentRequest;
  try {
    body = (await req.json()) as VerifyPaymentRequest;
  } catch {
    return jsonResponse({ error: "INVALID_JSON_BODY" }, 400);
  }

  // Validate required fields
  const required = ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature", "trip_id", "origin_stop_id", "dest_stop_id"];
  for (const field of required) {
    if (!(body as Record<string, unknown>)[field]) {
      return jsonResponse({ error: `MISSING_FIELD: ${field}` }, 400);
    }
  }
  const passengerCount = Math.max(1, Math.min(6, Math.floor(body.passenger_count ?? 1)));

  // ─── CRITICAL SECURITY CHECK ────────────────────────────────────────────────
  // Verify Razorpay HMAC signature BEFORE doing anything with the database.
  // If this check fails, the request is fraudulent — reject immediately.
  const isValid = await verifyRazorpaySignature(
    body.razorpay_order_id,
    body.razorpay_payment_id,
    body.razorpay_signature,
    razorpaySecret,
  );

  if (!isValid) {
    console.warn(`PAYMENT FRAUD ATTEMPT from user ${userData.user.id}: invalid signature for order ${body.razorpay_order_id}`);
    return jsonResponse({ error: "PAYMENT_SIGNATURE_INVALID" }, 400);
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Use the service-role client to record the payment and create the ticket.
  // Service role bypasses RLS on razorpay_orders but NOT on tickets —
  // create_secure_ticket is SECURITY DEFINER and enforces its own rules.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Idempotency: if this payment_id already has a ticket, return the existing one
  const { data: existingOrder } = await admin
    .from("razorpay_orders")
    .select("ticket_id, status")
    .eq("razorpay_payment_id", body.razorpay_payment_id)
    .single();

  if (existingOrder?.ticket_id) {
    const { data: existingTicket } = await admin
      .from("tickets")
      .select("*")
      .eq("id", existingOrder.ticket_id)
      .single();
    return jsonResponse({ ticket: existingTicket, idempotent: true }, 200);
  }

  // Record the verified payment (upsert on order_id)
  await admin
    .from("razorpay_orders")
    .upsert({
      id:                  body.razorpay_order_id,
      passenger_id:        userData.user.id,
      trip_id:             body.trip_id,
      origin_stop_id:      body.origin_stop_id,
      dest_stop_id:        body.dest_stop_id,
      passenger_count:     passengerCount,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature:  body.razorpay_signature,
      status:              "PAID",
    }, { onConflict: "id" });

  // Now create the ticket using the caller's JWT so RLS + auth.uid() work correctly
  const { data: ticket, error: ticketError } = await callerClient.rpc("create_secure_ticket", {
    p_trip_id:         body.trip_id,
    p_origin_stop_id:  body.origin_stop_id,
    p_dest_stop_id:    body.dest_stop_id,
    p_passenger_count: passengerCount,
  });

  if (ticketError || !ticket) {
    console.error("create_secure_ticket failed:", ticketError);
    // Mark the order as FAILED so it can be investigated
    await admin
      .from("razorpay_orders")
      .update({ status: "FAILED" })
      .eq("id", body.razorpay_order_id);
    return jsonResponse({ error: ticketError?.message ?? "TICKET_CREATION_FAILED" }, 500);
  }

  // Link the ticket to the order
  await admin
    .from("razorpay_orders")
    .update({ ticket_id: ticket.id })
    .eq("id", body.razorpay_order_id);

  return jsonResponse({ ticket }, 200);
});
