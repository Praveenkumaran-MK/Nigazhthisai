import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Route, Bus, Conductor } from "@sbt/shared-types";
import { listRoutes } from "@sbt/supabase-client";
import { MapFrame, Card, Badge, EmptyState } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useFleetPresence } from "../hooks/useFleetPresence";

const busIcon = L.divIcon({
  className: "",
  html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="#16a34a" stroke="white" stroke-width="1"><path d="M12 2L4 20h16L12 2z"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

export function FleetPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);

  useEffect(() => {
    listRoutes(supabase).then(setRoutes);
    supabase.from("buses").select("*").then(({ data }) => setBuses((data ?? []) as Bus[]));
    supabase.from("conductors").select("*").then(({ data }) => setConductors((data ?? []) as Conductor[]));
  }, []);

  const fleet = useFleetPresence(routes.map((r) => r.id));

  const busLabel = (id: string) => buses.find((b) => b.id === id)?.bus_number ?? id.slice(0, 8);
  const routeLabel = (id: string) => routes.find((r) => r.id === id)?.route_number ?? id.slice(0, 8);
  const conductorLabel = (id: string) => conductors.find((c) => c.id === id)?.display_name ?? "Unknown";

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row">
      <div className="lg:w-72">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Live Fleet</h1>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-500">{fleet.length} bus(es) online</p>
        {fleet.length === 0 && <EmptyState title="No buses online" description="Conductors appear here once they start service." />}
        <div className="flex flex-col gap-2 overflow-y-auto">
          {fleet.map((bus) => (
            <Card key={bus.busId}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{busLabel(bus.busId)}</p>
                <Badge tone="success">Online</Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500">Route {routeLabel(bus.routeId)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">{conductorLabel(bus.conductorId)}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-600">
                Last seen: {new Date(bus.lastSeen).toLocaleTimeString()}
              </p>
            </Card>
          ))}
        </div>
      </div>

      <MapFrame heightClassName="flex-1">
        <MapContainer center={[10.787, 79.1378]} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {fleet
            .filter((b) => b.position)
            .map((bus) => (
              <Marker key={bus.busId} position={[bus.position!.latitude, bus.position!.longitude]} icon={busIcon}>
                <Popup>
                  {busLabel(bus.busId)} — Route {routeLabel(bus.routeId)}
                  <br />
                  {conductorLabel(bus.conductorId)}
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </MapFrame>
    </div>
  );
}
