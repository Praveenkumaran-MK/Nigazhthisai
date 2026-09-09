import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, LoadingState, StatusIndicator, StatCard, Badge } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useConductorAuth } from "../hooks/useConductorAuth";

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

export function DashboardPage() {
  const { conductor, logout } = useConductorAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<ConductorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);

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

  const loadStats = useCallback(async () => {
    if (!conductor?.id) return;
    try {
      const { data, error } = await supabase.rpc("get_conductor_stats", {
        p_conductor_id: conductor.id,
        p_target_date: new Date().toISOString().split("T")[0],
      });
      if (error) throw error;
      setStats(data as ConductorStats);
    } catch (err) {
      console.error("Failed to load conductor stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conductor?.id]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadStats();
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 p-5 pt-8">
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
          {/* Active Trip Banner or Scheduled Trip */}
          {stats?.active_trip ? (
            <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center justify-between">
                <Badge tone="success">TRIP IN PROGRESS</Badge>
                <span className="text-xs font-mono text-emerald-400">
                  Bus #{stats.active_trip.bus_number ?? "N/A"}
                </span>
              </div>
              <div className="mt-3">
                <h2 className="text-lg font-bold text-slate-100">
                  {stats.active_trip.route_code}: {stats.active_trip.origin} → {stats.active_trip.destination}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Stop #{stats.active_trip.current_stop_index ?? 1} • Started {stats.active_trip.actual_departure ? new Date(stats.active_trip.actual_departure).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently"}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" size="lg" onClick={() => navigate(`/trip/${stats.active_trip!.id}`)}>
                  Continue Live Trip →
                </Button>
                <Button variant="secondary" size="lg" onClick={() => navigate(`/trip/${stats.active_trip!.id}/scan`)}>
                  Scan QR
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between">
                <Badge tone="neutral">SCHEDULE</Badge>
                <span className="text-xs text-slate-400">Today: {stats?.trips_count ?? 0} Trips Assigned</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">No trip is currently active right now.</p>
            </Card>
          )}

          {/* Today's Operational Key Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Tickets Issued"
              value={stats?.tickets_issued ?? 0}
            />
            <StatCard
              label="Total Shift Revenue"
              value={`₹${(stats?.total_revenue ?? 0).toFixed(2)}`}
            />
          </div>

          {/* Financial Breakdown Card */}
          <Card className="border-slate-800 bg-slate-900/80">
            <h3 className="text-sm font-semibold text-slate-200">Today's Revenue Breakdown</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
                  Cash / ETM Collections
                </span>
                <span className="font-mono font-semibold text-slate-100">
                  ₹{(stats?.cash_revenue ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-cyan-400"></span>
                  Digital / Online Tickets
                </span>
                <span className="font-mono font-semibold text-slate-100">
                  ₹{(stats?.digital_revenue ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-300 font-medium">Total Shift Collection</span>
                <span className="font-mono font-bold text-emerald-400 text-base">
                  ₹{(stats?.total_revenue ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  if (stats?.active_trip) {
                    navigate(`/trip/${stats.active_trip.id}/scan`);
                  } else {
                    alert("Please start or open a trip first to scan tickets.");
                  }
                }}
              >
                📷 Open Scanner
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  if (stats?.active_trip) {
                    navigate(`/trip/${stats.active_trip.id}`);
                  } else {
                    alert("No active trip to issue tickets for.");
                  }
                }}
              >
                🎟️ Issue Cash Ticket
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
