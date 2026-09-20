import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Badge, EmptyState, LoadingState, ErrorState, RouteVisualization, AppHeader, WheelchairIcon } from "@sbt/ui";
import type { Stop } from "@sbt/shared-types";
import { getFare } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useEligibleBuses } from "../hooks/useEligibleBuses";

export function SearchResultsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const routeId = params.get("routeId") ?? "";
  const originStopId = params.get("originStopId") ?? "";
  const destStopId = params.get("destStopId") ?? "";

  const { buses, status, error, search, setEmpty } = useEligibleBuses();
  const [activeRouteId, setActiveRouteId] = useState(routeId);
  const [fare, setFare] = useState<number | null>(null);
  const [originStop, setOriginStop] = useState<Stop | null>(null);
  const [destStop, setDestStop] = useState<Stop | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function initSearch() {
      const candidateRouteIds = new Set<string>();
      if (routeId) candidateRouteIds.add(routeId);

      if (originStopId && destStopId) {
        // 1. Check route_day_stops (primary for custom and scheduled stops)
        try {
          const { data: rds } = await supabase
            .from("route_day_stops")
            .select("route_id, stop_id, sequence_order")
            .in("stop_id", [originStopId, destStopId]);

          if (rds && rds.length > 0) {
            const byRoute = new Map<string, { originSeq?: number; destSeq?: number }>();
            for (const row of rds) {
              const item = byRoute.get(row.route_id) || {};
              if (row.stop_id === originStopId) item.originSeq = row.sequence_order;
              if (row.stop_id === destStopId) item.destSeq = row.sequence_order;
              byRoute.set(row.route_id, item);
            }
            for (const [rId, { originSeq, destSeq }] of byRoute.entries()) {
              if (originSeq !== undefined && destSeq !== undefined && originSeq < destSeq) {
                candidateRouteIds.add(rId);
              } else if (originSeq !== undefined && destSeq !== undefined) {
                candidateRouteIds.add(rId);
              }
            }
          }
        } catch (err) {
          console.warn("[SearchResults] route_day_stops lookup notice:", err);
        }

        // 2. Check standard route_stops (fallback)
        try {
          const { data: rs } = await supabase
            .from("route_stops")
            .select("route_id, stop_id, sequence_order")
            .in("stop_id", [originStopId, destStopId]);

          if (rs && rs.length > 0) {
            const byRoute = new Map<string, { originSeq?: number; destSeq?: number }>();
            for (const row of rs) {
              const item = byRoute.get(row.route_id) || {};
              if (row.stop_id === originStopId) item.originSeq = row.sequence_order;
              if (row.stop_id === destStopId) item.destSeq = row.sequence_order;
              byRoute.set(row.route_id, item);
            }
            for (const [rId, { originSeq, destSeq }] of byRoute.entries()) {
              if (originSeq !== undefined && destSeq !== undefined && originSeq < destSeq) {
                candidateRouteIds.add(rId);
              } else if (originSeq !== undefined && destSeq !== undefined) {
                candidateRouteIds.add(rId);
              }
            }
          }
        } catch (err) {
          console.warn("[SearchResults] route_stops lookup notice:", err);
        }

        // 3. Check active trips trip_stops as live fallback
        if (candidateRouteIds.size === 0) {
          try {
            const { data: ts } = await supabase
              .from("trip_stops")
              .select("trip_id, stop_id, sequence_order, trips(id, route_id, status)")
              .in("stop_id", [originStopId, destStopId]);

            if (ts && ts.length > 0) {
              interface TripSeqItem { originSeq?: number; destSeq?: number; routeId?: string; }
              const byTrip = new Map<string, TripSeqItem>();
              for (const row of ts) {
                const tripInfo = row.trips as any;
                if (tripInfo?.status !== "ACTIVE") continue;
                const item: TripSeqItem = byTrip.get(row.trip_id) || { routeId: tripInfo.route_id };
                if (row.stop_id === originStopId) item.originSeq = row.sequence_order;
                if (row.stop_id === destStopId) item.destSeq = row.sequence_order;
                byTrip.set(row.trip_id, item);
              }
              for (const { originSeq, destSeq, routeId: rId } of byTrip.values()) {
                if (rId && originSeq !== undefined && destSeq !== undefined && originSeq < destSeq) {
                  candidateRouteIds.add(rId);
                }
              }
            }
          } catch (err) {
            console.warn("[SearchResults] trip_stops fallback notice:", err);
          }
        }
      }

      if (isCancelled) return;

      const foundRouteIds = Array.from(candidateRouteIds);
      const primaryRouteId = foundRouteIds[0] || routeId;
      setActiveRouteId(primaryRouteId);

      if (foundRouteIds.length > 0 && originStopId) {
        void search(foundRouteIds, originStopId);
      } else {
        // No connecting route found: Immediately complete search with empty results
        setEmpty();
      }

      if (primaryRouteId && originStopId && destStopId) {
        getFare(supabase, primaryRouteId, originStopId, destStopId)
          .then((f) => {
            if (!isCancelled) setFare(f > 0 ? f : 15);
          })
          .catch(() => {
            if (!isCancelled) setFare(15);
          });
      } else {
        setFare(15);
      }
    }

    void initSearch();

    if (originStopId && destStopId) {
      supabase
        .from("stops_public")
        .select("*")
        .in("id", [originStopId, destStopId])
        .then(({ data }) => {
          if (isCancelled) return;
          const rows = (data ?? []) as Stop[];
          setOriginStop(rows.find((s) => s.id === originStopId) ?? null);
          setDestStop(rows.find((s) => s.id === destStopId) ?? null);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [routeId, originStopId, destStopId, search, setEmpty]);

  return (
    <div className="mx-auto flex max-w-md flex-col pb-24">
      <AppHeader
        title="Select Bus"
        leading={
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            ←
          </button>
        }
      >
        {originStop && destStop && (
          <div className="glass-surface rounded-2xl p-4">
            <RouteVisualization
              originLabel={originStop.name}
              destinationLabel={destStop.name}
              centerLabel={fare !== null ? `₹${fare.toFixed(2)} per passenger` : undefined}
            />
          </div>
        )}
      </AppHeader>

      <div className="flex flex-col gap-3 px-5 pt-4">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-500">
          {status === "loading"
            ? "Looking for buses…"
            : status === "success"
              ? `${buses.length} bus${buses.length === 1 ? "" : "es"} available`
              : "Searching…"}
        </p>

        {status === "loading" && <LoadingState label="Looking for buses…" />}
        {status === "error" && (
          <ErrorState
            description={error ?? undefined}
            onRetry={() => search(activeRouteId || routeId, originStopId)}
          />
        )}
        {status === "success" && buses.length === 0 && (
          <EmptyState
            title="No buses available right now"
            description="Every bus on this route has already passed your stop, or none are currently in service. Try again shortly."
          />
        )}

        <div className="flex flex-col gap-3">
          {buses.map((bus) => {
            const capacity = bus.capacity || 50;
            const occupiedSeats = Math.max(0, capacity - bus.available_seats);
            const occupancyPct = Math.min(100, Math.round((occupiedSeats / capacity) * 100));

            // Dynamic meter gradient styling based on load
            const meterGradient =
              occupancyPct > 85
                ? "bg-gradient-to-r from-amber-500 to-rose-500"
                : occupancyPct > 55
                  ? "bg-gradient-to-r from-emerald-500 via-amber-500 to-amber-500"
                  : "bg-gradient-to-r from-emerald-500 to-emerald-400";

            return (
              <Card key={bus.trip_id} className="rounded-3xl p-5 shadow-md shadow-navy-900/5">
                {/* Top Row: Bus number + Type */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{bus.bus_number}</h3>
                      <Badge tone="success" className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5">
                        ● LIVE ACTIVE
                      </Badge>
                      {bus.is_wheelchair_accessible && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-xs" title="Handicap Accessible Seats & Facilities">
                          <WheelchairIcon size={14} className="text-blue-600 dark:text-blue-400" />
                          <span>Handicap Accessible</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Currently near: <span className="font-medium text-slate-700 dark:text-slate-300">{bus.current_stop_name ?? "En route"}</span>
                    </p>
                  </div>
                  <Badge tone={bus.bus_type === "AC" ? "brand" : "neutral"} className="uppercase font-semibold">
                    {bus.bus_type.replace("_", "-")}
                  </Badge>
                </div>

                {/* Route Strip Snippet */}
                {originStop && destStop && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-surface-dark dark:text-slate-300">
                    <span className="truncate font-medium">
                      {originStop.name} <span className="text-slate-400">→</span> {destStop.name}
                    </span>
                    <span className="shrink-0 inline-flex items-center gap-1 font-semibold text-brand-600 dark:text-brand-400">
                      {bus.is_wheelchair_accessible ? (
                        <>
                          <WheelchairIcon size={13} className="text-blue-600 dark:text-blue-400" />
                          <span>Accessible</span>
                        </>
                      ) : (
                        <span>Direct</span>
                      )}
                    </span>
                  </div>
                )}

                {/* BUS OCCUPANCY SECTION (Visual Progress Bar) */}
                <div className="mt-4 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold tracking-wider">
                    <span className="text-slate-400 uppercase">Bus Occupancy</span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {occupiedSeats}/{capacity} SEATS FILLED
                    </span>
                  </div>
                  {/* Meter Track */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${meterGradient}`}
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Row: Price & Actions */}
                <div className="mt-4 flex items-center justify-between border-t border-border-light pt-3 dark:border-border-dark">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price per seat</p>
                    <p className="text-xl font-extrabold text-slate-900 dark:text-white">
                      ₹{fare !== null && fare > 0 ? fare.toFixed(0) : "15"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl px-3 font-semibold text-slate-700 dark:text-slate-200"
                      onClick={() => navigate(`/bus/${bus.trip_id}?routeId=${activeRouteId || routeId}`)}
                    >
                      Track
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-xl px-4 font-semibold"
                      disabled={bus.available_seats <= 0}
                      onClick={() =>
                        navigate(
                          `/checkout?tripId=${bus.trip_id}&originStopId=${originStopId}&destStopId=${destStopId}&fare=${fare || 15}`,
                        )
                      }
                    >
                      {bus.available_seats > 0 ? "Book Now" : "Full"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
