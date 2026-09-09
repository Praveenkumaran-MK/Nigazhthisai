import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Badge, EmptyState, LoadingState, ErrorState, RouteVisualization, AppHeader } from "@sbt/ui";
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

  const { buses, status, error, search } = useEligibleBuses();
  const [fare, setFare] = useState<number | null>(null);
  const [originStop, setOriginStop] = useState<Stop | null>(null);
  const [destStop, setDestStop] = useState<Stop | null>(null);

  useEffect(() => {
    if (routeId && originStopId) void search(routeId, originStopId);
    if (routeId && originStopId && destStopId) {
      getFare(supabase, routeId, originStopId, destStopId).then(setFare).catch(() => setFare(null));
    }
    if (originStopId && destStopId) {
      supabase
        .from("stops_public")
        .select("*")
        .in("id", [originStopId, destStopId])
        .then(({ data }) => {
          const rows = (data ?? []) as Stop[];
          setOriginStop(rows.find((s) => s.id === originStopId) ?? null);
          setDestStop(rows.find((s) => s.id === destStopId) ?? null);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, originStopId, destStopId]);

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
          {status === "success" ? `${buses.length} bus${buses.length === 1 ? "" : "es"} available` : "Searching…"}
        </p>

        {status === "loading" && <LoadingState label="Looking for buses…" />}
        {status === "error" && <ErrorState description={error ?? undefined} onRetry={() => search(routeId, originStopId)} />}
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
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{bus.bus_number}</h3>
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
                    <span className="shrink-0 font-semibold text-brand-600 dark:text-brand-400">
                      {bus.is_wheelchair_accessible ? "♿ Accessible" : "Direct"}
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
                      {fare !== null ? `₹${fare.toFixed(0)}` : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl px-3 font-semibold text-slate-700 dark:text-slate-200"
                      onClick={() => navigate(`/bus/${bus.trip_id}?routeId=${routeId}`)}
                    >
                      <span className="mr-1">🧭</span> Track
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-xl px-4 font-semibold"
                      disabled={fare === null || bus.available_seats <= 0}
                      onClick={() =>
                        navigate(
                          `/checkout?tripId=${bus.trip_id}&originStopId=${originStopId}&destStopId=${destStopId}&fare=${fare}`,
                        )
                      }
                    >
                      <span className="mr-1">🎟️</span> {bus.available_seats > 0 ? "Book Now" : "Full"}
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
