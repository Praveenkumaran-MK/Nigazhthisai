import type { SupabaseClient } from "@supabase/supabase-js";
import { toAppError } from "./errors";

/**
 * Admin-only, atomic route-stop ordering RPCs (see
 * supabase/migrations/...012_route_stop_ordering.sql). Previously the Admin
 * UI mutated `route_stops.sequence_order` directly with sequential client
 * UPDATEs, which always collided with the table's unique constraint — these
 * wrappers replace that with single-transaction server-side functions.
 */
export async function reorderRouteStop(
  client: SupabaseClient,
  routeId: string,
  stopId: string,
  direction: -1 | 1,
): Promise<void> {
  const { error } = await client.rpc("reorder_route_stop", {
    p_route_id: routeId,
    p_stop_id: stopId,
    p_direction: direction,
  });
  if (error) throw toAppError(error);
}

export async function addRouteStop(client: SupabaseClient, routeId: string, stopId: string): Promise<void> {
  const { error } = await client.rpc("add_route_stop", { p_route_id: routeId, p_stop_id: stopId });
  if (error) throw toAppError(error);
}

export async function removeRouteStop(client: SupabaseClient, routeId: string, stopId: string): Promise<void> {
  const { error } = await client.rpc("remove_route_stop", { p_route_id: routeId, p_stop_id: stopId });
  if (error) throw toAppError(error);
}
