import { useEffect, useState } from "react";
import type { Bus, Route, District } from "@sbt/shared-types";
import { listRoutes } from "@sbt/supabase-client";
import { WheelchairIcon } from "@sbt/ui";
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
        {
          key: "is_wheelchair_accessible",
          header: "Handicap Facilities",
          render: (b) =>
            b.is_wheelchair_accessible ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                <WheelchairIcon size={14} className="text-blue-600 dark:text-blue-400" />
                <span>Accessible</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 font-medium">
                Standard
              </span>
            ),
        },
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
        {
          name: "is_wheelchair_accessible",
          label: "Handicap / Wheelchair Accessible Facilities",
          type: "checkbox",
        },
      ]}
      toFormValues={(b) => ({
        bus_number: b.bus_number,
        district_id: b.district_id ?? "",
        route_id: b.route_id ?? "",
        type: b.type,
        capacity: b.capacity,
        is_wheelchair_accessible: b.is_wheelchair_accessible ?? false,
      })}
      transformSubmit={(values) => ({
        bus_number: String(values.bus_number ?? "").trim(),
        district_id: values.district_id || null,
        route_id: values.route_id || null,
        type: values.type,
        capacity: Number(values.capacity),
        is_wheelchair_accessible: Boolean(values.is_wheelchair_accessible),
      })}
      onDelete={async (bus) => {
        const { data, error } = await supabase.rpc("delete_bus_safe", { p_bus_id: bus.id });
        if (error) {
          if (error.message.includes("function") || error.code === "PGRST202") {
            const { error: delErr } = await supabase.from("buses").delete().eq("id", bus.id);
            if (delErr) throw new Error(delErr.message);
            return { message: "Bus deleted" };
          }
          throw new Error(error.message);
        }
        return { message: (data as any)?.message ?? "Bus deleted successfully" };
      }}
    />
  );
}
