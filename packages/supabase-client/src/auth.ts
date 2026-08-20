/// <reference types="vite/client" />
import type { SupabaseClient, Session } from "@supabase/supabase-js";

/**
 * Passenger auth: "zero-login" from the user's perspective. Internally this
 * establishes a Supabase ANONYMOUS auth session (auth.signInAnonymously()),
 * which gives the browser a real, server-verified auth.uid() that RLS uses
 * to scope ticket visibility (`tickets.passenger_session_id = auth.uid()`).
 * No form, password or identity is ever shown.
 */
export async function ensurePassengerSession(client: SupabaseClient): Promise<Session> {
  const { data: existing } = await client.auth.getSession();
  if (existing.session) return existing.session;

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`Failed to establish passenger session: ${error?.message ?? "unknown error"}`);
  }
  return data.session;
}

/**
 * Conductor login: the UI collects a government ID (e.g. "TN-MTC-8492") and
 * a password issued by the admin at provisioning time. Internally this maps
 * to the synthetic Supabase Auth email <govt-id>@conductor.internal created
 * by the `provision-conductor` Edge Function. The government-ID UX is
 * preserved; the underlying identity is a real Supabase Auth user.
 */
export async function signInConductor(
  client: SupabaseClient,
  governmentId: string,
  password: string,
): Promise<Session> {
  const email = `${governmentId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}@conductor.internal`;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(error?.message ?? "Invalid government ID or password");
  }
  return data.session;
}

/**
 * DEV-ONLY conductor auth shortcut. Guarded by import.meta.env.DEV so it can
 * never run in a production build. Lets a developer exercise the conductor
 * app locally without a mailer/SMS provider configured, by signing in with
 * a fixed local Supabase Auth test user seeded via the Supabase CLI
 * (`supabase/seed.sql` does NOT create auth.users rows — see README "Local
 * development" section for the one-time `supabase auth` seed command).
 */
export async function devSignInConductor(client: SupabaseClient, governmentId: string): Promise<Session> {
  if (!import.meta.env.DEV) {
    throw new Error("devSignInConductor is only available in development builds");
  }
  return signInConductor(client, governmentId, "dev-local-password-only");
}

/** Admin login: standard Supabase email/password. */
export async function signInAdmin(client: SupabaseClient, email: string, password: string): Promise<Session> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(error?.message ?? "Invalid email or password");
  }
  return data.session;
}

export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}
