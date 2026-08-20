import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Select, Alert, Spinner, AppHeader, CommuterHero } from "@sbt/ui";
import type { Route, RouteWithStops } from "@sbt/shared-types";
import { listRoutes, getRouteWithStops } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useGeolocation } from "../hooks/useGeolocation";
import { useNearestStop } from "../hooks/useNearestStop";

export function HomePage() {
  const navigate = useNavigate();
  const geo = useGeolocation();
  const nearest = useNearestStop();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeDetail, setRouteDetail] = useState<RouteWithStops | null>(null);
  const [originStopId, setOriginStopId] = useState("");
  const [destStopId, setDestStopId] = useState("");
  // Tracks whether the passenger has explicitly chosen an origin themselves
  // for the CURRENTLY selected route, so a late-resolving geolocation fix
  // (GPS can take up to the 10s timeout) can't silently overwrite a manual
  // pick once it finally comes back.
  const userPickedOriginRef = useRef(false);

  useEffect(() => {
    geo.request();
    listRoutes(supabase).then(setRoutes).catch(() => setRoutes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (geo.status === "granted" && geo.position) {
      nearest.lookup(geo.position.latitude, geo.position.longitude);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status]);

  useEffect(() => {
    if (!selectedRouteId) {
      setRouteDetail(null);
      return;
    }
    getRouteWithStops(supabase, selectedRouteId).then((detail) => {
      setRouteDetail(detail);
      // Preselect the geolocated nearest stop as Origin if it belongs to
      // this route — but never once the passenger has picked one
      // themselves for this route selection.
      if (!userPickedOriginRef.current && nearest.stop && detail?.stops.some((s) => s.id === nearest.stop!.stop_id)) {
        setOriginStopId(nearest.stop.stop_id);
      }
    });
  }, [selectedRouteId, nearest.stop]);

  const canSearch = selectedRouteId && originStopId && destStopId && originStopId !== destStopId;

  return (
    <div className="mx-auto flex max-w-md flex-col">
      <AppHeader showWordmark actions={<span className="text-[11px] font-medium text-white/60">No login needed</span>}>
        <div className="flex items-center justify-between gap-2 pt-2">
          <h2 className="max-w-[52%] text-2xl font-bold leading-tight text-white sm:text-3xl">
            Where are you headed?
          </h2>
          <CommuterHero className="h-28 w-40 shrink-0" />
        </div>
      </AppHeader>
      {/* Navy bleed behind the overlapping search card below */}
      <div className="-mt-px h-12 bg-navy-800" />

      {/* Search card, overlapping the hero bottom edge */}
      <div className="-mt-10 flex flex-col gap-4 px-5">
        <div className="rounded-3xl bg-white p-5 shadow-xl shadow-navy-900/10 dark:bg-surface-dark">
          <div className="flex flex-col gap-4">
            <Select
              label="Route"
              placeholder="Select a route"
              value={selectedRouteId}
              onChange={(e) => {
                setSelectedRouteId(e.target.value);
                setOriginStopId("");
                setDestStopId("");
                userPickedOriginRef.current = false;
              }}
              options={routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` }))}
            />

            <Select
              label="From"
              placeholder={routeDetail ? "Select origin" : "Select a route first"}
              value={originStopId}
              disabled={!routeDetail}
              onChange={(e) => {
                userPickedOriginRef.current = true;
                setOriginStopId(e.target.value);
              }}
              options={(routeDetail?.stops ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />

            <Select
              label="To"
              placeholder={routeDetail ? "Select destination" : "Select a route first"}
              value={destStopId}
              disabled={!routeDetail}
              onChange={(e) => setDestStopId(e.target.value)}
              options={(routeDetail?.stops ?? [])
                .filter((s) => s.id !== originStopId)
                .map((s) => ({ value: s.id, label: s.name }))}
            />

            <Button
              size="lg"
              className="mt-1 w-full"
              disabled={!canSearch}
              onClick={() =>
                navigate(`/search?routeId=${selectedRouteId}&originStopId=${originStopId}&destStopId=${destStopId}`)
              }
            >
              Search Buses
            </Button>
          </div>
        </div>

        {geo.status === "requesting" && (
          <Alert tone="info" title="Locating you…" icon={<Spinner size="sm" />}>
            We use your location only to suggest your nearest stop.
          </Alert>
        )}
        {(geo.status === "denied" || geo.status === "unavailable" || geo.status === "timeout") && (
          <Alert tone="warning" title="Location unavailable">
            {geo.status === "denied"
              ? "Location permission was denied. Select your stops manually above."
              : "We couldn't detect your location. Select your stops manually above."}
          </Alert>
        )}
        {nearest.status === "success" && nearest.stop && (
          <Alert tone="success" title={`Nearest stop: ${nearest.stop.name}`}>
            {Math.round(nearest.stop.distance_meters)}m away — pick a route above to use it as your origin.
          </Alert>
        )}
      </div>
    </div>
  );
}
