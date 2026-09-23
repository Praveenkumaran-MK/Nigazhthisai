import type { Stop } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";
import { ResourceCrudPage } from "../components/crud/ResourceCrudPage";

export function StopsPage() {
  return (
    <ResourceCrudPage<Stop>
      title="Stops"
      description="Bus stops used by routes across the district."
      table="stops"
      readTable="stops_public"
      orderBy="name"
      columns={[
        { key: "name", header: "Name", render: (s) => s.name },
        { key: "code", header: "Code", render: (s) => s.code },
        { key: "district", header: "District", render: (s) => s.district },
        {
          key: "location",
          header: "Coordinates",
          render: (s) => `${s.location.latitude.toFixed(4)}, ${s.location.longitude.toFixed(4)}`,
        },
      ]}
      fields={[
        { name: "name", label: "Stop name", type: "text", required: true },
        { name: "code", label: "Stop code", type: "text", required: true, placeholder: "e.g. TCB-01" },
        { name: "district", label: "District", type: "text", required: true },
        { name: "latitude", label: "Latitude", type: "number", step: "0.000001", required: true },
        { name: "longitude", label: "Longitude", type: "number", step: "0.000001", required: true },
      ]}
      toFormValues={(s) => ({
        name: s.name,
        code: s.code,
        district: s.district,
        latitude: s.location.latitude,
        longitude: s.location.longitude,
      })}
      transformSubmit={(values) => ({
        name: String(values.name ?? "").trim(),
        code: String(values.code ?? "").trim().toUpperCase(),
        district: String(values.district ?? "").trim(),
        location: `SRID=4326;POINT(${Number(values.longitude)} ${Number(values.latitude)})`,
      })}
      onDelete={async (stop) => {
        // 1. Guard against active trips currently serving this stop
        const { data: activeTrips } = await supabase
          .from("trips")
          .select("id")
          .eq("current_stop_id", stop.id)
          .eq("status", "ACTIVE")
          .limit(1);

        if (activeTrips && activeTrips.length > 0) {
          throw new Error(`Cannot delete stop "${stop.name}" because an active transit trip is currently at this stop.`);
        }

        // 2. Unlink from route lines, day schedules, and fare matrix
        await supabase.from("route_day_stops").delete().eq("stop_id", stop.id);
        await supabase.from("route_stops").delete().eq("stop_id", stop.id);
        await supabase.from("fare_matrix").delete().eq("origin_stop_id", stop.id);
        await supabase.from("fare_matrix").delete().eq("dest_stop_id", stop.id);
        await supabase.from("trips").update({ current_stop_id: null }).eq("current_stop_id", stop.id);

        // 3. Check if historical tickets or trip stops reference this stop
        const [{ count: ticketCount1 }, { count: ticketCount2 }, { count: tripStopCount }] = await Promise.all([
          supabase.from("tickets").select("id", { count: "exact", head: true }).eq("origin_stop_id", stop.id),
          supabase.from("tickets").select("id", { count: "exact", head: true }).eq("dest_stop_id", stop.id),
          supabase.from("trip_stops").select("id", { count: "exact", head: true }).eq("stop_id", stop.id),
        ]);

        const hasHistory = (ticketCount1 ?? 0) > 0 || (ticketCount2 ?? 0) > 0 || (tripStopCount ?? 0) > 0;

        if (hasHistory) {
          // Decommission stop to preserve historical passenger tickets & receipts
          await supabase
            .from("stops")
            .update({ name: `${stop.name} [DECOMMISSIONED]`, updated_at: new Date().toISOString() })
            .eq("id", stop.id);
          return { message: "Stop unlinked from all routes and fares. Historical ticket records preserved." };
        } else {
          // Clean delete for unreferenced stop
          const { error: delErr } = await supabase.from("stops").delete().eq("id", stop.id);
          if (delErr) throw new Error(delErr.message);
          return { message: "Stop deleted successfully." };
        }
      }}
    />
  );
}
