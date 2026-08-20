import type { Stop } from "@sbt/shared-types";
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
        name: values.name,
        code: values.code,
        district: values.district,
        location: `SRID=4326;POINT(${values.longitude} ${values.latitude})`,
      })}
    />
  );
}
