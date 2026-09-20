import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import type { Trip, RouteWithStops, TripStop, Bus as BusModel, Stop } from "@sbt/shared-types";
import { getRouteWithStops, listTripStops } from "@sbt/supabase-client";
import { MapFrame, Badge, LoadingState, StatusIndicator, AppHeader, TransitBusRunner, WheelchairIcon } from "@sbt/ui";
import { Bus, GitCommitVertical } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRealtimeBusTracking } from "../hooks/useRealtimeBusTracking";
import { BusPipelineTracker, PipelineStopRow } from "../components/BusPipelineTracker";

const stopIcon = L.divIcon({
  className: "",
  html: `<div style="width:12px;height:12px;border-radius:9999px;background:#64748b;border:2px solid white;box-shadow:0 0 0 1px #64748b"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function busIcon(heading: number | null) {
  const rotation = heading ?? 0;
  return L.divIcon({
    className: "",
    html: `<div style="transform:rotate(${rotation}deg)"><svg width="34" height="34" viewBox="0 0 24 24" fill="#D97F00" stroke="white" stroke-width="1"><path d="M12 2L4 20h16L12 2z"/></svg></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Default to pipeline view (Where is My Train style from Image 2)
  const [viewMode, setViewMode] = useState<"pipeline" | "map">(
    searchParams.get("view") === "map" ? "map" : "pipeline"
  );

  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<RouteWithStops | null>(null);
  const [bus, setBus] = useState<BusModel | null>(null);
  const [stopRows, setStopRows] = useState<StopRow[]>([]);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const loadTripData = useCallback(async () => {
    if (!tripId) return;
    const { data } = await supabase.from("trips").select("*").eq("id", tripId).single();
    if (!data) return;
    const t = data as Trip;
    setTrip(t);
    const [routeDetail, busRow, tripStops] = await Promise.all([
      getRouteWithStops(supabase, t.route_id),
      supabase.from("buses").select("*").eq("id", t.bus_id).single().then(({ data: b }) => b as BusModel | null),
      listTripStops(supabase, tripId),
    ]);
    setRoute(routeDetail);
    setBus(busRow);
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

  // Real-time telemetry & stop progression subscription (par with Admin Fleet monitoring)
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
      let distKm = idx * 15;
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
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label="Loading bus live tracking…" />
      </div>
    );
  }

  // If in Pipeline view ("Where is My Train" style)
  if (viewMode === "pipeline") {
    return (
      <BusPipelineTracker
        trip={trip}
        route={route}
        bus={bus}
        stops={pipelineStops}
        onToggleMap={() => setViewMode("map")}
        onRefresh={() => void loadTripData()}
      />
    );
  }

  // If in Interactive Map view
  const polyline = route.stops.map((s) => [s.location.latitude, s.location.longitude] as [number, number]);
  const center = polyline[Math.floor(polyline.length / 2)] ?? [10.787, 79.1378];
  const currentStop = stopRows.find((s) => s.stop_id === trip.current_stop_id);
  const isLive = connectionState === "connected" && Boolean(position) && !isStale;

  const currentIndex = stopRows.findIndex((s) => s.stop_id === trip.current_stop_id);
  const lastIndex = Math.max(1, stopRows.length - 1);
  const journeyProgress = currentIndex >= 0 ? (currentIndex / lastIndex) * 100 : 0;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <AppHeader
        className="z-10"
        title={`Route ${route.route_number}`}
        subtitle={route.name}
        leading={
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            ←
          </button>
        }
      />

      {/* Floating Button to Switch to Pipeline View */}
      <button
        type="button"
        onClick={() => setViewMode("pipeline")}
        className="absolute top-16 right-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-blue-900 shadow-md backdrop-blur hover:bg-white active:scale-95 transition dark:bg-slate-900/95 dark:text-blue-300 dark:border dark:border-slate-800"
      >
        <GitCommitVertical className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span>Station Pipeline</span>
      </button>

      <div className="relative flex-1">
        <MapFrame heightClassName="h-full" className="rounded-none border-0">
          <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Polyline positions={polyline} pathOptions={{ color: "#D97F00", weight: 4, opacity: 0.6 }} />
            {route.stops.map((stop) => (
              <Marker key={stop.id} position={[stop.location.latitude, stop.location.longitude]} icon={stopIcon}>
                <Popup>{stop.name}</Popup>
              </Marker>
            ))}
            {position && (
              <Marker position={[position.latitude, position.longitude]} icon={busIcon(position.heading)}>
                <Popup>
                  Bus last update: {telemetry ? new Date(telemetry.timestamp).toLocaleTimeString() : "—"}
                  {telemetry && <div>GPS accuracy: ±{Math.round(telemetry.accuracy)}m</div>}
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </MapFrame>
        {!position && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <Badge tone="neutral">Waiting for live GPS from the conductor…</Badge>
          </div>
        )}
      </div>

      {/* Floating bottom tracking card */}
      <div className="z-10 -mt-6 rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.1)] dark:bg-surface-dark">
        <button
          type="button"
          onClick={() => setSheetExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-5 pb-2 pt-3"
          aria-expanded={sheetExpanded}
        >
          <span className="mx-auto h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        </button>

        <div className="px-5 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-navy-600 px-2.5 py-1 text-xs font-bold text-white">
                {bus?.bus_number ?? "—"}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-500">
                {bus?.type.replace("_", "-") ?? ""}
              </span>
              {bus?.is_wheelchair_accessible && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800" title="Handicap Accessible Bus">
                  <WheelchairIcon size={13} className="text-blue-600 dark:text-blue-400" />
                  <span>Accessible</span>
                </span>
              )}
              {trip?.status === "ACTIVE" && bus?.is_active !== false && bus?.status === "ACTIVE" ? (
                <Badge tone="success" className="font-extrabold uppercase tracking-wider text-[10px]">
                  ● ACTIVE
                </Badge>
              ) : (
                <Badge tone="neutral" className="font-extrabold uppercase tracking-wider text-[10px]">
                  {trip?.status !== "ACTIVE" ? (trip?.status ?? "INACTIVE") : (bus?.status ?? "INACTIVE")}
                </Badge>
              )}
              {trip?.schedule_adherence && trip.status === "ACTIVE" && (
                <Badge tone={trip.schedule_adherence === "DELAYED" ? "warning" : "success"}>
                  {trip.schedule_adherence === "DELAYED"
                    ? `Delayed (+${trip.delay_minutes ?? 0}m)`
                    : "On-Time"}
                </Badge>
              )}
            </div>
            <StatusIndicator status={isLive && trip?.status === "ACTIVE" && bus?.is_active !== false ? "online" : "connecting"} label={isLive && trip?.status === "ACTIVE" && bus?.is_active !== false ? "Live" : "Standby"} />
          </div>

          {(trip?.status !== "ACTIVE" || bus?.is_active === false || bus?.status === "MAINTENANCE" || bus?.status === "INACTIVE") && (
            <div className="mt-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 p-3 text-xs text-amber-200 flex items-center justify-between">
              <span>This bus is currently not in active service.</span>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="underline font-bold hover:text-white"
              >
                Back
              </button>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {currentStop ? (
                <>
                  Currently near <span className="font-semibold text-slate-900 dark:text-slate-100">{currentStop.stop.name}</span>
                </>
              ) : (
                "En route"
              )}
            </p>
            <button
              type="button"
              onClick={() => setViewMode("pipeline")}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Bus className="h-3.5 w-3.5" />
              <span>Pipeline View →</span>
            </button>
          </div>

          {isStale && <Badge tone="warning" className="mt-2">Signal delayed — last update may be out of date</Badge>}

          {stopRows.length > 1 && (
            <TransitBusRunner
              className="mt-4"
              progress={journeyProgress}
              stops={stopRows.map((s, i) => ({
                label: s.stop.name,
                atPercent: (i / lastIndex) * 100,
                done: s.status === "DEPARTED",
              }))}
            />
          )}
        </div>

        {sheetExpanded && (
          <div className="max-h-[40vh] overflow-y-auto border-t border-border-light px-5 py-3 dark:border-border-dark">
            <ol className="flex flex-col gap-4">
              {stopRows.map((s, idx) => {
                const isPast = s.status === "DEPARTED";
                const isCurrent = s.stop_id === trip.current_stop_id;
                return (
                  <li key={s.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                      <span
                        className={
                          isCurrent
                            ? "h-3.5 w-3.5 rounded-full bg-brand-500 ring-4 ring-brand-500/20"
                            : isPast
                              ? "h-3 w-3 rounded-full bg-slate-400 dark:bg-slate-600"
                              : "h-3 w-3 rounded-full border-2 border-slate-300 bg-white dark:border-slate-600 dark:bg-black"
                        }
                        aria-hidden="true"
                      />
                      {idx < stopRows.length - 1 && <span className="mt-1 h-8 w-px bg-slate-200 dark:bg-slate-800" />}
                    </div>
                    <div className="pb-1">
                      <p
                        className={
                          isCurrent
                            ? "text-sm font-semibold text-brand-700 dark:text-brand-400"
                            : isPast
                              ? "text-sm text-slate-400 line-through dark:text-slate-600"
                              : "text-sm font-medium text-slate-900 dark:text-slate-100"
                        }
                      >
                        {s.stop.name}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-600">
                        {isCurrent ? "Current stop" : isPast ? "Departed" : "Upcoming"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
