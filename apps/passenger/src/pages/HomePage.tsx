import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Select, Alert, Spinner, AppHeader, CommuterHero } from "@sbt/ui";
import type { Route, RouteWithStops } from "@sbt/shared-types";
import { listRoutes, getRouteWithStops } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useGeolocation } from "../hooks/useGeolocation";
import { useNearestStop } from "../hooks/useNearestStop";
import { useI18n } from "../lib/i18n";
import type { Language } from "../lib/i18n";

interface ServiceAlert {
  id: string;
  title: string | null;
  message: string;
  severity: string;
}

/** Language toggle pill shown in the AppHeader actions slot. */
function LangToggle() {
  const { lang, setLang } = useI18n();

  return (
    <button
      type="button"
      id="lang-toggle"
      aria-label="Switch language"
      onClick={() => setLang((lang === "en" ? "ta" : "en") as Language)}
      className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
    >
      <span className="text-[10px] leading-none">🌐</span>
      {lang === "en" ? "தமிழ்" : "EN"}
    </button>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const geo = useGeolocation();
  const nearest = useNearestStop();
  const { t } = useI18n();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeDetail, setRouteDetail] = useState<RouteWithStops | null>(null);
  const [originStopId, setOriginStopId] = useState("");
  const [destStopId, setDestStopId] = useState("");
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlert[]>([]);
  const [detectingGps, setDetectingGps] = useState(false);
  // Tracks whether the passenger has explicitly chosen an origin themselves
  const userPickedOriginRef = useRef(false);

  useEffect(() => {
    geo.request();
    listRoutes(supabase).then(setRoutes).catch(() => setRoutes([]));

    // Load any active operational alerts visible to passengers
    supabase
      .from("alerts")
      .select("id, title, message, severity")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setServiceAlerts((data ?? []) as ServiceAlert[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDetectLocation = () => {
    setDetectingGps(true);
    geo.request();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          nearest.lookup(pos.coords.latitude, pos.coords.longitude);
          setDetectingGps(false);
        },
        () => setDetectingGps(false),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

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
      if (!userPickedOriginRef.current && nearest.stop && detail?.stops.some((s) => s.id === nearest.stop!.stop_id)) {
        setOriginStopId(nearest.stop.stop_id);
      }
    });
  }, [selectedRouteId, nearest.stop]);

  const canSearch = selectedRouteId && originStopId && destStopId && originStopId !== destStopId;

  const alertTone = (severity: string) =>
    severity === "CRITICAL" ? "danger" : severity === "WARNING" ? "warning" : "info";

  return (
    <div className="mx-auto flex max-w-md flex-col">
      <AppHeader
        showWordmark
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-white/60">{t("ticketsSavedDevice")}</span>
            <LangToggle />
          </div>
        }
      >
        <div className="flex items-center justify-between gap-2 pt-2">
          <h2 className="max-w-[52%] text-2xl font-bold leading-tight text-white sm:text-3xl">
            {t("whereHeaded")}
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
              label={t("route")}
              placeholder={t("selectRoute")}
              value={selectedRouteId}
              onChange={(e) => {
                setSelectedRouteId(e.target.value);
                setOriginStopId("");
                setDestStopId("");
                userPickedOriginRef.current = false;
              }}
              options={routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` }))}
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("from")}</span>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={detectingGps}
                  className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 transition"
                >
                  <span>📍</span>
                  {detectingGps ? "Locating..." : "Find Nearest Stop"}
                </button>
              </div>
              <Select
                placeholder={routeDetail ? t("selectOrigin") : t("selectRouteFirst")}
                value={originStopId}
                disabled={!routeDetail}
                onChange={(e) => {
                  userPickedOriginRef.current = true;
                  setOriginStopId(e.target.value);
                }}
                options={(routeDetail?.stops ?? []).map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>

            <Select
              label={t("to")}
              placeholder={routeDetail ? t("selectDest") : t("selectRouteFirst")}
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
              {t("searchBuses")}
            </Button>
          </div>
        </div>

        {/* Service Alerts Banner */}
        {serviceAlerts.map((alert) => (
          <Alert
            key={alert.id}
            tone={alertTone(alert.severity)}
            title={alert.title ?? t("serviceAlert")}
          >
            {alert.message}
          </Alert>
        ))}

        {geo.status === "requesting" && (
          <Alert tone="info" title={t("locatingYou")} icon={<Spinner size="sm" />}>
            {t("locationUseNote")}
          </Alert>
        )}
        {(geo.status === "denied" || geo.status === "unavailable" || geo.status === "timeout") && (
          <Alert tone="warning" title="Location unavailable">
            {geo.status === "denied" ? t("locationDenied") : t("locationUnavailable")}
          </Alert>
        )}
        {nearest.status === "success" && nearest.stop && (
          <Alert tone="success" title={`${t("nearestStop")}: ${nearest.stop.name}`}>
            {Math.round(nearest.stop.distance_meters)}{t("nearestStopAway")}
          </Alert>
        )}
      </div>
    </div>
  );
}
