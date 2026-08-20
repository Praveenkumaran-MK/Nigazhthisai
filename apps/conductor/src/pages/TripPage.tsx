import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Badge,
  LoadingState,
  StatusIndicator,
  useToast,
  AppHeader,
  TransitBusRunner,
  ConductorHero,
} from "@sbt/ui";
import type { Trip, TripStop, TripOccupancy, Stop } from "@sbt/shared-types";
import { startTrip, departStopAndExpireTickets, listTripStops, getTripOccupancy } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useConductorAuth } from "../hooks/useConductorAuth";
import { useWakeLock } from "../hooks/useWakeLock";
import { useGpsTelemetry } from "../hooks/useGpsTelemetry";
import { useSosLongPress } from "../hooks/useSosLongPress";
import { createAlert } from "@sbt/supabase-client";
import { PocketMode } from "../components/PocketMode";

interface StopRow extends TripStop {
  stop: Stop;
}

export function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { conductor } = useConductorAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [occupancy, setOccupancy] = useState<TripOccupancy | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [pocketMode, setPocketMode] = useState(false);
  const [departingStopId, setDepartingStopId] = useState<string | null>(null);

  const wakeLock = useWakeLock();

  const loadTrip = useCallback(async () => {
    if (!tripId) return;
    const { data } = await supabase.from("trips").select("*").eq("id", tripId).single();
    setTrip(data as Trip);
    const tripStops = await listTripStops(supabase, tripId);
    const { data: stopRows } = await supabase.from("stops").select("*").in(
      "id",
      tripStops.map((s) => s.stop_id),
    );
    const stopById = new Map((stopRows ?? []).map((s) => [s.id, s as Stop]));
    setStops(tripStops.map((s) => ({ ...s, stop: stopById.get(s.stop_id)! })));
    setOccupancy(await getTripOccupancy(supabase, tripId));
  }, [tripId]);

  useEffect(() => {
    void loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    if (!tripId) return;
    // Previously only watched trip_stops/trip_occupancy — trips itself
    // wasn't included, so when depart_stop_and_expire_tickets flipped the
    // trip to COMPLETED, this screen kept showing ACTIVE, kept offering
    // Depart buttons, and kept broadcasting GPS on a finished trip. (Also
    // requires migration 011, which adds these tables to the
    // supabase_realtime publication — without that, none of this fires.)
    const channel = supabase
      .channel(`trip-live:${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` }, () => void loadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_stops", filter: `trip_id=eq.${tripId}` }, () => void loadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_occupancy", filter: `trip_id=eq.${tripId}` }, () => void loadTrip())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, loadTrip]);

  // Release the Wake Lock once the trip completes (it was previously never
  // released by any caller, leaking past trip end) or when this screen
  // unmounts.
  useEffect(() => {
    if (trip?.status === "COMPLETED") {
      void wakeLock.release();
    }
    // wakeLock.release is stable (useCallback with empty deps); depending
    // on the whole `wakeLock` object would re-run this every render since
    // useWakeLock() returns a fresh object literal each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.status, wakeLock.release]);

  useEffect(() => {
    return () => {
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const telemetry = useGpsTelemetry({
    busId: trip?.bus_id ?? "",
    tripId: trip?.id ?? "",
    routeId: trip?.route_id ?? "",
    conductorId: conductor?.id ?? "",
    enabled: trip?.status === "ACTIVE" && Boolean(conductor),
  });

  const handleStartService = async () => {
    if (!tripId) return;
    setIsStarting(true);
    // Fire-and-forget, outside the try below: a Wake Lock failure must
    // never block starting GPS tracking. (useWakeLock().request() already
    // catches its own errors internally rather than throwing, but this
    // keeps the call site honest about that instead of relying on it.)
    void wakeLock.request();
    try {
      const updated = await startTrip(supabase, tripId);
      setTrip(updated);
      push({ tone: "success", title: "Service started", description: "Broadcasting your live location." });
    } catch (e) {
      push({ tone: "danger", title: "Could not start service", description: e instanceof Error ? e.message : undefined });
    } finally {
      setIsStarting(false);
    }
  };

  const handleDepart = async (stopId: string) => {
    if (!tripId) return;
    setDepartingStopId(stopId);
    try {
      await departStopAndExpireTickets(supabase, tripId, stopId);
      push({ tone: "info", title: "Stop marked as departed" });
      // Don't rely solely on the realtime subscription to refresh — call
      // it directly too, so the UI updates immediately even if a Postgres
      // Changes event is delayed or (before migration 011) never arrives.
      await loadTrip();
    } catch (e) {
      push({ tone: "danger", title: "Could not update stop", description: e instanceof Error ? e.message : undefined });
    } finally {
      setDepartingStopId(null);
    }
  };

  const handleSos = async () => {
    if (!conductor) return;
    try {
      await createAlert(supabase, {
        trip_id: trip?.id ?? null,
        bus_id: trip?.bus_id ?? null,
        conductor_id: conductor.id,
        severity: "SOS",
        message: "SOS triggered by conductor",
        latitude: telemetry.lastTelemetry?.latitude ?? null,
        longitude: telemetry.lastTelemetry?.longitude ?? null,
      });
      push({ tone: "danger", title: "SOS sent", description: "Admin has been alerted." });
    } catch (e) {
      push({ tone: "danger", title: "SOS failed to send", description: e instanceof Error ? e.message : undefined });
    }
  };
  const sos = useSosLongPress(handleSos);

  if (!trip) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label="Loading trip…" />
      </div>
    );
  }

  if (pocketMode) {
    return <PocketMode telemetryStatus={telemetry.status} onExit={() => setPocketMode(false)} sos={sos} />;
  }

  return (
    <div className="flex flex-col">
      <AppHeader
        sticky
        title={<Badge tone={trip.status === "ACTIVE" ? "success" : "neutral"}>{trip.status}</Badge>}
        subtitle={
          <span className="inline-flex items-center gap-1">
            GPS:
            <StatusIndicator
              status={telemetry.status === "watching" ? "online" : telemetry.status === "denied" ? "error" : "connecting"}
              label={telemetry.status}
            />
          </span>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate(`/trip/${trip.id}/scanner`)}>
            Scan tickets
          </Button>
        }
      >
        {trip.status === "ACTIVE" && stops.length > 1 && (
          <TransitBusRunner
            label="Route progress"
            progress={(Math.max(0, stops.findIndex((s) => s.stop_id === trip.current_stop_id)) / Math.max(1, stops.length - 1)) * 100}
            stops={stops.map((s, i) => ({
              label: s.stop.name,
              atPercent: (i / Math.max(1, stops.length - 1)) * 100,
              done: s.status === "DEPARTED",
            }))}
          />
        )}
      </AppHeader>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-5 pb-28">
      {trip.status === "SCHEDULED" && (
        <>
          <ConductorHero className="h-40 w-full" />
          <Button size="lg" isLoading={isStarting} onClick={handleStartService}>
            Start service
          </Button>
        </>
      )}

      {trip.status === "ACTIVE" && occupancy && (
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Occupancy</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {occupancy.current_passenger_count} / {occupancy.capacity}
          </p>
          <p className="text-sm text-slate-500">{occupancy.capacity - occupancy.current_passenger_count} seats available</p>
        </Card>
      )}

      <Card>
        <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Upcoming stops</p>
        <ol className="flex flex-col gap-2">
          {stops.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg bg-[#0a0a0a] px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-100">{s.stop.name}</p>
                <Badge tone={s.status === "DEPARTED" ? "neutral" : s.status === "ARRIVED" ? "brand" : "neutral"}>
                  {s.status}
                </Badge>
              </div>
              {/* Only the trip's current stop may be departed — matches the
                  server-side guard in depart_stop_and_expire_tickets, which
                  now rejects any other stop_id. Showing the button on every
                  non-departed stop previously let a mis-tap on a later stop
                  complete the trip early. */}
              {s.stop_id === trip.current_stop_id && s.status !== "DEPARTED" && trip.status === "ACTIVE" && (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={departingStopId === s.stop_id}
                  onClick={() => handleDepart(s.stop_id)}
                >
                  Departed
                </Button>
              )}
            </li>
          ))}
        </ol>
      </Card>

      {trip.status === "ACTIVE" && (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setPocketMode(true)}>
            Pocket mode
          </Button>
          <Button
            variant="danger"
            className="flex-1 select-none"
            {...sos.handlers}
            style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.35) ${sos.progress * 100}%, transparent ${sos.progress * 100}%)` }}
          >
            {sos.isPressing ? "Hold for SOS…" : "SOS (hold)"}
          </Button>
        </div>
      )}
      </div>
    </div>
  );
}
