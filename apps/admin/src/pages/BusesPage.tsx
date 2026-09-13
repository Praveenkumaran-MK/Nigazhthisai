import { useEffect, useState } from "react";
import type { Bus, Route, District } from "@sbt/shared-types";
import { listRoutes } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { ResourceCrudPage } from "../components/crud/ResourceCrudPage";

export function BusesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);

  useEffect(() => {
    listRoutes(supabase).then(setRoutes);
    supabase
      .from("districts")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setDistricts((data ?? []) as District[]));
  }, []);

  const routeName = (routeId: string | null) => routes.find((r) => r.id === routeId)?.route_number ?? "—";
  const districtName = (districtId: string | null) => districts.find((d) => d.id === districtId)?.name ?? "—";

  return (
    <ResourceCrudPage<Bus>
      title="Buses"
      description="Fleet vehicles, each optionally assigned to a route and operating district."
      table="buses"
      orderBy="bus_number"
      columns={[
        { key: "bus_number", header: "Bus number", render: (b) => b.bus_number },
        { key: "district", header: "District", render: (b) => districtName(b.district_id) },
        { key: "route", header: "Route", render: (b) => routeName(b.route_id) },
        { key: "type", header: "Type", render: (b) => b.type.replace("_", "-") },
        { key: "capacity", header: "Capacity", render: (b) => b.capacity },
      ]}
      fields={[
        { name: "bus_number", label: "Bus number", type: "text", required: true, placeholder: "TN-49-N-1023" },
        {
          name: "district_id",
          label: "District",
          type: "select",
          placeholder: "Select district",
          options: districts.map((d) => ({ value: d.id, label: d.name })),
        },
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
