import { useEffect, useState, useCallback } from "react";
import { DataTable, Badge, Card, Button, Dialog, Select, DateTimePicker, Input, useToast, EditIcon, HistoryIcon, TrashIcon, Alert } from "@sbt/ui";
import type { Trip, Route, Bus, Conductor } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";

interface TripEditAudit {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  edited_at: string;
}

const statusTone = {
  SCHEDULED: "neutral",
  PLANNED: "brand",
  ACTIVE: "success",
  COMPLETED: "brand",
  CANCELLED: "danger",
} as const;

export function TripsPage() {
  const { push } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [status, setStatus] = useState<"loading" | "success">("loading");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Create Trip Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newRouteId, setNewRouteId] = useState("");
  const [newBusId, setNewBusId] = useState("");
  const [newConductorId, setNewConductorId] = useState("");
  const [newDeparture, setNewDeparture] = useState("");
  const [newDuration, setNewDuration] = useState("2.0");
  const [isCreating, setIsCreating] = useState(false);

  // Edit Modal State
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [editRouteId, setEditRouteId] = useState("");
  const [editBusId, setEditBusId] = useState("");
  const [editConductorId, setEditConductorId] = useState("");
  const [editDeparture, setEditDeparture] = useState("");
  const [editArrival, setEditArrival] = useState("");
  const [editReason, setEditReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Audit History State
  const [auditTrip, setAuditTrip] = useState<Trip | null>(null);
  const [auditLogs, setAuditLogs] = useState<TripEditAudit[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Delete / Cancel Trip State
  const [deletingTrip, setDeletingTrip] = useState<Trip | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const loadData = useCallback(async () => {
    setStatus("loading");
    try {
      const [t, r, b, c] = await Promise.all([
        supabase.from("trips").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("routes").select("*").order("route_number"),
        supabase.from("buses").select("*").order("bus_number"),
        supabase.from("conductors").select("*").eq("is_active", true).order("display_name"),
      ]);

      setTrips((t.data ?? []) as Trip[]);
      setRoutes((r.data ?? []) as Route[]);
      setBuses((b.data ?? []) as Bus[]);
      setConductors((c.data ?? []) as Conductor[]);
      setStatus("success");
    } catch (err) {
      console.error("Failed to load trips data:", err);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setNewRouteId(routes[0]?.id || "");
    setNewBusId(buses[0]?.id || "");
    setNewConductorId(conductors[0]?.id || "");
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    setNewDeparture(inOneHour.toISOString());
    setNewDuration("2.0");
    setCreateOpen(true);
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouteId || !newBusId || !newDeparture) {
      alert("Please select route, bus, and departure time.");
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.rpc("direct_schedule_trip", {
        p_route_id: newRouteId,
        p_bus_id: newBusId,
        p_conductor_id: newConductorId || null,
        p_scheduled_departure: newDeparture,
        p_duration_hours: parseFloat(newDuration) || 2.0,
      });

      if (error) throw error;

      push({ tone: "success", title: "Trip scheduled successfully", description: "Conductor and fleet assigned." });
      setCreateOpen(false);
      await loadData();
    } catch (err: any) {
      alert("Failed to schedule trip: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEdit = (t: Trip) => {
    setEditingTrip(t);
    setEditRouteId(t.route_id);
    setEditBusId(t.bus_id);
    setEditConductorId(t.conductor_id ?? "");
    setEditDeparture(t.scheduled_departure ? new Date(t.scheduled_departure).toISOString() : "");
    setEditArrival(t.scheduled_arrival ? new Date(t.scheduled_arrival).toISOString() : "");
    setEditReason("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.rpc("edit_trip", {
        p_trip_id: editingTrip.id,
        p_route_id: editRouteId || null,
        p_bus_id: editBusId || null,
        p_conductor_id: editConductorId || null,
        p_scheduled_departure: editDeparture || null,
        p_scheduled_arrival: editArrival || null,
        p_reason: editReason.trim() || null,
      });

      if (error) throw error;

      push({ tone: "success", title: "Trip updated successfully", description: "Audit trail record saved." });
      setEditingTrip(null);
      await loadData();
    } catch (err: any) {
      alert("Failed to edit trip: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewAudit = async (t: Trip) => {
    setAuditTrip(t);
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase
        .from("trip_edits")
        .select("*")
        .eq("trip_id", t.id)
        .order("edited_at", { ascending: false });
      if (error) throw error;
      setAuditLogs((data ?? []) as TripEditAudit[]);
    } catch (err: any) {
      alert("Failed to load audit history: " + err.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleOpenDelete = (t: Trip) => {
    setDeletingTrip(t);
    setCancelReason("");
    setDeleteError(null);
  };

  const handleCancelTrip = async (t: Trip) => {
    setIsCancelling(true);
    setDeleteError(null);
    try {
      const { error: updateErr } = await supabase
        .from("trips")
        .update({ status: "CANCELLED", last_edited_at: new Date().toISOString() })
        .eq("id", t.id);

      if (updateErr) throw updateErr;

      // Audit log entry
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user?.id) {
          await supabase.from("trip_edits").insert({
            trip_id: t.id,
            edited_by: sessionData.session.user.id,
            field_name: "status",
            old_value: t.status,
            new_value: "CANCELLED",
            reason: cancelReason.trim() || "Trip cancelled by administrator before dispatch",
          });
        }
      } catch {
        // non-fatal
      }

      push({
        tone: "success",
        title: "Trip cancelled",
        description: "Scheduled trip has been marked as CANCELLED.",
      });
      setDeletingTrip(null);
      await loadData();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to cancel trip");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteTrip = async (t: Trip) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { error: delErr } = await supabase
        .from("trips")
        .delete()
        .eq("id", t.id);

      if (delErr) {
        if (delErr.message.includes("foreign key") || (delErr as any).code === "23503") {
          throw new Error("This trip already has passenger tickets or dependencies associated. Please choose 'Cancel Trip' instead of permanent deletion.");
        }
        throw delErr;
      }

      push({
        tone: "success",
        title: "Trip deleted permanently",
        description: "Scheduled trip removed from dispatch schedule.",
      });
      setDeletingTrip(null);
      await loadData();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete trip");
    } finally {
      setIsDeleting(false);
    }
  };

  const routeLabel = (id: string) => routes.find((r) => r.id === id)?.route_number ?? id.slice(0, 8);
  const busLabel = (id: string) => buses.find((b) => b.id === id)?.bus_number ?? id.slice(0, 8);
  const conductorLabel = (id: string | null) => conductors.find((c) => c.id === id)?.display_name ?? "Unassigned";

  const filteredTrips = trips.filter(
    (t) => statusFilter === "ALL" || t.status === statusFilter
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Trips & Live Dispatch</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitor trips in real-time, modify scheduled assignments, and view change audits.
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All Statuses ({trips.length})</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ACTIVE">Active (In-Transit)</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <Button onClick={handleOpenCreate}>+ Schedule Trip</Button>
        </div>
      </div>

      <Card>
        <DataTable
          columns={[
            {
              key: "departure",
              header: "Scheduled Start",
              render: (t) => {
                const dateVal = t.scheduled_departure || t.started_at || t.created_at;
                return dateVal
                  ? new Date(dateVal).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";
              },
            },
            { key: "route", header: "Route", render: (t) => <span className="font-semibold">{routeLabel(t.route_id)}</span> },
            { key: "bus", header: "Bus", render: (t) => busLabel(t.bus_id) },
            { key: "conductor", header: "Conductor", render: (t) => conductorLabel(t.conductor_id) },
            {
              key: "status",
              header: "Status",
              render: (t) => <Badge tone={statusTone[t.status as keyof typeof statusTone] ?? "neutral"}>{t.status}</Badge>,
            },
            {
              key: "actions",
              header: "Actions",
              render: (t) => (
                <div className="flex items-center gap-1.5">
                  {t.status === "SCHEDULED" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(t)}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300 dark:hover:bg-brand-900 border border-brand-200/60 dark:border-brand-800/60 shadow-xs transition"
                      >
                        <EditIcon className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDelete(t)}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900 border border-rose-200/60 dark:border-rose-800/60 shadow-xs transition"
                      >
                        <TrashIcon className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleViewAudit(t)}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                  >
                    <HistoryIcon className="h-3 w-3 text-slate-400" />
                    <span>Audit Log</span>
                  </button>
                </div>
              ),
            },
          ]}
          rows={filteredTrips}
          getRowId={(t) => t.id}
          isLoading={status === "loading"}
          emptyTitle="No trips found"
        />
      </Card>

      {/* Direct Schedule Trip Modal */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Schedule New Bus Trip"
      >
        <form onSubmit={handleSaveCreate} className="flex flex-col gap-4 py-2">
          <Select
            label="Route"
            value={newRouteId}
            onChange={(e) => setNewRouteId(e.target.value)}
            options={routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` }))}
          />

          <Select
            label="Bus Assignment"
            value={newBusId}
            onChange={(e) => setNewBusId(e.target.value)}
            options={buses.map((b) => ({ value: b.id, label: `${b.bus_number} (${b.type})` }))}
          />

          <Select
            label="Conductor Assignment"
            value={newConductorId}
            onChange={(e) => setNewConductorId(e.target.value)}
            options={[
              { value: "", label: "— Unassigned / Assign Later —" },
              ...conductors.map((c) => ({ value: c.id, label: `${c.display_name} (${c.government_id})` })),
            ]}
          />

          <DateTimePicker
            label="Scheduled Departure"
            value={newDeparture}
            onChange={setNewDeparture}
          />

          <Input
            label="Estimated Duration (Hours)"
            type="number"
            step="0.5"
            min="0.5"
            value={newDuration}
            onChange={(e) => setNewDuration(e.target.value)}
          />

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Scheduling…" : "Create & Schedule Trip"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Scheduled Trip Modal */}
      <Dialog
        open={Boolean(editingTrip)}
        onClose={() => setEditingTrip(null)}
        title="Edit Scheduled Trip Assignment"
      >
        <form onSubmit={handleSaveEdit} className="flex flex-col gap-4 py-2">
          <Select
            label="Route"
            value={editRouteId}
            onChange={(e) => setEditRouteId(e.target.value)}
            options={routes.map((r) => ({ value: r.id, label: `${r.route_number} — ${r.name}` }))}
          />

          <Select
            label="Assigned Bus"
            value={editBusId}
            onChange={(e) => setEditBusId(e.target.value)}
            options={buses.map((b) => ({ value: b.id, label: `${b.bus_number} (${b.type})` }))}
          />

          <Select
            label="Assigned Conductor"
            value={editConductorId}
            onChange={(e) => setEditConductorId(e.target.value)}
            options={[
              { value: "", label: "— Unassigned —" },
              ...conductors.map((c) => ({ value: c.id, label: `${c.display_name} (${c.government_id})` })),
            ]}
          />

          <DateTimePicker
            label="Scheduled Departure"
            value={editDeparture}
            onChange={setEditDeparture}
          />

          <DateTimePicker
            label="Scheduled Arrival (Optional)"
            value={editArrival}
            onChange={setEditArrival}
          />

          <Input
            label="Reason for Modification"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="e.g., Driver reassignment / Vehicle swap"
          />

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingTrip(null)} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog
        open={Boolean(auditTrip)}
        onClose={() => setAuditTrip(null)}
        title={`Audit Trail: Trip #${auditTrip?.id.slice(0, 8)}`}
      >
        <div className="py-2">
          {loadingAudit ? (
            <p className="text-sm text-slate-500">Loading audit trail…</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No modification records found for this trip.</p>
          ) : (
            <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs flex flex-col gap-1">
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="font-bold text-slate-700 dark:text-slate-300 uppercase">{log.field_name}</span>
                    <span>{new Date(log.edited_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="line-through text-rose-500">{log.old_value || "—"}</span>
                    <span>→</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{log.new_value || "—"}</span>
                  </div>
                  {log.reason && <p className="text-slate-500 mt-1 italic">Reason: {log.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      {/* Cancel or Delete Scheduled Trip Dialog */}
      <Dialog
        open={Boolean(deletingTrip)}
        onClose={() => {
          if (!isDeleting && !isCancelling) setDeletingTrip(null);
        }}
        title="Delete or Cancel Scheduled Trip"
      >
        {deletingTrip && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/70 text-xs dark:bg-slate-800/50 dark:border-slate-700">
              <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                <div>
                  <span className="text-slate-400 font-medium">Route: </span>
                  <span className="font-bold">{routeLabel(deletingTrip.route_id)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Bus: </span>
                  <span className="font-bold">{busLabel(deletingTrip.bus_id)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Conductor: </span>
                  <span className="font-bold">{conductorLabel(deletingTrip.conductor_id)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Status: </span>
                  <Badge tone="neutral">{deletingTrip.status}</Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 rounded-xl bg-amber-50/70 p-3 border border-amber-200/70 text-xs text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300">
              <p className="font-bold">Choose an action for this scheduled trip:</p>
              <p>• <strong>Cancel Trip:</strong> Marks status as <em>CANCELLED</em>. Preserves an audit trail for dispatch logs.</p>
              <p>• <strong>Delete Permanently:</strong> Completely removes this scheduled trip from the database.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Cancellation Reason / Note (optional)
              </label>
              <Input
                placeholder="e.g. Bus breakdown, schedule change, bad weather"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            {deleteError && (
              <Alert tone="danger" title="Action failed">
                {deleteError}
              </Alert>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingTrip(null)}
                disabled={isDeleting || isCancelling}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCancelTrip(deletingTrip)}
                isLoading={isCancelling}
                disabled={isDeleting}
                className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
              >
                Cancel Trip
              </Button>
              <Button
                type="button"
                onClick={() => handleDeleteTrip(deletingTrip)}
                isLoading={isDeleting}
                disabled={isCancelling}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Delete Permanently
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
