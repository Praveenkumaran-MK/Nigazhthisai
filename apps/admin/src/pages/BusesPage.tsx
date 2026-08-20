import { useEffect, useState } from "react";
import type { Bus, Route } from "@sbt/shared-types";
import { listRoutes } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { ResourceCrudPage } from "../components/crud/ResourceCrudPage";

export function BusesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);

  useEffect(() => {
    listRoutes(supabase).then(setRoutes);
  }, []);

  const routeName = (routeId: string | null) => routes.find((r) => r.id === routeId)?.route_number ?? "—";

  return (
    <ResourceCrudPage<Bus>
      title="Buses"
      description="Fleet vehicles, each optionally assigned to a route."
      table="buses"
      orderBy="bus_number"
      columns={[
        { key: "bus_number", header: "Bus number", render: (b) => b.bus_number },
        { key: "route", header: "Route", render: (b) => routeName(b.route_id) },
        { key: "type", header: "Type", render: (b) => b.type.replace("_", "-") },
        { key: "capacity", header: "Capacity", render: (b) => b.capacity },
      ]}
      fields={[
        { name: "bus_number", label: "Bus number", type: "text", required: true, placeholder: "TN-49-N-1023" },
        {
          name: "route_id",
          label: "Route",
          type: "select",
          // Without a placeholder, the <select> has no empty option, so an
          // unset value (undefined) visually defaults to showing the first
          // real route as "selected" even though nothing was chosen.
          placeholder: "No route assigned",
          options: routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` })),
        },
        {
          name: "type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "NON_AC", label: "Non-AC" },
            { value: "AC", label: "AC" },
          ],
        },
        { name: "capacity", label: "Capacity", type: "number", required: true },
      ]}
    />
  );
}
