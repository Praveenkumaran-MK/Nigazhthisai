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

export interface RouteDemandInsight {
  route_id: string;
  route_number: string;
  route_name: string;
  total_passengers: number;
  total_trips: number;
  busiest_origin_stop: string;
  busiest_origin_count: number;
  busiest_dest_stop: string;
  busiest_dest_count: number;
  avg_trip_utilization_pct: number;
  surge_detected: boolean;
  suggested_additional_buses: number;
}

export async function computeRouteDemandAnalytics(
  client: SupabaseClient,
  routeId?: string,
  targetDate?: string,
): Promise<RouteDemandInsight[]> {
  const { data, error } = await client.rpc("compute_route_demand_analytics", {
    p_route_id: routeId ?? null,
    p_target_date: targetDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw toAppError(error);
  return (data ?? []) as RouteDemandInsight[];
}

