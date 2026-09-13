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
import type { Trip, TripStop, TripOccupancy, Stop, Bus, Route } from "@sbt/shared-types";
import { startTrip, departStopAndExpireTickets, listTripStops, getTripOccupancy, verifyBusQr } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useConductorAuth } from "../hooks/useConductorAuth";
import { useWakeLock } from "../hooks/useWakeLock";
import { useGpsTelemetry } from "../hooks/useGpsTelemetry";
import { useSosLongPress } from "../hooks/useSosLongPress";
import { createAlert } from "@sbt/supabase-client";
import { PocketMode } from "../components/PocketMode";
import { BusQrScannerModal } from "../components/BusQrScannerModal";
import { Play, Ticket, Camera, Lock, AlertTriangle, QrCode, Bus as BusIcon, ArrowLeft, MessageSquare, Send, CheckCircle2, ShieldAlert } from "lucide-react";

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

interface SosChatMessage {
  id: string;
  alert_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

export function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { conductor } = useConductorAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [assignedBus, setAssignedBus] = useState<Bus | null>(null);
  const [assignedRoute, setAssignedRoute] = useState<Route | null>(null);
  const [showBusScanner, setShowBusScanner] = useState(false);
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
  const [concessionType, setConcessionType] = useState<string>("NORMAL");
  const [isIssuing, setIsIssuing] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<IssuedTicket | null>(null);
  const [estimatedFare, setEstimatedFare] = useState<number>(15);

  // SOS & Dispatch Chat State
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [showSosChat, setShowSosChat] = useState(false);
  const [sosMessages, setSosMessages] = useState<SosChatMessage[]>([]);
  const [sosMsgInput, setSosMsgInput] = useState("");
  const [isSendingSosMsg, setIsSendingSosMsg] = useState(false);

  const wakeLock = useWakeLock();

  const loadTrip = useCallback(async () => {
    if (!tripId) return;
    const { data } = await supabase.from("trips").select("*").eq("id", tripId).single();
    const t = data as Trip;
    setTrip(t);

    if (t?.bus_id) {
      const { data: bData } = await supabase.from("buses").select("*").eq("id", t.bus_id).single();
      if (bData) setAssignedBus(bData as Bus);
    }
    if (t?.route_id) {
      const { data: rData } = await supabase.from("routes").select("*").eq("id", t.route_id).single();
      if (rData) setAssignedRoute(rData as Route);
    }

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
        if (concessionType === "STUDENT" || concessionType === "SENIOR" || concessionType === "SENIOR_CITIZEN") discountPct = 0.5;
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

  const handleVerifyAndStart = async (scannedValue: string) => {
    if (!tripId || !trip) return;
    setIsStarting(true);
    try {
      console.info("[TripPage] Initiating vehicle verification for bus_id:", trip.bus_id);

      // 1. Verify bus QR against assigned bus
      await verifyBusQr(
        supabase,
        scannedValue,
        trip.bus_id,
        assignedBus?.bus_number,
        assignedBus?.registration_number
      );

      // 2. Haptic buzz on valid bus identity
      if ("vibrate" in navigator) {
        navigator.vibrate([120]);
      }

      // 3. Start trip and transition status to ACTIVE
      void wakeLock.request();
      const updated = await startTrip(supabase, tripId, scannedValue);
      setTrip(updated);
      setShowBusScanner(false);
      push({
        tone: "success",
        title: "Bus Verified — Service Live!",
        description: `Bus #${assignedBus?.bus_number ?? "assigned vehicle"} is now broadcasting GPS and visible to passengers.`,
      });
      await loadTrip();
    } catch (err: any) {
      console.error("[TripPage] Bus verification error:", err);
      throw err;
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

  // Check for any existing active SOS alert for this trip
  useEffect(() => {
    if (!tripId) return;
    supabase
      .from("alerts")
      .select("id, status")
      .eq("trip_id", tripId)
      .in("status", ["ACTIVE", "ACKNOWLEDGED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setActiveAlertId(data.id);
        }
      });
  }, [tripId]);

  // Realtime subscription for SOS Chat messages
  useEffect(() => {
    if (!activeAlertId) return;

    const loadSosMsgs = async () => {
      const { data } = await supabase
        .from("alert_messages")
        .select("*")
        .eq("alert_id", activeAlertId)
        .order("created_at", { ascending: true });
      if (data) setSosMessages(data as SosChatMessage[]);
    };
    void loadSosMsgs();

    const channel = supabase
      .channel(`conductor-sos-chat-${activeAlertId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_messages", filter: `alert_id=eq.${activeAlertId}` },
        (payload) => {
          setSosMessages((prev) => {
            const newMsg = payload.new as SosChatMessage;
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAlertId]);

  const handleSendSosMsg = async (presetText?: string) => {
    const text = (presetText ?? sosMsgInput).trim();
    if (!text || !activeAlertId) return;
    setIsSendingSosMsg(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: sendErr } = await supabase.from("alert_messages").insert({
        alert_id: activeAlertId,
        sender_id: user?.id ?? conductor?.id,
        sender_role: "conductor",
        message: text,
      });
      if (sendErr) throw sendErr;
      setSosMsgInput("");
    } catch (err: any) {
      push({ tone: "danger", title: "Message failed", description: err.message ?? "Could not send message" });
    } finally {
      setIsSendingSosMsg(false);
    }
  };

  const handleSos = async () => {
    if (!conductor) return;
    try {
      const alert = await createAlert(supabase, {
        trip_id: trip?.id ?? null,
        bus_id: trip?.bus_id ?? null,
        conductor_id: conductor.id,
        severity: "SOS",
        message: "SOS triggered by conductor",
        latitude: telemetry.lastTelemetry?.latitude ?? null,
        longitude: telemetry.lastTelemetry?.longitude ?? null,
      });
      setActiveAlertId(alert.id);
      setShowSosChat(true);
      push({ tone: "danger", title: "SOS sent", description: "Admin alerted. Emergency dispatcher chat opened." });
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
      let ticketData: IssuedTicket | null = null;

      // 1. Attempt generate_passenger_cash_ticket (migration 038/039)
      const { data, error } = await supabase.rpc("generate_passenger_cash_ticket", {
        p_trip_id: tripId,
        p_origin_stop_id: originStopId,
        p_dest_stop_id: destStopId,
        p_passenger_count: passengerCount,
        p_concession_type: concessionType,
      });

      if (!error && data) {
        ticketData = data as IssuedTicket;
      } else {
        console.warn("[CashTicket] generate_passenger_cash_ticket failed, falling back to issue_cash_ticket:", error);

        // 2. Fallback to issue_cash_ticket (migration 024)
        const { data: fbData, error: fbErr } = await supabase.rpc("issue_cash_ticket", {
          p_trip_id: tripId,
          p_origin_stop_id: originStopId,
          p_dest_stop_id: destStopId,
          p_passenger_count: passengerCount,
        });

        if (fbErr) {
          console.warn("[CashTicket] issue_cash_ticket also failed:", fbErr);
          throw fbErr;
        }

        ticketData = {
          ticket_id: fbData.id,
          pnr: fbData.pnr,
          fare: Number(fbData.total_fare ?? fbData.fare ?? estimatedFare),
          passenger_count: fbData.passenger_count ?? passengerCount,
          concession_type: fbData.concession_type ?? concessionType,
          qr_payload: fbData.qr_payload,
          qr_signature: fbData.qr_signature,
          created_at: fbData.created_at || new Date().toISOString(),
        };
      }

      setIssuedTicket(ticketData);
      push({ tone: "success", title: "Ticket Issued", description: `PNR: ${ticketData.pnr} • ₹${ticketData.fare}` });
      await loadTrip();
    } catch (err: any) {
      console.error("[CashTicket] Cash ticket issuance failed:", err);
      push({ tone: "danger", title: "Issuance failed", description: err.message || "Failed to issue ticket." });
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
        leading={
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Back to Dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 active:scale-95 shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        title={
          <div className="flex items-center gap-2">
            <Badge tone={trip.status === "ACTIVE" ? "success" : trip.status === "COMPLETED" ? "brand" : "neutral"}>
              {trip.status}
            </Badge>
            <span className="text-xs font-bold text-slate-300">Trip #{trip.id.slice(0, 6).toUpperCase()}</span>
            {activeAlertId && (
              <button
                type="button"
                onClick={() => setShowSosChat(true)}
                className="flex items-center gap-1 animate-pulse rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black text-rose-400"
              >
                <ShieldAlert className="h-3 w-3" />
                <span>SOS CHAT</span>
              </button>
            )}
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
        {/* TRIP COMPLETED HERO CARD */}
        {trip.status === "COMPLETED" && (
          <Card className="border-emerald-500/50 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 shadow-2xl p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <Badge tone="success" className="mt-3 inline-block font-extrabold tracking-wider uppercase text-[10px]">
              TRIP COMPLETED
            </Badge>
            <h2 className="mt-2 text-xl font-black text-white">All Stops Serviced & Concluded</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              This transit journey has reached its final destination. All passenger tickets have been reconciled.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-left rounded-xl bg-slate-950/70 p-3 text-xs border border-slate-800">
              <div>
                <span className="text-slate-400">Total Route Stops:</span>
                <p className="font-bold text-slate-200">{stops.length} Stops</p>
              </div>
              <div>
                <span className="text-slate-400">Assigned Bus:</span>
                <p className="font-bold text-slate-200">{assignedBus?.bus_number ?? "Vehicle"}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2.5">
              <Button
                size="lg"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Return to Conductor Dashboard</span>
              </Button>
            </div>
          </Card>
        )}
        {trip.status === "SCHEDULED" && (
          <div className="flex flex-col gap-4">
            <ConductorHero className="h-36 w-full rounded-2xl shadow-xl" />

            {/* Vehicle Verification & Activation Gate */}
            <Card className="border-amber-500/50 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 shadow-xl shadow-amber-950/30 p-5">
              <div className="flex items-center justify-between">
                <Badge tone="warning" className="animate-pulse font-extrabold uppercase tracking-wider text-[11px]">
                  ACTION REQUIRED • SERVICE OFFLINE
                </Badge>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {assignedBus?.bus_number ? `Bus #${assignedBus.bus_number}` : "Bus Unassigned"}
                </span>
              </div>

              <div className="mt-3.5">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <BusIcon className="h-5 w-5 text-amber-400" />
                  <span>Verify Assigned Vehicle</span>
                </h2>
                <div className="mt-2.5 rounded-xl bg-slate-950/60 border border-slate-800 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Assigned Bus:</span>
                    <span className="font-bold text-slate-200">
                      {assignedBus?.bus_number ?? "Loading…"}
                      {assignedBus?.registration_number ? ` (${assignedBus.registration_number})` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vehicle Type & Seats:</span>
                    <span className="font-medium text-slate-300">
                      {assignedBus?.type ?? "Standard"} · {assignedBus?.capacity ?? 50} Passengers
                    </span>
                  </div>
                  {assignedRoute && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Route:</span>
                      <span className="font-medium text-slate-300">
                        {assignedRoute.route_number ? `Route ${assignedRoute.route_number}: ` : ""}{assignedRoute.name}
                      </span>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs text-amber-200/90 leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  This transit service is currently <strong>offline and hidden from passengers</strong>. To begin broadcasting live GPS location and allow passengers to book seats, scan the official QR code located on Bus #{assignedBus?.bus_number ?? "the assigned vehicle"}.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <Button
                  size="lg"
                  className="h-14 w-full text-base font-black shadow-xl bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center justify-center gap-2.5 rounded-2xl"
                  isLoading={isStarting}
                  onClick={() => setShowBusScanner(true)}
                >
                  <QrCode className="h-5 w-5" />
                  <span>Scan Bus QR to Start Service</span>
                </Button>

                <button
                  type="button"
                  onClick={() => setShowBusScanner(true)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline text-center py-1 transition-colors"
                >
                  Cannot scan with camera? Enter verification code manually
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* PROMINENT CONDUCTOR HERO ACTIONS (Unmissable, High-Contrast, Thumb-Friendly) */}
        {trip.status === "ACTIVE" && (
          <div className="grid grid-cols-2 gap-3.5">
            {/* Issue Cash Ticket Card Button */}
            <button
              type="button"
              onClick={() => {
                setIssuedTicket(null);
                setShowIssueTicket(true);
              }}
              className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl border border-[#D97F00]/40 bg-gradient-to-br from-[#0D2A5D] to-[#081A3A] p-4 text-left shadow-xl shadow-navy-950/40 transition-all duration-150 active:scale-95 hover:brightness-110"
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D97F00]/20 text-[#D97F00] border border-[#D97F00]/30 backdrop-blur-sm shadow-inner">
                  <Ticket className="h-5 w-5" />
                </span>
                <span className="rounded-md bg-[#D97F00] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Cash POS
                </span>
              </div>
              <div className="mt-3">
                <p className="text-base font-black leading-tight text-white uppercase tracking-wide">
                  Issue Ticket
                </p>
                <p className="text-[11px] font-semibold text-white/70 mt-0.5">
                  Walk-in cash fare
                </p>
              </div>
            </button>

            {/* Scan Passenger QR Card Button */}
            <button
              type="button"
              onClick={() => navigate(`/trip/${trip.id}/scan`)}
              className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900 to-slate-950 p-4 text-left shadow-xl shadow-navy-950/40 transition-all duration-150 active:scale-95 hover:brightness-110"
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white border border-white/10 backdrop-blur-sm shadow-inner">
                  <Camera className="h-5 w-5" />
                </span>
                <span className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Validator
                </span>
              </div>
              <div className="mt-3">
                <p className="text-base font-black leading-tight text-white uppercase tracking-wide">
                  Scan Ticket
                </p>
                <p className="text-[11px] font-semibold text-white/70 mt-0.5">
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
              <Ticket className="h-4 w-4" />
              <span>Issue Ticket</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/trip/${trip.id}/scan`)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/50 active:scale-98 transition-transform"
            >
              <Camera className="h-4 w-4" />
              <span>Scan QR</span>
            </button>

            <button
              type="button"
              onClick={() => setPocketMode(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
              title="Pocket Lock"
            >
              <Lock className="h-5 w-5" />
            </button>

            <button
              type="button"
              {...sos.handlers}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-600 font-bold text-white shadow-lg shadow-rose-950/60 active:scale-95 select-none"
              title="Hold for SOS"
              style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.4) ${sos.progress * 100}%, transparent ${sos.progress * 100}%)` }}
            >
              <AlertTriangle className="h-5 w-5" />
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
                  { value: "NORMAL", label: "Normal (Full Fare)" },
                  { value: "STUDENT", label: "Student (50% Off)" },
                  { value: "SENIOR_CITIZEN", label: "Senior (50% Off)" },
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

      {/* Bus QR Scanner & Vehicle Verification Modal */}
      <BusQrScannerModal
        isOpen={showBusScanner}
        onClose={() => setShowBusScanner(false)}
        assignedBus={assignedBus}
        onVerify={handleVerifyAndStart}
      />

      {/* Emergency SOS & Dispatch Control Room Chat Drawer */}
      <Dialog
        open={showSosChat}
        onClose={() => setShowSosChat(false)}
        title="Emergency Dispatch & Control Room Chat"
      >
        <div className="flex flex-col gap-4 py-1">
          {/* Header Alert Strip */}
          <div className="flex items-center justify-between rounded-xl bg-rose-500/10 border border-rose-500/30 p-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-400" />
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">Live Control Room Channel</p>
                <p className="text-[11px] text-rose-300">Central transit dispatchers are monitoring this trip.</p>
              </div>
            </div>
            <Badge tone="danger" className="font-extrabold uppercase text-[10px]">
              SOS ACTIVE
            </Badge>
          </div>

          {/* Messages Feed */}
          <div className="flex flex-col gap-2.5 max-h-[300px] min-h-[160px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            {sosMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center text-xs text-slate-400">
                <MessageSquare className="h-8 w-8 text-slate-600 mb-1" />
                <p>No messages yet.</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Control room operators have received your SOS.</p>
              </div>
            ) : (
              sosMessages.map((msg) => {
                const isConductor = msg.sender_role === "conductor";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                      isConductor
                        ? "self-end bg-amber-600/90 text-white rounded-tr-none"
                        : "self-start bg-indigo-950/80 border border-indigo-500/40 text-indigo-100 rounded-tl-none"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] font-bold opacity-80 mb-1">
                      <span>{isConductor ? "You (Conductor)" : "Control Room (Admin)"}</span>
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="font-medium">{msg.message}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Reply Preset Chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              "Medical assistance needed",
              "Traffic roadblock / delayed",
              "Vehicle mechanical issue",
              "Patrol / Security requested",
              "Situation under control",
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSendSosMsg(chip)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold px-2.5 py-1 transition-colors border border-slate-700"
              >
                + {chip}
              </button>
            ))}
          </div>

          {/* Message Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendSosMsg();
            }}
            className="flex items-center gap-2 pt-1"
          >
            <input
              type="text"
              placeholder="Type message to central dispatch..."
              value={sosMsgInput}
              onChange={(e) => setSosMsgInput(e.target.value)}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
            />
            <Button
              type="submit"
              size="sm"
              className="h-10 px-4 bg-brand-600 hover:bg-brand-500 font-bold rounded-xl shrink-0"
              disabled={!sosMsgInput.trim() || isSendingSosMsg}
              isLoading={isSendingSosMsg}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
