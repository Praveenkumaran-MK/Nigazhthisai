import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import type { Trip, RouteWithStops, TripStop, Bus, Stop } from "@sbt/shared-types";
import { getRouteWithStops, listTripStops } from "@sbt/supabase-client";
import { MapFrame, Badge, LoadingState, StatusIndicator, AppHeader, TransitBusRunner } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useRealtimeBusTracking } from "../hooks/useRealtimeBusTracking";

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

export function LiveMapPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<RouteWithStops | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);
  const [stopRows, setStopRows] = useState<StopRow[]>([]);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    supabase
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .single()
      .then(async ({ data }) => {
        if (!data) return;
        const t = data as Trip;
        setTrip(t);
        const [routeDetail, busRow, tripStops] = await Promise.all([
          getRouteWithStops(supabase, t.route_id),
          supabase.from("buses").select("*").eq("id", t.bus_id).single().then(({ data: b }) => b as Bus | null),
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
      });
  }, [tripId]);

  const { connectionState, position, telemetry, isStale } = useRealtimeBusTracking(
    trip?.route_id ?? null,
    trip?.bus_id ?? null,
  );

  if (!trip || !route) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label="Loading route…" />
      </div>
    );
  }

  const polyline = route.stops.map((s) => [s.location.latitude, s.location.longitude] as [number, number]);
  const center = polyline[Math.floor(polyline.length / 2)] ?? [10.787, 79.1378];
  const currentStop = stopRows.find((s) => s.stop_id === trip.current_stop_id);
  const isLive = connectionState === "connected" && Boolean(position) && !isStale;

  // Journey progress comes from real stop progression (trip_stops), not
  // from GPS distance — it's the same source the eligibility rules use, so
  // the bar can never disagree with the stop list rendered below it.
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

      {/* Floating bottom tracking card — summary always visible, tap to
          reveal the full ordered stop list (matches the reference's
          bus-tracking sheet). */}
      <div className="z-10 -mt-6 rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.1)] dark:bg-surface-dark">
        <button
          type="button"
          onClick={() => setSheetExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-5 pb-2 pt-3"
          aria-expanded={sheetExpanded}
        >
          <span className="mx-auto h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        </button>

        {/* pb-5 (not pb-2): the progress runner sits last in this sheet and
            was rendering flush against the viewport edge on short phones. */}
        <div className="px-5 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-navy-600 px-2.5 py-1 text-xs font-bold text-white">
                {bus?.bus_number ?? "—"}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-500">
                {bus?.type.replace("_", "-") ?? ""}
              </span>
            </div>
            <StatusIndicator status={isLive ? "online" : "connecting"} label={isLive ? "Live" : "Connecting…"} />
          </div>

          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {currentStop ? (
              <>
                Currently near <span className="font-semibold text-slate-900 dark:text-slate-100">{currentStop.stop.name}</span>
              </>
            ) : (
              "En route"
            )}
          </p>
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
