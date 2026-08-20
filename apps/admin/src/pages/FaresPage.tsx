import { useEffect, useState } from "react";
import type { FareMatrixEntry, Route, Stop } from "@sbt/shared-types";
import { listRoutes, listStops } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { ResourceCrudPage } from "../components/crud/ResourceCrudPage";

export function FaresPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeStopIds, setRouteStopIds] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    listRoutes(supabase).then(setRoutes);
    listStops(supabase).then(setStops);
    supabase
      .from("route_stops")
      .select("route_id, stop_id")
      .then(({ data }) => {
        const map = new Map<string, Set<string>>();
        for (const row of (data ?? []) as Array<{ route_id: string; stop_id: string }>) {
          if (!map.has(row.route_id)) map.set(row.route_id, new Set());
          map.get(row.route_id)!.add(row.stop_id);
        }
        setRouteStopIds(map);
      });
  }, []);

  const routeLabel = (id: string) => routes.find((r) => r.id === id)?.route_number ?? id.slice(0, 8);
  const stopLabel = (id: string) => stops.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  // Only offer stops that are actually on the selected route, and exclude
  // whichever stop is already chosen on the "other side" of the pair — a
  // fare row for a stop not on the route can never match a real journey,
  // and origin==dest can never be a valid fare either (both were
  // previously silently accepted client-side, deferring to a generic DB
  // constraint error).
  const stopOptionsForRoute = (excludeFieldName: "origin_stop_id" | "dest_stop_id") => (values: Record<string, unknown>) => {
    const routeId = values.route_id as string | undefined;
    const allowed = routeId ? routeStopIds.get(routeId) : undefined;
    const excludeId = values[excludeFieldName] as string | undefined;
    return stops
      .filter((s) => (allowed ? allowed.has(s.id) : true))
      .filter((s) => s.id !== excludeId)
      .map((s) => ({ value: s.id, label: s.name }));
  };

  return (
    <ResourceCrudPage<FareMatrixEntry>
      title="Fares"
      description="Flat fare per origin/destination pair on a route."
      table="fare_matrix"
      columns={[
        { key: "route", header: "Route", render: (f) => routeLabel(f.route_id) },
        { key: "origin", header: "Origin", render: (f) => stopLabel(f.origin_stop_id) },
        { key: "dest", header: "Destination", render: (f) => stopLabel(f.dest_stop_id) },
        { key: "fare", header: "Fare", render: (f) => `₹${Number(f.flat_fare_amount).toFixed(2)}` },
      ]}
      fields={[
        { name: "route_id", label: "Route", type: "select", required: true, options: routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` })) },
        { name: "origin_stop_id", label: "Origin stop", type: "select", required: true, optionsForValues: stopOptionsForRoute("dest_stop_id") },
        { name: "dest_stop_id", label: "Destination stop", type: "select", required: true, optionsForValues: stopOptionsForRoute("origin_stop_id") },
        { name: "flat_fare_amount", label: "Fare amount (₹)", type: "number", step: "0.01", required: true },
      ]}
    />
  );
}
