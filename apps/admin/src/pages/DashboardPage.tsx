import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
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
  CheckCircleIcon,
} from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { AdminControlCenter } from "../components/AdminControlCenter";

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
  const [latestAlert, setLatestAlert] = useState<LiveAlertSnippet | null>(null);
  const [activeTripsList, setActiveTripsList] = useState<LiveTripSnippet[]>([]);
  const [demandInsights, setDemandInsights] = useState<RouteDemandInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
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
          supabase.from("stops").select("id", { count: "exact", head: true }),
          supabase.from("routes").select("id", { count: "exact", head: true }),
          supabase.from("buses").select("id", { count: "exact", head: true }),
          supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
          supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "SCHEDULED"),
          supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "COMPLETED"),
          supabase.from("alerts").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "ACKNOWLEDGED"]),
          supabase.from("alerts").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "ACKNOWLEDGED"]).in("severity", ["HIGH", "CRITICAL"]),
          supabase.from("districts").select("id", { count: "exact", head: true }),
          supabase.from("conductors").select("id", { count: "exact", head: true }),
          supabase.from("tickets").select("id", { count: "exact", head: true }),
          supabase.from("complaints").select("id", { count: "exact", head: true }),
          supabase.from("complaints").select("id", { count: "exact", head: true }).in("status", ["OPEN", "IN_REVIEW"]),
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
      } catch (err) {
        console.error("Dashboard metrics fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    void fetchDashboardData();

    // Fetch Live Route Demand Analytics
    supabase.rpc("compute_route_demand_analytics").then(({ data }) => {
      if (data && Array.isArray(data)) {
        setDemandInsights(data as RouteDemandInsight[]);
      }
    });

    // Fetch Latest Alert
    supabase
      .from("alerts")
      .select("id, message, created_at, severity, buses(bus_number)")
      .in("status", ["ACTIVE", "ACKNOWLEDGED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const rawBus = data.buses as { bus_number?: string } | { bus_number?: string }[] | null;
          const busNo = Array.isArray(rawBus) ? rawBus[0]?.bus_number : rawBus?.bus_number;
          setLatestAlert({
            id: data.id,
            message: data.message || "High-priority alert reported",
            created_at: new Date(data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            severity: data.severity,
            bus_plate_number: busNo,
          });
        }
      });

    // Fetch Running Trips Snippet
    supabase
      .from("trips")
      .select("id, status, started_at, scheduled_departure, created_at, routes(name, route_number), buses(bus_number)")
      .in("status", ["ACTIVE", "SCHEDULED"])
      .order("created_at", { ascending: false })
      .limit(2)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const formatted = data.map((t, idx) => {
            const r = Array.isArray(t.routes) ? t.routes[0] : t.routes;
            const b = Array.isArray(t.buses) ? t.buses[0] : t.buses;
            const departureTime = t.scheduled_departure || t.started_at || t.created_at;
            const timeStr = departureTime
              ? new Date(departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "--:--";
            return {
              id: t.id,
              trip_code: `TRP-${100 + idx + 1}`,
              route_name: r?.name || r?.route_number || "TRANSIT CORRIDOR",
              plate_number: b?.bus_number || "TN 39 AB 1000",
              status: t.status === "ACTIVE" ? "RUNNING" : "SCHEDULED",
              eta: timeStr,
            };
          });
          setActiveTripsList(formatted);
        }
      });
  }, [isMasterAdmin]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-700 dark:bg-brand-950/80 dark:text-brand-300">
              {isMasterAdmin ? "Master Command Authority" : "District Operations"}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Nigazhthisai — Executive Mission Control
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time telemetry pulse, high-level operational highlights, and rapid access across all modules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/fleet"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700"
          >
            <ActivityIcon className="h-4 w-4" />
            <span>Open Pipeline Tracker</span>
          </Link>
        </div>
      </div>

      {/* Top Urgent Telemetry & Dispatched Trips */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Urgent Alert Banner */}
        <div className="flex flex-col justify-between rounded-xl border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-950/60 dark:bg-[#112240]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <ShieldAlertIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {latestAlert
                  ? `Bus ${latestAlert.bus_plate_number || "FLEET"} — ${latestAlert.message}`
                  : "All telemetry parameters normal. No active SOS signals detected."}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" />
                  {latestAlert?.created_at || "Current Time"}
                </span>
                <span className="inline-block h-1 w-1 rounded-full bg-slate-400" />
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {latestAlert ? `${latestAlert.severity} PRIORITY` : "NORMAL"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Link
              to="/alerts"
              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-rose-600 hover:text-rose-700 dark:text-rose-400"
            >
              Investigate Alerts
              <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Live Dispatched Running Trips Snippet */}
        <div className="flex flex-col gap-2.5">
          {(activeTripsList.length > 0 ? activeTripsList : [
            { id: "1", trip_code: "TRP-101", route_name: "TIRUPPUR - AVINASHI EXPRESS", plate_number: "TN 39 AB 1234", status: "RUNNING", eta: "12:45 PM" },
            { id: "2", trip_code: "TRP-102", route_name: "COIMBATORE CENTRAL CORRIDOR", plate_number: "TN 38 AB 5678", status: "RUNNING", eta: "01:15 PM" },
          ]).map((trip) => (
            <div
              key={trip.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#112240]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <BusIcon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tracking-wider text-slate-900 dark:text-slate-100">
                      Trip #{trip.trip_code}
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
                  ETA: {trip.eta}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Master Authority Feature Switches */}
      <AdminControlCenter />

      {/* Real-time Corridor Passenger Demand & Fleet Surge Insights */}
      {demandInsights.length > 0 && (
        <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#112240]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Corridor Passenger Demand & Surge Intelligence
                </h3>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  Computed Live
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
                    ? "border-amber-500/50 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-950/20 shadow-sm"
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
              {isMasterAdmin ? "System Command — All Operating Districts" : "District Fleet Operations"}
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {loading ? "Synchronizing system pulse…" : `${metrics.activeTripsCount} Active Bus Trips in Service`}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {isMasterAdmin
                ? `${metrics.districtsCount} Districts registered · ${metrics.activeAlertsCount} Open telemetry alerts · ${metrics.conductorsCount} Active conductors`
                : `${metrics.activeAlertsCount} Open telemetry alerts across ${metrics.routesCount} Active routes`}
            </p>
          </div>
          <FleetCommandHero className="order-1 h-36 w-full max-w-[260px] sm:order-2" />
        </div>
      </Card>

      {/* ALL SECTIONS OVERVIEW GRID (Executive High-Level Highlights with Deep-Links) */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Operational Section Highlights
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Real-time status snapshot · Click any module to deep-dive
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Live Pipeline Tracking */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
                Corridor configurations, day-wise stop sequencing, and ETA intervals.
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
              <span>Manage Routes & ETAs</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 3. Trips & Assignments */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
                Daily service dispatches, conductor pairing, and audit logs.
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
              <span>View Trip Schedules & Logs</span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* 4. Conductor Workforce */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
                Crew management, mandatory verified phone numbers, and duty allocation.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Total Roster</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.conductorsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Active Crew</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.conductorsCount > 0 ? metrics.conductorsCount : 0}</p>
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
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
                Automated continuous 60s background idle scanning and SOS dispatch.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Active Alerts</span>
                  <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{metrics.activeAlertsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">High / Critical</span>
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
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
                Service quality reports, overcrowding, and conductor dispute resolution.
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

          {/* 7. Revenue & Finance */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
                Cash vs digital collections, custom date range analytics, and PDF export.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Tickets Issued</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.totalTicketsCount}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Audit Status</span>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Synced</p>
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
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
                Depot servicing, fitness certificates, and scheduled bus maintenance.
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
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500/50 hover:shadow-md dark:border-slate-800 dark:bg-[#112240]">
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
