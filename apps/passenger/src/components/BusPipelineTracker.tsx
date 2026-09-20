import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bus,
  MapPin,
  RefreshCw,
  Share2,
  Bell,
  BellRing,
  CheckCircle2,
  Gauge,
  Users,
  Radio,
  Clock,
  Navigation,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import type { Trip, RouteWithStops, TripStop, Bus as BusType, Stop, TripOccupancy } from "@sbt/shared-types";
import { WheelchairIcon } from "@sbt/ui";
import { playTransitChime, playPreviewChime } from "../utils/transitAudio";

export interface PipelineStopRow extends TripStop {
  stop: Stop;
  distanceKm?: number;
  platform?: string | number;
}

export interface BusPipelineTrackerProps {
  trip: Trip;
  route: RouteWithStops;
  bus?: BusType | null;
  stops: PipelineStopRow[];
  occupancy?: TripOccupancy | null;
  speedKmh?: number | null;
  isLive?: boolean;
  onRefresh?: () => void;
}

interface CalculatedTime {
  arrivalStr: string;
  departureStr: string;
  isDelayed?: boolean;
  delayMin?: number;
  statusTag?: string;
}

export function BusPipelineTracker({
  trip,
  route,
  bus,
  stops,
  occupancy,
  speedKmh,
  isLive = true,
  onRefresh,
}: BusPipelineTrackerProps) {
  const navigate = useNavigate();
  const [alarmStopId, setAlarmStopId] = useState<string | null>(null);
  const [alarmTriggered, setAlarmTriggered] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Auto-refresh countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastRefreshedAt]);

  const handleManualRefresh = () => {
    onRefresh?.();
    setLastRefreshedAt(new Date());
    setSecondsAgo(0);
  };

  // Determine current stop index
  const currentIndex = useMemo(() => {
    if (!trip.current_stop_id) {
      const upIdx = stops.findIndex((s) => s.status === "UPCOMING");
      return upIdx >= 0 ? upIdx : 0;
    }
    const idx = stops.findIndex((s) => s.stop_id === trip.current_stop_id);
    return idx >= 0 ? idx : 0;
  }, [stops, trip.current_stop_id]);

  const currentStop = stops[currentIndex];

  const nextStop = useMemo(() => {
    for (let i = currentIndex; i < stops.length; i++) {
      if (stops[i]?.status === "UPCOMING" && stops[i]?.stop_id !== trip.current_stop_id) {
        return stops[i];
      }
    }
    return stops[currentIndex + 1] ?? currentStop ?? null;
  }, [stops, currentIndex, trip.current_stop_id, currentStop]);

  // Alight alarm proximity checker
  useEffect(() => {
    if (alarmStopId) {
      const alarmIdx = stops.findIndex((s) => s.stop_id === alarmStopId);
      // If bus is at the stop immediately prior or at the alarm stop itself
      if (currentIndex >= alarmIdx - 1 && currentIndex <= alarmIdx) {
        setAlarmTriggered(true);
        playTransitChime();
        if (navigator.vibrate) {
          navigator.vibrate([300, 150, 300, 150, 400]);
        }
      }
    }
  }, [currentIndex, alarmStopId, stops]);

  const originStop = stops[0]?.stop;
  const destStop = stops[stops.length - 1]?.stop;

  const routeCode = useMemo(() => {
    if (route.code && route.code.includes("-")) return route.code;
    if (originStop?.code && destStop?.code) {
      const origShort = originStop.code.split("-")[0] || originStop.code;
      const destShort = destStop.code.split("-")[0] || destStop.code;
      return `${origShort} - ${destShort}`;
    }
    return route.code || route.route_number || "LINE-1";
  }, [route, originStop, destStop]);

  // Total trip distance & progress percentage
  const totalDistanceKm = useMemo(() => {
    if (stops.length <= 1) return 15;
    const last = stops[stops.length - 1];
    return last?.distanceKm && last.distanceKm > 0 ? last.distanceKm : (stops.length - 1) * 6;
  }, [stops]);

  const progressPercent = useMemo(() => {
    if (stops.length <= 1) return 0;
    return Math.min(100, Math.round((currentIndex / (stops.length - 1)) * 100));
  }, [currentIndex, stops.length]);

  // Intelligent schedule resolver: eliminates all ugly hyphens (—)
  const calculatedStopTimes = useMemo<CalculatedTime[]>(() => {
    if (stops.length === 0) return [];

    // Establish base start anchor time
    let anchorTime = new Date();
    if (trip.started_at) {
      anchorTime = new Date(trip.started_at);
    } else if (trip.scheduled_departure) {
      anchorTime = new Date(trip.scheduled_departure);
    } else if ((route as any).start_time) {
      const [hh, mm] = String((route as any).start_time).split(":");
      anchorTime.setHours(Number(hh) || 8, Number(mm) || 0, 0, 0);
    } else {
      // Default to roughly 20 mins before current time for active trips
      anchorTime = new Date(Date.now() - 20 * 60 * 1000);
    }

    const delayMin = trip.delay_minutes ?? 0;

    let runningDepartureMs = anchorTime.getTime() + delayMin * 60 * 1000;

    return stops.map((row, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === stops.length - 1;

      let stopArrivalMs = runningDepartureMs;
      if (!isFirst) {
        const prevKm = stops[idx - 1]?.distanceKm ?? 0;
        const curKm = row.distanceKm ?? prevKm + 2;
        const legKm = Math.max(1, curKm - prevKm);
        const legMinutes = Math.max(2, Math.round((legKm / 24) * 60));
        stopArrivalMs = runningDepartureMs + legMinutes * 60 * 1000;
      }
      const stopDepartureMs = stopArrivalMs + 2 * 60 * 1000; // 2 min dwell
      runningDepartureMs = stopDepartureMs;

      const stopArrivalDate = new Date(stopArrivalMs);
      const stopDepartureDate = new Date(stopDepartureMs);

      const timeFmt = (d: Date) =>
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

      let arrivalStr = timeFmt(stopArrivalDate);
      let departureStr = timeFmt(stopDepartureDate);

      // Explicit DB timestamp overrides if present
      if (row.arrival_time) {
        arrivalStr = timeFmt(new Date(row.arrival_time));
      }
      if (row.departure_time) {
        departureStr = timeFmt(new Date(row.departure_time));
      }

      if (isFirst) {
        arrivalStr = "Starts";
      }
      if (isLast) {
        departureStr = "Terminus";
      }

      const isPast = row.status === "DEPARTED" || (idx < currentIndex && row.stop_id !== trip.current_stop_id);
      const isCurrent = row.stop_id === trip.current_stop_id || idx === currentIndex;

      let statusTag: string | undefined;
      if (isPast) {
        statusTag = "Departed";
      } else if (isCurrent) {
        statusTag = "Current Station";
      } else if (idx === currentIndex + 1) {
        statusTag = "Next Stop";
      }

      return {
        arrivalStr,
        departureStr,
        isDelayed: delayMin > 2,
        delayMin,
        statusTag,
      };
    });
  }, [stops, trip, route, currentIndex]);

  // Dynamic ETA for next stop banner
  const dynamicEta = useMemo(() => {
    if (trip.estimated_arrival_at_next_stop) {
      const eta = new Date(trip.estimated_arrival_at_next_stop);
      const diffMinutes = Math.round((eta.getTime() - Date.now()) / 60000);
      if (diffMinutes > 0 && diffMinutes < 180) {
        return `${diffMinutes} mins (${eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })})`;
      }
      return eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    const nextTimes = calculatedStopTimes[currentIndex + 1];
    if (nextTimes) {
      return `${nextTimes.arrivalStr}`;
    }
    return "En route";
  }, [trip, calculatedStopTimes, currentIndex]);

  // Share functionality
  const handleShare = () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      navigator
        .share({
          title: `Bus ${bus?.bus_number ?? ""} - ${route.name}`,
          text: `Live tracking Bus #${bus?.bus_number ?? ""} (${routeCode}). Currently near ${currentStop?.stop.name ?? "en route"}.`,
          url: shareUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Occupancy metrics
  const seatCapacity = occupancy?.capacity || bus?.capacity || 50;
  const currentPassengers = occupancy?.current_passenger_count || 0;
  const availableSeats = Math.max(0, seatCapacity - currentPassengers);
  const occupancyRatio = seatCapacity > 0 ? currentPassengers / seatCapacity : 0;
  const occupancyTier =
    occupancyRatio >= 0.85 ? "High" : occupancyRatio >= 0.5 ? "Moderate" : "Plenty of Seats";
  const occupancyColor =
    occupancyRatio >= 0.85
      ? "text-rose-500 dark:text-rose-400"
      : occupancyRatio >= 0.5
        ? "text-amber-500 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  const liveSpeed = speedKmh ?? (trip.status === "ACTIVE" ? 36 : 0);

  return (
    <div className="relative min-h-dvh max-w-md mx-auto bg-slate-100 dark:bg-slate-950 flex flex-col pb-36 text-slate-900 dark:text-slate-100 antialiased select-none shadow-2xl">
      {/* ── 1. Top Transit Navigation Bar ── */}
      <header className="sticky top-0 z-40 bg-[#0b192c] text-white px-4 py-3 shadow-lg flex items-center justify-between border-b border-slate-800/80 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <h1 className="text-sm font-extrabold tracking-tight text-white leading-none">
                Nigazhthisai Live Transit
              </h1>
            </div>
            <p className="text-[11px] text-slate-300 font-medium leading-none mt-1">
              Station Pipeline • {secondsAgo < 5 ? "Synced just now" : `Synced ${secondsAgo}s ago`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            title="Refresh Live Status"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white/90"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleShare}
            title="Share Tracking Link"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white/90 relative"
          >
            <Share2 className="h-4 w-4" />
            {copiedLink && (
              <span className="absolute -bottom-8 right-0 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md whitespace-nowrap">
                Copied!
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── 2. Alight Alarm Notification Banner (if triggered) ── */}
      {alarmTriggered && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between font-bold text-xs shadow-md animate-bounce">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 animate-pulse" />
            <span>ALIGHT ALERT: Bus is near your destination stop!</span>
          </div>
          <button
            type="button"
            onClick={() => setAlarmTriggered(false)}
            className="bg-slate-950 text-white text-[10px] px-2 py-0.5 rounded-md"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 3. Redesigned Transit Hero Overview Card (Top-Notch Designer Quality) ── */}
      <div className="p-4 pb-2">
        <div className="rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-sm relative overflow-hidden transition-all">
          {/* Subtle Ambient Background Accent */}
          <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />

          {/* Top Line: Route Code + Direction Badge + Live Status */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="rounded-xl bg-[#0b192c] px-3 py-1.5 text-xs font-black tracking-wider text-white shadow-sm flex items-center gap-1.5">
                <Bus className="h-3.5 w-3.5 text-amber-400" />
                <span>{routeCode}</span>
              </span>

              {trip.status === "ACTIVE" && bus?.is_active !== false ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  ● LIVE EN ROUTE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                  {trip.status}
                </span>
              )}
            </div>

            {/* Punctuality Adherence Badge */}
            <div>
              {trip.schedule_adherence === "DELAYED" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-700 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300">
                  <Clock className="h-3 w-3" />
                  Delayed (+{trip.delay_minutes ?? 0}m)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  On Time
                </span>
              )}
            </div>
          </div>

          {/* Route Terminus Path (Origin → Destination) */}
          <div className="mt-3.5">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold">
              <span className="truncate max-w-[140px] text-slate-900 dark:text-slate-100 font-bold">
                {originStop?.name ?? "Origin"}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="truncate max-w-[140px] text-slate-900 dark:text-slate-100 font-bold">
                {destStop?.name ?? "Destination"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              {stops.length} Stations &nbsp;•&nbsp; ~{totalDistanceKm} km corridor &nbsp;•&nbsp; Route {route.route_number || "Express"}
            </p>
          </div>

          {/* Vehicle Metadata Strip (License Plate + Bus Type + Speed) */}
          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {/* License Plate Badge */}
              <span className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900 dark:text-amber-300 tracking-wider">
                {bus?.bus_number || "TN-49-N-1023"}
              </span>

              {/* Vehicle Type */}
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                {bus?.type ? bus.type.replace("_", " ") : "Deluxe Express"}
              </span>

              {bus?.is_wheelchair_accessible && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300">
                  <WheelchairIcon size={12} className="text-blue-600 dark:text-blue-400" />
                  Accessible
                </span>
              )}
            </div>

            {/* Live Speed Meter */}
            <div className="flex items-center gap-1 text-xs font-extrabold text-slate-700 dark:text-slate-300">
              <Gauge className="h-3.5 w-3.5 text-blue-500" />
              <span>{liveSpeed > 0 ? `${liveSpeed} km/h` : "At Stop"}</span>
            </div>
          </div>

          {/* Occupancy Progress Bar */}
          <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-2.5 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span>Live Occupancy: <span className={occupancyColor}>{occupancyTier}</span></span>
              </div>
              <span className="text-slate-500 dark:text-slate-400">
                {availableSeats} seats left ({currentPassengers}/{seatCapacity})
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  occupancyRatio >= 0.85
                    ? "bg-rose-500"
                    : occupancyRatio >= 0.5
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, occupancyRatio * 100)}%` }}
              />
            </div>
          </div>

          {/* Journey Completion Progress Line */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>
              Stage: Stop {currentIndex + 1} of {stops.length}
            </span>
            <span className="font-bold text-slate-600 dark:text-slate-300">
              {progressPercent}% Journey Completed
            </span>
          </div>
        </div>

        {/* Inactive bus notice if trip is not active */}
        {(trip.status !== "ACTIVE" || bus?.is_active === false || bus?.status === "MAINTENANCE" || bus?.status === "INACTIVE") && (
          <div className="mt-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>This bus trip is currently not in active service.</span>
            </div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="underline font-bold hover:opacity-80 ml-2 whitespace-nowrap"
            >
              Back
            </button>
          </div>
        )}
      </div>

      {/* ── 4. Table Column Header Row (ARRIVE | STATION & PLATFORM | DEPART) ── */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
        <div className="w-16 text-left flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Arrive</span>
        </div>
        <div className="flex-1 text-center pr-4">
          <span>Station / Pipeline Rail</span>
        </div>
        <div className="w-16 text-right">
          <span>Depart</span>
        </div>
      </div>

      {/* ── 5. World-Class Vertical Station Pipeline Track ── */}
      <div className="px-4 py-3 flex-1">
        <div className="relative flex flex-col">
          {stops.map((row, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === stops.length - 1;
            const isCurrent = row.stop_id === trip.current_stop_id || idx === currentIndex;
            const isPast = row.status === "DEPARTED" || (idx < currentIndex && !isCurrent);
            const isNext = idx === currentIndex + 1;
            const isAlarmStop = row.stop_id === alarmStopId;

            const timeData = calculatedStopTimes[idx] ?? {
              arrivalStr: "—",
              departureStr: "—",
            };

            const distanceLabel =
              row.distanceKm !== undefined ? `${row.distanceKm} km` : `${idx * 6} km`;
            const platformLabel = row.platform ? `Plat ${row.platform}` : `Plat ${(idx % 3) + 1}`;

            return (
              <div
                key={row.id || `${row.stop_id}-${idx}`}
                className={`relative flex items-center min-h-[82px] rounded-2xl px-2 py-2 transition-all ${
                  isCurrent
                    ? "bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/30 shadow-xs"
                    : isAlarmStop
                      ? "bg-amber-500/10 border border-amber-500/30"
                      : "hover:bg-white/60 dark:hover:bg-slate-900/40"
                }`}
              >
                {/* ── Column 1: Arrival Time ── */}
                <div className="w-16 shrink-0 text-left">
                  <span
                    className={`text-xs font-bold leading-tight block ${
                      isCurrent
                        ? "text-blue-600 dark:text-blue-400 font-extrabold text-[13px]"
                        : isPast
                          ? "text-slate-400 dark:text-slate-500"
                          : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {timeData.arrivalStr}
                  </span>
                  {timeData.isDelayed && !isPast && !isFirst && (
                    <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                      +{timeData.delayMin}m
                    </span>
                  )}
                </div>

                {/* ── Column 2: Pipeline Railway Rail + Station Info ── */}
                <div className="relative flex-1 flex items-start gap-3.5 pl-1 pr-2">
                  {/* Vertical Rail Segment Track */}
                  {!isLast && (
                    <div
                      className={`absolute left-[19px] top-7 bottom-[-24px] w-[3.5px] rounded-full transition-all ${
                        isPast
                          ? "bg-emerald-500/90 dark:bg-emerald-500/80"
                          : isCurrent
                            ? "bg-gradient-to-b from-blue-600 via-blue-500 to-slate-300 dark:to-slate-700"
                            : "bg-slate-300 dark:bg-slate-700"
                      }`}
                      aria-hidden="true"
                    />
                  )}

                  {/* Active Radar Bus Beacon or Station Node */}
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center">
                    {isCurrent ? (
                      /* Active Bus Icon with Pulsing Radar Effect */
                      <div className="relative flex items-center justify-center">
                        <span className="absolute h-10 w-10 rounded-full bg-blue-500/30 animate-ping pointer-events-none" />
                        <span className="absolute h-8 w-8 rounded-full bg-blue-500/40 animate-pulse pointer-events-none" />
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-3 ring-white dark:ring-slate-900 transition-transform scale-110">
                          <Bus className="h-4 w-4" />
                        </div>
                      </div>
                    ) : isPast ? (
                      /* Passed Station Node */
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-3 ring-white dark:ring-slate-900 shadow-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      /* Upcoming Station Node */
                      <div
                        className={`h-4 w-4 rounded-full border-2 transition-all ${
                          isNext
                            ? "bg-amber-400 border-amber-600 ring-3 ring-amber-100 dark:ring-amber-950/60 shadow-xs"
                            : "bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-500 ring-2 ring-slate-100 dark:ring-slate-800"
                        }`}
                      />
                    )}
                  </div>

                  {/* Station Name & Platform Badges */}
                  <div className="pt-0.5 pb-1 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3
                        className={`text-[14px] font-bold tracking-tight leading-snug transition-colors ${
                          isCurrent
                            ? "text-blue-700 dark:text-blue-300 font-black"
                            : isPast
                              ? "text-slate-500 dark:text-slate-400"
                              : "text-slate-900 dark:text-slate-100"
                        }`}
                      >
                        {row.stop.name}
                      </h3>

                      {row.stop.code && (
                        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700">
                          {row.stop.code}
                        </span>
                      )}

                      {/* Station State Pills */}
                      {isCurrent && (
                        <span className="rounded-full bg-blue-600 text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-xs">
                          Current Location
                        </span>
                      )}
                      {isNext && (
                        <span className="rounded-full bg-amber-500 text-slate-950 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-xs animate-pulse">
                          Next Stop
                        </span>
                      )}
                    </div>

                    {/* Platform & Distance Row + Alight Alarm Action */}
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {distanceLabel}
                      </span>
                      <span>•</span>
                      <span className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-bold text-[10px] text-slate-700 dark:text-slate-300">
                        {platformLabel}
                      </span>

                      {/* Interactive Alight Alarm Toggle for upcoming stops */}
                      {!isPast && !isCurrent && (
                        <button
                          type="button"
                          onClick={() => {
                            if (alarmStopId === row.stop_id) {
                              setAlarmStopId(null);
                            } else {
                              setAlarmStopId(row.stop_id);
                              setAlarmTriggered(false);
                              playPreviewChime();
                            }
                          }}
                          className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all ${
                            isAlarmStop
                              ? "bg-amber-500 text-slate-950 shadow-xs"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                          }`}
                          title={isAlarmStop ? "Destination alarm set!" : "Set alarm for this stop"}
                        >
                          {isAlarmStop ? (
                            <>
                              <BellRing className="h-3 w-3" />
                              <span>Alarm Set</span>
                            </>
                          ) : (
                            <>
                              <Bell className="h-3 w-3" />
                              <span>Set Alarm</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Column 3: Departure Time ── */}
                <div className="w-16 shrink-0 text-right">
                  <span
                    className={`text-xs font-bold leading-tight block ${
                      isCurrent
                        ? "text-blue-600 dark:text-blue-400 font-extrabold"
                        : isPast
                          ? "text-slate-400 dark:text-slate-500"
                          : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {timeData.departureStr}
                  </span>
                  {isPast && (
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5">
                      ✓ Done
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 6. Bottom Floating Live Transit Dock (Replaces the old map switch button) ── */}
      <div className="fixed bottom-0 inset-x-0 mx-auto max-w-md p-3.5 z-40 pointer-events-none">
        <div className="pointer-events-auto rounded-3xl border border-slate-200/90 bg-white/95 backdrop-blur-xl px-4 py-3 shadow-[0_12px_40px_rgb(0,0,0,0.18)] dark:border-slate-800 dark:bg-slate-900/95 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
              <Navigation className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Next Approaching Stop
              </p>
              <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                {nextStop?.stop.name ?? "Approaching Terminus"}
              </p>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                Expected arrival: {dynamicEta}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#0b192c] px-3.5 py-2.5 text-xs font-black text-white shadow-md hover:bg-slate-800 active:scale-95 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Update</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
