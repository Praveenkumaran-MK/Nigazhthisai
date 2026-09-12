import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, LoadingState, StatusIndicator, StatCard, Badge } from "@sbt/ui";
import { QrCode, Ticket, Play, Clock, Bus as BusIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useConductorAuth } from "../hooks/useConductorAuth";

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

export function DashboardPage() {
  const { conductor, logout } = useConductorAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<ConductorStats | null>(null);
  const [assignedTrips, setAssignedTrips] = useState<AssignedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const rpcStatsAvailable = useRef<boolean>(true);

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
            bus_number
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
              "[Dashboard] get_conductor_stats RPC returned error, switching to direct client query fallback:",
              statsErr.message
            );
            rpcStatsAvailable.current = false;
          }
        } catch (err) {
          console.warn("[Dashboard] get_conductor_stats invocation failed, using direct query fallback:", err);
          rpcStatsAvailable.current = false;
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

          let ticketsIssued = 0;
          let cashRevenue = 0;
          let digitalRevenue = 0;
          let passengersCarried = 0;

          if (allTripIds.length > 0) {
            const { data: tickets } = await supabase
              .from("tickets")
              .select("id, total_fare, channel, passenger_count, created_at, status")
              .in("trip_id", allTripIds)
              .in("status", ["PAID", "VALIDATED", "EXPIRED"]);

            if (tickets) {
              const todayTickets = tickets.filter((tk) => {
                const dateStr = (tk.created_at || "").slice(0, 10);
                return dateStr === todayStr;
              });

              ticketsIssued = todayTickets.length;
              for (const tk of todayTickets) {
                const fare = Number(tk.total_fare || 0);
                const isCash = tk.channel === "CASH" || tk.channel === "ETM";
                if (isCash) {
                  cashRevenue += fare;
                } else {
                  digitalRevenue += fare;
                }
                passengersCarried += tk.passenger_count || 1;
              }
            }
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

  // Real-time listener for newly assigned or updated trips
  useEffect(() => {
    if (!conductor?.id) return;
    const channel = supabase
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conductor?.id, loadData]);

  const handleRefresh = () => {
    rpcStatsAvailable.current = true;
    setRefreshing(true);
    void loadData();
  };

  // Derive active and scheduled trips
  const activeTrip = assignedTrips.find((t) => t.status === "ACTIVE") ?? (stats?.active_trip ? {
    id: stats.active_trip.id,
    status: "ACTIVE" as const,
    bus_id: stats.active_trip.bus_id,
    route_id: "",
    started_at: stats.active_trip.actual_departure,
    buses: { id: stats.active_trip.bus_id, bus_number: stats.active_trip.bus_number },
    routes: { id: "", route_number: stats.active_trip.route_code, name: `${stats.active_trip.origin} → ${stats.active_trip.destination}` },
  } : null);

  const scheduledTrips = assignedTrips.filter((t) => t.status === "SCHEDULED");
  const primaryScheduledTrip = !activeTrip && scheduledTrips.length > 0 ? scheduledTrips[0] : null;
  const otherScheduledTrips = !activeTrip && scheduledTrips.length > 1 ? scheduledTrips.slice(1) : (activeTrip ? scheduledTrips : []);

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
          {/* Active Trip Banner */}
          {activeTrip ? (
            <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 shadow-xl shadow-emerald-950/30">
              <div className="flex items-center justify-between">
                <Badge tone="success" className="font-extrabold uppercase tracking-wider">TRIP IN PROGRESS</Badge>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  Bus #{activeTrip.buses?.bus_number ?? "N/A"}
                </span>
              </div>
              <div className="mt-3">
                <h2 className="text-lg font-bold text-slate-100">
                  {activeTrip.routes?.route_number ? `Route ${activeTrip.routes.route_number}: ` : ""}
                  {activeTrip.routes?.name ?? "Live Transit Service"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Started {activeTrip.started_at ? new Date(activeTrip.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently"}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" size="lg" onClick={() => navigate(`/trip/${activeTrip.id}`)}>
                  Continue Live Trip →
                </Button>
                <Button variant="secondary" size="lg" onClick={() => navigate(`/trip/${activeTrip.id}/scan`)}>
                  Scan QR
                </Button>
              </div>
            </Card>
          ) : primaryScheduledTrip ? (
            /* Prominent Scheduled Trip Banner (Asking to Start with Bus QR verification) */
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
                      ? new Date(primaryScheduledTrip.scheduled_departure).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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
                  onClick={() => navigate(`/trip/${primaryScheduledTrip.id}`)}
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
                      onClick={() => navigate(`/trip/${st.id}`)}
                    >
                      View & Start
                    </Button>
                  </div>
                ))}
              </div>
            </div>
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
                className="inline-flex items-center gap-2"
                onClick={() => {
                  const targetTrip = activeTrip || primaryScheduledTrip;
                  if (targetTrip) {
                    navigate(`/trip/${targetTrip.id}/scan`);
                  } else {
                    alert("No active or scheduled trip to scan tickets for.");
                  }
                }}
              >
                <QrCode className="h-4 w-4 text-sky-500" />
                <span>Open Scanner</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="inline-flex items-center gap-2"
                onClick={() => {
                  const targetTrip = activeTrip || primaryScheduledTrip;
                  if (targetTrip) {
                    navigate(`/trip/${targetTrip.id}`);
                  } else {
                    alert("No active or scheduled trip to issue tickets for.");
                  }
                }}
              >
                <Ticket className="h-4 w-4 text-emerald-500" />
                <span>Issue Cash Ticket</span>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
