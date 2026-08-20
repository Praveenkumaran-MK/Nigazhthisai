import type { SupabaseClient } from "@supabase/supabase-js";
import type { EligibleBus } from "@sbt/shared-types";
import { toAppError } from "./errors";

/**
 * Implements the "must exclude buses that already passed the passenger's
 * origin" rule via the list_eligible_buses RPC (ordered trip_stops
 * progression), never by comparing raw GPS proximity.
 */
export async function listEligibleBuses(
  client: SupabaseClient,
  routeId: string,
  originStopId: string,
): Promise<EligibleBus[]> {
  const { data, error } = await client.rpc("list_eligible_buses", {
    p_route_id: routeId,
    p_origin_stop_id: originStopId,
  });
  if (error) throw toAppError(error);
  return (data ?? []) as EligibleBus[];
}
