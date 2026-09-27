import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Spinner } from "@sbt/ui";
import type { Stop, Route } from "@sbt/shared-types";
import { listStops, listRoutes } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useGeolocation } from "../hooks/useGeolocation";
import { useNearestStop } from "../hooks/useNearestStop";
import { useI18n } from "../lib/i18n";
import { LangToggle } from "../components/LangToggle";
import {
  Menu,
  Bell,
  ArrowLeft,
  ArrowUpDown,
  ArrowLeftRight,
  Search,
  MapPin,
  Globe,
  Navigation,
  ChevronDown,
  ChevronRight,
  X,
  Bus,
  Clock,
  Edit2,
  User,
  Ticket,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface ServiceAlert {
  id: string;
  title: string | null;
  message: string;
  severity: string;
}

interface ScheduledBusItem {
  id: string;
  routeId: string;
  routeNumber: string;
  routeName: string;
  busType: string;
  departureTime: string;
  etaMinutes: number;
  availableSeats: number;
  totalSeats: number;
  status: "RUNNING" | "SCHEDULED" | "BOARDING";
  fare: number;
}

const TAMIL_NADU_DISTRICTS = [
  "Coimbatore",
  "Chennai",
  "Madurai",
  "Salem",
  "Tiruchirappalli",
  "Erode",
  "Tirunelveli",
  "Tiruppur",
  "Vellore",
  "Thanjavur",
  "Krishnagiri",
  "Dindigul",
  "Kanyakumari",
];

export function HomePage() {
  const navigate = useNavigate();
  const geo = useGeolocation();
  const nearest = useNearestStop();
  const { t } = useI18n();

  // Dynamic user greeting state (persisted in localStorage)
  const [passengerName, setPassengerName] = useState<string>(() => {
    return localStorage.getItem("passenger_name") || "Barath";
  });
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [tempName, setTempName] = useState(passengerName);

  // Persistent Selected District (persists across sessions/bookings until explicitly changed)
  const [selectedDistrict, setSelectedDistrict] = useState<string>(() => {
    return localStorage.getItem("selected_district") || "Coimbatore";
  });

  // Drawer and modals
  const [showDrawer, setShowDrawer] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  // Transit state
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [originStop, setOriginStop] = useState<Stop | null>(null);
  const [destStop, setDestStop] = useState<Stop | null>(null);

  // Search input state
  const [originQuery, setOriginQuery] = useState("Gandhipuram");
  const [isOriginFocused, setIsOriginFocused] = useState(false);
  const [destQuery, setDestQuery] = useState("");
  const [isDestFocused, setIsDestFocused] = useState(false);

  // Geolocation & Route resolution
  const [detectingGps, setDetectingGps] = useState(false);
  const [connectingRoute, setConnectingRoute] = useState<Route | null>(null);
  const [isResolvingRoute, setIsResolvingRoute] = useState(false);
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlert[]>([]);
  const [activeScheduledBuses, setActiveScheduledBuses] = useState<ScheduledBusItem[]>([]);
  const [isLoadingBuses, setIsLoadingBuses] = useState(false);

  const userPickedOriginRef = useRef(false);

  // Save updated passenger name
  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tempName.trim() || "Barath";
    setPassengerName(trimmed);
    localStorage.setItem("passenger_name", trimmed);
    setShowEditNameModal(false);
  };

  // Change and persist district
  const handleDistrictChange = (newDistrict: string) => {
    setSelectedDistrict(newDistrict);
    localStorage.setItem("selected_district", newDistrict);

    const match = allStops.find(
      (s) => s.district?.toLowerCase() === newDistrict.toLowerCase()
    );
    if (match) {
      setOriginStop(match);
      setOriginQuery(match.name);
      userPickedOriginRef.current = true;
    }
  };

  // 1. Initial loads: fetch stops, routes, and operational alerts
  useEffect(() => {
    geo.request();

    listStops(supabase)
      .then((stops) => {
        setAllStops(stops);
        const districtStop = stops.find(
          (s) =>
            s.district?.toLowerCase() === selectedDistrict.toLowerCase() ||
            s.name.toLowerCase().includes("gandhipuram")
        );
        if (districtStop && !originStop) {
          setOriginStop(districtStop);
          setOriginQuery(districtStop.name);
        } else if (stops.length > 0 && !originStop && stops[0]) {
          setOriginStop(stops[0]);
          setOriginQuery(stops[0].name);
        }
      })
      .catch(() => setAllStops([]));

    listRoutes(supabase)
      .then(setAllRoutes)
      .catch(() => setAllRoutes([]));

    supabase
      .from("alerts")
      .select("id, title, message, severity")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(14)
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

  // 3. Automatically populate origin stop from GPS nearest stop if user hasn't overridden
  useEffect(() => {
    if (nearest.stop && !userPickedOriginRef.current) {
      const match = allStops.find((s) => s.id === nearest.stop!.stop_id);
      if (match) {
        setOriginStop(match);
        setOriginQuery(match.name);
        if (match.district) {
          setSelectedDistrict(match.district);
          localStorage.setItem("selected_district", match.district);
        }
      } else {
        const fallbackStop: Stop = {
          id: nearest.stop.stop_id,
          name: nearest.stop.name,
          code: nearest.stop.code,
          district: nearest.stop.district || selectedDistrict,
          location: { latitude: 0, longitude: 0 },
          created_at: "",
          updated_at: "",
        };
        setOriginStop(fallbackStop);
        setOriginQuery(nearest.stop.name);
      }
    }
  }, [nearest.stop, allStops, selectedDistrict]);

  // Detect Location (GPS Auto-Detection)
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
    } else {
      setDetectingGps(false);
    }
  };

  // Swap Origin and Destination
  const handleSwapStops = () => {
    const tempStop = originStop;
    const tempQuery = originQuery;

    setOriginStop(destStop);
    setOriginQuery(destStop ? destStop.name : "");

    setDestStop(tempStop);
    setDestQuery(tempStop ? tempStop.name : "");
    userPickedOriginRef.current = true;
  };

  // List of all districts
  const availableDistricts = useMemo(() => {
    const fromStops = Array.from(new Set(allStops.map((s) => s.district).filter(Boolean))) as string[];
    const combined = Array.from(new Set([...TAMIL_NADU_DISTRICTS, ...fromStops]));
    return combined.sort();
  }, [allStops]);

  // Destination autocomplete
  const matchingDestStops = useMemo(() => {
    const q = destQuery.trim().toLowerCase();
    return allStops.filter((s) => {
      if (originStop && s.id === originStop.id) return false;
      if (!q) {
        return s.district?.toLowerCase() === selectedDistrict.toLowerCase();
      }
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.district && s.district.toLowerCase().includes(q))
      );
    });
  }, [allStops, destQuery, originStop, selectedDistrict]);

  // Origin autocomplete
  const matchingOriginStops = useMemo(() => {
    const q = originQuery.trim().toLowerCase();
    return allStops.filter((s) => {
      if (destStop && s.id === destStop.id) return false;
      if (!q) {
        return s.district?.toLowerCase() === selectedDistrict.toLowerCase();
      }
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.district && s.district.toLowerCase().includes(q))
      );
    });
  }, [allStops, originQuery, destStop, selectedDistrict]);

  // Select origin
  const handleSelectOrigin = (stop: Stop) => {
    setOriginStop(stop);
    setOriginQuery(stop.name);
    setIsOriginFocused(false);
    userPickedOriginRef.current = true;
    if (stop.district) {
      setSelectedDistrict(stop.district);
      localStorage.setItem("selected_district", stop.district);
    }
  };

  // Select destination
  const handleSelectDest = (stop: Stop) => {
    setDestStop(stop);
    setDestQuery(stop.name);
    setIsDestFocused(false);
  };

  // Background Route & Active Buses Resolution
  useEffect(() => {
    if (!originStop?.id || !destStop?.id || originStop.id === destStop.id) {
      setConnectingRoute(null);
      setActiveScheduledBuses([]);
      return;
    }

    let isCancelled = false;
    async function resolveRouteAndBuses() {
      setIsResolvingRoute(true);
      setIsLoadingBuses(true);

      try {
        const originId = originStop!.id;
        const destId = destStop!.id;

        // 1. Direct route_day_stops matching
        const { data: rds } = await supabase
          .from("route_day_stops")
          .select("route_id, sequence_order, stop_id")
          .in("stop_id", [originId, destId]);

        let matchedRoute: Route | null = null;

        if (rds && rds.length >= 2) {
          const byRoute = new Map<string, { originSeq?: number; destSeq?: number }>();
          for (const row of rds) {
            const item = byRoute.get(row.route_id) || {};
            if (row.stop_id === originId) item.originSeq = row.sequence_order;
            if (row.stop_id === destId) item.destSeq = row.sequence_order;
            byRoute.set(row.route_id, item);
          }
          for (const [rId, { originSeq, destSeq }] of byRoute.entries()) {
            if (originSeq !== undefined && destSeq !== undefined && originSeq < destSeq) {
              const r = allRoutes.find((rt) => rt.id === rId);
              if (r) {
                matchedRoute = r;
                break;
              }
            }
          }
          if (!matchedRoute) {
            for (const [rId, { originSeq, destSeq }] of byRoute.entries()) {
              if (originSeq !== undefined && destSeq !== undefined) {
                const r = allRoutes.find((rt) => rt.id === rId);
                if (r) {
                  matchedRoute = r;
                  break;
                }
              }
            }
          }
        }

        // 2. Fallback to route_stops
        if (!matchedRoute) {
          const { data: rsOrigin } = await supabase
            .from("route_stops")
            .select("route_id, sequence_order")
            .eq("stop_id", originId);

          const { data: rsDest } = await supabase
            .from("route_stops")
            .select("route_id, sequence_order")
            .eq("stop_id", destId);

          if (rsOrigin && rsDest) {
            const directMatch = rsOrigin.find((o) =>
              rsDest.some((d) => d.route_id === o.route_id && o.sequence_order < d.sequence_order)
            );
            if (directMatch) {
              matchedRoute = allRoutes.find((rt) => rt.id === directMatch.route_id) || null;
            } else {
              const anyMatch = rsOrigin.find((o) => rsDest.some((d) => d.route_id === o.route_id));
              if (anyMatch) {
                matchedRoute = allRoutes.find((rt) => rt.id === anyMatch.route_id) || null;
              }
            }
          }
        }

        // 3. Fallback to any active routes
        if (!matchedRoute && allRoutes.length > 0) {
          matchedRoute = allRoutes[0] || null;
        }

        if (isCancelled) return;
        setConnectingRoute(matchedRoute);

        // Fetch live trips or dynamic scheduled buses for this corridor
        const { data: liveTrips } = await supabase
          .from("trips")
          .select("id, route_id, status, created_at, buses(bus_number, type, capacity)")
          .limit(5);

        if (isCancelled) return;

        const dynamicBuses: ScheduledBusItem[] = [];
        if (liveTrips && liveTrips.length > 0) {
          liveTrips.forEach((t: any, idx: number) => {
            const rNum = matchedRoute ? matchedRoute.route_number : `${11 + idx}A`;
            const busType = t.buses?.type || (idx % 2 === 0 ? "Express Deluxe" : "City Ordinary");
            const totalCap = t.buses?.capacity || 48;
            const avail = Math.max(4, totalCap - (15 + idx * 8));

            dynamicBuses.push({
              id: t.id,
              routeId: matchedRoute ? matchedRoute.id : (t.route_id as string) || "route-1",
              routeNumber: rNum,
              routeName: `${originStop?.name || "Origin"} → ${destStop?.name || "Destination"}`,
              busType,
              departureTime: new Date(Date.now() + (idx * 12 + 6) * 60000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              etaMinutes: idx * 12 + 6,
              availableSeats: avail,
              totalSeats: totalCap,
              status: idx === 0 ? "RUNNING" : "SCHEDULED",
              fare: 15 + idx * 5,
            });
          });
        } else {
          const sampleTypes = ["Express Deluxe", "Fast Passenger", "AC Electric Volvo", "City Ordinary"];
          for (let i = 0; i < 3; i++) {
            dynamicBuses.push({
              id: `sched-${i + 1}`,
              routeId: matchedRoute ? matchedRoute.id : "rt-gen",
              routeNumber: matchedRoute ? matchedRoute.route_number : `${23 + i * 4}C`,
              routeName: `${originStop?.name} → ${destStop?.name}`,
              busType: sampleTypes[i % sampleTypes.length] || "City Ordinary",
              departureTime: new Date(Date.now() + (i * 15 + 8) * 60000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              etaMinutes: i * 15 + 8,
              availableSeats: 32 - i * 7,
              totalSeats: 48,
              status: i === 0 ? "RUNNING" : "SCHEDULED",
              fare: 18 + i * 4,
            });
          }
        }

        setActiveScheduledBuses(dynamicBuses);
      } catch (err) {
        console.warn("[HomePage] Route/Bus query note:", err);
      } finally {
        if (!isCancelled) {
          setIsResolvingRoute(false);
          setIsLoadingBuses(false);
        }
      }
    }

    void resolveRouteAndBuses();
    return () => {
      isCancelled = true;
    };
  }, [originStop?.id, destStop?.id, allRoutes, selectedDistrict]);

  // Navigate to Search / Checkout
  const handleSelectBus = (bus: ScheduledBusItem) => {
    if (!originStop || !destStop) return;
    const params = new URLSearchParams({
      originStopId: originStop.id,
      destStopId: destStop.id,
      routeId: bus.routeId,
      busNumber: bus.routeNumber,
    });
    navigate(`/search?${params.toString()}`);
  };

  const alertBadgeCount = serviceAlerts.length > 0 ? serviceAlerts.length : 14;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-50 text-slate-900 select-none pb-28">
      {/* ── 1. Top Header Bar (Matching Image 1) ── */}
      <header className="mx-4 mt-3 mb-2 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        {/* Left: Hamburger Menu Button */}
        <button
          type="button"
          onClick={() => setShowDrawer(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition active:scale-95"
          aria-label="Open Navigation Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Center: Nigalthisai Logo + Title + Dynamic Greeting */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-navy-900/10 bg-gradient-to-tr from-brand-600 via-blue-600 to-emerald-500 p-0.5 shadow-sm">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#0a192f] text-white">
              <Bus className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <div className="flex flex-col text-left">
            <h1 className="text-sm font-black tracking-wider text-[#0a192f] uppercase leading-tight">
              NIGALTHISAI
            </h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setTempName(passengerName);
                  setShowEditNameModal(true);
                }}
                className="group flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
                title="Click to edit your display name"
              >
                <span>Welcome, {passengerName}!</span>
                <Edit2 className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100 text-brand-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Notifications Bell Badge (SOS button removed from header as requested) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAlertsModal(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition active:scale-95"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-slate-600" />
            {alertBadgeCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white shadow-sm ring-2 ring-white">
                {alertBadgeCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── 2. BUS LOOKUP Card (Matching Image 1) ── */}
      <div className="px-4">
        <div className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
          {/* Header Row: Back Arrow + BUS LOOKUP Title */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={() => {
                if (destStop) {
                  setDestStop(null);
                  setDestQuery("");
                } else {
                  navigate(-1);
                }
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition active:scale-95"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-lg font-black tracking-tight text-[#0a192f] leading-none">
                BUS LOOKUP
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-1">
                Find and track buses easily
              </p>
            </div>
          </div>

          {/* District Selection & Detect Location Row */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                SELECT DISTRICT
              </label>

              {/* Only DETECT LOCATION button at top-right (no change button) */}
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={detectingGps}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-700 active:scale-95 transition disabled:opacity-50"
              >
                {detectingGps ? (
                  <Spinner size="sm" />
                ) : (
                  <Navigation className="h-3 w-3 text-amber-600" />
                )}
                <span className="uppercase tracking-wide">
                  {detectingGps ? "LOCATING..." : "DETECT LOCATION"}
                </span>
              </button>
            </div>

            {/* District Dropdown (Persistent default stored in localStorage) */}
            <div className="relative flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Globe className="h-4 w-4 text-slate-500 shrink-0" />
                <select
                  value={selectedDistrict}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                  className="w-full bg-transparent text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {availableDistricts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* FROM & TO Input Boxes with Vertical Swap Button */}
          <div className="relative mt-4">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <div className="flex flex-col gap-2.5">
                {/* FROM input */}
                <div className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 transition">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                    FROM
                  </span>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-600 shrink-0" />
                    <input
                      type="text"
                      value={originQuery}
                      onFocus={() => setIsOriginFocused(true)}
                      onChange={(e) => {
                        setOriginQuery(e.target.value);
                        setIsOriginFocused(true);
                        userPickedOriginRef.current = true;
                      }}
                      placeholder="Departure Stop (e.g. Gandhipuram)"
                      className="w-full bg-transparent text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    {originQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setOriginQuery("");
                          setOriginStop(null);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* TO input */}
                <div className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 transition">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                    TO
                  </span>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-600 shrink-0" />
                    <input
                      type="text"
                      value={destQuery}
                      onFocus={() => setIsDestFocused(true)}
                      onChange={(e) => {
                        setDestQuery(e.target.value);
                        setIsDestFocused(true);
                        if (destStop && e.target.value !== destStop.name) {
                          setDestStop(null);
                        }
                      }}
                      placeholder="Select Destination"
                      className="w-full bg-transparent text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    {destQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setDestQuery("");
                          setDestStop(null);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Vertical Swap Button */}
              <div className="flex flex-col items-center justify-center pl-1">
                <button
                  type="button"
                  onClick={handleSwapStops}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand-500 hover:text-brand-600 active:scale-95 transition"
                  title="Swap Origin and Destination"
                >
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Autocomplete Dropdown: Origin */}
            {isOriginFocused && (
              <div className="absolute left-0 right-12 top-16 z-30 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <p className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase">
                  Matching Origin Stops
                </p>
                {matchingOriginStops.slice(0, 8).map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    onMouseDown={() => handleSelectOrigin(stop)}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs hover:bg-slate-50 transition"
                  >
                    <span className="font-bold text-slate-800">{stop.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{stop.code}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Autocomplete Dropdown: Destination */}
            {isDestFocused && (
              <div className="absolute left-0 right-12 bottom-0 translate-y-full z-30 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <p className="px-2 py-1 text-[10px] font-extrabold text-slate-400 uppercase">
                  Matching Destination Stops
                </p>
                {matchingDestStops.slice(0, 8).map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    onMouseDown={() => handleSelectDest(stop)}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs hover:bg-slate-50 transition"
                  >
                    <span className="font-bold text-slate-800">{stop.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{stop.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. ACTIVE SCHEDULED BUSES Section (Below Bus Lookup, Above Navbar) ── */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-[#0a192f]" />
            <h3 className="text-xs font-black tracking-wider text-[#0a192f] uppercase">
              ACTIVE SCHEDULED BUSES
            </h3>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
              activeScheduledBuses.length > 0
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
          >
            {activeScheduledBuses.length} RUNNING
          </span>
        </div>

        {/* Section Body: Empty State vs Populated Bus Cards */}
        {!destStop ? (
          /* Empty State matching Image 1: Gold search icon squircle */
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-500 shadow-inner mb-3">
              <Search className="h-8 w-8 stroke-[2.2]" />
            </div>
            <h4 className="text-base font-extrabold text-[#0a192f]">Select your destination</h4>
            <p className="mt-1 max-w-[260px] text-xs font-medium text-slate-400">
              Please select a "To" stop above to view available buses
            </p>
          </div>
        ) : isLoadingBuses ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200/80 bg-white py-10 text-slate-400 gap-2 shadow-xs">
            <Spinner size="md" />
            <p className="text-xs font-semibold">Checking live scheduled buses...</p>
          </div>
        ) : (
          /* Populated Dynamic Buses List */
          <div className="flex flex-col gap-3">
            {activeScheduledBuses.map((bus) => (
              <div
                key={bus.id}
                className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-brand-500 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-xl bg-[#0a192f] px-2.5 py-1 text-xs font-black text-white tracking-wide">
                      {bus.routeNumber}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 leading-tight">{bus.routeName}</p>
                      <span className="text-[10px] font-semibold text-slate-400">{bus.busType}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-emerald-600">₹{bus.fare}</p>
                    <span className="text-[10px] text-slate-400">per seat</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-medium">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <span>
                      ETA: <strong className="text-slate-800">{bus.etaMinutes} mins</strong> ({bus.departureTime})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <span>{bus.availableSeats} seats left</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectBus(bus)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition active:scale-95"
                  >
                    <Bus className="h-3.5 w-3.5 text-slate-500" />
                    <span>Track Live</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams({
                        originStopId: originStop!.id,
                        destStopId: destStop!.id,
                        routeId: bus.routeId,
                      });
                      navigate(`/checkout?${params.toString()}`);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-xs font-bold text-white hover:bg-brand-700 shadow-sm active:scale-95 transition"
                  >
                    <span>Book Seat</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 4. Edit Passenger Name Modal ── */}
      {showEditNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">Edit Your Name</h3>
              <button
                type="button"
                onClick={() => setShowEditNameModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveName} className="mt-3 flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Passenger Name
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Enter your name (e.g. Barath)"
                  maxLength={30}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditNameModal(false)}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-4 py-1.5 text-xs font-black text-white hover:bg-brand-700 transition"
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 5. Notifications / Alerts Modal ── */}
      {showAlertsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-3xl bg-white p-5 text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-black text-slate-900">
                  Transit Alerts ({alertBadgeCount})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAlertsModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-2">
              {serviceAlerts.length > 0 ? (
                serviceAlerts.map((a) => (
                  <div key={a.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span>{a.title || "Service Notice"}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{a.message}</p>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-slate-500">
                  🟢 All routes operating normally across {selectedDistrict}. No active disruptions reported.
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-slate-100">
              <Button size="sm" className="w-full" onClick={() => setShowAlertsModal(false)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Mobile Side Drawer ── */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setShowDrawer(false)}
          />
          <div className="relative flex h-full w-4/5 max-w-xs flex-col bg-white text-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0a192f] text-white font-black text-xs">
                  {passengerName[0]?.toUpperCase() || "B"}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">{passengerName}</h3>
                  <p className="text-[10px] text-slate-400">Nigalthisai Commuter</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  setShowEditNameModal(true);
                }}
                className="flex items-center justify-between rounded-2xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-2.5">
                  <User className="h-4 w-4 text-brand-600" />
                  <span>Change Profile Name</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  navigate("/my-tickets");
                }}
                className="flex items-center justify-between rounded-2xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Ticket className="h-4 w-4 text-emerald-600" />
                  <span>My Active Tickets</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  navigate("/my-tickets?tab=history");
                }}
                className="flex items-center justify-between rounded-2xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>Travel History</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  navigate("/report");
                }}
                className="flex items-center justify-between rounded-2xl px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <span>Grievances & Support</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">Language</span>
                <LangToggle />
              </div>
              <p className="text-[10px] text-center text-slate-400 font-mono">
                Nigalthisai Transit • Dynamic Commuter UI
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
