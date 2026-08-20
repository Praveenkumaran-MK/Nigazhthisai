import { useEffect, useState } from "react";
import { DataTable, Badge, Card } from "@sbt/ui";
import type { Trip, Route, Bus, Conductor } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";

const statusTone = { SCHEDULED: "neutral", ACTIVE: "success", COMPLETED: "brand", CANCELLED: "danger" } as const;

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [status, setStatus] = useState<"loading" | "success">("loading");

  useEffect(() => {
    Promise.all([
      supabase.from("trips").select("*").order("service_date", { ascending: false }).limit(100),
      supabase.from("routes").select("*"),
      supabase.from("buses").select("*"),
      supabase.from("conductors").select("*"),
    ]).then(([t, r, b, c]) => {
      setTrips((t.data ?? []) as Trip[]);
      setRoutes((r.data ?? []) as Route[]);
      setBuses((b.data ?? []) as Bus[]);
      setConductors((c.data ?? []) as Conductor[]);
      setStatus("success");
    });
  }, []);

  const routeLabel = (id: string) => routes.find((r) => r.id === id)?.route_number ?? id.slice(0, 8);
  const busLabel = (id: string) => buses.find((b) => b.id === id)?.bus_number ?? id.slice(0, 8);
  const conductorLabel = (id: string | null) => conductors.find((c) => c.id === id)?.display_name ?? "Unassigned";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Trips</h1>
        <p className="text-sm text-slate-500 dark:text-slate-500">Read-only overview — trips are created from confirmed schedules and progressed by conductors.</p>
      </div>
      <Card>
        <DataTable
          columns={[
            { key: "date", header: "Date", render: (t) => t.service_date },
            { key: "route", header: "Route", render: (t) => routeLabel(t.route_id) },
            { key: "bus", header: "Bus", render: (t) => busLabel(t.bus_id) },
            { key: "conductor", header: "Conductor", render: (t) => conductorLabel(t.conductor_id) },
            { key: "status", header: "Status", render: (t) => <Badge tone={statusTone[t.status]}>{t.status}</Badge> },
          ]}
          rows={trips}
          getRowId={(t) => t.id}
          isLoading={status === "loading"}
          emptyTitle="No trips yet"
        />
      </Card>
    </div>
  );
}
