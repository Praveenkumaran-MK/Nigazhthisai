import { useEffect, useState, useMemo } from "react";
import { Dialog, Button, Badge, Input, Select, useToast } from "@sbt/ui";
import {
  MapPinIcon,
  ClockIcon,
  CalendarIcon,
  EditIcon,
  TrashIcon,
  PlusIcon,
  FilterIcon,
  CheckCircleIcon,
} from "@sbt/ui";
import type { Route, Stop, District } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";
import { useAdminAuth } from "../hooks/useAdminAuth";

interface RouteStopItem {
  id: string;
  stop_id: string;
  name: string;
  code: string;
  sequence_order: number;
  expected_arrival_time?: string;
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

  // Day-Wise Scheduler Modal State
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<number>(-1); // -1 = DEFAULT/STANDARD
  const [dayStopsMap, setDayStopsMap] = useState<Record<number, RouteStopItem[]>>({});
  const [selectedStopId, setSelectedStopId] = useState("");
  const [customStopName, setCustomStopName] = useState("");
  const [stopEta, setStopEta] = useState("");
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

  // Open Scheduler modal for a route
  const handleOpenScheduler = async (route: Route) => {
    setActiveRoute(route);
    setSelectedDayKey(-1);
    setSelectedStopId("");
    setCustomStopName("");
    setStopEta("");
    setSchedulerOpen(true);

    try {
      // 1. Fetch standard route stops (with fallback)
      let stdStops: any[] = [];
      const stdResWithEta = await supabase
        .from("route_stops")
        .select("id, stop_id, sequence_order, expected_arrival_time, stops(name, code)")
        .eq("route_id", route.id)
        .order("sequence_order");

      if (stdResWithEta.data && !stdResWithEta.error) {
        stdStops = stdResWithEta.data;
      } else {
        const stdResFallback = await supabase
          .from("route_stops")
          .select("id, stop_id, sequence_order, stops(name, code)")
          .eq("route_id", route.id)
          .order("sequence_order");
        stdStops = stdResFallback.data ?? [];
      }

      // 2. Fetch day-specific overrides (with fallback)
      let dayStops: any[] = [];
      const dayResWithEta = await supabase
        .from("route_day_stops")
        .select("id, stop_id, sequence_order, day_of_week, expected_arrival_time, stops(name, code)")
        .eq("route_id", route.id)
        .order("sequence_order");

      if (dayResWithEta.data && !dayResWithEta.error) {
        dayStops = dayResWithEta.data;
      } else {
        const dayResFallback = await supabase
          .from("route_day_stops")
          .select("id, stop_id, sequence_order, day_of_week, stops(name, code)")
          .eq("route_id", route.id)
          .order("sequence_order");
        dayStops = dayResFallback.data ?? [];
      }

      const map: Record<number, RouteStopItem[]> = {};

      // Standard (-1)
      map[-1] = (stdStops ?? []).map((s: any) => ({
        id: s.id,
        stop_id: s.stop_id,
        name: s.stops?.name ?? "Stop",
        code: s.stops?.code ?? "STP",
        sequence_order: s.sequence_order,
        expected_arrival_time: s.expected_arrival_time ?? "",
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
            expected_arrival_time: ds.expected_arrival_time ?? "",
          }));

        // Fallback to standard if no day override
        map[d] = filtered.length > 0 ? filtered : [...(map[-1] ?? [])];
      }

      setDayStopsMap(map);
    } catch (e) {
      console.error("Failed to load stops for scheduler:", e);
    }
  };

  // Add stop to current day sequence with ETA
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
      push({ tone: "warning", title: "Please select a verified stop from the database." });
      return;
    }

    const currentList = dayStopsMap[selectedDayKey] ?? [];
    const newItem: RouteStopItem = {
      id: "temp-" + Math.random(),
      stop_id: targetStopId,
      name: stopName,
      code: stopCode,
      sequence_order: currentList.length + 1,
      expected_arrival_time: stopEta.trim() || undefined,
    };

    setDayStopsMap((prev) => ({
      ...prev,
      [selectedDayKey]: [...currentList, newItem],
    }));

    setSelectedStopId("");
    setCustomStopName("");
    setStopEta("");
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

    const updated = list.map((item, idx) => ({ ...item, sequence_order: idx + 1 }));
    setDayStopsMap((prev) => ({ ...prev, [selectedDayKey]: updated }));
  };

  // Update stop ETA inline
  const handleUpdateStopEta = (index: number, etaValue: string) => {
    const list = [...(dayStopsMap[selectedDayKey] ?? [])];
    if (list[index]) {
      list[index] = { ...list[index]!, expected_arrival_time: etaValue };
      setDayStopsMap((prev) => ({ ...prev, [selectedDayKey]: list }));
    }
  };

  // Remove stop
  const handleRemoveStop = (index: number) => {
    const list = [...(dayStopsMap[selectedDayKey] ?? [])];
    list.splice(index, 1);
    const updated = list.map((item, idx) => ({ ...item, sequence_order: idx + 1 }));
    setDayStopsMap((prev) => ({ ...prev, [selectedDayKey]: updated }));
  };

  // Save Schedule sequence with ETAs
  const handleSaveSchedule = async () => {
    if (!activeRoute) return;
    setIsSavingSchedule(true);
    try {
      const currentList = dayStopsMap[selectedDayKey] ?? [];
      const payload = currentList.map((s, idx) => ({
        stop_id: s.stop_id,
        sequence_order: idx + 1,
        expected_arrival_time: s.expected_arrival_time || null,
      }));

      // 1. Try modern RPC with ETAs (migration 040)
      const { error: rpcErr } = await supabase.rpc("save_route_day_stops", {
        p_route_id: activeRoute.id,
        p_day_of_week: selectedDayKey,
        p_stops: payload,
      });

      if (rpcErr) {
        // 2. Try legacy RPC with stop_ids array (migration 033)
        const stopIds = currentList.map((s) => s.stop_id);
        const { error: legacyErr } = await supabase.rpc("save_route_day_stops", {
          p_route_id: activeRoute.id,
          p_day_of_week: selectedDayKey,
          p_stop_ids: stopIds,
        });

        if (legacyErr) {
          // 3. Fallback: Direct table operations
          await supabase
            .from("route_day_stops")
            .delete()
            .eq("route_id", activeRoute.id)
            .eq("day_of_week", selectedDayKey);

          if (currentList.length > 0) {
            const rows = currentList.map((s, idx) => ({
              route_id: activeRoute.id,
              day_of_week: selectedDayKey,
              stop_id: s.stop_id,
              sequence_order: idx + 1,
            }));
            const { error: insErr } = await supabase.from("route_day_stops").insert(rows);
            if (insErr) throw insErr;
          }
        }
      }

      push({
        tone: "success",
        title: "Schedule & Stop Sequence Saved",
        description: `Updated ${currentList.length} stops for ${
          DAYS.find((d) => d.key === selectedDayKey)?.label
        }`,
      });

      await loadData();
    } catch (err: any) {
      alert("Failed to save schedule: " + err.message);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Open Timetable Departures
  const handleOpenTimetable = (route: Route) => {
    setTimetableRoute(route);
    setTimetableSlots([
      { id: "1", time: "06:30", day: 1 },
      { id: "2", time: "08:15", day: 1 },
      { id: "3", time: "11:45", day: 1 },
      { id: "4", time: "14:30", day: 1 },
      { id: "5", time: "17:00", day: 1 },
      { id: "6", time: "19:45", day: 1 },
    ]);
    setTimetableOpen(true);
  };

  const handleAddSlot = () => {
    if (!newSlotTime) return;
    setTimetableSlots((prev) => [
      ...prev,
      { id: String(Date.now()), time: newSlotTime, day: Number(newSlotDay) },
    ]);
  };

  const handleRemoveSlot = (id: string) => {
    setTimetableSlots((prev) => prev.filter((s) => s.id !== id));
  };

  // Create Route
  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouteNumber.trim() || !newRouteName.trim()) return;

    setIsCreatingRoute(true);
    try {
      const code = (newRouteCode.trim() || newRouteNumber.trim()).toUpperCase();
      const districtId = newRouteDistrictId || profile?.district_id || null;

      const { error } = await supabase.from("routes").insert({
        route_number: newRouteNumber.trim(),
        name: newRouteName.trim(),
        code: code,
        district_id: districtId,
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

  // Edit Route Modal
  const handleOpenEditRoute = (r: Route) => {
    setEditingRoute(r);
    setEditRouteNumber(r.route_number);
    setEditRouteName(r.name);
    setEditRouteCode(r.code ?? r.route_number);
    setEditRouteStatus(r.is_active !== false ? "ACTIVE" : "INACTIVE");
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
      {/* ─── TOP OPERATIONS HEADER BAR (Requirement 7: Clean title only) ─── */}
      <div className="flex flex-col gap-1 border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-extrabold uppercase tracking-wide text-slate-900 dark:text-slate-100">
          OPERATIONS
        </h1>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Route Configuration & Dynamic Weekly Schedules
        </p>
      </div>

      {/* ─── SEARCH & FILTER CONTROLS ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by route code, name, or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-xs font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="relative">
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-xs font-bold uppercase text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="ALL">ALL DISTRICTS</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <PlusIcon size={14} />
            <span>CREATE ROUTE</span>
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
                            <MapPinIcon size={16} />
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
                            className="text-[11px] font-bold uppercase tracking-wider text-brand-600 hover:text-brand-700 transition"
                          >
                            Configure Stops & ETA
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

                      {/* ACTIONS */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-slate-500">
                          <button
                            type="button"
                            title="Timetable Departures"
                            onClick={() => handleOpenTimetable(r)}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            <ClockIcon size={14} />
                          </button>

                          <button
                            type="button"
                            title="Configure Stops & ETAs"
                            onClick={() => handleOpenScheduler(r)}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            <CalendarIcon size={14} />
                          </button>

                          <button
                            type="button"
                            title="Edit Route"
                            onClick={() => handleOpenEditRoute(r)}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            <EditIcon size={14} />
                          </button>

                          <button
                            type="button"
                            title="Delete Route"
                            onClick={() => handleDeleteRoute(r)}
                            className="p-2 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 transition dark:border-rose-900/40 dark:hover:bg-rose-950/40"
                          >
                            <TrashIcon size={14} />
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
      </div>

      {/* ─── DAY-WISE SCHEDULER & STOP-LEVEL ETA MODAL (Requirements 1 & 7) ─── */}
      <Dialog
        open={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
        title={`Configure Route Stops & Schedule ETA: ${activeRoute?.route_number ?? ""}`}
      >
        {activeRoute && (
          <div className="flex flex-col gap-4">
            <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-500">
                Route: <span className="font-bold text-slate-900 dark:text-slate-100">{activeRoute.name}</span> ({activeRoute.code ?? activeRoute.route_number})
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Set sequence order and Expected Time of Arrival (ETA) for each stopping point. This powers the live visual pipeline.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 min-h-[420px] rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
              {/* Left Sidebar: Standard + Weekly Schedule Days */}
              <div className="md:col-span-4 border-r border-slate-200 p-3 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                <button
                  type="button"
                  onClick={() => setSelectedDayKey(-1)}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider transition ${
                    selectedDayKey === -1
                      ? "bg-white text-navy-900 shadow-sm border border-slate-200 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                      : "text-slate-600 hover:bg-white/60 dark:text-slate-400"
                  }`}
                >
                  <span>STANDARD (DEFAULT)</span>
                  <span className={selectedDayKey === -1 ? "text-amber-500 font-bold" : "text-slate-300"}>
                    Active
                  </span>
                </button>

                <p className="mt-4 mb-2 px-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  WEEKDAY OVERRIDES
                </p>

                <div className="flex flex-col gap-1">
                  {DAYS.filter((d) => d.key !== -1).map((day) => {
                    const isSelected = selectedDayKey === day.key;
                    const count = (dayStopsMap[day.key] ?? []).length;

                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => setSelectedDayKey(day.key)}
                        className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition ${
                          isSelected
                            ? "bg-white text-navy-900 shadow-sm border border-slate-200 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                            : "text-slate-600 hover:bg-white/60 dark:text-slate-400"
                        }`}
                      >
                        <span>{day.label}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {count > 0 ? `${count} stops` : "Default"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Content: Stops & ETA Sequence Builder */}
              <div className="md:col-span-8 p-4 flex flex-col gap-4 overflow-y-auto max-h-[500px]">
                {/* Add Stop with ETA Form */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2.5">
                    Add Stop & Expected Arrival Time (ETA)
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-7">
                      <select
                        value={selectedStopId}
                        onChange={(e) => {
                          setSelectedStopId(e.target.value);
                          if (e.target.value) setCustomStopName("");
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">-- Select Stop Point --</option>
                        {stops.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        placeholder="ETA (e.g. 08:30 AM)"
                        value={stopEta}
                        onChange={(e) => setStopEta(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddStopToSequence}
                        className="w-full h-full rounded-lg bg-slate-900 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition dark:bg-brand-600 dark:hover:bg-brand-500"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stops Sequence Node List */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                    <span>Stop Progression ({currentStopsList.length} stops)</span>
                    <span>Expected Arrival Time</span>
                  </div>

                  {currentStopsList.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400 italic">
                      No stops in this schedule sequence yet. Add stops above.
                    </p>
                  ) : (
                    currentStopsList.map((stop, idx) => (
                      <div
                        key={stop.id || idx}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/80 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                              {stop.name}
                            </p>
                            <p className="text-[10px] text-slate-400 uppercase font-mono">
                              {stop.code}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Set ETA..."
                            value={stop.expected_arrival_time ?? ""}
                            onChange={(e) => handleUpdateStopEta(idx, e.target.value)}
                            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono font-semibold text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 text-right"
                          />

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveStop(idx, "up")}
                              disabled={idx === 0}
                              className="px-1.5 py-1 text-xs text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStop(idx, "down")}
                              disabled={idx === currentStopsList.length - 1}
                              className="px-1.5 py-1 text-xs text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveStop(idx)}
                              className="px-1.5 py-1 text-xs text-rose-500 hover:text-rose-700"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setSchedulerOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSchedule} disabled={isSavingSchedule}>
                {isSavingSchedule ? "Saving Schedule…" : "Save Route Stops & ETAs"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ─── ROUTE DEPARTURES TIMETABLE MODAL ─── */}
      <Dialog
        open={timetableOpen}
        onClose={() => setTimetableOpen(false)}
        title={`Departure Timetable: ${timetableRoute?.route_number ?? ""}`}
      >
        {timetableRoute && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-slate-500">
              Configure daily scheduled departure slot times for route {timetableRoute.name}.
            </p>

            <div className="flex gap-2">
              <Input
                label="Departure Time"
                type="time"
                value={newSlotTime}
                onChange={(e) => setNewSlotTime(e.target.value)}
              />
              <div className="flex items-end">
                <Button onClick={handleAddSlot}>+ Add Slot</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {timetableSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800"
                >
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {slot.time}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(slot.id)}
                    className="text-rose-500 hover:text-rose-700 font-bold ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button onClick={() => setTimetableOpen(false)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ─── CREATE ROUTE MODAL ─── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Route">
        <form onSubmit={handleCreateRoute} className="flex flex-col gap-4 py-1">
          <Input
            label="Route Number"
            required
            placeholder="e.g. 101, 12A, 54B"
            value={newRouteNumber}
            onChange={(e) => setNewRouteNumber(e.target.value)}
          />

          <Input
            label="Route Name"
            required
            placeholder="e.g. Tiruppur Old Bus Stand — Avinashi"
            value={newRouteName}
            onChange={(e) => setNewRouteName(e.target.value)}
          />

          <Input
            label="Route Short Code (Optional)"
            placeholder="e.g. TUP-AVI"
            value={newRouteCode}
            onChange={(e) => setNewRouteCode(e.target.value)}
          />

          <Select
            label="District Scope"
            value={newRouteDistrictId}
            onChange={(e) => setNewRouteDistrictId(e.target.value)}
            options={[
              { value: "", label: "— Automatic / Current Admin District —" },
              ...districts.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreatingRoute}>
              {isCreatingRoute ? "Creating…" : "Create Route"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ─── EDIT ROUTE MODAL ─── */}
      <Dialog open={Boolean(editingRoute)} onClose={() => setEditingRoute(null)} title="Edit Route Configuration">
        <form onSubmit={handleUpdateRoute} className="flex flex-col gap-4 py-1">
          <Input
            label="Route Number"
            required
            value={editRouteNumber}
            onChange={(e) => setEditRouteNumber(e.target.value)}
          />

          <Input
            label="Route Name"
            required
            value={editRouteName}
            onChange={(e) => setEditRouteName(e.target.value)}
          />

          <Input
            label="Route Short Code"
            required
            value={editRouteCode}
            onChange={(e) => setEditRouteCode(e.target.value)}
          />

          <Select
            label="Operational Status"
            value={editRouteStatus}
            onChange={(e) => setEditRouteStatus(e.target.value as any)}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setEditingRoute(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdatingRoute}>
              {isUpdatingRoute ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
