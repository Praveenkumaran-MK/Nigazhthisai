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
          {buses.map((bus) => (
            <Card key={bus.trip_id} className="rounded-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">{bus.bus_number}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    Currently near: {bus.current_stop_name ?? "En route"}
                  </p>
                </div>
                <Badge tone={bus.bus_type === "AC" ? "brand" : "neutral"}>{bus.bus_type.replace("_", "-")}</Badge>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border-light pt-3 dark:border-border-dark">
                <div>
                  {fare !== null && <p className="text-lg font-bold text-brand-600 dark:text-brand-400">₹{fare.toFixed(2)}</p>}
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    {bus.available_seats > 0 ? `${bus.available_seats} seats available` : "Bus is full"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/bus/${bus.trip_id}?routeId=${routeId}`)}>
                    Track live
                  </Button>
                  <Button
                    size="sm"
                    disabled={fare === null || bus.available_seats <= 0}
                    onClick={() =>
                      navigate(
                        `/checkout?tripId=${bus.trip_id}&originStopId=${originStopId}&destStopId=${destStopId}&fare=${fare}`,
                      )
                    }
                  >
                    Buy ticket
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
