import { useEffect, useState, useCallback } from "react";
import { DataTable, Badge, Card, Button, Dialog, Select, DateTimePicker, Input, useToast } from "@sbt/ui";
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

  const loadData = useCallback(async () => {
    setStatus("loading");
    try {
      const [t, r, b, c] = await Promise.all([
        supabase.from("trips").select("*").order("scheduled_departure", { ascending: false }).limit(100),
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
            <option value="ALL">All Statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ACTIVE">Active (In-Transit)</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <Card>
        <DataTable
          columns={[
            {
              key: "departure",
              header: "Scheduled Start",
              render: (t) =>
                t.scheduled_departure
                  ? new Date(t.scheduled_departure).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—",
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
                <div className="flex items-center gap-2">
                  {t.status === "SCHEDULED" && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(t)}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      Edit Trip
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleViewAudit(t)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  >
                    Audit Log
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
            label="Scheduled Arrival"
            value={editArrival}
            onChange={setEditArrival}
          />

          <Input
            label="Reason for Modification"
            placeholder="e.g. Conductor shift exchange or bus swap"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
          />

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" type="button" onClick={() => setEditingTrip(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              Save Changes &amp; Audit →
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog
        open={Boolean(auditTrip)}
        onClose={() => setAuditTrip(null)}
        title={`Audit Trail: Trip #${auditTrip?.id.slice(0, 8) ?? ""}`}
      >
        <div className="flex flex-col gap-3 py-2 max-h-96 overflow-y-auto">
          {loadingAudit ? (
            <div className="text-sm text-slate-500 py-4 text-center">Loading audit history…</div>
          ) : auditLogs.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">No modification history recorded for this trip.</div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex flex-col gap-1 bg-slate-50 dark:bg-slate-900">
                <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                  <span className="font-mono text-brand-600">Field: {log.field_name}</span>
                  <span className="text-slate-400">{new Date(log.edited_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-2 text-slate-600 dark:text-slate-400">
                  <span className="line-through text-rose-500">{log.old_value || "(null)"}</span>
                  <span>→</span>
                  <span className="font-medium text-emerald-500">{log.new_value || "(null)"}</span>
                </div>
                {log.reason && (
                  <p className="text-slate-500 italic mt-0.5">Reason: "{log.reason}"</p>
                )}
              </div>
            ))
          )}
          <div className="flex justify-end mt-2">
            <Button variant="outline" onClick={() => setAuditTrip(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
