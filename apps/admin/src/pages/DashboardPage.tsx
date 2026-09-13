import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  StatCard,
  Button,
  FleetCommandHero,
  BusIcon,
  RouteIcon,
  ClockIcon,
  MapPinIcon,
  AlertTriangleIcon,
  UsersIcon,
  DollarSignIcon,
  FileTextIcon,
  ShieldAlertIcon,
  ActivityIcon,
  ArrowRightIcon,
} from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { computeRouteDemandAnalytics } from "@sbt/supabase-client";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { AdminControlCenter } from "../components/AdminControlCenter";
import { Ticket, Navigation, Users, DollarSign, RefreshCw, Calendar } from "lucide-react";
import type { District } from "@sbt/shared-types";

interface ModuleHighlights {
  stopsCount: number;
  routesCount: number;
  busesCount: number;
  activeTripsCount: number;
  scheduledTripsCount: number;
  completedTripsCount: number;
  activeAlertsCount: number;
  highSeverityAlertsCount: number;
  districtsCount: number;
  conductorsCount: number;
  totalTicketsCount: number;
  totalComplaintsCount: number;
  pendingComplaintsCount: number;
  maintenanceLogsCount: number;
}

interface LiveAlertSnippet {
  id: string;
  message: string;
  created_at: string;
  severity: string;
  bus_plate_number?: string;
}

interface LiveTripSnippet {
  id: string;
  trip_code: string;
  route_name: string;
  plate_number: string;
  status: string;
  eta: string;
}

interface RouteDemandInsight {
  route_id: string;
  route_number: string;
  route_name: string;
  total_passengers: number;
  total_trips: number;
  busiest_origin_stop: string;
  busiest_origin_count: number;
  busiest_dest_stop: string;
  busiest_dest_count: number;
  avg_trip_utilization_pct: number;
  surge_detected: boolean;
  suggested_additional_buses: number;
}

export function DashboardPage() {
  const { profile } = useAdminAuth();
  const isMasterAdmin = profile?.role === "master_admin";

  // Location & Timeframe filter states (100% DB-driven)
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("ALL");
  const [timeframe, setTimeframe] = useState<"TODAY" | "WEEK" | "MONTH" | "ALL">("TODAY");

  // Core aggregated counts
  const [metrics, setMetrics] = useState<ModuleHighlights>({
    stopsCount: 0,
    routesCount: 0,
    busesCount: 0,
    activeTripsCount: 0,
    scheduledTripsCount: 0,
    completedTripsCount: 0,
    activeAlertsCount: 0,
    highSeverityAlertsCount: 0,
    districtsCount: 0,
    conductorsCount: 0,
    totalTicketsCount: 0,
    totalComplaintsCount: 0,
    pendingComplaintsCount: 0,
    maintenanceLogsCount: 0,
  });

  // Dynamic financial & passenger metrics (calculated from Supabase tickets table)
  const [periodRevenue, setPeriodRevenue] = useState<number>(0);
  const [periodTicketsCount, setPeriodTicketsCount] = useState<number>(0);
  const [periodPassengersCount, setPeriodPassengersCount] = useState<number>(0);
  const [revenueTrend, setRevenueTrend] = useState<{ direction: "up" | "down" | "flat"; label: string }>({
    direction: "flat",
    label: "Live Database",
  });
  const [ticketTrend, setTicketTrend] = useState<{ direction: "up" | "down" | "flat"; label: string }>({
    direction: "flat",
    label: "Live Database",
  });

  const [latestAlert, setLatestAlert] = useState<LiveAlertSnippet | null>(null);
  const [activeTripsList, setActiveTripsList] = useState<LiveTripSnippet[]>([]);
  const [demandInsights, setDemandInsights] = useState<RouteDemandInsight[]>([]);
  const [loading, setLoading] = useState(true);

  // Load districts dynamically from Supabase
  useEffect(() => {
    supabase
      .from("districts")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data) {
          setDistricts(data as District[]);
        }
      });
  }, []);

  // Lock or pre-select district for regional admins
  useEffect(() => {
    if (!isMasterAdmin && profile?.district_id) {
      setSelectedDistrict(profile.district_id);
    }
  }, [isMasterAdmin, profile?.district_id]);

  // Main fetch function - 100% softcoded, zero hardcoded numbers
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const isDistrictFiltered = selectedDistrict !== "ALL";

      // 1. Time boundaries for revenue and tickets
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let startIso: string | null = null;
      let prevStartIso: string | null = null;
      let prevEndIso: string | null = null;

      if (timeframe === "TODAY") {
        startIso = todayMidnight.toISOString();
        const yesterdayMidnight = new Date(todayMidnight.getTime() - 24 * 60 * 60 * 1000);
        prevStartIso = yesterdayMidnight.toISOString();
        prevEndIso = todayMidnight.toISOString();
      } else if (timeframe === "WEEK") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startIso = weekAgo.toISOString();
        prevStartIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        prevEndIso = weekAgo.toISOString();
      } else if (timeframe === "MONTH") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startIso = monthAgo.toISOString();
        prevStartIso = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
        prevEndIso = monthAgo.toISOString();
      }

      // 2. Query Tickets for dynamic revenue and passenger volume
      let ticketsQuery = supabase.from("tickets").select("total_fare, passenger_count, created_at");
      if (startIso) {
        ticketsQuery = ticketsQuery.gte("created_at", startIso);
      }
      if (isDistrictFiltered) {
        ticketsQuery = ticketsQuery.eq("district_id", selectedDistrict);
      }

      const { data: ticketsData } = await ticketsQuery;
      const currentRev = (ticketsData ?? []).reduce((sum, t) => sum + (Number(t.total_fare) || 0), 0);
      const currentPax = (ticketsData ?? []).reduce((sum, t) => sum + (Number(t.passenger_count) || 1), 0);
      const currentTicketsCount = ticketsData?.length ?? 0;

      setPeriodRevenue(currentRev);
      setPeriodTicketsCount(currentTicketsCount);
      setPeriodPassengersCount(currentPax);

      // Trend Comparison Query against prior timeframe
      if (prevStartIso && prevEndIso) {
        let prevTicketsQuery = supabase
          .from("tickets")
          .select("total_fare, created_at")
          .gte("created_at", prevStartIso)
          .lt("created_at", prevEndIso);

        if (isDistrictFiltered) {
          prevTicketsQuery = prevTicketsQuery.eq("district_id", selectedDistrict);
        }

        const { data: prevData } = await prevTicketsQuery;
        const prevRev = (prevData ?? []).reduce((sum, t) => sum + (Number(t.total_fare) || 0), 0);
        const prevCount = prevData?.length ?? 0;

        if (prevRev > 0) {
          const diffRev = ((currentRev - prevRev) / prevRev) * 100;
          setRevenueTrend({
            direction: diffRev >= 0 ? "up" : "down",
            label: `${diffRev >= 0 ? "+" : ""}${diffRev.toFixed(1)}% vs prior ${timeframe.toLowerCase()}`,
          });
        } else if (currentRev > 0) {
          setRevenueTrend({ direction: "up", label: "New transactions recorded" });
        } else {
          setRevenueTrend({ direction: "flat", label: "0 in previous cycle" });
        }

        if (prevCount > 0) {
          const diffCount = ((currentTicketsCount - prevCount) / prevCount) * 100;
          setTicketTrend({
            direction: diffCount >= 0 ? "up" : "down",
            label: `${diffCount >= 0 ? "+" : ""}${diffCount.toFixed(1)}% vs prior ${timeframe.toLowerCase()}`,
          });
        } else if (currentTicketsCount > 0) {
          setTicketTrend({ direction: "up", label: "Active tickets issued" });
        } else {
          setTicketTrend({ direction: "flat", label: "0 in previous cycle" });
        }
      } else {
        setRevenueTrend({ direction: "flat", label: "All-Time Synced" });
        setTicketTrend({ direction: "flat", label: "All-Time Synced" });
      }

      // 3. Exact Database Record Counts
      let stopsQ = supabase.from("stops").select("id", { count: "exact", head: true });
      let routesQ = supabase.from("routes").select("id", { count: "exact", head: true });
      let busesQ = supabase.from("buses").select("id", { count: "exact", head: true });
      let conductorsQ = supabase.from("conductors").select("id", { count: "exact", head: true });
      let allTicketsQ = supabase.from("tickets").select("id", { count: "exact", head: true });
      let complaintsQ = supabase.from("complaints").select("id", { count: "exact", head: true });
      let pendingComplaintsQ = supabase.from("complaints").select("id", { count: "exact", head: true }).in("status", ["OPEN", "IN_REVIEW"]);

      if (isDistrictFiltered) {
        stopsQ = stopsQ.eq("district_id", selectedDistrict);
        routesQ = routesQ.eq("district_id", selectedDistrict);
        busesQ = busesQ.eq("district_id", selectedDistrict);
        conductorsQ = conductorsQ.eq("district_id", selectedDistrict);
        allTicketsQ = allTicketsQ.eq("district_id", selectedDistrict);
        complaintsQ = complaintsQ.eq("district_id", selectedDistrict);
        pendingComplaintsQ = pendingComplaintsQ.eq("district_id", selectedDistrict);
      }

      const [
        stopsRes,
        routesRes,
        busesRes,
        activeTripsRes,
        scheduledTripsRes,
        completedTripsRes,
        activeAlertsRes,
        highAlertsRes,
        districtsRes,
        conductorsRes,
        ticketsRes,
        complaintsRes,
        pendingComplaintsRes,
        maintenanceRes,
      ] = await Promise.all([
        stopsQ,
        routesQ,
        busesQ,
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "SCHEDULED"),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "COMPLETED"),
        supabase.from("alerts").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "ACKNOWLEDGED"]),
        supabase.from("alerts").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "ACKNOWLEDGED"]).in("severity", ["CRITICAL", "SOS"]),
        supabase.from("districts").select("id", { count: "exact", head: true }),
        conductorsQ,
        allTicketsQ,
        complaintsQ,
        pendingComplaintsQ,
        supabase.from("bus_maintenance_logs").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
      ]);

      setMetrics({
        stopsCount: stopsRes.count ?? 0,
        routesCount: routesRes.count ?? 0,
        busesCount: busesRes.count ?? 0,
        activeTripsCount: activeTripsRes.count ?? 0,
        scheduledTripsCount: scheduledTripsRes.count ?? 0,
        completedTripsCount: completedTripsRes.count ?? 0,
        activeAlertsCount: activeAlertsRes.count ?? 0,
        highSeverityAlertsCount: highAlertsRes.count ?? 0,
        districtsCount: districtsRes.count ?? 0,
        conductorsCount: conductorsRes.count ?? 0,
        totalTicketsCount: ticketsRes.count ?? 0,
        totalComplaintsCount: complaintsRes.count ?? 0,
        pendingComplaintsCount: pendingComplaintsRes.count ?? 0,
        maintenanceLogsCount: maintenanceRes.count ?? 0,
      });

      // 4. Fetch Real Running Trips from DB (No mock fallback)
      let tripsQuery = supabase
        .from("trips")
        .select(`
          id,
          status,
          started_at,
          scheduled_departure,
          created_at,
          routes ( name, route_number ),
          buses ( bus_number, district_id )
        `)
        .in("status", ["ACTIVE", "SCHEDULED"])
        .order("created_at", { ascending: false })
        .limit(3);

      if (isDistrictFiltered) {
        tripsQuery = tripsQuery.eq("buses.district_id", selectedDistrict);
      }

      const { data: tripsData } = await tripsQuery;
      if (tripsData && tripsData.length > 0) {
        const formatted = tripsData.map((t) => {
          const r = Array.isArray(t.routes) ? t.routes[0] : t.routes;
          const b = Array.isArray(t.buses) ? t.buses[0] : t.buses;
          const departureTime = t.scheduled_departure || t.started_at || t.created_at;
          const timeStr = departureTime
            ? new Date(departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "--:--";
          return {
            id: t.id,
            trip_code: `TRP-${t.id.slice(0, 6).toUpperCase()}`,
            route_name: r?.name || (r?.route_number ? `Route ${r.route_number}` : "Transit Corridor"),
            plate_number: b?.bus_number || "Unassigned Bus",
            status: t.status === "ACTIVE" ? "RUNNING" : "SCHEDULED",
            eta: timeStr,
          };
        });
        setActiveTripsList(formatted);
      } else {
        setActiveTripsList([]);
      }

      // 5. Fetch Latest Alert from DB
      const { data: alertData } = await supabase
        .from("alerts")
        .select("id, message, created_at, severity, buses(bus_number, district_id)")
        .in("status", ["ACTIVE", "ACKNOWLEDGED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (alertData) {
        const rawBus = alertData.buses as { bus_number?: string } | { bus_number?: string }[] | null;
        const busNo = Array.isArray(rawBus) ? rawBus[0]?.bus_number : rawBus?.bus_number;
        setLatestAlert({
          id: alertData.id,
          message: alertData.message || "High-priority alert reported",
          created_at: new Date(alertData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          severity: alertData.severity,
          bus_plate_number: busNo,
        });
      } else {
        setLatestAlert(null);
      }

      // 6. Fetch Live Route Demand Analytics
      try {
        const insights = await computeRouteDemandAnalytics(supabase);
        if (insights && Array.isArray(insights)) {
          setDemandInsights(insights as RouteDemandInsight[]);
        }
      } catch (err) {
        // Handled silently if analytics RPC is unpopulated
      }
    } catch (err) {
      console.error("Dashboard metrics fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDistrict, timeframe, isMasterAdmin]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const activeDistrictObj = useMemo(() => {
    return districts.find((d) => d.id === selectedDistrict);
  }, [districts, selectedDistrict]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-50 border border-[#D97F00]/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#D97F00] dark:bg-brand-950/80 dark:text-brand-300">
              {isMasterAdmin ? "Master Command Authority" : `${activeDistrictObj?.name ?? "District"} Operations`}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0D2A5D] dark:text-white">
            Nigazhthisai — Executive Mission Control
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time telemetry pulse, database-verified operational highlights, and rapid access across transit systems
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchDashboardData} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Telemetry</span>
          </Button>
          <Link
            to="/fleet"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0D2A5D] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#0D2A5D]/20 transition hover:bg-[#0A2149]"
          >
            <ActivityIcon className="h-4 w-4" />
            <span>Open Pipeline Tracker</span>
          </Link>
        </div>
      </div>

      {/* Location & Timeframe Filters (100% connected to DB) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-dark">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#D97F00]">
            DYNAMIC DATABASE SCOPE
          </p>
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0D2A5D] dark:text-white">
            FILTER DASHBOARD DATA BY REGION & TIMEFRAME
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* District Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DISTRICT</span>
            <select
              aria-label="Filter by district"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              disabled={!isMasterAdmin && !!profile?.district_id}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-[#D97F00] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {isMasterAdmin && <option value="ALL">ALL DISTRICTS ({districts.length})</option>}
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name.toUpperCase()} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TIMEFRAME</span>
            <select
              aria-label="Filter by timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-[#D97F00] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODAY">TODAY (LIVE PULSE)</option>
              <option value="WEEK">PAST 7 DAYS</option>
              <option value="MONTH">PAST 30 DAYS</option>
              <option value="ALL">ALL-TIME AGGREGATE</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4 Operations KPI Cards (Softcoded and calculated directly from Supabase tables) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={timeframe === "TODAY" ? "Today's Revenue" : `${timeframe} Revenue`}
          value={`₹${periodRevenue.toLocaleString("en-IN")}`}
          icon={<DollarSign className="h-5 w-5" />}
          trend={revenueTrend}
        />
        <StatCard
          label={timeframe === "TODAY" ? "Tickets Issued Today" : `${timeframe} Tickets`}
          value={periodTicketsCount.toLocaleString("en-IN")}
          icon={<Ticket className="h-5 w-5" />}
          trend={ticketTrend}
        />
        <StatCard
          label="Active Trips in Transit"
          value={metrics.activeTripsCount.toLocaleString("en-IN")}
          icon={<Navigation className="h-5 w-5" />}
          trend={{
            direction: metrics.activeTripsCount > 0 ? "up" : "flat",
            label: metrics.activeTripsCount > 0 ? `${metrics.activeTripsCount} on road` : "No active trips",
          }}
        />
        <StatCard
          label="Passenger Journeys"
          value={periodPassengersCount.toLocaleString("en-IN")}
          icon={<Users className="h-5 w-5" />}
          trend={{
            direction: periodPassengersCount > 0 ? "up" : "flat",
            label: `${periodPassengersCount} riders recorded`,
          }}
        />
      </div>

      {/* Top Urgent Telemetry & Dispatched Trips */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Urgent Alert Banner */}
        <div className="flex flex-col justify-between rounded-xl border border-rose-200 bg-white p-5 shadow-xs dark:border-rose-950/60 dark:bg-[#112240]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <ShieldAlertIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {latestAlert
                  ? `Bus ${latestAlert.bus_plate_number || "Fleet"} — ${latestAlert.message}`
                  : "All telemetry parameters normal. No active SOS signals detected in this district."}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" />
                  {latestAlert?.created_at || "Live System Health"}
                </span>
                <span className="inline-block h-1 w-1 rounded-full bg-slate-400" />
                <span className={`font-semibold ${latestAlert ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {latestAlert ? `${latestAlert.severity} PRIORITY` : "ALL SYSTEMS GREEN"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Link
              to="/alerts"
              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-rose-600 hover:text-rose-700 dark:text-rose-400"
            >
              Investigate Alerts Console ({metrics.activeAlertsCount})
              <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Live Dispatched Running Trips Snippet (100% DB-driven, zero fake mocks) */}
        <div className="flex flex-col gap-2.5">
          {activeTripsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-[#112240] h-full">
              <BusIcon className="h-7 w-7 text-slate-400 mb-1.5 opacity-60" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                No Active Trips Dispatched
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs">
                When conductors initiate service from their app, live vehicle telemetry and route milestones will appear here.
              </p>
              <Link
                to="/trips"
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                <span>Dispatch Scheduled Trip</span>
                <ArrowRightIcon className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            activeTripsList.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#112240]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    <BusIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black tracking-wider text-slate-900 dark:text-slate-100">
                        {trip.trip_code}
                      </span>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
                        {trip.status}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {trip.route_name} • {trip.plate_number}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Departure / ETA: {trip.eta}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Master Authority Feature Switches */}
      <AdminControlCenter />

      {/* Real-time Corridor Passenger Demand & Fleet Surge Insights */}
      {demandInsights.length > 0 && (
        <Card className="border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#112240]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Corridor Passenger Demand & Surge Intelligence
                </h3>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  Computed Live from Bookings
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Automated demand aggregation from passenger bookings. Highlights peak stop density and suggests fleet adjustments.
              </p>
            </div>
            <Link
              to="/schedules"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              <span>Manage Schedules & Fleet Allocation</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {demandInsights.slice(0, 6).map((item) => (
              <div
                key={item.route_id}
                className={`rounded-xl border p-4 transition-all ${
                  item.surge_detected
                    ? "border-amber-500/50 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-950/20 shadow-xs"
                    : "border-slate-100 bg-slate-50/60 dark:border-slate-800/80 dark:bg-slate-900/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                      Route {item.route_number}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                      {item.route_name}
                    </h4>
                  </div>
                  {item.surge_detected ? (
                    <span className="rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 animate-pulse">
                      <span>⚡ Surge (+{item.suggested_additional_buses} Bus)</span>
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold">
                      Normal Demand
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Total Booked Pax:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{item.total_passengers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Busiest Boarding:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[140px]" title={item.busiest_origin_stop}>
                      {item.busiest_origin_stop} ({item.busiest_origin_count})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Busiest Alighting:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[140px]" title={item.busiest_dest_stop}>
                      {item.busiest_dest_stop} ({item.busiest_dest_count})
                    </span>
                  </div>
                </div>

                {/* Utilization Progress Bar */}
                <div className="mt-3.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
                    <span className="text-slate-400">Capacity Load</span>
                    <span className={item.avg_trip_utilization_pct >= 85 ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"}>
                      {item.avg_trip_utilization_pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.avg_trip_utilization_pct >= 85
                          ? "bg-amber-500"
                          : item.avg_trip_utilization_pct >= 60
                          ? "bg-brand-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, item.avg_trip_utilization_pct)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Executive Command Hero */}
      <Card className="overflow-hidden bg-navy-depth p-0 shadow-glow-navy">
        <div className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
          <div className="order-2 text-center sm:order-1 sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">
              {isMasterAdmin ? "System Command — All Operating Districts" : `${activeDistrictObj?.name ?? "District"} Fleet Operations`}
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {loading ? "Synchronizing database telemetry…" : `${metrics.activeTripsCount} Active Bus Trips in Service`}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {isMasterAdmin
                ? `${metrics.districtsCount} Districts registered · ${metrics.activeAlertsCount} Open telemetry alerts · ${metrics.conductorsCount} Registered conductors`
                : `${metrics.activeAlertsCount} Open telemetry alerts across ${metrics.routesCount} routes in ${activeDistrictObj?.name ?? "District"}`}
            </p>
          </div>
          <FleetCommandHero className="order-1 h-36 w-full max-w-[260px] sm:order-2" />
        </div>
      </Card>

      {/* ALL SECTIONS OVERVIEW GRID (Executive Highlights with Deep-Links) */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Operational Section Highlights
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Database-synchronized status snapshot · Click any module to deep-dive
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Live Pipeline Tracking */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <ActivityIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Live Telemetry
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Live Pipeline Tracking
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Sequential stop-by-stop live progression with ETA delay detection.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Active Pipeline</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.activeTripsCount} Buses</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Scheduled Next</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.scheduledTripsCount} Trips</p>
                </div>
              </div>
            </div>
            <Link
              to="/fleet"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              <span>Inspect Live Pipeline</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 2. Routes & Stops */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <RouteIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Transit Corridors
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Routes & Schedules
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Corridor configurations, day-wise stop sequencing, and timetable matrices.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Active Routes</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.routesCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Transit Stops</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.stopsCount}</p>
                </div>
              </div>
            </div>
            <Link
              to="/routes"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              <span>Manage Routes & Timetables</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 3. Trips & Dispatches */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
                  <BusIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  Daily Dispatches
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Trips & Dispatches
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Daily service dispatches, crew pairings, and operational history.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">In-Service Now</span>
                  <p className="text-lg font-bold text-teal-600 dark:text-teal-400">{metrics.activeTripsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Completed Today</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.completedTripsCount}</p>
                </div>
              </div>
            </div>
            <Link
              to="/trips"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              <span>View Trip Logs</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 4. Conductor Workforce */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                  <UsersIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Crew Operations
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Conductor Workforce
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Crew management, mandatory verified phone numbers, and duty assignment.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Total Roster</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.conductorsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Registered Crew</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.conductorsCount}</p>
                </div>
              </div>
            </div>
            <Link
              to="/conductors"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              <span>Manage Conductors</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 5. Emergency & Idle Alerts */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                  <AlertTriangleIcon className="h-5 w-5" />
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  metrics.activeAlertsCount > 0
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                }`}>
                  {metrics.activeAlertsCount > 0 ? "Attention Needed" : "All Clear"}
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Alerts & Idle Scanner
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Automated continuous idle bus detection and high-priority SOS dispatch.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Active Alerts</span>
                  <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{metrics.activeAlertsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Critical / SOS</span>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{metrics.highSeverityAlertsCount}</p>
                </div>
              </div>
            </div>
            <Link
              to="/alerts"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400"
            >
              <span>Review Alert Console</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 6. Passenger Grievances */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  Passenger Feedback
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Grievances & Complaints
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Service quality reports, overcrowding, and crew conduct audits.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Pending Review</span>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{metrics.pendingComplaintsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Total Logged</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.totalComplaintsCount}</p>
                </div>
              </div>
            </div>
            <Link
              to="/complaints"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              <span>Investigate Grievances</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 7. Revenue & Collections */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <DollarSignIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Financial Audits
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Revenue & Collections
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Cash vs digital collections, custom date range analytics, and audit PDF export.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Tickets Issued</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.totalTicketsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Audit Status</span>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">DB Synced</p>
                </div>
              </div>
            </div>
            <Link
              to="/revenue"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              <span>Revenue Reports & PDF</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 8. Fleet Maintenance */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                  <BusIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Fleet Health
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Fleet Maintenance
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Depot repairs, fitness certificates, and scheduled bus maintenance logs.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Total Fleet</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.busesCount} Buses</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Open Logs</span>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{metrics.maintenanceLogsCount}</p>
                </div>
              </div>
            </div>
            <Link
              to="/maintenance"
              className="mt-4 inline-flex items-center justify-between text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              <span>Fleet Maintenance Console</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 9. Regional Districts (Master Admin) */}
          {isMasterAdmin && (
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400">
                    <MapPinIcon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                    Authority
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                  Regional Districts
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  State jurisdictional boundaries, dynamic district creation, and administrator allocation.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Districts</span>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.districtsCount}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-slate-400">Status</span>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Operational</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <Link
                  to="/districts"
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  <span>Districts</span>
                  <ArrowRightIcon className="h-3 w-3" />
                </Link>
                <Link
                  to="/admin-users"
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  <span>Admins</span>
                  <ArrowRightIcon className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
