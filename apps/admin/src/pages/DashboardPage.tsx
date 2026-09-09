import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatCard, Card, FleetCommandHero } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { AdminControlCenter } from "../components/AdminControlCenter";

interface DistrictCounts {
  stops: number;
  routes: number;
  buses: number;
  activeTrips: number;
  activeAlerts: number;
}

interface SystemCounts extends DistrictCounts {
  districts: number;
  conductors: number;
  totalTickets: number;
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

export function DashboardPage() {
  const { profile } = useAdminAuth();
  const isMasterAdmin = profile?.role === "master_admin";
  const [counts, setCounts] = useState<DistrictCounts | SystemCounts | null>(null);
  const [latestAlert, setLatestAlert] = useState<LiveAlertSnippet | null>(null);
  const [activeTripsList, setActiveTripsList] = useState<LiveTripSnippet[]>([]);

  useEffect(() => {
    // 1. Fetch Summary Counts
    if (isMasterAdmin) {
      Promise.all([
        supabase.from("stops").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
        supabase.from("buses").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "SCHEDULED"]),
        supabase.from("alerts").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "ACKNOWLEDGED"]),
        supabase.from("districts").select("id", { count: "exact", head: true }),
        supabase.from("conductors").select("id", { count: "exact", head: true }),
        supabase.from("tickets").select("id", { count: "exact", head: true }),
      ]).then(([stops, routes, buses, activeTrips, activeAlerts, districts, conductors, tickets]) => {
        setCounts({
          stops: stops.count ?? 0,
          routes: routes.count ?? 0,
          buses: buses.count ?? 0,
          activeTrips: activeTrips.count ?? 0,
          activeAlerts: activeAlerts.count ?? 0,
          districts: districts.count ?? 0,
          conductors: conductors.count ?? 0,
          totalTickets: tickets.count ?? 0,
        } as SystemCounts);
      });
    } else {
      Promise.all([
        supabase.from("stops").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
        supabase.from("buses").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "SCHEDULED"]),
        supabase.from("alerts").select("id", { count: "exact", head: true }).in("status", ["ACTIVE", "ACKNOWLEDGED"]),
      ]).then(([stops, routes, buses, activeTrips, activeAlerts]) => {
        setCounts({
          stops: stops.count ?? 0,
          routes: routes.count ?? 0,
          buses: buses.count ?? 0,
          activeTrips: activeTrips.count ?? 0,
          activeAlerts: activeAlerts.count ?? 0,
        });
      });
    }

    // 2. Fetch Latest Alert
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
            message: data.message,
            created_at: new Date(data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            severity: data.severity,
            bus_plate_number: busNo,
          });
        }
      });

    // 3. Fetch Active & Scheduled Trips
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
              : "12:45 PM";
            return {
              id: t.id,
              trip_code: `TRP-${100 + idx + 1}`,
              route_name: r?.name || r?.route_number || "TIRUPPUR - AVINASHI",
              plate_number: b?.bus_number || "TN 39 AB 1234",
              status: t.status === "ACTIVE" ? "RUNNING" : "SCHEDULED",
              eta: timeStr,
            };
          });
          setActiveTripsList(formatted);
        }
      });
  }, [isMasterAdmin]);

  const sys = counts as SystemCounts | null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isMasterAdmin ? "State Transit Authority — System Overview" : "Overview"}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time telemetry, operational control, and district administrative access
          </p>
        </div>
      </div>

      {/* Top Telemetry & Notification Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Urgent Alert Banner / Idle Alert Card */}
        <div className="flex flex-col justify-between rounded-xl border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-950/60 dark:bg-[#112240]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {latestAlert
                  ? `Bus ${latestAlert.bus_plate_number || ""} — ${latestAlert.message}`
                  : "Bus TN 66 GH 3456 idle for 25m at unconventional location"}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>🕒 {latestAlert?.created_at || "09:30 PM"}</span>
                <span className="inline-block h-1 w-1 rounded-full bg-slate-400" />
                <span className="font-semibold text-rose-600 dark:text-rose-400">HIGH PRIORITY</span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Link
              to="/alerts"
              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-rose-600 hover:text-rose-700 dark:text-rose-400"
            >
              Investigate Alert ↗
            </Link>
          </div>
        </div>

        {/* Live Dispatched Running Trips */}
        <div className="flex flex-col gap-2.5">
          {(activeTripsList.length > 0 ? activeTripsList : [
            { id: "1", trip_code: "TRP-103", route_name: "TIRUPPUR - AVINASHI", plate_number: "TN 39 AB 1234", status: "RUNNING", eta: "12:45 PM" },
            { id: "2", trip_code: "TRP-104", route_name: "TIRUPPUR - AVINASHI", plate_number: "TN 38 AB 1234", status: "RUNNING", eta: "12:45 PM" },
          ]).map((trip) => (
            <div
              key={trip.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#112240]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <svg className="h-5 w-5 transform -rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
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

      {/* ADMIN CONTROL CENTER - Live Master Authority Feature Switches */}
      <AdminControlCenter />

      {/* Fleet command hero */}
      <Card className="overflow-hidden bg-navy-depth p-0 shadow-glow-navy">
        <div className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
          <div className="order-2 text-center sm:order-1 sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">
              {isMasterAdmin ? "System Command — All Districts" : "Fleet Command"}
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {counts
                ? `${counts.activeTrips} bus${counts.activeTrips === 1 ? "" : "es"} in service`
                : "Loading fleet…"}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {counts
                ? isMasterAdmin
                  ? `${(sys as SystemCounts).districts} districts · ${counts.activeAlerts} open alert${counts.activeAlerts === 1 ? "" : "s"}`
                  : `${counts.activeAlerts} open alert${counts.activeAlerts === 1 ? "" : "s"} across ${counts.routes} route${counts.routes === 1 ? "" : "s"}`
                : isMasterAdmin ? "Fetching system status…" : "Fetching district status"}
            </p>
          </div>
          <FleetCommandHero className="order-1 h-36 w-full max-w-[260px] sm:order-2" />
        </div>
      </Card>

      {/* Stat cards */}
      {isMasterAdmin && sys ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Districts" value={sys.districts ?? "…"} />
            <StatCard label="Buses" value={sys.buses ?? "…"} />
            <StatCard label="Conductors" value={sys.conductors ?? "…"} />
            <StatCard label="Trips in service" value={sys.activeTrips ?? "…"} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Routes" value={sys.routes ?? "…"} />
            <StatCard label="Stops" value={sys.stops ?? "…"} />
            <StatCard label="Total Tickets" value={sys.totalTickets ?? "…"} />
            <StatCard label="Open Alerts" value={sys.activeAlerts ?? "…"} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Stops" value={counts?.stops ?? "…"} />
          <StatCard label="Routes" value={counts?.routes ?? "…"} />
          <StatCard label="Buses" value={counts?.buses ?? "…"} />
          <StatCard label="Trips in service" value={counts?.activeTrips ?? "…"} />
          <StatCard label="Open alerts" value={counts?.activeAlerts ?? "…"} />
        </div>
      )}
    </div>
  );
}
