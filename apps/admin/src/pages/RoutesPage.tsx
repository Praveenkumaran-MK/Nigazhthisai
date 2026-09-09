import { useEffect, useState, useMemo } from "react";
import { Dialog, Button, Badge, Input, Select, useToast } from "@sbt/ui";
import type { Route, Stop, District } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";
import { useAdminAuth } from "../hooks/useAdminAuth";

interface RouteStopItem {
  id: string;
  stop_id: string;
  name: string;
  code: string;
  sequence_order: number;
}

interface WeeklyScheduleMap {
  [routeId: string]: number[]; // array of day_of_week (0=Sun, 1=Mon ... 6=Sat)
}

const DAYS = [
  { key: -1, label: "STANDARD (DEFAULT)", short: "STD" },
  { key: 0, label: "SUNDAY", short: "S" },
  { key: 1, label: "MONDAY", short: "M" },
  { key: 2, label: "TUESDAY", short: "T" },
  { key: 3, label: "WEDNESDAY", short: "W" },
  { key: 4, label: "THURSDAY", short: "T" },
  { key: 5, label: "FRIDAY", short: "F" },
  { key: 6, label: "SATURDAY", short: "S" },
];

export function RoutesPage() {
  const { profile } = useAdminAuth();
  const { push } = useToast();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklyScheduleMap>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("ALL");
  const [lang, setLang] = useState<"EN" | "TA">("EN");

  // Day-Wise Scheduler Modal State
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<number>(-1); // -1 = DEFAULT/STANDARD
  const [dayStopsMap, setDayStopsMap] = useState<Record<number, RouteStopItem[]>>({});
  const [selectedStopId, setSelectedStopId] = useState("");
  const [customStopName, setCustomStopName] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Route Timetable / Departures Quick Modal State
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [timetableRoute, setTimetableRoute] = useState<Route | null>(null);
  const [timetableSlots, setTimetableSlots] = useState<{ id: string; time: string; day: number }[]>([]);
  const [newSlotTime, setNewSlotTime] = useState("08:00");
  const [newSlotDay, setNewSlotDay] = useState("1");

  // Create Route Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newRouteNumber, setNewRouteNumber] = useState("");
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteCode, setNewRouteCode] = useState("");
  const [newRouteDistrictId, setNewRouteDistrictId] = useState("");
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);

  // Edit Route Modal State
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [editRouteNumber, setEditRouteNumber] = useState("");
  const [editRouteName, setEditRouteName] = useState("");
  const [editRouteCode, setEditRouteCode] = useState("");
  const [editRouteStatus, setEditRouteStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, stopsRes, districtsRes, schedulesRes] = await Promise.all([
        supabase.from("routes").select("*").order("route_number"),
        supabase.from("stops").select("*").order("name"),
        supabase.from("districts").select("*").order("name"),
        supabase.from("route_weekly_schedules").select("route_id, day_of_week"),
      ]);

      if (routesRes.error) throw routesRes.error;
      setRoutes((routesRes.data ?? []) as Route[]);
      setStops((stopsRes.data ?? []) as Stop[]);
      setDistricts((districtsRes.data ?? []) as District[]);

      // Group active schedule days per route
      const schedMap: WeeklyScheduleMap = {};
      (schedulesRes.data ?? []).forEach((s) => {
        if (!schedMap[s.route_id]) schedMap[s.route_id] = [];
        if (!schedMap[s.route_id]!.includes(s.day_of_week)) {
          schedMap[s.route_id]!.push(s.day_of_week);
        }
      });
      setWeeklySchedules(schedMap);
    } catch (err: any) {
      console.error("Failed to load routes data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Filtered routes
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (selectedDistrict !== "ALL" && r.district_id !== selectedDistrict) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const code = (r.code ?? r.route_number).toLowerCase();
        const name = r.name.toLowerCase();
        const num = r.route_number.toLowerCase();
        return code.includes(q) || name.includes(q) || num.includes(q);
      }
      return true;
    });
  }, [routes, selectedDistrict, search]);

  // Open Day-Wise Route Scheduler Modal
  const handleOpenScheduler = async (route: Route) => {
    setActiveRoute(route);
    setSelectedDayKey(-1); // Default standard
    setDayStopsMap({});
    setSchedulerOpen(true);

    try {
      // Load standard route_stops
      const { data: stdStops } = await supabase
        .from("route_stops")
        .select("id, stop_id, sequence_order, stops(id, name, code)")
        .eq("route_id", route.id)
        .order("sequence_order");

      // Load custom day overrides from route_day_stops
      const { data: dayStops } = await supabase
        .from("route_day_stops")
        .select("id, stop_id, day_of_week, sequence_order, stops(id, name, code)")
        .eq("route_id", route.id)
        .order("sequence_order");

      const map: Record<number, RouteStopItem[]> = {};

      // Standard sequence (-1)
      map[-1] = (stdStops ?? []).map((rs: any) => ({
        id: rs.id,
        stop_id: rs.stop_id,
        name: rs.stops?.name ?? "Stop",
        code: rs.stops?.code ?? "STP",
        sequence_order: rs.sequence_order,
      }));

      // Weekday sequences (0 to 6)
      for (let d = 0; d <= 6; d++) {
        const filtered = (dayStops ?? [])
          .filter((ds: any) => ds.day_of_week === d)
          .map((ds: any) => ({
            id: ds.id,
            stop_id: ds.stop_id,
            name: ds.stops?.name ?? "Stop",
            code: ds.stops?.code ?? "STP",
            sequence_order: ds.sequence_order,
          }));

        // Fallback to standard if no day override
        map[d] = filtered.length > 0 ? filtered : [...(map[-1] ?? [])];
      }

      setDayStopsMap(map);
    } catch (e) {
      console.error("Failed to load stops for scheduler:", e);
    }
  };

  // Add stop to current day sequence
  const handleAddStopToSequence = () => {
    if (!selectedStopId && !customStopName.trim()) return;

    let stopName = customStopName.trim();
    let stopCode = "CUST";
    let targetStopId = selectedStopId;

    if (selectedStopId) {
      const found = stops.find((s) => s.id === selectedStopId);
      if (found) {
        stopName = found.name;
        stopCode = found.code;
        targetStopId = found.id;
      }
    }

    if (!targetStopId) {
      push({ tone: "warning", title: "Please select a pre-defined stop to ensure database integrity." });
      return;
    }

    const currentList = dayStopsMap[selectedDayKey] ?? [];
    const newItem: RouteStopItem = {
      id: "temp-" + Math.random(),
      stop_id: targetStopId,
      name: stopName,
      code: stopCode,
      sequence_order: currentList.length + 1,
    };

    setDayStopsMap((prev) => ({
      ...prev,
      [selectedDayKey]: [...currentList, newItem],
    }));

    setSelectedStopId("");
    setCustomStopName("");
  };

  // Move stop Up / Down
  const handleMoveStop = (index: number, direction: "up" | "down") => {
    const list = [...(dayStopsMap[selectedDayKey] ?? [])];
    if (direction === "up" && index > 0) {
      const temp = list[index - 1]!;
      list[index - 1] = list[index]!;
      list[index] = temp;
    } else if (direction === "down" && index < list.length - 1) {
      const temp = list[index + 1]!;
      list[index + 1] = list[index]!;
      list[index] = temp;
    }

    // Re-index sequence_order
    const updated = list.map((item, idx) => ({ ...item, sequence_order: idx + 1 }));
    setDayStopsMap((prev) => ({ ...prev, [selectedDayKey]: updated }));
  };

  // Remove stop
  const handleRemoveStop = (index: number) => {
    const list = [...(dayStopsMap[selectedDayKey] ?? [])];
    list.splice(index, 1);
    const updated = list.map((item, idx) => ({ ...item, sequence_order: idx + 1 }));
    setDayStopsMap((prev) => ({ ...prev, [selectedDayKey]: updated }));
  };

  // Save Entire Day-Wise Schedule
  const handleSaveEntireSchedule = async () => {
    if (!activeRoute) return;
    setIsSavingSchedule(true);
    try {
      // Save each configured day sequence via RPC save_route_day_stops
      for (const [dayKeyStr, stopsList] of Object.entries(dayStopsMap)) {
        const dayKey = parseInt(dayKeyStr, 10);
        const stopIds = stopsList.map((s) => s.stop_id);
        const { error } = await supabase.rpc("save_route_day_stops", {
          p_route_id: activeRoute.id,
          p_day_of_week: dayKey,
          p_stop_ids: stopIds,
        });
        if (error) throw error;
      }

      push({ tone: "success", title: "Day-Wise Route Schedule Saved Successfully" });
      setSchedulerOpen(false);
      await loadData();
    } catch (err: any) {
      alert("Failed to save schedule: " + err.message);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Open Timetable Modal (Clock Icon)
  const handleOpenTimetable = async (route: Route) => {
    setTimetableRoute(route);
    setTimetableOpen(true);
    try {
      const { data } = await supabase
        .from("route_weekly_schedules")
        .select("id, departure_time, day_of_week")
        .eq("route_id", route.id)
        .order("day_of_week")
        .order("departure_time");

      setTimetableSlots(
        (data ?? []).map((d: any) => ({
          id: d.id,
          time: d.departure_time.slice(0, 5),
          day: d.day_of_week,
        }))
      );
    } catch (e) {
      console.error("Failed to load departures:", e);
    }
  };

  // Add Departure Slot
  const handleAddDepartureSlot = async () => {
    if (!timetableRoute || !newSlotTime) return;
    try {
      const { data, error } = await supabase
        .from("route_weekly_schedules")
        .insert({
          route_id: timetableRoute.id,
          departure_time: newSlotTime,
          day_of_week: parseInt(newSlotDay, 10),
          is_active: true,
        })
        .select("id, departure_time, day_of_week")
        .single();

      if (error) throw error;
      setTimetableSlots((prev) => [
        ...prev,
        { id: data.id, time: data.departure_time.slice(0, 5), day: data.day_of_week },
      ]);
      push({ tone: "success", title: "Departure Slot Added" });
    } catch (e: any) {
      alert("Failed to add departure slot: " + e.message);
    }
  };

  // Delete Departure Slot
  const handleDeleteDepartureSlot = async (id: string) => {
    try {
      await supabase.from("route_weekly_schedules").delete().eq("id", id);
      setTimetableSlots((prev) => prev.filter((s) => s.id !== id));
      push({ tone: "success", title: "Departure Slot Removed" });
    } catch (e: any) {
      alert("Failed to delete slot: " + e.message);
    }
  };

  // Create Route
  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouteNumber.trim() || !newRouteName.trim()) return;
    setIsCreatingRoute(true);
    try {
      const code = newRouteCode.trim() || newRouteNumber.trim().toUpperCase();
      const { error } = await supabase.from("routes").insert({
        route_number: newRouteNumber.trim(),
        name: newRouteName.trim(),
        code: code,
        district_id: newRouteDistrictId || null,
        is_active: true,
      });

      if (error) throw error;
      push({ tone: "success", title: "Route Created Successfully" });
      setCreateOpen(false);
      setNewRouteNumber("");
      setNewRouteName("");
      setNewRouteCode("");
      setNewRouteDistrictId("");
      await loadData();
    } catch (e: any) {
      alert("Failed to create route: " + e.message);
    } finally {
      setIsCreatingRoute(false);
    }
  };

  // Edit Route
  const handleOpenEditRoute = (r: Route) => {
    setEditingRoute(r);
    setEditRouteNumber(r.route_number);
    setEditRouteName(r.name);
    setEditRouteCode(r.code ?? r.route_number);
    setEditRouteStatus(r.is_active === false ? "INACTIVE" : "ACTIVE");
  };

  const handleUpdateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoute) return;
    setIsUpdatingRoute(true);
    try {
      const { error } = await supabase
        .from("routes")
        .update({
          route_number: editRouteNumber.trim(),
          name: editRouteName.trim(),
          code: editRouteCode.trim() || editRouteNumber.trim().toUpperCase(),
          is_active: editRouteStatus === "ACTIVE",
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingRoute.id);

      if (error) throw error;
      push({ tone: "success", title: "Route Updated Successfully" });
      setEditingRoute(null);
      await loadData();
    } catch (e: any) {
      alert("Failed to update route: " + e.message);
    } finally {
      setIsUpdatingRoute(false);
    }
  };

  // Delete Route
  const handleDeleteRoute = async (r: Route) => {
    if (!confirm(`Are you sure you want to delete route ${r.route_number} (${r.name})?`)) return;
    try {
      const { error } = await supabase.from("routes").delete().eq("id", r.id);
      if (error) throw error;
      push({ tone: "success", title: "Route Deleted" });
      await loadData();
    } catch (e: any) {
      alert("Failed to delete route: " + e.message);
    }
  };

  const currentStopsList = dayStopsMap[selectedDayKey] ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* ─── TOP OPERATIONS HEADER BAR ─── */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span>✕</span>
            <span>BACK</span>
          </button>
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              OPERATIONS
            </h1>
            <p className="text-xs font-medium text-slate-500">Route Configuration & Dynamic Weekly Schedules</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Language Toggle EN | TA */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setLang("EN")}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                lang === "EN" ? "bg-navy-900 text-white shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("TA")}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                lang === "TA" ? "bg-navy-900 text-white shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              TA
            </button>
          </div>

          {/* Bell Notification */}
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span>🔔</span>
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500"></span>
          </div>

          {/* Admin Avatar */}
          <div className="flex items-center gap-2 pl-2">
            <div className="text-right">
              <p className="text-xs font-extrabold uppercase text-slate-900 dark:text-slate-100">
                {profile?.role === "master_admin" ? "MASTER ADMIN" : "DISTRICT ADMIN"}
              </p>
              <p className="text-[10px] font-semibold text-amber-600">
                {profile?.role === "master_admin" ? "MASTER ADMIN" : "AUTHORIZED"}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700 shadow-sm">
              👤
            </div>
          </div>
        </div>
      </div>

      {/* ─── SEARCH & FILTER CONTROLS ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input
              type="text"
              placeholder="Search routes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {/* District Filter Pill */}
          <div className="relative">
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-8 text-xs font-bold uppercase text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="ALL">ALL DISTRICT</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name.toUpperCase()}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-500">
              🔻
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <span>+</span>
            <span>CREATE ROUTE</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (routes.length > 0) handleOpenScheduler(routes[0]!);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700"
          >
            <span className="text-amber-400">+</span>
            <span>START SETUP WIZARD</span>
          </button>
        </div>
      </div>

      {/* ─── ROUTES DATA TABLE ─── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-800/60 text-slate-500 font-extrabold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5 text-left">ROUTE ID</th>
                <th className="px-5 py-3.5 text-left">ROUTE NAME</th>
                <th className="px-5 py-3.5 text-left">CODE</th>
                <th className="px-5 py-3.5 text-left">DYNAMIC SCHEDULE</th>
                <th className="px-5 py-3.5 text-left">STATUS</th>
                <th className="px-5 py-3.5 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading routes and schedules…
                  </td>
                </tr>
              ) : filteredRoutes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No routes found matching filter.
                  </td>
                </tr>
              ) : (
                filteredRoutes.map((r, idx) => {
                  const routeCode = r.code ?? r.route_number;
                  const activeDays = weeklySchedules[r.id] ?? [];
                  const isActive = r.is_active !== false;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      {/* ROUTE ID */}
                      <td className="px-5 py-4 font-bold text-slate-500">#{idx + 1}</td>

                      {/* ROUTE NAME */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-inner dark:bg-slate-800 dark:text-slate-300">
                            📍
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                              {r.name}
                            </p>
                            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mt-0.5">
                              STANDARD ROUTE ACTIVE
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* CODE */}
                      <td className="px-5 py-4">
                        <span className="inline-block rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {routeCode}
                        </span>
                      </td>

                      {/* DYNAMIC SCHEDULE (S M T W T F S) */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {["S", "M", "T", "W", "T", "F", "S"].map((dayLetter, dayIdx) => {
                              const hasDaySchedule = activeDays.includes(dayIdx);
                              const isToday = new Date().getDay() === dayIdx;
                              return (
                                <span
                                  key={dayIdx}
                                  title={`Day: ${dayLetter} (${hasDaySchedule ? "Configured" : "Standard"})`}
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold transition ${
                                    hasDaySchedule
                                      ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-400/40"
                                      : isToday
                                      ? "bg-slate-200 text-slate-800 font-bold"
                                      : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                                  }`}
                                >
                                  {dayLetter}
                                </span>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenScheduler(r)}
                            className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-brand-600 transition"
                          >
                            VIEW SCHEDULE
                          </button>
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                            isActive
                              ? "bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>

                      {/* ACTIONS (Clock, Calendar, Edit, Delete) */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-slate-400">
                          {/* Timetable Clock */}
                          <button
                            type="button"
                            title="Timetable Departures"
                            onClick={() => handleOpenTimetable(r)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800"
                          >
                            ⏱️
                          </button>

                          {/* Day-Wise Calendar */}
                          <button
                            type="button"
                            title="Day-Wise Route Scheduler"
                            onClick={() => handleOpenScheduler(r)}
                            className="p-1.5 rounded-lg hover:bg-amber-50 hover:text-amber-600 transition"
                          >
                            📅
                          </button>

                          {/* Edit Route */}
                          <button
                            type="button"
                            title="Edit Route"
                            onClick={() => handleOpenEditRoute(r)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800"
                          >
                            ✏️
                          </button>

                          {/* Delete Route */}
                          <button
                            type="button"
                            title="Delete Route"
                            onClick={() => handleDeleteRoute(r)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Pagination Info */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] font-bold uppercase text-slate-400 dark:border-slate-800">
          <span>SHOWING 1 TO {filteredRoutes.length} OF {filteredRoutes.length} ROUTES</span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════════
          DAY-WISE ROUTE SCHEDULER MODAL (MATCHING SCREENSHOT 2)
      ════════════════════════════════════════════════════════════════════════════ */}
      {schedulerOpen && activeRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-2xl text-white shadow-md shadow-amber-500/20">
                  📅
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    DAY-WISE ROUTE SCHEDULER
                  </h2>
                  <p className="text-xs font-bold text-slate-500 uppercase">
                    EDITING: {activeRoute.name} ({activeRoute.code ?? activeRoute.route_number})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSchedulerOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: 2-Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 min-h-[420px]">
              {/* Left Sidebar: Standard + Weekly Schedule Days */}
              <div className="md:col-span-4 border-r border-slate-100 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                {/* Standard / Default Tab */}
                <button
                  type="button"
                  onClick={() => setSelectedDayKey(-1)}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
                    selectedDayKey === -1
                      ? "bg-white text-navy-900 shadow-sm border border-slate-200 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                      : "text-slate-600 hover:bg-white/60 dark:text-slate-400"
                  }`}
                >
                  <span>STANDARD (DEFAULT)</span>
                  <span className={selectedDayKey === -1 ? "text-amber-500" : "text-slate-300"}>
                    ✓
                  </span>
                </button>

                <p className="mt-5 mb-2 px-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  WEEKLY SCHEDULE
                </p>

                <div className="flex flex-col gap-1">
                  {DAYS.filter((d) => d.key !== -1).map((day) => {
                    const isSelected = selectedDayKey === day.key;
                    const hasCustomOverrides = (dayStopsMap[day.key] ?? []).length > 0;

                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => setSelectedDayKey(day.key)}
                        className={`w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide transition ${
                          isSelected
                            ? "bg-white text-navy-900 shadow-sm border border-slate-200 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                            : "text-slate-600 hover:bg-white/60 dark:text-slate-400"
                        }`}
                      >
                        <span>{day.label}</span>
                        <span
                          className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] ${
                            isSelected
                              ? "bg-amber-500 text-white"
                              : hasCustomOverrides
                              ? "bg-slate-200 text-slate-600"
                              : "border border-slate-300 text-transparent"
                          }`}
                        >
                          {isSelected ? "●" : "○"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Main Content: Stop Sequence Editor */}
              <div className="md:col-span-8 p-6 flex flex-col gap-5 overflow-y-auto max-h-[500px]">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>⏱️</span>
                    <span>
                      STOPS SEQUENCE FOR {DAYS.find((d) => d.key === selectedDayKey)?.label ?? "DEFAULT"}
                    </span>
                  </h3>
                </div>

                {/* Add Stop to Sequence Card */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3">
                    ADD STOP TO SEQUENCE
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* Pre-defined Stop Dropdown */}
                    <div className="relative flex-1">
                      <select
                        value={selectedStopId}
                        onChange={(e) => {
                          setSelectedStopId(e.target.value);
                          if (e.target.value) setCustomStopName("");
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-4 text-xs font-medium text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">-- Select Pre-defined Stop --</option>
                        {stops.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                        📍
                      </span>
                    </div>

                    {/* Custom Stop Input */}
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Or type custom..."
                        value={customStopName}
                        onChange={(e) => {
                          setCustomStopName(e.target.value);
                          if (e.target.value) setSelectedStopId("");
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>

                    {/* Add Stop Button */}
                    <button
                      type="button"
                      onClick={handleAddStopToSequence}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white shadow-md hover:bg-slate-800 transition dark:bg-brand-600 shrink-0"
                    >
                      + ADD STOP
                    </button>
                  </div>

                  <p className="mt-2 text-[9px] font-semibold text-rose-500">
                    * HIGHLY RECOMMENDED: USE PRE-DEFINED STOPS FROM THE STOPS DATABASE TO GUARANTEE RELATIONAL INTEGRITY.
                  </p>
                </div>

                {/* Stop Sequence Nodes List */}
                <div className="flex flex-col gap-3 relative before:absolute before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                  {currentStopsList.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400 italic">
                      No stops in this sequence yet. Add stops using the form above.
                    </p>
                  ) : (
                    currentStopsList.map((stop, idx) => (
                      <div
                        key={stop.id || idx}
                        className="relative z-10 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:shadow dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="flex items-center gap-3">
                          {/* Step Index Badge */}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-extrabold text-white shadow">
                            {String(idx + 1).padStart(2, "0")}
                          </div>

                          <div>
                            <p className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">
                              {stop.name}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mt-0.5">
                              VERIFIED STOP POINT
                            </p>
                          </div>
                        </div>

                        {/* Node Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Move Up"
                            onClick={() => handleMoveStop(idx, "up")}
                            disabled={idx === 0}
                            className="p-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            title="Move Down"
                            onClick={() => handleMoveStop(idx, "down")}
                            disabled={idx === currentStopsList.length - 1}
                            className="p-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            title="Remove Stop"
                            onClick={() => handleRemoveStop(idx)}
                            className="p-1 text-xs text-rose-500 hover:text-rose-700 ml-1"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex items-center gap-4 text-[10px] font-extrabold tracking-wider uppercase text-slate-500">
                <span className="flex items-center gap-1.5 text-amber-600">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  AUTO-DETECTION ENABLED
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-600 dark:text-slate-300">
                  DYNAMIC FALLBACK LOGIC: ACTIVE
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSchedulerOpen(false)}
                  disabled={isSavingSchedule}
                  className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200/60 transition"
                >
                  DISCARD CHANGES
                </button>

                <button
                  type="button"
                  onClick={handleSaveEntireSchedule}
                  disabled={isSavingSchedule}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-700"
                >
                  {isSavingSchedule ? "SAVING…" : "💾 SAVE ENTIRE SCHEDULE"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════
          TIMETABLE / DEPARTURES QUICK MODAL (CLOCK ICON)
      ════════════════════════════════════════════════════════════════════════════ */}
      {timetableOpen && timetableRoute && (
        <Dialog
          open={true}
          onClose={() => setTimetableOpen(false)}
          title={`Departure Timetable: ${timetableRoute.name} (${timetableRoute.code ?? timetableRoute.route_number})`}
        >
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs">
              <input
                type="time"
                value={newSlotTime}
                onChange={(e) => setNewSlotTime(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono font-bold"
              />
              <select
                value={newSlotDay}
                onChange={(e) => setNewSlotDay(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
              >
                {DAYS.filter((d) => d.key !== -1).map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handleAddDepartureSlot}>
                + Add Time Slot
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
              {timetableSlots.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">No departure slots configured yet.</p>
              ) : (
                timetableSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-3 font-mono">
                      <span className="font-bold text-emerald-600 text-sm">{slot.time}</span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {DAYS.find((d) => d.key === slot.day)?.label ?? "Day"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDepartureSlot(slot.id)}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Dialog>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════
          CREATE ROUTE MODAL
      ════════════════════════════════════════════════════════════════════════════ */}
      {createOpen && (
        <Dialog open={true} onClose={() => setCreateOpen(false)} title="Create New Route">
          <form onSubmit={handleCreateRoute} className="flex flex-col gap-4 py-2">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Route Number</label>
              <Input
                placeholder="e.g. 12A, TUP-AVI"
                value={newRouteNumber}
                onChange={(e) => setNewRouteNumber(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Route Name</label>
              <Input
                placeholder="e.g. Tiruppur Old Bus Stand – Avinashi"
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Route Code (Optional)</label>
              <Input
                placeholder="e.g. TUP-AVI"
                value={newRouteCode}
                onChange={(e) => setNewRouteCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">District Jurisdiction</label>
              <Select
                value={newRouteDistrictId}
                onChange={(e) => setNewRouteDistrictId(e.target.value)}
                options={[
                  { value: "", label: "— System-wide / Unassigned —" },
                  ...districts.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isCreatingRoute}>
                Create Route
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════
          EDIT ROUTE MODAL
      ════════════════════════════════════════════════════════════════════════════ */}
      {editingRoute && (
        <Dialog open={true} onClose={() => setEditingRoute(null)} title={`Edit Route #${editingRoute.route_number}`}>
          <form onSubmit={handleUpdateRoute} className="flex flex-col gap-4 py-2">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Route Number</label>
              <Input
                value={editRouteNumber}
                onChange={(e) => setEditRouteNumber(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Route Name</label>
              <Input
                value={editRouteName}
                onChange={(e) => setEditRouteName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Route Code</label>
              <Input
                value={editRouteCode}
                onChange={(e) => setEditRouteCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Status</label>
              <Select
                value={editRouteStatus}
                onChange={(e) => setEditRouteStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" type="button" onClick={() => setEditingRoute(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isUpdatingRoute}>
                Save Changes
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
