import { useEffect, useState, useMemo } from "react";
import { Dialog, Button, Badge, useToast } from "@sbt/ui";
import {
  MapPin,
  Clock,
  Calendar,
  Edit2,
  Trash2,
  Plus,
  Search,
  Grid,
  List,
  Bus,
  Layers,
  CheckCircle2,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  X,
  Compass,
} from "lucide-react";
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
  { key: -1, label: "STANDARD (DAILY)", short: "STD" },
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
  const [routeStopsCount, setRouteStopsCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // View state: Corridor Cards (default) vs Clean Table
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Filters
  const [search, setSearch] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("ALL");

  // Day-Wise Scheduler Modal State
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<number>(-1); // -1 = DEFAULT/STANDARD
  const [dayStopsMap, setDayStopsMap] = useState<Record<number, RouteStopItem[]>>({});
  const [selectedStopId, setSelectedStopId] = useState("");
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
  const [editRouteDistrictId, setEditRouteDistrictId] = useState("");
  const [editRouteStatus, setEditRouteStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, stopsRes, districtsRes, schedulesRes, routeStopsRes] = await Promise.all([
        supabase.from("routes").select("*").order("route_number"),
        supabase.from("stops").select("*").order("name"),
        supabase.from("districts").select("*").order("name"),
        supabase.from("route_weekly_schedules").select("route_id, day_of_week"),
        supabase.from("route_stops").select("route_id, stop_id"),
      ]);

      if (routesRes.error) throw routesRes.error;
      const loadedRoutes = (routesRes.data ?? []) as Route[];
      setRoutes(loadedRoutes);
      setStops((stopsRes.data ?? []) as Stop[]);
      setDistricts((districtsRes.data ?? []) as District[]);

      // Group active schedule days per route
      const schedMap: WeeklyScheduleMap = {};
      (schedulesRes.data ?? []).forEach((s: any) => {
        if (!schedMap[s.route_id]) schedMap[s.route_id] = [];
        if (!schedMap[s.route_id]!.includes(s.day_of_week)) {
          schedMap[s.route_id]!.push(s.day_of_week);
        }
      });
      setWeeklySchedules(schedMap);

      // Count stops per route
      const counts: Record<string, number> = {};
      (routeStopsRes.data ?? []).forEach((rs: any) => {
        counts[rs.route_id] = (counts[rs.route_id] ?? 0) + 1;
      });
      setRouteStopsCount(counts);
    } catch (err: any) {
      console.error("Failed to load routes data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Filtered Routes
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      const q = search.trim().toLowerCase();
      const code = (r.code ?? r.route_number ?? "").toLowerCase();
      const name = (r.name ?? "").toLowerCase();
      const number = (r.route_number ?? "").toLowerCase();

      const matchesQuery = !q || code.includes(q) || name.includes(q) || number.includes(q);
      const matchesDistrict = selectedDistrict === "ALL" || r.district_id === selectedDistrict;

      return matchesQuery && matchesDistrict;
    });
  }, [routes, search, selectedDistrict]);

  // Executive Stats
  const activeRoutesCount = useMemo(() => routes.filter((r) => r.is_active !== false).length, [routes]);
  const coveredDistrictsCount = useMemo(() => {
    const set = new Set(routes.map((r) => r.district_id).filter(Boolean));
    return set.size;
  }, [routes]);

  // Open Scheduler Modal
  const handleOpenScheduler = async (route: Route) => {
    setActiveRoute(route);
    setSelectedDayKey(-1); // default standard
    setSelectedStopId("");
    setStopEta("");
    setDayStopsMap({});
    setSchedulerOpen(true);

    try {
      // 1. Load Standard route stops
      const { data: stdData, error: stdErr } = await supabase
        .from("route_stops")
        .select("id, stop_id, sequence_order, expected_arrival_time")
        .eq("route_id", route.id)
        .order("sequence_order", { ascending: true });

      if (stdErr) throw stdErr;

      const stopMap = new Map(stops.map((s) => [s.id, s]));

      const standardList: RouteStopItem[] = (stdData ?? []).map((s) => {
        const meta = stopMap.get(s.stop_id);
        return {
          id: s.id,
          stop_id: s.stop_id,
          name: meta?.name ?? "Unknown Stop",
          code: meta?.code ?? "STP",
          sequence_order: s.sequence_order,
          expected_arrival_time: s.expected_arrival_time,
        };
      });

      // 2. Load Day-Wise exception schedules from route_day_stops
      let dayData: any[] = [];
      try {
        const { data, error: dayErr } = await supabase
          .from("route_day_stops")
          .select("id, day_of_week, stop_id, sequence_order, expected_arrival_time")
          .eq("route_id", route.id)
          .order("sequence_order", { ascending: true });

        if (!dayErr && data) {
          dayData = data;
        }
      } catch (err) {
        console.warn("Could not load day exception stops:", err);
      }

      const map: Record<number, RouteStopItem[]> = {
        [-1]: standardList,
      };

      dayData.forEach((row: any) => {
        const d = row.day_of_week;
        if (!map[d]) map[d] = [];
        const meta = stopMap.get(row.stop_id);
        map[d]!.push({
          id: row.id,
          stop_id: row.stop_id,
          name: meta?.name ?? "Unknown Stop",
          code: meta?.code ?? "STP",
          sequence_order: row.sequence_order,
          expected_arrival_time: row.expected_arrival_time,
        });
      });

      setDayStopsMap(map);
    } catch (err: any) {
      console.error("Error loading stop schedules:", err);
      push({ tone: "danger", title: "Could not load stops", description: err.message });
    }
  };

  // Add Stop into Active Day List
  const handleAddStopToSchedule = () => {
    if (!selectedStopId) return;

    const stopMeta = stops.find((s) => s.id === selectedStopId);
    if (!stopMeta) return;

    const currentList = dayStopsMap[selectedDayKey] ?? [];

    if (currentList.some((s) => s.stop_id === selectedStopId)) {
      alert("This stop is already added to this corridor.");
      return;
    }

    const newItem: RouteStopItem = {
      id: "temp-" + Date.now(),
      stop_id: selectedStopId,
      name: stopMeta.name,
      code: stopMeta.code,
      sequence_order: currentList.length + 1,
      expected_arrival_time: stopEta.trim() || undefined,
    };

    setDayStopsMap((prev) => ({
      ...prev,
      [selectedDayKey]: [...currentList, newItem],
    }));

    setSelectedStopId("");
    setStopEta("");
  };

  // Move Stop Up / Down
  const handleMoveStop = (index: number, direction: "up" | "down") => {
    const currentList = [...(dayStopsMap[selectedDayKey] ?? [])];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;

    const temp = currentList[index]!;
    currentList[index] = currentList[targetIndex]!;
    currentList[targetIndex] = temp;

    // re-sequence
    const resequenced = currentList.map((item, idx) => ({
      ...item,
      sequence_order: idx + 1,
    }));

    setDayStopsMap((prev) => ({
      ...prev,
      [selectedDayKey]: resequenced,
    }));
  };

  // Remove Stop
  const handleRemoveStopFromSchedule = (index: number) => {
    const currentList = (dayStopsMap[selectedDayKey] ?? []).filter((_, i) => i !== index);
    const resequenced = currentList.map((item, idx) => ({
      ...item,
      sequence_order: idx + 1,
    }));

    setDayStopsMap((prev) => ({
      ...prev,
      [selectedDayKey]: resequenced,
    }));
  };

  // Save Corridor Schedule
  const handleSaveSchedule = async () => {
    if (!activeRoute) return;
    setIsSavingSchedule(true);
    try {
      const currentList = dayStopsMap[selectedDayKey] ?? [];

      if (selectedDayKey === -1) {
        // Standard route stops
        await supabase.from("route_stops").delete().eq("route_id", activeRoute.id);
        if (currentList.length > 0) {
          const stdRows = currentList.map((s, idx) => ({
            route_id: activeRoute.id,
            stop_id: s.stop_id,
            sequence_order: idx + 1,
            expected_arrival_time: s.expected_arrival_time || null,
          }));
          const { error: stdErr } = await supabase.from("route_stops").insert(stdRows);
          if (stdErr) throw stdErr;
        }
      } else {
        // Day-specific schedule in route_day_stops
        await supabase
          .from("route_day_stops")
          .delete()
          .eq("route_id", activeRoute.id)
          .eq("day_of_week", selectedDayKey);

        if (currentList.length > 0) {
          const dayRows = currentList.map((s, idx) => ({
            route_id: activeRoute.id,
            day_of_week: selectedDayKey,
            stop_id: s.stop_id,
            sequence_order: idx + 1,
            expected_arrival_time: s.expected_arrival_time || null,
          }));
          const { error: dayErr } = await supabase.from("route_day_stops").insert(dayRows);
          if (dayErr) throw dayErr;
        }
      }

      push({
        tone: "success",
        title: "Corridor Updated",
        description: `Saved ${currentList.length} stops for ${
          DAYS.find((d) => d.key === selectedDayKey)?.label
        }.`,
      });

      await loadData();
    } catch (err: any) {
      alert("Failed to save schedule: " + (err?.message || JSON.stringify(err)));
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
    setEditRouteDistrictId(r.district_id ?? "");
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
          district_id: editRouteDistrictId || null,
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
      {/* ─── EXECUTIVE METRICS STRIP ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Routes</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Bus className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{routes.length}</p>
          <span className="mt-0.5 inline-block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {activeRoutesCount} Active in Service
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Transit Stops</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <MapPin className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stops.length}</p>
          <span className="mt-0.5 inline-block text-[11px] font-semibold text-slate-500">
            Network Coverage Points
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Districts Served</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Compass className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{coveredDistrictsCount}</p>
          <span className="mt-0.5 inline-block text-[11px] font-semibold text-slate-500">
            Across {districts.length} Available
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Operating Rate</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {routes.length > 0 ? `${Math.round((activeRoutesCount / routes.length) * 100)}%` : "100%"}
          </p>
          <span className="mt-0.5 inline-block text-[11px] font-semibold text-emerald-600">
            High Reliability Status
          </span>
        </div>
      </div>

      {/* ─── SEARCH, FILTERS & VIEW MODE CONTROLS ─── */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search corridors by name, code, or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {/* District Selector */}
          <div className="relative">
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-xs font-bold uppercase text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
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

        {/* View Mode Toggle & Create Route Button */}
        <div className="flex items-center gap-2.5">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === "cards"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === "table"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>

          <Button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-brand-900/20 hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            <span>New Route</span>
          </Button>
        </div>
      </div>

      {/* ─── CORRIDOR CARDS GRID VIEW (Top-Notch Interactive UX) ─── */}
      {viewMode === "cards" ? (
        loading ? (
          <div className="py-20 text-center text-xs text-slate-400">Loading corridors…</div>
        ) : filteredRoutes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-xs text-slate-500 dark:border-slate-800">
            <Layers className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="font-bold text-slate-700 dark:text-slate-300">No transit corridors match your search.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Try clearing filters or adding a new route.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRoutes.map((route) => {
              const routeCode = route.code ?? route.route_number;
              const districtObj = districts.find((d) => d.id === route.district_id);
              const stopsCount = routeStopsCount[route.id] ?? 0;
              const activeDays = weeklySchedules[route.id] ?? [];
              const isActive = route.is_active !== false;

              return (
                <div
                  key={route.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-900/5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    {/* Top Row: Code Pill + Status + District */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-brand-50 border border-brand-200/60 px-2.5 py-1 font-mono text-xs font-black text-brand-700 dark:bg-brand-950/50 dark:border-brand-800 dark:text-brand-300">
                          {routeCode}
                        </span>
                        <Badge tone={isActive ? "success" : "neutral"} className="text-[10px] font-bold">
                          {isActive ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </div>

                      {districtObj && (
                        <span className="truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {districtObj.name}
                        </span>
                      )}
                    </div>

                    {/* Corridor Title */}
                    <h3 className="mt-3.5 text-base font-black text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors">
                      {route.name}
                    </h3>

                    {/* Route Statistics Bar */}
                    <div className="mt-3 flex items-center gap-4 text-xs font-medium text-slate-500 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-bold text-slate-800 dark:text-slate-200">{stopsCount} Stops</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          {activeDays.length > 0 ? `${activeDays.length} Days / Week` : "Standard Daily"}
                        </span>
                      </div>
                    </div>

                    {/* Weekly Schedule Days Pill Strip */}
                    <div className="mt-3 flex items-center gap-1">
                      {["S", "M", "T", "W", "T", "F", "S"].map((letter, dayIdx) => {
                        const hasSched = activeDays.includes(dayIdx);
                        const isToday = new Date().getDay() === dayIdx;
                        return (
                          <span
                            key={dayIdx}
                            title={`Day ${letter}: ${hasSched ? "Customized" : "Default"}`}
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black transition ${
                              hasSched
                                ? "bg-amber-500 text-white"
                                : isToday
                                ? "bg-brand-100 text-brand-700 font-bold dark:bg-brand-900/40 dark:text-brand-300"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                            }`}
                          >
                            {letter}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions Footer Strip */}
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Button
                      size="sm"
                      onClick={() => handleOpenScheduler(route)}
                      className="flex items-center gap-1.5 rounded-xl bg-slate-900 text-white hover:bg-brand-600 dark:bg-slate-800 dark:hover:bg-brand-600 text-xs font-bold transition shadow-xs"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>Manage Stops & ETA</span>
                    </Button>

                    <div className="flex items-center gap-1 text-slate-400">
                      <button
                        type="button"
                        onClick={() => handleOpenTimetable(route)}
                        title="Timetable Departures"
                        className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white transition"
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditRoute(route)}
                        title="Edit Route"
                        className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white transition"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRoute(route)}
                        title="Delete Route"
                        className="rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ─── STREAMLINED TABLE VIEW (Clean & High-Density) ─── */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs dark:divide-slate-800">
              <thead className="bg-slate-50/80 text-slate-500 font-extrabold uppercase tracking-wider dark:bg-slate-800/60">
                <tr>
                  <th className="px-5 py-3.5 text-left">CORRIDOR</th>
                  <th className="px-5 py-3.5 text-left">CODE</th>
                  <th className="px-5 py-3.5 text-left">DISTRICT</th>
                  <th className="px-5 py-3.5 text-left">STOPS</th>
                  <th className="px-5 py-3.5 text-left">STATUS</th>
                  <th className="px-5 py-3.5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Loading routes…
                    </td>
                  </tr>
                ) : filteredRoutes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No routes found.
                    </td>
                  </tr>
                ) : (
                  filteredRoutes.map((route) => {
                    const routeCode = route.code ?? route.route_number;
                    const districtObj = districts.find((d) => d.id === route.district_id);
                    const stopsCount = routeStopsCount[route.id] ?? 0;
                    const isActive = route.is_active !== false;

                    return (
                      <tr key={route.id} className="hover:bg-slate-50/80 transition dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                          <p className="text-sm font-extrabold">{route.name}</p>
                          <span className="text-[10px] text-slate-400">Route #{route.route_number}</span>
                        </td>
                        <td className="px-5 py-3.5 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {routeCode}
                        </td>
                        <td className="px-5 py-3.5 uppercase text-slate-600 dark:text-slate-400">
                          {districtObj?.name ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-200">
                          {stopsCount} Stops
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={isActive ? "success" : "neutral"} className="text-[10px] font-bold">
                            {isActive ? "ACTIVE" : "INACTIVE"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenScheduler(route)}
                              className="text-xs font-bold"
                            >
                              Stops
                            </Button>
                            <button
                              type="button"
                              onClick={() => handleOpenTimetable(route)}
                              title="Timetable"
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditRoute(route)}
                              title="Edit"
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRoute(route)}
                              title="Delete"
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
      )}

      {/* ─── VISUAL JOURNEY & DAY-WISE SCHEDULER MODAL ─── */}
      <Dialog
        open={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
        title={activeRoute ? `Transit Stops & Sequence: ${activeRoute.name}` : "Configure Corridor"}
      >
        {activeRoute && (
          <div className="flex flex-col gap-4 py-1">
            {/* Corridor Header Info Banner */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-3 dark:bg-slate-950 dark:border-slate-800">
              <div>
                <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                  {activeRoute.code ?? activeRoute.route_number}
                </span>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{activeRoute.name}</p>
              </div>
              <Badge tone="brand" className="font-bold text-xs">
                {currentStopsList.length} STOPS ASSIGNED
              </Badge>
            </div>

            {/* Day Selector Pills */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                Select Schedule Cadence:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => setSelectedDayKey(day.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      selectedDayKey === day.key
                        ? "bg-brand-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Stop Strip */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                Add Stop to Corridor:
              </label>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <select
                  value={selectedStopId}
                  onChange={(e) => setSelectedStopId(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Select bus stop to insert…</option>
                  {stops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — {s.district}
                    </option>
                  ))}
                </select>

                <input
                  type="time"
                  value={stopEta}
                  onChange={(e) => setStopEta(e.target.value)}
                  placeholder="ETA"
                  title="Expected Time of Arrival (Optional)"
                  className="w-24 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />

                <Button
                  size="sm"
                  onClick={handleAddStopToSchedule}
                  disabled={!selectedStopId}
                  className="h-9 font-bold shrink-0 bg-brand-600 hover:bg-brand-500 text-white rounded-xl"
                >
                  + Add Stop
                </Button>
              </div>
            </div>

            {/* Interactive Timeline Stop Sequence List */}
            <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto rounded-xl border border-slate-200 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
              {currentStopsList.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 italic">
                  No stops configured for this schedule. Add stops using the selector above.
                </div>
              ) : (
                currentStopsList.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-black text-xs border border-brand-200/80 dark:bg-brand-950/60 dark:text-brand-300">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          <span className="font-mono">{item.code}</span>
                          {item.expected_arrival_time && (
                            <span className="font-semibold text-emerald-600">
                              ETA: {item.expected_arrival_time}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveStop(idx, "up")}
                        disabled={idx === 0}
                        title="Move Up"
                        className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveStop(idx, "down")}
                        disabled={idx === currentStopsList.length - 1}
                        title="Move Down"
                        className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveStopFromSchedule(idx)}
                        title="Remove Stop"
                        className="rounded-lg p-1.5 hover:bg-rose-50 text-rose-500 dark:hover:bg-rose-950/40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer CTA */}
            <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setSchedulerOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-brand-600 hover:bg-brand-500 font-bold text-white rounded-xl shadow-md"
                isLoading={isSavingSchedule}
                onClick={handleSaveSchedule}
              >
                Save Stop Sequence
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ─── TIMETABLE DEPARTURES MODAL ─── */}
      <Dialog
        open={timetableOpen}
        onClose={() => setTimetableOpen(false)}
        title={timetableRoute ? `Timetable: Route ${timetableRoute.route_number}` : "Timetable"}
      >
        <div className="flex flex-col gap-4 py-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daily fixed bus departure times from origin terminal.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="time"
              value={newSlotTime}
              onChange={(e) => setNewSlotTime(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800"
            />
            <Button size="sm" onClick={handleAddSlot} className="rounded-xl font-bold bg-brand-600 text-white">
              + Add Departure Slot
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {timetableSlots.map((slot) => (
              <div
                key={slot.id}
                className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
              >
                <Clock className="h-3.5 w-3.5 text-brand-600" />
                <span>{slot.time}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSlot(slot.id)}
                  className="text-slate-400 hover:text-rose-500 ml-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                push({ tone: "success", title: "Timetable updated" });
                setTimetableOpen(false);
              }}
              className="font-bold bg-emerald-600 text-white"
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ─── CREATE ROUTE MODAL ─── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Transit Corridor">
        <form onSubmit={handleCreateRoute} className="flex flex-col gap-4 py-1">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Route Number / Short Code *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 49-A or KRI-01"
              value={newRouteNumber}
              onChange={(e) => setNewRouteNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Corridor Name (Origin → Destination) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Krishnagiri Old Bus Stand → Hosur Central"
              value={newRouteName}
              onChange={(e) => setNewRouteName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              District
            </label>
            <select
              value={newRouteDistrictId}
              onChange={(e) => setNewRouteDistrictId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Select district (optional)…</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              isLoading={isCreatingRoute}
              className="bg-brand-600 hover:bg-brand-500 font-bold text-white rounded-xl shadow-sm"
            >
              Create Corridor
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ─── EDIT ROUTE MODAL ─── */}
      <Dialog open={Boolean(editingRoute)} onClose={() => setEditingRoute(null)} title="Edit Transit Corridor">
        {editingRoute && (
          <form onSubmit={handleUpdateRoute} className="flex flex-col gap-4 py-1">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Route Number *
              </label>
              <input
                type="text"
                required
                value={editRouteNumber}
                onChange={(e) => setEditRouteNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Corridor Name *
              </label>
              <input
                type="text"
                required
                value={editRouteName}
                onChange={(e) => setEditRouteName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                District
              </label>
              <select
                value={editRouteDistrictId}
                onChange={(e) => setEditRouteDistrictId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Select district (optional)…</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Operational Status
              </label>
              <select
                value={editRouteStatus}
                onChange={(e) => setEditRouteStatus(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setEditingRoute(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                isLoading={isUpdatingRoute}
                className="bg-brand-600 hover:bg-brand-500 font-bold text-white rounded-xl shadow-sm"
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
