import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import type { Trip, RouteWithStops, TripStop, Bus as BusModel, Stop, TripOccupancy } from "@sbt/shared-types";
import { getRouteWithStops, listTripStops, getTripOccupancy } from "@sbt/supabase-client";
import { LoadingState } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useRealtimeBusTracking } from "../hooks/useRealtimeBusTracking";
import { BusPipelineTracker, PipelineStopRow } from "../components/BusPipelineTracker";

interface StopRow extends TripStop {
  stop: Stop;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function LiveMapPage() {
  const { tripId } = useParams<{ tripId: string }>();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<RouteWithStops | null>(null);
  const [bus, setBus] = useState<BusModel | null>(null);
  const [occupancy, setOccupancy] = useState<TripOccupancy | null>(null);
  const [stopRows, setStopRows] = useState<StopRow[]>([]);

  const loadTripData = useCallback(async () => {
    if (!tripId) return;
    const { data } = await supabase.from("trips").select("*").eq("id", tripId).single();
    if (!data) return;
    const t = data as Trip;
    setTrip(t);
    const [routeDetail, busRow, tripStops, occ] = await Promise.all([
      getRouteWithStops(supabase, t.route_id),
      supabase.from("buses").select("*").eq("id", t.bus_id).single().then(({ data: b }) => b as BusModel | null),
      listTripStops(supabase, tripId),
      getTripOccupancy(supabase, tripId).catch(() => null),
    ]);
    setRoute(routeDetail);
    setBus(busRow);
    setOccupancy(occ);

    const { data: stopsData } = await supabase
      .from("stops_public")
      .select("*")
      .in("id", tripStops.map((s) => s.stop_id));
    const byId = new Map(((stopsData ?? []) as Stop[]).map((s) => [s.id, s]));
    setStopRows(tripStops.map((s) => ({ ...s, stop: byId.get(s.stop_id)! })).filter((s) => s.stop));
  }, [tripId]);

  useEffect(() => {
    void loadTripData();
  }, [loadTripData]);

  // Real-time telemetry & stop progression subscription
  useEffect(() => {
    if (!tripId) return;

    const channel = supabase
      .channel(`live-trip-sync:${tripId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
        (payload) => {
          setTrip((prev) => (prev ? { ...prev, ...(payload.new as Trip) } : (payload.new as Trip)));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_stops", filter: `trip_id=eq.${tripId}` },
        () => {
          void listTripStops(supabase, tripId).then(async (tripStops) => {
            const { data: stopsData } = await supabase
              .from("stops_public")
              .select("*")
              .in("id", tripStops.map((s) => s.stop_id));
            const byId = new Map(((stopsData ?? []) as Stop[]).map((s) => [s.id, s]));
            setStopRows(tripStops.map((s) => ({ ...s, stop: byId.get(s.stop_id)! })).filter((s) => s.stop));
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_occupancy", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setOccupancy(payload.new as TripOccupancy);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  const { connectionState, position, telemetry, isStale } = useRealtimeBusTracking(
    trip?.route_id ?? null,
    trip?.bus_id ?? null,
  );

  // Calculate cumulative distance and platform for the pipeline view
  const pipelineStops: PipelineStopRow[] = useMemo(() => {
    if (stopRows.length === 0) return [];
    const originLoc = stopRows[0]?.stop?.location;
    return stopRows.map((s, idx) => {
      let distKm = idx * 8;
      if (originLoc && s.stop?.location) {
        distKm = calculateDistanceKm(
          originLoc.latitude,
          originLoc.longitude,
          s.stop.location.latitude,
          s.stop.location.longitude
        );
      }
      return {
        ...s,
        distanceKm: distKm,
        platform: (idx % 3) + 1,
      };
    });
  }, [stopRows]);

  if (!trip || !route) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LoadingState label="Connecting to bus live tracking…" />
      </div>
    );
  }

  const isLive = connectionState === "connected" && Boolean(position) && !isStale && trip.status === "ACTIVE";

  return (
    <BusPipelineTracker
      trip={trip}
      route={route}
      bus={bus}
      stops={pipelineStops}
      occupancy={occupancy}
      speedKmh={telemetry?.speed != null ? Math.round(telemetry.speed * 3.6) : (trip.current_speed ?? null)}
      isLive={isLive}
      onRefresh={() => void loadTripData()}
    />
  );
}
