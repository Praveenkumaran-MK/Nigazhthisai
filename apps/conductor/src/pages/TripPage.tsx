import { useEffect, useState, useCallback, useMemo } from "react";
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
  Dialog,
  Select,
  QRDisplay,
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

interface IssuedTicket {
  ticket_id: string;
  pnr: string;
  fare: number;
  passenger_count: number;
  concession_type: string;
  qr_payload: string;
  qr_signature: string;
  created_at: string;
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

  // Cash Ticket Issuance State
  const [showIssueTicket, setShowIssueTicket] = useState(false);
  const [originStopId, setOriginStopId] = useState<string>("");
  const [destStopId, setDestStopId] = useState<string>("");
  const [passengerCount, setPassengerCount] = useState<number>(1);
  const [concessionType, setConcessionType] = useState<string>("NONE");
  const [isIssuing, setIsIssuing] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<IssuedTicket | null>(null);
  const [estimatedFare, setEstimatedFare] = useState<number>(15);

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
    const rows = tripStops.map((s) => ({ ...s, stop: stopById.get(s.stop_id)! }));
    setStops(rows);

    if (rows.length > 0) {
      const curStopId = (data as Trip)?.current_stop_id;
      const initialOrigin = (curStopId && rows.some((r) => r.stop_id === curStopId))
        ? curStopId
        : rows[0]?.stop_id;

      if (initialOrigin && !originStopId) {
        setOriginStopId(initialOrigin);
        const originIdx = rows.findIndex((r) => r.stop_id === initialOrigin);
        const downstream = rows.slice(originIdx + 1);
        if (downstream.length > 0) {
          setDestStopId(downstream[downstream.length - 1]?.stop_id || downstream[0]?.stop_id || "");
        }
      }
    }

    setOccupancy(await getTripOccupancy(supabase, tripId));
  }, [tripId, originStopId]);

  useEffect(() => {
    void loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    if (!tripId) return;
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

  // Downstream stop options based on selected origin stop
  const originIndex = useMemo(() => {
    return stops.findIndex((s) => s.stop_id === originStopId);
  }, [stops, originStopId]);

  const availableDestinations = useMemo(() => {
    if (originIndex < 0 || originIndex >= stops.length - 1) {
      // If at last stop, allow all other stops
      return stops.filter((s) => s.stop_id !== originStopId);
    }
    // Only stops strictly after origin stop
    return stops.slice(originIndex + 1);
  }, [stops, originIndex, originStopId]);

  // Handle origin change & auto-adjust destination
  const handleOriginChange = (newOriginId: string) => {
    setOriginStopId(newOriginId);
    const newIdx = stops.findIndex((s) => s.stop_id === newOriginId);
    const nextStops = stops.slice(newIdx + 1);
    if (nextStops.length > 0) {
      // If current dest is not downstream, pick the next stop
      if (!nextStops.some((s) => s.stop_id === destStopId)) {
        setDestStopId(nextStops[0]?.stop_id || "");
      }
    } else {
      // If last stop, fallback to any other stop
      const other = stops.find((s) => s.stop_id !== newOriginId);
      if (other) setDestStopId(other.stop_id);
    }
  };

  // Calculate live estimated fare
  useEffect(() => {
    if (!trip?.route_id || !originStopId || !destStopId) return;

    supabase
      .rpc("calculate_fare", {
        p_route_id: trip.route_id,
        p_origin_stop_id: originStopId,
        p_dest_stop_id: destStopId,
      })
      .then(({ data }) => {
        let baseFare = Number(data) || 15;
        let discountPct = 0;
        if (concessionType === "STUDENT" || concessionType === "SENIOR") discountPct = 0.5;
        if (concessionType === "MONTHLY_PASS") discountPct = 0.75;
        if (concessionType === "FREEDOM_FIGHTER") discountPct = 1.0;

        const total = Math.round(baseFare * passengerCount * (1 - discountPct));
        setEstimatedFare(Math.max(0, total));
      });
  }, [trip?.route_id, originStopId, destStopId, passengerCount, concessionType]);

  useEffect(() => {
    if (trip?.status === "COMPLETED") {
      void wakeLock.release();
    }
  }, [trip?.status, wakeLock.release]);

  useEffect(() => {
    return () => {
      void wakeLock.release();
    };
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

  // Handle Cash Ticket Issuance
  const handleIssueCashTicket = async () => {
    if (!tripId || !originStopId || !destStopId) return;
    setIsIssuing(true);
    try {
      const { data, error } = await supabase.rpc("generate_passenger_cash_ticket", {
        p_trip_id: tripId,
        p_origin_stop_id: originStopId,
        p_dest_stop_id: destStopId,
        p_passenger_count: passengerCount,
        p_concession_type: concessionType,
      });

      if (error) throw error;
      setIssuedTicket(data as IssuedTicket);
      push({ tone: "success", title: "Ticket Issued", description: `PNR: ${data.pnr} • ₹${data.fare}` });
      await loadTrip();
    } catch (err: any) {
      push({ tone: "danger", title: "Issuance failed", description: err.message });
    } finally {
      setIsIssuing(false);
    }
  };

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
    <div className="flex flex-col min-h-dvh bg-slate-950 text-slate-100">
      <AppHeader
        sticky
        title={
          <div className="flex items-center gap-2">
            <Badge tone={trip.status === "ACTIVE" ? "success" : "neutral"}>{trip.status}</Badge>
            <span className="text-xs font-bold text-slate-300">Trip #{trip.id.slice(0, 6).toUpperCase()}</span>
          </div>
        }
        subtitle={
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span>GPS:</span>
            <StatusIndicator
              status={telemetry.status === "watching" ? "online" : telemetry.status === "denied" ? "error" : "connecting"}
              label={telemetry.status}
            />
          </span>
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

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 pb-36">
        {trip.status === "SCHEDULED" && (
          <div className="flex flex-col gap-4">
            <ConductorHero className="h-44 w-full rounded-2xl shadow-xl" />
            <Button size="lg" className="h-14 text-base font-extrabold shadow-lg" isLoading={isStarting} onClick={handleStartService}>
              🚀 Start Transit Service →
            </Button>
          </div>
        )}

        {/* PROMINENT CONDUCTOR HERO ACTIONS (Unmissable, High-Contrast, Thumb-Friendly) */}
        {trip.status === "ACTIVE" && (
          <div className="grid grid-cols-2 gap-3.5">
            {/* 🎟️ Issue Cash Ticket Card Button */}
            <button
              type="button"
              onClick={() => {
                setIssuedTicket(null);
                setShowIssueTicket(true);
              }}
              className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-[#b45309] to-[#ea580c] p-4 text-left shadow-xl shadow-amber-950/40 transition-all duration-150 active:scale-95 hover:brightness-110"
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl backdrop-blur-sm shadow-inner">
                  🎟️
                </span>
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Cash POS
                </span>
              </div>
              <div className="mt-3">
                <p className="text-base font-black leading-tight text-white uppercase tracking-wide">
                  Issue Ticket
                </p>
                <p className="text-[11px] font-semibold text-amber-100/90 mt-0.5">
                  Walk-in cash fare
                </p>
              </div>
            </button>

            {/* 📷 Scan Passenger QR Card Button */}
            <button
              type="button"
              onClick={() => navigate(`/trip/${trip.id}/scan`)}
              className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-br from-[#1e40af] to-[#3b82f6] p-4 text-left shadow-xl shadow-blue-950/40 transition-all duration-150 active:scale-95 hover:brightness-110"
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl backdrop-blur-sm shadow-inner">
                  📷
                </span>
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Validator
                </span>
              </div>
              <div className="mt-3">
                <p className="text-base font-black leading-tight text-white uppercase tracking-wide">
                  Scan Ticket
                </p>
                <p className="text-[11px] font-semibold text-blue-100/90 mt-0.5">
                  Verify QR tickets
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Occupancy Card */}
        {trip.status === "ACTIVE" && occupancy && (
          <Card className="border-slate-800 bg-slate-900/95 shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Bus Occupancy</p>
                <p className="mt-1 text-2xl font-black text-slate-100">
                  {occupancy.current_passenger_count} <span className="text-sm font-normal text-slate-400">/ {occupancy.capacity} Seats</span>
                </p>
              </div>
              <Badge tone={occupancy.capacity - occupancy.current_passenger_count > 5 ? "success" : "danger"} className="text-xs font-bold px-2.5 py-1">
                {Math.max(0, occupancy.capacity - occupancy.current_passenger_count)} seats left
              </Badge>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${Math.min(100, (occupancy.current_passenger_count / Math.max(1, occupancy.capacity)) * 100)}%` }}
              />
            </div>
          </Card>
        )}

        {/* Route Stops Sequence */}
        <Card className="border-slate-800 bg-slate-900/95 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Trip Stop Sequence</p>
            <span className="text-xs text-slate-400 font-medium">{stops.length} Total Stops</span>
          </div>
          <ol className="flex flex-col gap-2">
            {stops.map((s, idx) => {
              const isCurrent = s.stop_id === trip.current_stop_id;
              const isDeparted = s.status === "DEPARTED";

              return (
                <li
                  key={s.id}
                  className={`flex items-center justify-between rounded-xl p-3 border transition-all ${
                    isCurrent
                      ? "border-brand-500 bg-brand-500/10 shadow-sm"
                      : isDeparted
                      ? "border-slate-800/40 bg-slate-950/40 opacity-70"
                      : "border-slate-800 bg-slate-950/80"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-100">{s.stop.name}</p>
                      <Badge tone={isDeparted ? "neutral" : s.status === "ARRIVED" ? "brand" : "neutral"} className="mt-0.5 text-[10px]">
                        {s.status}
                      </Badge>
                    </div>
                  </div>
                  {isCurrent && !isDeparted && trip.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="font-bold shadow-md"
                      isLoading={departingStopId === s.stop_id}
                      onClick={() => handleDepart(s.stop_id)}
                    >
                      Depart →
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {/* STICKY BOTTOM QUICK ACTION DOCK (Always visible during transit) */}
      {trip.status === "ACTIVE" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-slate-950/95 p-3 backdrop-blur-md shadow-2xl">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIssuedTicket(null);
                setShowIssueTicket(true);
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-950/50 active:scale-98 transition-transform"
            >
              <span>🎟️</span>
              <span>Issue Ticket</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/trip/${trip.id}/scan`)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/50 active:scale-98 transition-transform"
            >
              <span>📷</span>
              <span>Scan QR</span>
            </button>

            <button
              type="button"
              onClick={() => setPocketMode(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-lg text-slate-300 hover:text-white"
              title="Pocket Lock"
            >
              🔒
            </button>

            <button
              type="button"
              {...sos.handlers}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-lg font-bold text-white shadow-lg shadow-rose-950/60 active:scale-95 select-none"
              title="Hold for SOS"
              style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.4) ${sos.progress * 100}%, transparent ${sos.progress * 100}%)` }}
            >
              🆘
            </button>
          </div>
        </div>
      )}

      {/* Cash / Walk-in Ticket Issuance Modal */}
      <Dialog
        open={showIssueTicket}
        onClose={() => {
          setShowIssueTicket(false);
          setIssuedTicket(null);
        }}
        title={issuedTicket ? "Ticket Issued Successfully" : "Issue Cash / Walk-in Ticket"}
      >
        {issuedTicket ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <Badge tone="success" className="text-sm px-3 py-1 font-bold uppercase tracking-wider">
              ✓ Paid & Validated (Cash)
            </Badge>
            <div className="font-mono text-2xl font-black tracking-widest text-amber-400 bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/20">
              PNR: {issuedTicket.pnr}
            </div>

            {issuedTicket.qr_payload && (
              <div className="p-3 bg-white rounded-2xl shadow-xl">
                <QRDisplay value={issuedTicket.qr_payload} size={180} />
              </div>
            )}

            <div className="text-xs text-slate-300 space-y-1.5 w-full bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Passengers:</span>
                <span className="font-bold text-white">{issuedTicket.passenger_count} Passenger{issuedTicket.passenger_count > 1 ? "s" : ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Concession:</span>
                <span className="font-bold text-white">{issuedTicket.concession_type}</span>
              </div>
              <div className="flex justify-between font-black text-emerald-400 text-base pt-2 border-t border-slate-800">
                <span>Total Collected:</span>
                <span>₹{Number(issuedTicket.fare).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2 w-full mt-2">
              <Button
                className="flex-1 font-bold"
                size="lg"
                onClick={() => {
                  setIssuedTicket(null);
                  setShowIssueTicket(false);
                }}
              >
                Done
              </Button>
              <Button
                variant="secondary"
                className="flex-1 font-bold"
                size="lg"
                onClick={() => {
                  setIssuedTicket(null);
                }}
              >
                + Issue Another
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-1">
            {/* Boarding Stop */}
            <Select
              label="1. Boarding Stop (From)"
              value={originStopId}
              onChange={(e) => handleOriginChange(e.target.value)}
              options={stops.map((s, idx) => ({
                value: s.stop_id,
                label: `${idx + 1}. ${s.stop.name}${s.stop_id === trip.current_stop_id ? " (Current)" : ""}`,
              }))}
            />

            {/* Destination Stop - Only Downstream Stops */}
            <Select
              label="2. Destination Stop (To)"
              value={destStopId}
              onChange={(e) => setDestStopId(e.target.value)}
              options={availableDestinations.map((s) => ({
                value: s.stop_id,
                label: `→ ${s.stop.name}`,
              }))}
            />

            {/* Passenger Count Stepper + Concession */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">Passengers</label>
                <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 p-1">
                  <button
                    type="button"
                    onClick={() => setPassengerCount((c) => Math.max(1, c - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-800 text-lg font-bold text-white hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-bold text-white">{passengerCount}</span>
                  <button
                    type="button"
                    onClick={() => setPassengerCount((c) => Math.min(6, c + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-800 text-lg font-bold text-white hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              <Select
                label="Concession"
                value={concessionType}
                onChange={(e) => setConcessionType(e.target.value)}
                options={[
                  { value: "NONE", label: "None (Full Fare)" },
                  { value: "STUDENT", label: "Student (50% Off)" },
                  { value: "SENIOR", label: "Senior (50% Off)" },
                  { value: "MONTHLY_PASS", label: "Pass (75% Off)" },
                  { value: "FREEDOM_FIGHTER", label: "Free Pass" },
                ]}
              />
            </div>

            {/* Live Fare Preview Banner */}
            <div className="flex items-center justify-between rounded-xl bg-amber-500/10 p-3.5 border border-amber-500/30">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Total Cash to Collect:
              </span>
              <span className="text-xl font-black text-amber-400">
                ₹{estimatedFare.toFixed(2)}
              </span>
            </div>

            {/* Action Button */}
            <Button
              className="mt-1 w-full h-12 text-sm font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg"
              size="lg"
              isLoading={isIssuing}
              onClick={handleIssueCashTicket}
            >
              Collect ₹{estimatedFare.toFixed(2)} & Print Ticket →
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
