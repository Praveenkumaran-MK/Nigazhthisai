import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, TripOccupancy, TripStop } from "@sbt/shared-types";
import { toAppError } from "./errors";

export async function startTrip(
  client: SupabaseClient,
  tripId: string,
  busQr?: string,
): Promise<Trip> {
  // 1. Try 2-arg start_trip (migration 042+)
  let res = await client.rpc("start_trip", {
    p_trip_id: tripId,
    p_bus_qr: busQr ?? null,
  });

  // 2. Fallback to 1-arg start_trip if remote database only has the original function
  if (
    res.error &&
    (res.error.code === "PGRST202" ||
      res.error.message?.includes("schema cache") ||
      res.error.message?.includes("function") ||
      res.error.message?.includes("start_trip"))
  ) {
    console.warn("[startTrip] 2-arg start_trip not found, calling 1-arg fallback:", res.error);
    res = await client.rpc("start_trip", {
      p_trip_id: tripId,
    });
  }

  // 3. Fallback to direct status transition if RPC is unavailable in schema cache
  if (
    res.error &&
    (res.error.code === "PGRST202" || res.error.message?.includes("schema cache"))
  ) {
    console.warn("[startTrip] start_trip RPC missing, updating trips table directly:", res.error);
    const { data: updated, error: updateErr } = await client
      .from("trips")
      .update({
        status: "ACTIVE",
        started_at: new Date().toISOString(),
      })
      .eq("id", tripId)
      .select("*")
      .single();

    if (updateErr) throw toAppError(updateErr);
    return updated as unknown as Trip;
  }

  if (res.error) throw toAppError(res.error);
  return res.data as unknown as Trip;
}

export async function departStopAndExpireTickets(
  client: SupabaseClient,
  tripId: string,
  stopId: string,
): Promise<void> {
  const { error } = await client.rpc("depart_stop_and_expire_tickets", {
    p_trip_id: tripId,
    p_stop_id: stopId,
  });
  if (error) throw toAppError(error);
}

export async function listTripStops(client: SupabaseClient, tripId: string): Promise<TripStop[]> {
  const { data, error } = await client
    .from("trip_stops")
    .select("*")
    .eq("trip_id", tripId)
    .order("sequence_order");
  if (error) throw toAppError(error);
  return (data ?? []) as TripStop[];
}

export async function getTripOccupancy(client: SupabaseClient, tripId: string): Promise<TripOccupancy | null> {
  const { data, error } = await client.from("trip_occupancy").select("*").eq("trip_id", tripId).maybeSingle();
  if (error) throw toAppError(error);
  return data as TripOccupancy | null;
}

/**
 * Materializes a PLANNED schedule into a real trip (+ trip_stops copied from
 * the route). Without this, Admin's Schedules page created rows nothing
 * ever consumed — no trip existed for a conductor to pick up the next day.
 */
export async function confirmScheduleAndCreateTrip(
  client: SupabaseClient,
  scheduleId: string,
  conductorId: string,
): Promise<Trip> {
  const { data, error } = await client.rpc("confirm_schedule_and_create_trip", {
    p_schedule_id: scheduleId,
    p_conductor_id: conductorId,
  });
  if (error) throw toAppError(error);
  return data as unknown as Trip;
}

export async function getConductorScheduledTrip(client: SupabaseClient, conductorId: string): Promise<Trip | null> {
  const { data, error } = await client
    .from("trips")
    .select("*")
    .eq("conductor_id", conductorId)
    .eq("service_date", new Date().toISOString().slice(0, 10))
    .in("status", ["SCHEDULED", "ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error);
  return data as Trip | null;
}

export async function endTrip(
  client: SupabaseClient,
  tripId: string,
  busQr?: string,
): Promise<{ success: boolean; status: string; trip_id?: string; bus_number?: string }> {
  // 1. Try end_trip RPC
  const res = await client.rpc("end_trip", {
    p_trip_id: tripId,
    p_bus_qr: busQr ?? null,
  });

  if (res.error) {
    // Graceful fallback if RPC is not yet loaded in schema cache
    if (
      res.error.code === "PGRST202" ||
      res.error.message?.includes("schema cache") ||
      res.error.message?.includes("function") ||
      res.error.message?.includes("end_trip")
    ) {
      console.warn("[endTrip] end_trip RPC missing, executing direct fallback:", res.error);
      const now = new Date().toISOString();

      // Update trip status to COMPLETED
      const { data: updatedTrip, error: tripErr } = await client
        .from("trips")
        .update({
          status: "COMPLETED",
          ended_at: now,
        })
        .eq("id", tripId)
        .select("id, status, bus_id, buses(bus_number)")
        .single();

      if (tripErr) throw toAppError(tripErr);

      // Mark current ARRIVED stops as DEPARTED
      await client
        .from("trip_stops")
        .update({ status: "DEPARTED", departure_time: now })
        .eq("trip_id", tripId)
        .eq("status", "ARRIVED");

      // Expire all remaining active/paid/validated tickets for this trip
      await client
        .from("tickets")
        .update({ status: "EXPIRED" })
        .eq("trip_id", tripId)
        .in("status", ["PAID", "VALIDATED"]);

      // Reset occupancy
      await client
        .from("trip_occupancy")
        .update({ current_passenger_count: 0 })
        .eq("trip_id", tripId);

      const bus = Array.isArray(updatedTrip?.buses) ? updatedTrip.buses[0] : updatedTrip?.buses;
      return {
        success: true,
        status: "COMPLETED",
        trip_id: tripId,
        bus_number: bus?.bus_number,
      };
    }

    throw toAppError(res.error);
  }

  return (res.data ?? { success: true, status: "COMPLETED" }) as {
    success: boolean;
    status: string;
    trip_id?: string;
    bus_number?: string;
  };
}

