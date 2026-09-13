import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Alert, Spinner, AppHeader, CommuterHero, Badge } from "@sbt/ui";
import type { Stop, Route } from "@sbt/shared-types";
import { listStops, listRoutes } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useGeolocation } from "../hooks/useGeolocation";
import { useNearestStop } from "../hooks/useNearestStop";
import { useI18n } from "../lib/i18n";
import { LangToggle } from "../components/LangToggle";
import { MapPin, Search, ArrowRight, X, ArrowUpDown, Compass, Bus } from "lucide-react";

interface ServiceAlert {
  id: string;
  title: string | null;
  message: string;
  severity: string;
}

export function HomePage() {
  const navigate = useNavigate();
  const geo = useGeolocation();
  const nearest = useNearestStop();
  const { t } = useI18n();

  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [originStop, setOriginStop] = useState<Stop | null>(null);
  const [destStop, setDestStop] = useState<Stop | null>(null);
  const [destQuery, setDestQuery] = useState("");
  const [isDestFocused, setIsDestFocused] = useState(false);

  const [isChangingOrigin, setIsChangingOrigin] = useState(false);
  const [originQuery, setOriginQuery] = useState("");

  const [connectingRoute, setConnectingRoute] = useState<Route | null>(null);
  const [isResolvingRoute, setIsResolvingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlert[]>([]);
  const [detectingGps, setDetectingGps] = useState(false);
  const userPickedOriginRef = useRef(false);

  // 1. Initial loads: fetch stops, routes, and trigger GPS detection
  useEffect(() => {
    geo.request();
    listStops(supabase).then(setAllStops).catch(() => setAllStops([]));
    listRoutes(supabase).then(setAllRoutes).catch(() => setAllRoutes([]));

    // Active operational alerts
    supabase
      .from("alerts")
      .select("id, title, message, severity")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setServiceAlerts((data ?? []) as ServiceAlert[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Lookup nearest stop when GPS coordinates are available
  useEffect(() => {
    if (geo.status === "granted" && geo.position) {
      nearest.lookup(geo.position.latitude, geo.position.longitude);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status]);

  // 3. Automatically populate origin stop from GPS nearest stop
  useEffect(() => {
    if (nearest.stop && !userPickedOriginRef.current) {
      const match = allStops.find((s) => s.id === nearest.stop!.stop_id);
      if (match) {
        setOriginStop(match);
      } else {
        setOriginStop({
          id: nearest.stop.stop_id,
          name: nearest.stop.name,
          code: nearest.stop.code,
          district: nearest.stop.district || "Transit Network",
          location: { latitude: 0, longitude: 0 },
          created_at: "",
          updated_at: "",
        });
      }
    } else if (!originStop && allStops.length > 0 && !userPickedOriginRef.current && allStops[0]) {
      // Fallback if GPS is disabled or waiting
      setOriginStop(allStops[0]);
    }
  }, [nearest.stop, allStops, originStop]);

  // Manual GPS detect trigger
  const handleDetectLocation = () => {
    setDetectingGps(true);
    geo.request();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          nearest.lookup(pos.coords.latitude, pos.coords.longitude);
          userPickedOriginRef.current = false;
          setDetectingGps(false);
        },
        () => setDetectingGps(false),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  // 4. Background route resolution when origin and destination are set
  useEffect(() => {
    if (!originStop?.id || !destStop?.id || originStop.id === destStop.id) {
      setConnectingRoute(null);
      setRouteError(null);
      return;
    }

    let isCancelled = false;
    async function resolveRoute() {
      setIsResolvingRoute(true);
      setRouteError(null);
      try {
        const { data: rsOrigin } = await supabase
          .from("route_stops")
          .select("route_id, sequence_order")
          .eq("stop_id", originStop!.id);

        const { data: rsDest } = await supabase
          .from("route_stops")
          .select("route_id, sequence_order")
          .eq("stop_id", destStop!.id);

        if (isCancelled) return;

        if (rsOrigin && rsDest) {
          // Direct directional match: origin precedes destination
          const directMatch = rsOrigin.find((o) =>
            rsDest.some((d) => d.route_id === o.route_id && o.sequence_order < d.sequence_order)
          );

          if (directMatch) {
            const r = allRoutes.find((rt) => rt.id === directMatch.route_id);
            if (r) {
              setConnectingRoute(r);
              return;
            }
          }

          // Bidirectional or circular match
          const anyMatch = rsOrigin.find((o) => rsDest.some((d) => d.route_id === o.route_id));
          if (anyMatch) {
            const r = allRoutes.find((rt) => rt.id === anyMatch.route_id);
            if (r) {
              setConnectingRoute(r);
              return;
            }
          }
        }

        // If no explicit route_stops match found in database
        setConnectingRoute(null);
        setRouteError("No direct bus route between these stops. Try a nearby connecting stop.");
      } catch (err) {
        console.warn("[HomePage] Route resolution notice:", err);
      } finally {
        if (!isCancelled) setIsResolvingRoute(false);
      }
    }

    void resolveRoute();
    return () => {
      isCancelled = true;
    };
  }, [originStop?.id, destStop?.id, allRoutes]);

  // Autocomplete matching destination stops
  const matchingDestStops = useMemo(() => {
    const q = destQuery.trim().toLowerCase();
    return allStops.filter((s) => {
      if (originStop && s.id === originStop.id) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.district && s.district.toLowerCase().includes(q))
      );
    });
  }, [allStops, destQuery, originStop]);

  // Autocomplete matching origin stops
  const matchingOriginStops = useMemo(() => {
    const q = originQuery.trim().toLowerCase();
    return allStops.filter((s) => {
      if (destStop && s.id === destStop.id) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.district && s.district.toLowerCase().includes(q))
      );
    });
  }, [allStops, originQuery, destStop]);

  // Popular destination suggestions
  const popularDestinations = useMemo(() => {
    return allStops
      .filter((s) => !originStop || s.id !== originStop.id)
      .slice(0, 4);
  }, [allStops, originStop]);

  const handleSelectDest = (stop: Stop) => {
    setDestStop(stop);
    setDestQuery(stop.name);
    setIsDestFocused(false);
  };

  const handleSelectOrigin = (stop: Stop) => {
    setOriginStop(stop);
    userPickedOriginRef.current = true;
    setIsChangingOrigin(false);
    setOriginQuery("");
  };

  const handleSwapStops = () => {
    if (!destStop) return;
    const prevOrigin = originStop;
    setOriginStop(destStop);
    setDestStop(prevOrigin);
    setDestQuery(prevOrigin ? prevOrigin.name : "");
    userPickedOriginRef.current = true;
  };

  const canSearch = Boolean(originStop?.id && destStop?.id && originStop.id !== destStop.id);

  const handleSearchBuses = () => {
    if (!canSearch || !originStop || !destStop) return;
    const params = new URLSearchParams({
      originStopId: originStop.id,
      destStopId: destStop.id,
    });
    if (connectingRoute?.id) {
      params.set("routeId", connectingRoute.id);
    }
    navigate(`/search?${params.toString()}`);
  };

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

      {/* Destination-First Search Card */}
      <div className="-mt-10 flex flex-col gap-4 px-5">
        <div className="rounded-3xl bg-white p-5 shadow-xl shadow-navy-900/10 dark:bg-surface-dark">
          <div className="flex flex-col gap-4">

            {/* 1. Origin Stop (Auto GPS Determined) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  {t("from")} (Your Location)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={detectingGps}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 transition"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>{detectingGps ? "Locating…" : "Detect GPS"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChangingOrigin(!isChangingOrigin)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
                  >
                    {isChangingOrigin ? "Done" : "Change"}
                  </button>
                </div>
              </div>

              {!isChangingOrigin ? (
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {originStop?.name ?? "Locating nearest stop…"}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {originStop?.code ? `${originStop.code} • ` : ""}
                        {nearest.stop && originStop?.id === nearest.stop.stop_id
                          ? `${Math.round(nearest.stop.distance_meters)}m away (GPS)`
                          : "Departure Point"}
                      </p>
                    </div>
                  </div>
                  {nearest.stop && originStop?.id === nearest.stop.stop_id && (
                    <Badge tone="success">Near You</Badge>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Search origin stop…"
                    value={originQuery}
                    onChange={(e) => setOriginQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    {matchingOriginStops.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectOrigin(s)}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{s.code}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Swap Origin / Destination Button */}
            {destStop && (
              <div className="flex justify-center -my-2 relative z-10">
                <button
                  type="button"
                  onClick={handleSwapStops}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  title="Swap Origin and Destination"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* 2. Destination Stop Input (Real-Time Search & Autocomplete) */}
            <div className="relative">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 dark:text-slate-400">
                {t("to")} (Destination Stop)
              </label>

              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={destQuery}
                  placeholder="Type destination stop (e.g., Fish Market)…"
                  onFocus={() => setIsDestFocused(true)}
                  onChange={(e) => {
                    setDestQuery(e.target.value);
                    setIsDestFocused(true);
                    if (destStop && e.target.value !== destStop.name) {
                      setDestStop(null);
                    }
                  }}
                  className="w-full rounded-2xl border border-slate-300 bg-white pl-9 pr-8 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                {destQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setDestQuery("");
                      setDestStop(null);
                      setIsDestFocused(true);
                    }}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown List */}
              {isDestFocused && (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-navy-950/20 dark:border-slate-800 dark:bg-slate-900">
                  <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Matching Transit Stops
                  </p>
                  {matchingDestStops.length > 0 ? (
                    matchingDestStops.map((stop) => (
                      <button
                        key={stop.id}
                        type="button"
                        onMouseDown={() => handleSelectDest(stop)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-brand-50/80 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{stop.name}</p>
                            <p className="text-[11px] text-slate-400">{stop.district || "Transit Stop"}</p>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {stop.code}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No stops found matching "{destQuery}". Try another keyword.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Popular Destination Chips */}
            {!destStop && popularDestinations.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Popular Destinations
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {popularDestinations.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      onClick={() => handleSelectDest(stop)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <MapPin className="h-3 w-3 text-brand-600 dark:text-brand-400" />
                      <span>{stop.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Connecting Route Status Feedback */}
            {isResolvingRoute && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <Spinner size="sm" />
                <span>Checking connecting bus lines…</span>
              </div>
            )}

            {connectingRoute && !isResolvingRoute && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-50/70 p-2.5 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Bus className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Connected via <strong>Route {connectingRoute.route_number}</strong> ({connectingRoute.name})
                </span>
              </div>
            )}

            {routeError && !isResolvingRoute && (
              <Alert tone="warning" title="No Direct Route">
                {routeError}
              </Alert>
            )}

            {/* Search Buses CTA Button */}
            <Button
              size="lg"
              className="mt-1 w-full text-base font-bold shadow-lg shadow-brand-500/20"
              disabled={!canSearch}
              onClick={handleSearchBuses}
            >
              <div className="inline-flex items-center justify-center gap-2">
                <span>{t("searchBuses")}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
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
      </div>
    </div>
  );
}
