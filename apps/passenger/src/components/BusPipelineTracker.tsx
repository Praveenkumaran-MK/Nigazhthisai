import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bus, MapPin, MoreVertical, RefreshCw, Share2, Compass } from "lucide-react";
import type { Trip, RouteWithStops, TripStop, Bus as BusType, Stop } from "@sbt/shared-types";

export interface PipelineStopRow extends TripStop {
  stop: Stop;
  distanceKm?: number;
  platform?: string | number;
  expectedTime?: string | null;
}

interface BusPipelineTrackerProps {
  trip: Trip;
  route: RouteWithStops;
  bus?: BusType | null;
  stops: PipelineStopRow[];
  onToggleMap?: () => void;
  onRefresh?: () => void;
}

export function BusPipelineTracker({
  trip,
  route,
  bus,
  stops,
  onToggleMap,
  onRefresh,
}: BusPipelineTrackerProps) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  // Determine current stop index and next stop
  const currentIndex = useMemo(() => {
    if (!trip.current_stop_id) {
      // If current_stop_id is null, find first upcoming stop
      const upIdx = stops.findIndex((s) => s.status === "UPCOMING");
      return upIdx >= 0 ? upIdx : 0;
    }
    const idx = stops.findIndex((s) => s.stop_id === trip.current_stop_id);
    return idx >= 0 ? idx : 0;
  }, [stops, trip.current_stop_id]);

  const currentStop = stops[currentIndex];

  const nextStop = useMemo(() => {
    // Look for first upcoming stop after current
    for (let i = currentIndex; i < stops.length; i++) {
      if (stops[i]?.status === "UPCOMING" && stops[i]?.stop_id !== trip.current_stop_id) {
        return stops[i];
      }
    }
    return stops[currentIndex + 1] ?? currentStop ?? null;
  }, [stops, currentIndex, trip.current_stop_id, currentStop]);

  // Route Origin and Destination labels
  const originStop = stops[0]?.stop;
  const destStop = stops[stops.length - 1]?.stop;

  // Format short route code (e.g. TUP - MDU or KRI01)
  const routeCode = useMemo(() => {
    if (route.code && route.code.includes("-")) return route.code;
    if (originStop?.code && destStop?.code) {
      const origShort = originStop.code.split("-")[0] || originStop.code;
      const destShort = destStop.code.split("-")[0] || destStop.code;
      return `${origShort} - ${destShort}`;
    }
    return route.code || route.route_number || "TRANSIT";
  }, [route, originStop, destStop]);

  // Dynamic ETA for next stop
  const dynamicEta = useMemo(() => {
    if (trip.estimated_arrival_at_next_stop) {
      const eta = new Date(trip.estimated_arrival_at_next_stop);
      const diffMinutes = Math.round((eta.getTime() - Date.now()) / 60000);
      if (diffMinutes > 0 && diffMinutes < 180) {
        return `${diffMinutes} mins (${eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
      }
      return eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (trip.delay_minutes && trip.delay_minutes > 0) {
      return `+${trip.delay_minutes} min delay`;
    }
    return "—";
  }, [trip]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Bus ${bus?.bus_number ?? ""} - ${route.name}`,
        text: `Tracking Bus #${bus?.bus_number ?? ""} on route ${routeCode}. Currently near ${currentStop?.stop.name ?? "en route"}.`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Tracking link copied to clipboard!");
    }
    setShowMenu(false);
  };

  return (
    <div className="relative min-h-dvh max-w-md mx-auto bg-slate-50 dark:bg-slate-950 flex flex-col pb-28 text-slate-900 dark:text-slate-100 antialiased select-none">
      {/* ── 1. Header Bar (Matches Image 2) ── */}
      <header className="sticky top-0 z-30 bg-[#0f2438] text-white px-4 py-3 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950 shadow-sm">
              <Bus className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight tracking-tight text-white">Nigazhthisai</h1>
              <p className="text-[11px] text-white/70 font-medium leading-none">Your Bus. Your Route. On Time.</p>
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Options menu"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            <MoreVertical className="h-5 w-5 text-white/80" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-10 w-44 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-black/10 dark:bg-slate-900 dark:ring-white/10 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => {
                  onRefresh?.();
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh Status</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleMap?.();
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Compass className="h-4 w-4" />
                <span>Interactive Map</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Share2 className="h-4 w-4" />
                <span>Share Status</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── 2. Route Banner Card (Matches Image 2) ── */}
      <div className="p-4 pb-2">
        <div className="rounded-2xl border border-blue-100 bg-[#eef4fd] dark:border-blue-900/50 dark:bg-[#111f36] p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#102a43] dark:bg-blue-600 text-white shadow-md">
              <Bus className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">
                  {routeCode}
                </h2>
                {trip.status === "ACTIVE" && bus?.is_active !== false && bus?.status === "ACTIVE" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    ● ACTIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    {trip.status !== "ACTIVE" ? trip.status : (bus?.status ?? "STANDBY")}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {originStop?.name ?? "Origin"} <span className="text-slate-400">→</span> {destStop?.name ?? "Destination"}
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {trip.schedule_adherence === "DELAYED" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Delayed (+{trip.delay_minutes ?? 0}m)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>On Time</span>
              </span>
            )}
          </div>
        </div>

        {(trip.status !== "ACTIVE" || bus?.is_active === false || bus?.status === "MAINTENANCE" || bus?.status === "INACTIVE") && (
          <div className="mt-2 rounded-xl bg-amber-500/15 border border-amber-500/30 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
            <span>This bus is not actively in service.</span>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="underline font-bold hover:opacity-80 ml-2"
            >
              Back
            </button>
          </div>
        )}
      </div>

      {/* ── 3. Table Headers (Arrival | Stop / Location | Departure) ── */}
      <div className="px-5 pt-3 pb-2 flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200/70 dark:border-slate-800">
        <div className="w-16 text-left">Arrival</div>
        <div className="flex-1 pl-4">Stop / Location</div>
        <div className="w-16 text-right">Departure</div>
      </div>

      {/* ── 4. Vertical Pipeline Railway Rail (Matches Image 2) ── */}
      <div className="px-5 py-4 flex-1">
        <div className="relative flex flex-col">
          {stops.map((row, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === stops.length - 1;
            const isCurrent = row.stop_id === trip.current_stop_id || idx === currentIndex;
            const isPast = row.status === "DEPARTED" || (idx < currentIndex && !isCurrent);

            // Format Arrival & Departure Times
            let arrivalDisplay = "—";
            let departureDisplay = "—";

            if (!isFirst && row.arrival_time) {
              arrivalDisplay = new Date(row.arrival_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            } else if (!isFirst && (row as any).expected_arrival_time) {
              arrivalDisplay = (row as any).expected_arrival_time;
            }

            if (!isLast && row.departure_time) {
              departureDisplay = new Date(row.departure_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            } else if (!isLast && (row as any).expected_departure_time) {
              departureDisplay = (row as any).expected_departure_time;
            }

            // Distance & Platform
            const distance = row.distanceKm !== undefined ? `${row.distanceKm} km` : `${idx * 15} km`;
            const platform = row.platform ? `Platform ${row.platform}` : `Platform ${(idx % 3) + 1}`;

            return (
              <div key={row.id} className="relative flex items-center min-h-[76px]">
                {/* Left Column: Arrival Time */}
                <div className="w-16 shrink-0 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {arrivalDisplay}
                </div>

                {/* Center Column: Pipeline Vertical Rail & Stop Node */}
                <div className="relative flex-1 flex items-start gap-4 pl-2 pr-2">
                  {/* Vertical Rail Segment */}
                  {!isLast && (
                    <div
                      className={`absolute left-[20px] top-6 bottom-[-20px] w-[3px] transition-colors ${
                        isPast ? "bg-blue-500" : "bg-blue-400/80 dark:bg-blue-600/60"
                      }`}
                      aria-hidden="true"
                    />
                  )}

                  {/* Node Circle or Active Bus Badge */}
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center">
                    {isCurrent ? (
                      /* Active Bus Position Badge on the Rail (Matches Image 2) */
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-4 ring-blue-100 dark:ring-blue-900/60 transition-transform scale-110">
                        <Bus className="h-5 w-5" />
                      </div>
                    ) : (
                      /* Standard Station Node */
                      <div
                        className={`h-3 w-3 rounded-full transition-all ${
                          isPast
                            ? "bg-blue-600 ring-2 ring-blue-200 dark:ring-blue-900"
                            : "bg-blue-600 ring-2 ring-blue-300 dark:ring-blue-800"
                        }`}
                      />
                    )}
                  </div>

                  {/* Stop Information */}
                  <div className="pt-1.5 pb-2">
                    <h3
                      className={`text-sm font-bold tracking-tight transition-colors ${
                        isCurrent
                          ? "text-blue-600 dark:text-blue-400 text-[15px]"
                          : isPast
                            ? "text-slate-800 dark:text-slate-200"
                            : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {row.stop.name}
                      {row.stop.code && (
                        <span className="ml-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                          ({row.stop.code})
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      {distance} &nbsp;|&nbsp; {platform}
                    </p>
                  </div>
                </div>

                {/* Right Column: Departure Time */}
                <div className="w-16 shrink-0 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {departureDisplay}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 5. Bottom Floating Summary Card (Matches Image 2) ── */}
      <div className="fixed bottom-0 inset-x-0 mx-auto max-w-md p-3.5 z-40 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:border-slate-800 dark:bg-slate-900/95 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                Next Stop: {nextStop?.stop.name ?? "En route"}
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                Estimated time: {dynamicEta}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleMap}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-blue-800 shadow-sm hover:bg-blue-50 active:scale-95 transition-all dark:border-blue-900 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700"
          >
            <Bus className="h-4 w-4" />
            <span>Live Tracking</span>
          </button>
        </div>
      </div>
    </div>
  );
}
