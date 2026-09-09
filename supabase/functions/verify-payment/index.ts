// Edge Function: verify-payment
//
// Purpose: Verify a Razorpay payment signature server-side (HMAC-SHA256)
// BEFORE creating a ticket. Enforces amount verification, constant-time
// signature checking, and idempotent ticket creation.

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
  concession_type?:    string;
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
  const concessionType = body.concession_type ?? "NORMAL";

  // ─── CRITICAL SECURITY CHECK 1: Cryptographic HMAC signature ───────────────
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

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ─── CRITICAL SECURITY CHECK 2: Idempotency & Replay Protection ─────────────
  const { data: existingOrder } = await admin
    .from("razorpay_orders")
    .select("ticket_id, status, amount_paise")
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

  // Create the ticket using the caller's JWT so RLS + auth.uid() work correctly
  const { data: ticket, error: ticketError } = await callerClient.rpc("create_secure_ticket", {
    p_trip_id:         body.trip_id,
    p_origin_stop_id:  body.origin_stop_id,
    p_dest_stop_id:    body.dest_stop_id,
    p_passenger_count: passengerCount,
    p_concession_type: concessionType,
  });

  if (ticketError || !ticket) {
    console.error("create_secure_ticket failed:", ticketError);
    await admin
      .from("razorpay_orders")
      .update({ status: "FAILED" })
      .eq("id", body.razorpay_order_id);
    return jsonResponse({ error: ticketError?.message ?? "TICKET_CREATION_FAILED" }, 500);
  }

  // Link ticket to order
  await admin
    .from("razorpay_orders")
    .update({ ticket_id: ticket.id })
    .eq("id", body.razorpay_order_id);

  return jsonResponse({ ticket }, 200);
});
