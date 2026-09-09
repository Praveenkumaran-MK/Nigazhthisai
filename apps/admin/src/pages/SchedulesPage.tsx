import { useEffect, useState, useCallback } from "react";
import { Button, Card, DataTable, Dialog, Select, DateTimePicker, Badge, Alert, useToast, ErrorState, Input } from "@sbt/ui";
import type { Route, Bus, Conductor, Schedule } from "@sbt/shared-types";
import { listRoutes, confirmScheduleAndCreateTrip } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useCrudResource } from "../hooks/useCrudResource";

interface WeeklySchedule {
  id: string;
  route_id: string;
  day_of_week: number;
  departure_time: string;
  bus_id: string | null;
  preferred_conductor_id: string | null;
  duration_hours: number;
  is_active: boolean;
}

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SchedulesPage() {
  const { rows, status, error, create, reload } = useCrudResource<Schedule>({ table: "schedules", orderBy: "scheduled_start" });
  const { push } = useToast();
  const [tab, setTab] = useState<"trips" | "templates">("trips");

  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);

  // Trip Schedule Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [routeId, setRouteId] = useState("");
  const [busId, setBusId] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scheduledStart, setScheduledStart] = useState("");
  const [durationHours, setDurationHours] = useState("2");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmingSchedule, setConfirmingSchedule] = useState<Schedule | null>(null);
  const [confirmConductorId, setConfirmConductorId] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Weekly Schedule Templates
  const [weeklyTemplates, setWeeklyTemplates] = useState<WeeklySchedule[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [tplRouteId, setTplRouteId] = useState("");
  const [tplDay, setTplDay] = useState("1");
  const [tplTime, setTplTime] = useState("08:00");
  const [tplBusId, setTplBusId] = useState("");
  const [tplConductorId, setTplConductorId] = useState("");
  const [tplDuration, setTplDuration] = useState("2.0");
  const [isSavingTpl, setIsSavingTpl] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const { data, error: err } = await supabase
        .from("route_weekly_schedules")
        .select("*")
        .order("day_of_week")
        .order("departure_time");
      if (err) throw err;
      setWeeklyTemplates((data ?? []) as WeeklySchedule[]);
    } catch (e: any) {
      console.error("Failed to load weekly templates:", e);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    listRoutes(supabase).then(setRoutes);
    supabase.from("buses").select("*").order("bus_number").then(({ data }) => setBuses((data ?? []) as Bus[]));
    supabase
      .from("conductors")
      .select("*")
      .eq("is_active", true)
      .order("display_name")
      .then(({ data }) => setConductors((data ?? []) as Conductor[]));
    void loadTemplates();
  }, [loadTemplates]);

  const routeLabel = (id: string) => routes.find((r) => r.id === id)?.route_number ?? id.slice(0, 8);
  const busLabel = (id: string | null) => (id ? buses.find((b) => b.id === id)?.bus_number ?? id.slice(0, 8) : "—");
  const conductorLabel = (id: string | null) => (id ? conductors.find((c) => c.id === id)?.display_name ?? id.slice(0, 8) : "—");

  const resetWizard = () => {
    setRouteId("");
    setBusId("");
    setScheduledStart("");
    setDurationHours("2");
    setFormError(null);
  };

  const handleChooseLater = () => {
    setCalendarOpen(true);
  };

  const handleQuickPick = (hoursFromNow: number) => {
    const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    setScheduledStart(start.toISOString());
    void saveSchedule(start.toISOString());
  };

  const saveSchedule = async (startIso: string) => {
    if (!routeId || !busId || !startIso) {
      setFormError("Select a route, bus, and start time.");
      return;
    }
    const start = new Date(startIso);
    const end = new Date(start.getTime() + Number(durationHours) * 60 * 60 * 1000);

    const overlapping = rows.some(
      (s) =>
        s.bus_id === busId &&
        s.status !== "CANCELLED" &&
        start < new Date(s.scheduled_end) &&
        end > new Date(s.scheduled_start),
    );
    if (overlapping) {
      setFormError("This bus already has a schedule that overlaps with this time window.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await create({
        route_id: routeId,
        bus_id: busId,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status: "PLANNED",
      } as Partial<Schedule>);
      push({ tone: "success", title: "Schedule created" });
      setWizardOpen(false);
      setCalendarOpen(false);
      resetWizard();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save schedule");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!confirmingSchedule || !confirmConductorId) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      await confirmScheduleAndCreateTrip(supabase, confirmingSchedule.id, confirmConductorId);
      push({ tone: "success", title: "Trip created", description: "The conductor will see this trip on their dashboard." });
      setConfirmingSchedule(null);
      setConfirmConductorId("");
      await reload();
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Could not confirm schedule");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplRouteId || !tplTime) return;
    setIsSavingTpl(true);
    try {
      const { error: err } = await supabase.from("route_weekly_schedules").insert({
        route_id: tplRouteId,
        day_of_week: parseInt(tplDay, 10),
        departure_time: tplTime,
        bus_id: tplBusId || null,
        preferred_conductor_id: tplConductorId || null,
        duration_hours: parseFloat(tplDuration),
        is_active: true,
      });
      if (err) throw err;
      push({ tone: "success", title: "Weekday schedule template saved" });
      setShowTemplateModal(false);
      await loadTemplates();
    } catch (err: any) {
      alert("Failed to save template: " + err.message);
    } finally {
      setIsSavingTpl(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this recurring schedule slot?")) return;
    try {
      await supabase.from("route_weekly_schedules").delete().eq("id", id);
      await loadTemplates();
    } catch (e: any) {
      alert("Failed to delete: " + e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Schedules & Timetables</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Plan dynamic one-time trips or configure weekday departure templates.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "trips" ? (
            <Button
              onClick={() => {
                resetWizard();
                setWizardOpen(true);
              }}
            >
              + New Trip Schedule
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (routes.length > 0 && !tplRouteId && routes[0]) setTplRouteId(routes[0].id);
                setShowTemplateModal(true);
              }}
            >
              + Add Weekday Slot
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          type="button"
          onClick={() => setTab("trips")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            tab === "trips"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          ⏱️ Active Trip Schedules
        </button>
        <button
          type="button"
          onClick={() => setTab("templates")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            tab === "templates"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          📅 Weekday Departure Templates
        </button>
      </div>

      {tab === "trips" ? (
        status === "error" ? (
          <ErrorState description={error ?? undefined} onRetry={reload} />
        ) : (
          <DataTable
            columns={[
              { key: "route", header: "Route", render: (s) => routeLabel(s.route_id) },
              { key: "bus", header: "Bus", render: (s) => busLabel(s.bus_id) },
              { key: "start", header: "Start", render: (s) => new Date(s.scheduled_start).toLocaleString() },
              { key: "end", header: "End", render: (s) => new Date(s.scheduled_end).toLocaleString() },
              { key: "status", header: "Status", render: (s) => <Badge tone={s.status === "CONFIRMED" ? "success" : s.status === "CANCELLED" ? "danger" : "neutral"}>{s.status}</Badge> },
              {
                key: "actions",
                header: "",
                render: (s) =>
                  s.status === "PLANNED" ? (
                    <Button size="sm" onClick={() => setConfirmingSchedule(s)}>
                      Confirm &amp; assign conductor
                    </Button>
                  ) : null,
              },
            ]}
            rows={rows}
            getRowId={(s) => s.id}
            isLoading={status === "loading"}
            emptyTitle="No schedules yet"
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Day of Week", "Departure Time", "Route", "Assigned Bus", "Preferred Conductor", "Duration", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loadingTemplates ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading templates…</td>
                </tr>
              ) : weeklyTemplates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No recurring timetable templates created yet.</td>
                </tr>
              ) : (
                weeklyTemplates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {DAYS_OF_WEEK[t.day_of_week] ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                      {t.departure_time.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      {routeLabel(t.route_id)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {busLabel(t.bus_id)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {conductorLabel(t.preferred_conductor_id)}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {t.duration_hours}h
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Trip Schedule Modal */}
      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} title="New schedule" size="md">
        <div className="flex flex-col gap-4">
          <Select label="Route" placeholder="Select a route" value={routeId} onChange={(e) => setRouteId(e.target.value)} options={routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` }))} />
          <Select label="Bus" placeholder="Select a bus" value={busId} onChange={(e) => setBusId(e.target.value)} options={buses.map((b) => ({ value: b.id, label: b.bus_number }))} />
          <Select label="Duration (hours)" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} options={["1", "2", "3", "4"].map((h) => ({ value: h, label: `${h}h` }))} />

          {formError && <Alert tone="danger" title="Could not schedule">{formError}</Alert>}

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">When?</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!routeId || !busId || isSaving} onClick={() => handleQuickPick(1)}>
                In 1 hour
              </Button>
              <Button variant="outline" disabled={!routeId || !busId || isSaving} onClick={() => handleQuickPick(24)}>
                Tomorrow, same time
              </Button>
              <Button disabled={!routeId || !busId} onClick={handleChooseLater}>
                Later…
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Choose Date & Time */}
      <Dialog open={calendarOpen} onClose={() => setCalendarOpen(false)} title="Choose date & time" size="sm">
        <div className="flex flex-col gap-4">
          <DateTimePicker label="Start" value={scheduledStart} onChange={setScheduledStart} min={new Date().toISOString()} />
          {formError && <Alert tone="danger" title="Could not schedule">{formError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCalendarOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button isLoading={isSaving} disabled={!scheduledStart} onClick={() => saveSchedule(scheduledStart)}>
              Confirm schedule
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Confirm Schedule */}
      <Dialog
        open={Boolean(confirmingSchedule)}
        onClose={() => {
          setConfirmingSchedule(null);
          setConfirmError(null);
        }}
        title="Confirm schedule & assign conductor"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          {confirmingSchedule && (
            <Card>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {routeLabel(confirmingSchedule.route_id)} — {busLabel(confirmingSchedule.bus_id)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                {new Date(confirmingSchedule.scheduled_start).toLocaleString()}
              </p>
            </Card>
          )}
          <Select
            label="Conductor"
            placeholder="Select a conductor"
            value={confirmConductorId}
            onChange={(e) => setConfirmConductorId(e.target.value)}
            options={conductors.map((c) => ({ value: c.id, label: `${c.display_name} (${c.government_id})` }))}
          />
          {confirmError && <Alert tone="danger" title="Could not confirm">{confirmError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmingSchedule(null)} disabled={isConfirming}>
              Cancel
            </Button>
            <Button isLoading={isConfirming} disabled={!confirmConductorId} onClick={handleConfirmSchedule}>
              Create trip
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Weekday Schedule Slot Template Modal */}
      <Dialog open={showTemplateModal} onClose={() => setShowTemplateModal(false)} title="Add Weekday Departure Template">
        <form onSubmit={handleSaveTemplate} className="flex flex-col gap-4 py-2">
          <Select
            label="Route"
            value={tplRouteId}
            onChange={(e) => setTplRouteId(e.target.value)}
            options={routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` }))}
          />

          <Select
            label="Day of Week"
            value={tplDay}
            onChange={(e) => setTplDay(e.target.value)}
            options={DAYS_OF_WEEK.map((day, idx) => ({ value: String(idx), label: day }))}
          />

          <Input
            type="time"
            label="Departure Time (HH:MM)"
            value={tplTime}
            onChange={(e) => setTplTime(e.target.value)}
            required
          />

          <Select
            label="Designated Bus (Optional)"
            value={tplBusId}
            onChange={(e) => setTplBusId(e.target.value)}
            options={[
              { value: "", label: "— Any Available Bus —" },
              ...buses.map((b) => ({ value: b.id, label: b.bus_number })),
            ]}
          />

          <Select
            label="Preferred Conductor (Optional)"
            value={tplConductorId}
            onChange={(e) => setTplConductorId(e.target.value)}
            options={[
              { value: "", label: "— Assign Later —" },
              ...conductors.map((c) => ({ value: c.id, label: `${c.display_name} (${c.government_id})` })),
            ]}
          />

          <Input
            type="number"
            label="Trip Duration (Hours)"
            step="0.5"
            min="0.5"
            max="12"
            value={tplDuration}
            onChange={(e) => setTplDuration(e.target.value)}
          />

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" type="button" onClick={() => setShowTemplateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSavingTpl}>
              Save Recurring Slot
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
