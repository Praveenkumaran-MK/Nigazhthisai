import { useEffect, useState } from "react";
import { Select, Button, Card, EmptyState, LoadingState, useToast } from "@sbt/ui";
import type { Route, RouteWithStops } from "@sbt/shared-types";
import { listRoutes, getRouteWithStops, addRouteStop, removeRouteStop, reorderRouteStop } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

interface StopOption {
  id: string;
  name: string;
}

export function RouteStopsPage() {
  const { push } = useToast();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState("");
  const [detail, setDetail] = useState<RouteWithStops | null>(null);
  const [allStops, setAllStops] = useState<StopOption[]>([]);
  const [stopToAdd, setStopToAdd] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    listRoutes(supabase).then(setRoutes);
    supabase.from("stops_public").select("id, name").order("name").then(({ data }) => setAllStops((data ?? []) as StopOption[]));
  }, []);

  const reload = async () => {
    if (!routeId) return;
    setIsLoading(true);
    setDetail(await getRouteWithStops(supabase, routeId));
    setIsLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // All three mutations go through atomic RPCs (migration 012) rather than
  // direct .from("route_stops") writes — the sequence_order swap/append/
  // resequence logic isn't safe to do as separate client-side statements
  // (see migration 012's header comment for why the old version always
  // collided with the unique(route_id, sequence_order) constraint).
  const handleAdd = async () => {
    if (!routeId || !stopToAdd) return;
    try {
      await addRouteStop(supabase, routeId, stopToAdd);
      setStopToAdd("");
      await reload();
    } catch (e) {
      push({ tone: "danger", title: "Could not add stop", description: e instanceof Error ? e.message : undefined });
    }
  };

  const handleRemove = async (stopId: string) => {
    try {
      await removeRouteStop(supabase, routeId, stopId);
      await reload();
    } catch (e) {
      push({ tone: "danger", title: "Could not remove stop", description: e instanceof Error ? e.message : undefined });
    }
  };

  const handleMove = async (stopId: string, direction: -1 | 1) => {
    try {
      await reorderRouteStop(supabase, routeId, stopId, direction);
      await reload();
    } catch (e) {
      push({ tone: "danger", title: "Could not reorder stop", description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Route Stops</h1>
        <p className="text-sm text-slate-500 dark:text-slate-500">Ordering here is authoritative for fare lookup and eligible-bus filtering.</p>
      </div>

      <Card>
        <Select
          label="Route"
          placeholder="Select a route"
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          options={routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` }))}
        />
      </Card>

      {isLoading && <LoadingState />}

      {!isLoading && routeId && detail && detail.stops.length === 0 && (
        <EmptyState title="No stops on this route yet" description="Add stops below in the order buses will visit them." />
      )}

      {!isLoading && detail && detail.stops.length > 0 && (
        <Card>
          <ol className="flex flex-col gap-2">
            {detail.stops.map((stop, index) => (
              <li key={stop.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-[#0a0a0a]">
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {index + 1}. {stop.name}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => handleMove(stop.id, -1)}>
                    ↑
                  </Button>
                  <Button size="sm" variant="ghost" disabled={index === detail.stops.length - 1} onClick={() => handleMove(stop.id, 1)}>
                    ↓
                  </Button>
                  <Button size="sm" variant="ghost" className="text-danger-600" onClick={() => handleRemove(stop.id)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {routeId && (
        <Card>
          <div className="flex gap-2">
            <Select
              label="Add stop"
              placeholder="Select a stop"
              value={stopToAdd}
              onChange={(e) => setStopToAdd(e.target.value)}
              options={allStops
                .filter((s) => !detail?.stops.some((ds) => ds.id === s.id))
                .map((s) => ({ value: s.id, label: s.name }))}
              className="flex-1"
            />
            <Button className="mt-6" disabled={!stopToAdd} onClick={handleAdd}>
              Add
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
