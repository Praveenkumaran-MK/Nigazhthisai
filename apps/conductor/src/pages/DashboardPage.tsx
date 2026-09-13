import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  LoadingState,
  StatusIndicator,
  StatCard,
  Badge,
  Dialog,
  Select,
  QRDisplay,
  TransitBusRunner,
  useToast,
} from "@sbt/ui";
import {
  QrCode,
  Ticket,
  Clock,
  Bus as BusIcon,
  Eye,
  EyeOff,
  Lock,
  AlertTriangle,
  Camera,
  ShieldAlert,
  MessageSquare,
  Send,
  CheckCircle2,
  Navigation,
  Radio,
} from "lucide-react";
import type { TripStop, TripOccupancy, Stop } from "@sbt/shared-types";
import {
  startTrip,
  listTripStops,
  getTripOccupancy,
  verifyBusQr,
  createAlert,
} from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useConductorAuth } from "../hooks/useConductorAuth";
import { useConductorI18n } from "../lib/i18n";
import { useWakeLock } from "../hooks/useWakeLock";
import { useGpsTelemetry } from "../hooks/useGpsTelemetry";
import { useSosLongPress } from "../hooks/useSosLongPress";
import { PocketMode } from "../components/PocketMode";
import { BusQrScannerModal } from "../components/BusQrScannerModal";

interface AssignedTrip {
  id: string;
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  bus_id: string;
  route_id: string;
  scheduled_departure?: string | null;
  scheduled_arrival?: string | null;
  started_at?: string | null;
  current_stop_id?: string | null;
  buses?: {
    id: string;
    bus_number: string;
    registration_number?: string | null;
    type?: string | null;
    capacity?: number | null;
  } | null;
  routes?: {
    id: string;
    route_number: string;
    name: string;
  } | null;
}

interface ConductorStats {
  conductor_id: string;
  date: string;
  trips_count: number;
  active_trip: {
    id: string;
    status: string;
    bus_id: string;
    bus_number: string;
    route_code: string;
    origin: string;
    destination: string;
    actual_departure: string;
    current_stop_index: number;
  } | null;
  tickets_issued: number;
  cash_revenue: number;
  digital_revenue: number;
  total_revenue: number;
  passengers_carried: number;
}

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

export function DashboardPage() {
  const { conductor, logout } = useConductorAuth();
  const { lang, setLang, t } = useConductorI18n();
  const navigate = useNavigate();
  const { push } = useToast();

  const [stats, setStats] = useState<ConductorStats | null>(null);
  const [assignedTrips, setAssignedTrips] = useState<AssignedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const [hideFinancials, setHideFinancials] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ngz_conductor_metrics_hidden") === "true";
    } catch {
      return false;
    }
  });
  const rpcStatsAvailable = useRef<boolean>(true);

  // Active Trip Live Details
  const [stops, setStops] = useState<StopRow[]>([]);
  const [occupancy, setOccupancy] = useState<TripOccupancy | null>(null);
  const [pocketMode, setPocketMode] = useState(false);

  // Vehicle verification modal state
  const [showBusScanner, setShowBusScanner] = useState(false);
  const [verifyingTrip, setVerifyingTrip] = useState<AssignedTrip | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Cash POS Dialog & Receipt State
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

  const toggleHideFinancials = () => {
    setHideFinancials((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ngz_conductor_metrics_hidden", String(next));
      } catch {
        // quota
      }
      return next;
    });
  };

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!conductor?.id) return;
    try {
      // 1. Fetch live assigned trips (both SCHEDULED and ACTIVE)
      const { data: tripsData, error: tripsErr } = await supabase
        .from("trips")
        .select(`
          id,
          status,
          bus_id,
          route_id,
          scheduled_departure,
          scheduled_arrival,
          started_at,
          current_stop_id,
          buses (
            id,
            bus_number,
            registration_number,
            type,
            capacity
          ),
          routes (
            id,
            route_number,
            name
          )
        `)
        .eq("conductor_id", conductor.id)
        .in("status", ["ACTIVE", "SCHEDULED"])
        .order("created_at", { ascending: false });

      if (!tripsErr && tripsData) {
        const mapped: AssignedTrip[] = (tripsData as any[]).map((t) => ({
          id: t.id,
          status: t.status,
          bus_id: t.bus_id,
          route_id: t.route_id,
          scheduled_departure: t.scheduled_departure,
          scheduled_arrival: t.scheduled_arrival,
          started_at: t.started_at,
          current_stop_id: t.current_stop_id,
          buses: Array.isArray(t.buses) ? t.buses[0] : t.buses,
          routes: Array.isArray(t.routes) ? t.routes[0] : t.routes,
        }));
        setAssignedTrips(mapped);
      }

      // 2. Fetch stats for financial metrics
      let loadedStats: ConductorStats | null = null;
      if (rpcStatsAvailable.current) {
        try {
          const { data: statsData, error: statsErr } = await supabase.rpc("get_conductor_stats", {
            p_conductor_id: conductor.id,
            p_target_date: new Date().toISOString().slice(0, 10),
          });
          if (!statsErr && statsData) {
            loadedStats = statsData as ConductorStats;
          } else if (statsErr) {
            console.warn(
              "[Dashboard] get_conductor_stats RPC returned error, using direct query fallback:",
              statsErr.message
            );
          }
        } catch (err) {
          console.warn("[Dashboard] get_conductor_stats invocation failed, using direct query fallback:", err);
        }
      }

      // Direct fallback if RPC is unmigrated or unavailable: calculate directly from DB tables
      if (!loadedStats) {
        try {
          const todayStr: string = new Date().toISOString().slice(0, 10);
          const { data: allConductorTrips } = await supabase
            .from("trips")
            .select("id, status, scheduled_departure, started_at, created_at")
            .eq("conductor_id", conductor.id);

          const todayTrips = (allConductorTrips || []).filter((t) => {
            const dateStr = (t.scheduled_departure || t.started_at || t.created_at || "").slice(0, 10);
            return dateStr === todayStr;
          });
          const allTripIds = (allConductorTrips || []).map((t) => t.id);
          const activeTripIds = new Set(
            (allConductorTrips || []).filter((t) => t.status === "ACTIVE").map((t) => t.id)
          );

          let ticketsIssued = 0;
          let cashRevenue = 0;
          let digitalRevenue = 0;
          let passengersCarried = 0;

          const ticketMap = new Map<string, any>();

          if (allTripIds.length > 0) {
            const { data: tripTickets } = await supabase
              .from("tickets")
              .select("id, trip_id, total_fare, channel, passenger_count, created_at, validated_at, status")
              .in("trip_id", allTripIds)
              .in("status", ["PAID", "VALIDATED", "EXPIRED"]);

            for (const tk of tripTickets || []) {
              ticketMap.set(tk.id, tk);
            }
          }

          // Also fetch tickets validated by this conductor's user ID
          const { data: validatedTickets } = await supabase
            .from("tickets")
            .select("id, trip_id, total_fare, channel, passenger_count, created_at, validated_at, status")
            .eq("validated_by", conductor.id)
            .in("status", ["PAID", "VALIDATED", "EXPIRED"]);

          for (const tk of validatedTickets || []) {
            ticketMap.set(tk.id, tk);
          }

          const relevantTickets = Array.from(ticketMap.values()).filter((tk) => {
            const createdDate = (tk.created_at || "").slice(0, 10);
            const validatedDate = (tk.validated_at || "").slice(0, 10);
            const isToday = createdDate === todayStr || validatedDate === todayStr;
            const isOnActiveTrip = tk.trip_id && activeTripIds.has(tk.trip_id);
            return isToday || isOnActiveTrip;
          });

          ticketsIssued = relevantTickets.length;
          for (const tk of relevantTickets) {
            const fare = Number(tk.total_fare || 0);
            const isCash = tk.channel === "CASH" || tk.channel === "ETM";
            if (isCash) {
              cashRevenue += fare;
            } else {
              digitalRevenue += fare;
            }
            passengersCarried += tk.passenger_count || 1;
          }

          loadedStats = {
            conductor_id: conductor.id,
            date: todayStr,
            trips_count: todayTrips.length,
            active_trip: null,
            tickets_issued: ticketsIssued,
            cash_revenue: cashRevenue,
            digital_revenue: digitalRevenue,
            total_revenue: cashRevenue + digitalRevenue,
            passengers_carried: passengersCarried,
          };
        } catch (calcErr) {
          console.warn("[Dashboard] Direct stats calculation error:", calcErr);
        }
      }

      if (loadedStats) {
        setStats(loadedStats);
      }
    } catch (err) {
      console.error("Failed to load conductor dashboard data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conductor?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Reload on window focus and tab visibility (e.g. returning from scanner)
  useEffect(() => {
    const handleFocus = () => {
      void loadData();
    };
    window.addEventListener("focus", handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadData]);

  // Real-time listener for newly assigned or updated trips & tickets
  useEffect(() => {
    if (!conductor?.id) return;

    const tripsChannel = supabase
      .channel(`conductor-trips-realtime-${conductor.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trips",
          filter: `conductor_id=eq.${conductor.id}`,
        },
        () => {
          void loadData();
        }
      )
      .subscribe();

    const ticketsChannel = supabase
      .channel(`conductor-tickets-realtime-${conductor.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
        },
        () => {
          void loadData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(tripsChannel);
      void supabase.removeChannel(ticketsChannel);
    };
  }, [conductor?.id, loadData]);

  // Derive active and scheduled trips
  const activeTrip = assignedTrips.find((t) => t.status === "ACTIVE") ?? null;
  const scheduledTrips = assignedTrips.filter((t) => t.status === "SCHEDULED");
  const primaryScheduledTrip = !activeTrip && scheduledTrips.length > 0 ? scheduledTrips[0] : null;
  const otherScheduledTrips = !activeTrip && scheduledTrips.length > 1 ? scheduledTrips.slice(1) : (activeTrip ? scheduledTrips : []);

  // Fetch stops & occupancy when an active trip is present
  const loadActiveTripDetails = useCallback(async () => {
    if (!activeTrip?.id) {
      setStops([]);
      setOccupancy(null);
      return;
    }

    try {
      const tripStops = await listTripStops(supabase, activeTrip.id);
      if (tripStops.length > 0) {
        const { data: stopRows } = await supabase
          .from("stops")
          .select("*")
          .in("id", tripStops.map((s) => s.stop_id));
        const stopById = new Map((stopRows ?? []).map((s) => [s.id, s as Stop]));
        const rows = tripStops.map((s) => ({ ...s, stop: stopById.get(s.stop_id)! }));
        setStops(rows);

        // Prepopulate origin and destination for cash ticketing
        const curStopId = activeTrip.current_stop_id;
        const initialOrigin = curStopId && rows.some((r) => r.stop_id === curStopId)
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

      const occ = await getTripOccupancy(supabase, activeTrip.id);
      setOccupancy(occ);
    } catch (err) {
      console.warn("[Dashboard] Error loading active trip details:", err);
    }
  }, [activeTrip?.id, activeTrip?.current_stop_id, originStopId]);

  useEffect(() => {
    void loadActiveTripDetails();
  }, [loadActiveTripDetails]);

  // Real-time listener for active trip stops and occupancy progression
  useEffect(() => {
    if (!activeTrip?.id) return;

    const channel = supabase
      .channel(`dashboard-active-trip:${activeTrip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips", filter: `id=eq.${activeTrip.id}` },
        () => void loadActiveTripDetails()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_stops", filter: `trip_id=eq.${activeTrip.id}` },
        () => void loadActiveTripDetails()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_occupancy", filter: `trip_id=eq.${activeTrip.id}` },
        () => void loadActiveTripDetails()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeTrip?.id, loadActiveTripDetails]);

  // Telemetry: Continuous broadcast whenever active trip is running
  const telemetry = useGpsTelemetry({
    busId: activeTrip?.bus_id ?? "",
    tripId: activeTrip?.id ?? "",
    routeId: activeTrip?.route_id ?? "",
    conductorId: conductor?.id ?? "",
    enabled: Boolean(activeTrip && conductor),
  });

  // Screen WakeLock for continuous operation while driving
  useEffect(() => {
    if (activeTrip) {
      void wakeLock.request();
    } else {
      void wakeLock.release();
    }
    return () => {
      void wakeLock.release();
    };
  }, [activeTrip, wakeLock]);

  // Downstream stop options based on selected origin stop
  const originIndex = useMemo(() => {
    return stops.findIndex((s) => s.stop_id === originStopId);
  }, [stops, originStopId]);

  const availableDestinations = useMemo(() => {
    if (originIndex < 0 || originIndex >= stops.length - 1) {
      return stops.filter((s) => s.stop_id !== originStopId);
    }
    return stops.slice(originIndex + 1);
  }, [stops, originIndex, originStopId]);

  const handleOriginChange = (newOriginId: string) => {
    setOriginStopId(newOriginId);
    const newIdx = stops.findIndex((s) => s.stop_id === newOriginId);
    const nextStops = stops.slice(newIdx + 1);
    if (nextStops.length > 0) {
      if (!nextStops.some((s) => s.stop_id === destStopId)) {
        setDestStopId(nextStops[0]?.stop_id || "");
      }
    } else {
      const other = stops.find((s) => s.stop_id !== newOriginId);
      if (other) setDestStopId(other.stop_id);
    }
  };

  // Calculate live estimated fare
  useEffect(() => {
    if (!activeTrip?.route_id || !originStopId || !destStopId) return;

    supabase
      .rpc("calculate_fare", {
        p_route_id: activeTrip.route_id,
        p_origin_stop_id: originStopId,
        p_dest_stop_id: destStopId,
      })
      .then(({ data }) => {
        const baseFare = Number(data) || 15;
        let discountPct = 0;
        if (concessionType === "STUDENT" || concessionType === "SENIOR" || concessionType === "SENIOR_CITIZEN") discountPct = 0.5;
        if (concessionType === "MONTHLY_PASS") discountPct = 0.75;
        if (concessionType === "FREEDOM_FIGHTER") discountPct = 1.0;

        const total = Math.round(baseFare * passengerCount * (1 - discountPct));
        setEstimatedFare(Math.max(0, total));
      });
  }, [activeTrip?.route_id, originStopId, destStopId, passengerCount, concessionType]);

  // Handle Cash Ticket Issuance
  const handleIssueCashTicket = async () => {
    if (!activeTrip?.id || !originStopId || !destStopId) return;
    setIsIssuing(true);
    try {
      let ticketData: IssuedTicket | null = null;

      const { data, error } = await supabase.rpc("generate_passenger_cash_ticket", {
        p_trip_id: activeTrip.id,
        p_origin_stop_id: originStopId,
        p_dest_stop_id: destStopId,
        p_passenger_count: passengerCount,
        p_concession_type: concessionType,
      });

      if (!error && data) {
        ticketData = data as IssuedTicket;
      } else {
        const { data: fbData, error: fbErr } = await supabase.rpc("issue_cash_ticket", {
          p_trip_id: activeTrip.id,
          p_origin_stop_id: originStopId,
          p_dest_stop_id: destStopId,
          p_passenger_count: passengerCount,
        });

        if (fbErr) throw fbErr;

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
      await loadData();
      await loadActiveTripDetails();
    } catch (err: any) {
      console.error("[CashTicket] Cash ticket issuance failed:", err);
      push({ tone: "danger", title: "Issuance failed", description: err.message || "Failed to issue ticket." });
    } finally {
      setIsIssuing(false);
    }
  };

  // Vehicle verification & trip start handler
  const handleVerifyAndStart = async (scannedValue: string) => {
    const target = verifyingTrip || primaryScheduledTrip;
    if (!target) return;
    setIsStarting(true);
    try {
      await verifyBusQr(
        supabase,
        scannedValue,
        target.bus_id,
        target.buses?.bus_number,
        target.buses?.registration_number
      );

      if ("vibrate" in navigator) {
        navigator.vibrate([120]);
      }

      void wakeLock.request();
      await startTrip(supabase, target.id, scannedValue);
      setShowBusScanner(false);
      setVerifyingTrip(null);
      push({
        tone: "success",
        title: "Bus Verified — Service Live!",
        description: `Bus #${target.buses?.bus_number ?? "assigned vehicle"} is now broadcasting GPS and active.`,
      });
      await loadData();
    } catch (err: any) {
      console.error("[Dashboard] Bus verification error:", err);
      throw err;
    } finally {
      setIsStarting(false);
    }
  };

  // SOS & Dispatch Chat
  useEffect(() => {
    if (!activeTrip?.id) return;
    supabase
      .from("alerts")
      .select("id, status")
      .eq("trip_id", activeTrip.id)
      .in("status", ["ACTIVE", "ACKNOWLEDGED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setActiveAlertId(data.id);
        }
      });
  }, [activeTrip?.id]);

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
      void supabase.removeChannel(channel);
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
    if (!conductor || !activeTrip) return;
    try {
      const alert = await createAlert(supabase, {
        trip_id: activeTrip.id,
        bus_id: activeTrip.bus_id,
        conductor_id: conductor.id,
        severity: "SOS",
        message: "SOS triggered by conductor from dashboard",
        latitude: telemetry.lastTelemetry?.latitude ?? null,
        longitude: telemetry.lastTelemetry?.longitude ?? null,
      });
      setActiveAlertId(alert.id);
      setShowSosChat(true);
      push({ tone: "danger", title: "SOS sent", description: "Admin alerted. Emergency dispatcher chat opened." });
    } catch (e: any) {
      push({ tone: "danger", title: "SOS failed to send", description: e instanceof Error ? e.message : undefined });
    }
  };
  const sos = useSosLongPress(handleSos);

  const handleRefresh = () => {
    rpcStatsAvailable.current = true;
    setRefreshing(true);
    void loadData();
    if (activeTrip) {
      void loadActiveTripDetails();
    }
  };

  if (pocketMode) {
    return <PocketMode telemetryStatus={telemetry.status} onExit={() => setPocketMode(false)} sos={sos} />;
  }

  // Calculate stop progression percentage
  const currentStopIndex = stops.findIndex((s) => s.stop_id === activeTrip?.current_stop_id);
  const routeProgressPercent = stops.length > 1
    ? (Math.max(0, currentStopIndex) / Math.max(1, stops.length - 1)) * 100
    : 0;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 p-5 pt-8 pb-32">
      {/* Top Header */}
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">{conductor?.display_name ?? "Conductor"}</h1>
            <Badge tone="brand">ETM Active</Badge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <StatusIndicator status={isOnline ? "online" : "offline"} label={isOnline ? "Cloud Sync Active" : "Offline"} />
            <span>•</span>
            <span>Gov ID: {conductor?.government_id ?? "TN-TR-001"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Bilingual Language Switcher */}
          <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                lang === "en" ? "bg-[#D97F00] text-navy-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang("ta")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                lang === "ta" ? "bg-[#D97F00] text-navy-950 shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              TA
            </button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "..." : "↻ Refresh"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </header>

      {loading ? (
        <LoadingState label="Loading conductor dashboard…" />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* 1. LIVE ACTIVE TRANSIT HUB (Single Unified Operations Surface)             */}
          {/* ========================================================================= */}
          {activeTrip ? (
            <div className="flex flex-col gap-4">
              {/* Active Trip Hero Banner */}
              <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 shadow-xl shadow-emerald-950/30">
                <div className="flex items-center justify-between">
                  <Badge tone="success" className="font-extrabold uppercase tracking-wider">
                    TRIP IN PROGRESS
                  </Badge>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    Bus #{activeTrip.buses?.bus_number ?? "N/A"}
                  </span>
                </div>

                <div className="mt-3">
                  <h2 className="text-lg font-bold text-slate-100">
                    {activeTrip.routes?.route_number ? `Route ${activeTrip.routes.route_number}: ` : ""}
                    {activeTrip.routes?.name ?? "Live Transit Service"}
                  </h2>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    <span>
                      Started{" "}
                      {activeTrip.started_at
                        ? new Date(activeTrip.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Recently"}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-slate-300">
                      ID: #{activeTrip.id.slice(0, 6).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Continuous Automated GPS Telemetry Status Strip */}
                <div className="mt-3.5 flex items-center justify-between rounded-xl bg-slate-950/70 border border-emerald-500/20 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="font-bold text-emerald-300">Continuous GPS Tracking</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Status: {telemetry.status}
                  </span>
                </div>

                {/* Route Visual Progress Runner */}
                {stops.length > 1 && (
                  <div className="mt-4 pt-1">
                    <TransitBusRunner
                      label="Automated Route Progression"
                      progress={routeProgressPercent}
                      stops={stops.map((s, i) => ({
                        label: s.stop.name,
                        atPercent: (i / Math.max(1, stops.length - 1)) * 100,
                        done: s.status === "DEPARTED",
                      }))}
                    />
                  </div>
                )}

                {/* Prominent Action Buttons on Card */}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <Button
                    size="lg"
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black shadow-lg shadow-orange-950/40 inline-flex items-center justify-center gap-2"
                    onClick={() => {
                      setIssuedTicket(null);
                      setShowIssueTicket(true);
                    }}
                  >
                    <Ticket className="h-4 w-4" />
                    <span>Issue Ticket</span>
                  </Button>

                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold inline-flex items-center justify-center gap-2 border border-slate-700"
                    onClick={() => navigate(`/trip/${activeTrip.id}/scan`)}
                  >
                    <Camera className="h-4 w-4 text-sky-400" />
                    <span>Scan Ticket</span>
                  </Button>
                </div>
              </Card>

              {/* Live Bus Occupancy Card */}
              {occupancy && (
                <Card className="border-slate-800 bg-slate-900/90 shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Bus Occupancy</p>
                      <p className="mt-1 text-2xl font-black text-slate-100">
                        {occupancy.current_passenger_count}{" "}
                        <span className="text-sm font-normal text-slate-400">/ {occupancy.capacity} Seats</span>
                      </p>
                    </div>
                    <Badge
                      tone={occupancy.capacity - occupancy.current_passenger_count > 5 ? "success" : "danger"}
                      className="text-xs font-bold px-2.5 py-1"
                    >
                      {Math.max(0, occupancy.capacity - occupancy.current_passenger_count)} seats left
                    </Badge>
                  </div>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (occupancy.current_passenger_count / Math.max(1, occupancy.capacity)) * 100)}%`,
                      }}
                    />
                  </div>
                </Card>
              )}

              {/* Stop Progression Sequence (Automated via Continuous GPS) */}
              <Card className="border-slate-800 bg-slate-900/90 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-emerald-400" />
                    <p className="text-xs uppercase tracking-wider text-slate-300 font-bold">Automated Stop Sequence</p>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">{stops.length} Stops</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                  ⚡ <strong>Automatic GPS Progression:</strong> Stops arrive and depart automatically based on continuous vehicle GPS telemetry.
                </p>

                <ol className="flex flex-col gap-2">
                  {stops.map((s, idx) => {
                    const isCurrent = s.stop_id === activeTrip.current_stop_id;
                    const isDeparted = s.status === "DEPARTED";
                    const isArrived = s.status === "ARRIVED";

                    return (
                      <li
                        key={s.id}
                        className={`flex items-center justify-between rounded-xl p-3 border transition-all ${
                          isCurrent
                            ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                            : isDeparted
                            ? "border-slate-800/40 bg-slate-950/40 opacity-70"
                            : "border-slate-800 bg-slate-950/80"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              isCurrent
                                ? "bg-emerald-500 text-slate-950"
                                : isDeparted
                                ? "bg-slate-800 text-slate-500"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-100">{s.stop.name}</p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <Badge
                                tone={isDeparted ? "neutral" : isArrived ? "brand" : "neutral"}
                                className="text-[10px]"
                              >
                                {isCurrent ? "AT STOP (CURRENT)" : s.status}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {isCurrent && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <Radio className="h-3.5 w-3.5 animate-pulse" />
                            <span>Live</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </div>
          ) : primaryScheduledTrip ? (
            /* ========================================================================= */
            /* 2. SCHEDULED TRIP BANNER (Vehicle Verification & QR Activation Gate)       */
            /* ========================================================================= */
            <Card className="border-amber-500/50 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 shadow-xl shadow-amber-950/30">
              <div className="flex items-center justify-between">
                <Badge tone="warning" className="animate-pulse font-extrabold uppercase tracking-wider">
                  SCHEDULED SERVICE READY
                </Badge>
                <span className="text-xs font-mono font-bold text-amber-400">
                  Bus #{primaryScheduledTrip.buses?.bus_number ?? "N/A"}
                </span>
              </div>
              <div className="mt-3">
                <h2 className="text-lg font-bold text-slate-100">
                  {primaryScheduledTrip.routes?.route_number ? `Route ${primaryScheduledTrip.routes.route_number}: ` : ""}
                  {primaryScheduledTrip.routes?.name ?? "Assigned Route"}
                </h2>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-amber-200/90 font-medium">
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  <span>
                    Scheduled Departure:{" "}
                    {primaryScheduledTrip.scheduled_departure
                      ? new Date(primaryScheduledTrip.scheduled_departure).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Immediate / On Demand"}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-amber-200/90 bg-amber-500/15 border border-amber-500/30 rounded-lg p-2.5 font-medium flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    Scan the QR sticker on Bus #{primaryScheduledTrip.buses?.bus_number ?? "assigned vehicle"} to verify vehicle identity and activate this bus for passengers.
                  </span>
                </p>
              </div>
              <div className="mt-4">
                <Button
                  size="lg"
                  className="w-full h-13 text-base font-extrabold shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center gap-2"
                  onClick={() => {
                    setVerifyingTrip(primaryScheduledTrip);
                    setShowBusScanner(true);
                  }}
                >
                  <QrCode className="h-5 w-5" />
                  <span>Scan Bus QR to Start Service →</span>
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between">
                <Badge tone="neutral">SCHEDULE</Badge>
                <span className="text-xs text-slate-400">Today: {assignedTrips.length} Trips Assigned</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">No trips currently assigned or active right now.</p>
            </Card>
          )}

          {/* Upcoming Additional Scheduled Trips List */}
          {otherScheduledTrips.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Upcoming Assigned Trips</h3>
              <div className="flex flex-col gap-2">
                {otherScheduledTrips.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 transition hover:border-slate-700"
                  >
                    <div>
                      <p className="font-bold text-slate-200 text-sm">
                        {st.routes?.route_number ? `${st.routes.route_number}: ` : ""}
                        {st.routes?.name ?? "Trip Service"}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <BusIcon className="h-3 w-3 text-slate-500" />
                          {st.buses?.bus_number ?? "N/A"}
                        </span>
                        <span>•</span>
                        <span>
                          {st.scheduled_departure
                            ? new Date(st.scheduled_departure).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "Scheduled"}
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setVerifyingTrip(st);
                        setShowBusScanner(true);
                      }}
                    >
                      Start Trip
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. SHIFT PERFORMANCE & FINANCIAL METRICS                                   */}
          {/* ========================================================================= */}
          <div className="flex items-center justify-between pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("Shift Summary") || "Shift Performance"}
            </h3>
            <button
              type="button"
              onClick={toggleHideFinancials}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-xs font-semibold text-slate-400 hover:border-slate-700 hover:text-slate-200 transition"
              title={hideFinancials ? "Show metrics" : "Hide metrics"}
            >
              {hideFinancials ? (
                <>
                  <Eye className="h-3.5 w-3.5 text-amber-400" />
                  <span>Show</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                  <span>Hide</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Tickets Issued"
              value={hideFinancials ? "•••" : (stats?.tickets_issued ?? 0)}
            />
            <StatCard
              label="Total Shift Revenue"
              value={hideFinancials ? "₹ ••••" : `₹${(stats?.total_revenue ?? 0).toFixed(2)}`}
            />
          </div>

          {/* Financial Breakdown Card */}
          <Card className="border-slate-800 bg-slate-900/80">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Today's Revenue Breakdown</h3>
              <button
                type="button"
                onClick={toggleHideFinancials}
                className="text-slate-500 hover:text-slate-300 transition"
                title={hideFinancials ? "Show Revenue" : "Hide Revenue"}
                aria-label={hideFinancials ? "Show Revenue" : "Hide Revenue"}
              >
                {hideFinancials ? <Eye className="h-4 w-4 text-amber-400" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
                  Cash / ETM Collections
                </span>
                <span className="font-mono font-semibold text-slate-100">
                  {hideFinancials ? "₹ ••••" : `₹${(stats?.cash_revenue ?? 0).toFixed(2)}`}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-cyan-400"></span>
                  Digital / Online Tickets
                </span>
                <span className="font-mono font-semibold text-slate-100">
                  {hideFinancials ? "₹ ••••" : `₹${(stats?.digital_revenue ?? 0).toFixed(2)}`}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-300 font-medium">Total Shift Collection</span>
                <span className="font-mono font-bold text-emerald-400 text-base">
                  {hideFinancials ? "₹ ••••" : `₹${(stats?.total_revenue ?? 0).toFixed(2)}`}
                </span>
              </div>
            </div>
          </Card>

          {/* Quick Actions (Always visible) */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("Quick Actions")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="md"
                className="inline-flex items-center gap-2"
                onClick={() => {
                  const targetTrip = activeTrip || primaryScheduledTrip;
                  if (targetTrip) {
                    navigate(`/trip/${targetTrip.id}/scan`);
                  } else {
                    navigate("/scan");
                  }
                }}
              >
                <QrCode className="h-4 w-4 text-sky-500" />
                <span>{t("Open Scanner")}</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="inline-flex items-center gap-2"
                onClick={() => {
                  if (activeTrip) {
                    setIssuedTicket(null);
                    setShowIssueTicket(true);
                  } else {
                    alert("Please verify and start an assigned bus service before issuing cash tickets.");
                  }
                }}
              >
                <Ticket className="h-4 w-4 text-emerald-500" />
                <span>{t("Issue Cash Ticket")}</span>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 4. STICKY BOTTOM DOCK (For Active Transit Operations)                       */}
      {/* ========================================================================= */}
      {activeTrip && (
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
              onClick={() => navigate(`/trip/${activeTrip.id}/scan`)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/50 active:scale-98 transition-transform"
            >
              <Camera className="h-4 w-4" />
              <span>Scan QR</span>
            </button>

            {activeAlertId && (
              <button
                type="button"
                onClick={() => setShowSosChat(true)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-950 border border-rose-500/50 text-rose-400 hover:text-rose-200 animate-pulse"
                title="Open SOS Dispatch Chat"
              >
                <ShieldAlert className="h-5 w-5" />
              </button>
            )}

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
              style={{
                backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.4) ${sos.progress * 100}%, transparent ${sos.progress * 100}%)`,
              }}
            >
              <AlertTriangle className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODALS & DIALOGS                                                       */}
      {/* ========================================================================= */}

      {/* Cash POS Dialog & Receipt */}
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
                <span className="font-bold text-white">
                  {issuedTicket.passenger_count} Passenger{issuedTicket.passenger_count > 1 ? "s" : ""}
                </span>
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
                label: `${idx + 1}. ${s.stop.name}${s.stop_id === activeTrip?.current_stop_id ? " (Current)" : ""}`,
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
        onClose={() => {
          setShowBusScanner(false);
          setVerifyingTrip(null);
        }}
        assignedBus={verifyingTrip?.buses ?? primaryScheduledTrip?.buses ?? null}
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
