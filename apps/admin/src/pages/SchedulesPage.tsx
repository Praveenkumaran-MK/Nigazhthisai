import { useEffect, useState } from "react";
import { Button, Card, DataTable, Dialog, Select, DateTimePicker, Badge, Alert, useToast, ErrorState } from "@sbt/ui";
import type { Route, Bus, Conductor, Schedule } from "@sbt/shared-types";
import { listRoutes, confirmScheduleAndCreateTrip } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useCrudResource } from "../hooks/useCrudResource";

export function SchedulesPage() {
  const { rows, status, error, create, reload } = useCrudResource<Schedule>({ table: "schedules", orderBy: "scheduled_start" });
  const { push } = useToast();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);

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

  useEffect(() => {
    listRoutes(supabase).then(setRoutes);
    supabase.from("buses").select("*").order("bus_number").then(({ data }) => setBuses((data ?? []) as Bus[]));
    supabase
      .from("conductors")
      .select("*")
      .eq("is_active", true)
      .order("display_name")
      .then(({ data }) => setConductors((data ?? []) as Conductor[]));
  }, []);

  const routeLabel = (id: string) => routes.find((r) => r.id === id)?.route_number ?? id.slice(0, 8);
  const busLabel = (id: string) => buses.find((b) => b.id === id)?.bus_number ?? id.slice(0, 8);

  const resetWizard = () => {
    setRouteId("");
    setBusId("");
    setScheduledStart("");
    setDurationHours("2");
    setFormError(null);
  };

  // "Later" MUST immediately open the calendar/date-time modal (spec §43) —
  // no intermediate confirmation, no silently closing the wizard.
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

    // Reject overlapping windows for the same bus (a bus can't run two
    // schedules at once). The previous `end <= start` check here was
    // unreachable — end is always start + a positive duration — so it
    // never actually caught anything; this replaces it with a real check.
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Schedules</h1>
          <p className="text-sm text-slate-500 dark:text-slate-500">Plan when a bus runs a route, then confirm with a conductor to create the trip.</p>
        </div>
        <Button
          onClick={() => {
            resetWizard();
            setWizardOpen(true);
          }}
        >
          New schedule
        </Button>
      </div>

      {status === "error" ? (
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
      )}

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

      {/* "Later" immediately opens this calendar/date-time modal (spec §43) — never silently closes the wizard. */}
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

      {/* Materializes the schedule into a real trip (confirm_schedule_and_create_trip RPC) —
          without this step nothing ever consumed a PLANNED schedule. */}
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
    </div>
  );
}
