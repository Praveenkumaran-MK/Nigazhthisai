import type { SupabaseClient } from "@supabase/supabase-js";
import type { NearestStopResult, Route, RouteWithStops, Stop } from "@sbt/shared-types";
import { toAppError } from "./errors";

/** Uses the PostGIS find_nearest_stop RPC — never fetches every stop to compute distance client-side. */
export async function findNearestStop(
  client: SupabaseClient,
  latitude: number,
  longitude: number,
): Promise<NearestStopResult | null> {
  const { data, error } = await client.rpc("find_nearest_stop", {
    p_latitude: latitude,
    p_longitude: longitude,
    p_limit: 1,
  });
  if (error) throw toAppError(error);
  return (data as NearestStopResult[] | null)?.[0] ?? null;
}

// Reads use `stops_public` (see migrations/...009_public_views.sql), which
// decodes the PostGIS geography column into plain {latitude, longitude}
// JSON — the raw `stops` table's `location` column comes back from
// PostgREST as WKB hex and is not directly usable by a JS client.
export async function listStops(client: SupabaseClient): Promise<Stop[]> {
  const { data, error } = await client.from("stops_public").select("*").order("name");
  if (error) throw toAppError(error);
  return (data ?? []) as unknown as Stop[];
}

export async function listRoutes(client: SupabaseClient): Promise<Route[]> {
  const { data, error } = await client.from("routes").select("*").order("route_number");
  if (error) throw toAppError(error);
  return (data ?? []) as Route[];
}

export async function getRouteWithStops(client: SupabaseClient, routeId: string): Promise<RouteWithStops | null> {
  const { data: route, error: routeError } = await client.from("routes").select("*").eq("id", routeId).single();
  if (routeError) throw toAppError(routeError);
  if (!route) return null;

  const { data: routeStops, error: stopsError } = await client
    .from("route_stops")
    .select("sequence_order, stops_public(*)")
    .eq("route_id", routeId)
    .order("sequence_order");
  if (stopsError) throw toAppError(stopsError);

  const stops = (routeStops ?? []).map((rs) => ({
    ...(rs as unknown as { stops_public: Stop }).stops_public,
    sequence_order: (rs as unknown as { sequence_order: number }).sequence_order,
  }));

  return { ...(route as Route), stops };
}

export async function getFare(
  client: SupabaseClient,
  routeId: string,
  originStopId: string,
  destStopId: string,
): Promise<number> {
  try {
    // 1. Check direct route entry in fare_matrix
    const { data: directData } = await client
      .from("fare_matrix")
      .select("flat_fare_amount")
      .eq("route_id", routeId)
      .eq("origin_stop_id", originStopId)
      .eq("dest_stop_id", destStopId)
      .maybeSingle();

    if (directData?.flat_fare_amount && Number(directData.flat_fare_amount) > 0) {
      return Number(directData.flat_fare_amount);
    }

    // 2. Check reverse direction entry in fare_matrix
    const { data: reverseData } = await client
      .from("fare_matrix")
      .select("flat_fare_amount")
      .eq("route_id", routeId)
      .eq("origin_stop_id", destStopId)
      .eq("dest_stop_id", originStopId)
      .maybeSingle();

    if (reverseData?.flat_fare_amount && Number(reverseData.flat_fare_amount) > 0) {
      return Number(reverseData.flat_fare_amount);
    }

    // 3. Attempt calculate_fare RPC
    const { data: rpcFare, error: rpcError } = await client.rpc("calculate_fare", {
      p_route_id: routeId,
      p_origin_stop_id: originStopId,
      p_dest_stop_id: destStopId,
    });

    if (!rpcError && rpcFare != null && Number(rpcFare) > 0) {
      return Number(rpcFare);
    }

    // 4. Calculate based on route_stops hop distance
    const { data: stops } = await client
      .from("route_stops")
      .select("stop_id, sequence_order")
      .eq("route_id", routeId)
      .in("stop_id", [originStopId, destStopId]);

    if (stops && stops.length >= 2) {
      const s1 = stops.find((s) => s.stop_id === originStopId)?.sequence_order ?? 1;
      const s2 = stops.find((s) => s.stop_id === destStopId)?.sequence_order ?? 2;
      const hops = Math.max(1, Math.abs(s2 - s1));
      return Math.round(10 + hops * 5);
    }
  } catch (err) {
    console.warn("Error calculating dynamic fare, using default fallback:", err);
  }

  // Safe standard transit base fare fallback
  return 15;
}
