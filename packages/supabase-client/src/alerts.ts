import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert, AlertInsert } from "@sbt/shared-types";
import { toAppError } from "./errors";

/**
 * Direct table insert (not an RPC) is intentional and safe here: RLS policy
 * `alerts_conductor_insert` (migration 007) already enforces
 * `conductor_id = current_conductor_id()` and trip ownership at the database
 * layer, so a single-row insert is inherently atomic — no RPC is needed.
 */
export async function createAlert(client: SupabaseClient, input: AlertInsert): Promise<Alert> {
  const { data, error } = await client.from("alerts").insert(input).select().single();
  if (error) throw toAppError(error);
  return data as Alert;
}

export async function acknowledgeAlert(client: SupabaseClient, alertId: string): Promise<void> {
  const { error } = await client.from("alerts").update({ status: "ACKNOWLEDGED" }).eq("id", alertId);
  if (error) throw toAppError(error);
}

export async function resolveAlert(client: SupabaseClient, alertId: string): Promise<void> {
  const { error } = await client
    .from("alerts")
    .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
    .eq("id", alertId);
  if (error) throw toAppError(error);
}

export async function listActiveAlerts(client: SupabaseClient): Promise<Alert[]> {
  const { data, error } = await client
    .from("alerts")
    .select("*")
    .in("status", ["ACTIVE", "ACKNOWLEDGED"])
    .order("created_at", { ascending: false });
  if (error) throw toAppError(error);
  return (data ?? []) as Alert[];
}
