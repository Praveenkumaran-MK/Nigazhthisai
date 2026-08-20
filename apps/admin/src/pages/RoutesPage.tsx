import type { Route } from "@sbt/shared-types";
import { ResourceCrudPage } from "../components/crud/ResourceCrudPage";

export function RoutesPage() {
  return (
    <ResourceCrudPage<Route>
      title="Routes"
      description="Named routes identified by a route number. Manage stop order under Route Stops."
      table="routes"
      orderBy="route_number"
      columns={[
        { key: "route_number", header: "Number", render: (r) => r.route_number },
        { key: "name", header: "Name", render: (r) => r.name },
      ]}
      fields={[
        { name: "route_number", label: "Route number", type: "text", required: true, placeholder: "e.g. 12A" },
        { name: "name", label: "Route name", type: "text", required: true },
      ]}
    />
  );
}
