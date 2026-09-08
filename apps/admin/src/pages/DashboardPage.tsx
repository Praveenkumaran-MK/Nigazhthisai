import { useEffect, useState } from "react";
import { StatCard, Card, FleetCommandHero } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useAdminAuth } from "../hooks/useAdminAuth";

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

export function DashboardPage() {
  const { profile } = useAdminAuth();
  const isMasterAdmin = profile?.role === "master_admin";
  const [counts, setCounts] = useState<DistrictCounts | SystemCounts | null>(null);

  useEffect(() => {
    if (isMasterAdmin) {
      // System-wide counts for master admin
      Promise.all([
        supabase.from("stops").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
        supabase.from("buses").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
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
      // District-level counts for district admin
      Promise.all([
        supabase.from("stops").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
        supabase.from("buses").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
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
  }, [isMasterAdmin]);

  const sys = counts as SystemCounts | null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {isMasterAdmin ? "State Transit Authority — System Overview" : "Overview"}
      </h1>

      {/* Fleet command hero — live counts beside the control-room scene. */}
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

      {/* Stat cards — extra row for master admin */}
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

      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isMasterAdmin
            ? "Use the sidebar to manage districts, admin users, system settings, routes, fleet, and respond to SOS alerts across all districts."
            : "Use the sidebar to manage stops, routes, fares, buses, conductors, schedules, monitor the live fleet, and respond to SOS alerts."}
        </p>
      </Card>
    </div>
  );
}
