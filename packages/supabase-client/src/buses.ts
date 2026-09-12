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

/**
 * Validates a scanned bus QR code against the assigned bus identity.
 */
export async function verifyBusQr(
  client: SupabaseClient,
  qrString: string,
  busId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("verify_bus_qr", {
    p_qr_string: qrString,
    p_bus_id: busId,
  });
  if (error) throw toAppError(error);
  return Boolean(data);
}

