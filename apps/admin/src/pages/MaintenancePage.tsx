import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Bus } from "@sbt/shared-types";
import { Dialog, Button, Select, Input, Badge, Card } from "@sbt/ui";

interface MaintenanceLog {
  id: string;
  resource_label: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export function MaintenancePage() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);

  // New Maintenance Entry Modal
  const [showModal, setShowModal] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [status, setStatus] = useState("UNDER_MAINTENANCE");
  const [notes, setNotes] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [busRes, busLogsRes] = await Promise.all([
        supabase.from("buses").select("*").order("bus_number"),
        supabase.from("bus_maintenance_logs").select("*, buses(bus_number)").order("created_at", { ascending: false }).limit(50),
      ]);

      const busList = (busRes.data ?? []) as Bus[];
      setBuses(busList);

      if (busList.length > 0 && !resourceId && busList[0]) {
        setResourceId(busList[0].id);
      }

      const busLogs: MaintenanceLog[] = (busLogsRes.data ?? []).map((l: any) => ({
        id: l.id,
        resource_label: `Bus #${l.buses?.bus_number ?? "N/A"}`,
        status: l.status,
        notes: l.notes,
        created_at: l.created_at,
      }));

      setLogs(busLogs);
    } catch (err) {
      console.error("Failed to load maintenance data:", err);
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceId) return;
    setIsLogging(true);
    try {
      const { error: err } = await supabase.rpc("log_maintenance_entry", {
        p_resource_type: "BUS",
        p_resource_id: resourceId,
        p_status: status,
        p_battery_level: null,
        p_notes: notes.trim() || null,
      });

      if (err) throw err;

      setShowModal(false);
      setNotes("");
      await loadData();
    } catch (err: any) {
      alert("Failed to log maintenance event: " + err.message);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Bus Fleet Maintenance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track vehicle repairs, diagnostic logs, and operational availability for the bus fleet.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Log Maintenance Event</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase">Buses in Service</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {buses.filter((b) => b.is_active).length} / {buses.length}
          </p>
          <span className="text-[11px] text-slate-400">Active & road-ready</span>
        </Card>
        <Card className="p-4 border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase">Under Maintenance / Inactive</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {buses.filter((b) => !b.is_active).length}
          </p>
          <span className="text-[11px] text-slate-400">In depot workshop</span>
        </Card>
        <Card className="p-4 border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase">Total Service Logs</p>
          <p className="mt-1 text-2xl font-bold text-brand-600">
            {logs.length}
          </p>
          <span className="text-[11px] text-slate-400">Recent audit records</span>
        </Card>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {["Vehicle", "Status", "Notes", "Logged At"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading logs…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No maintenance records found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{log.resource_label}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        log.status === "OPERATIONAL" || log.status === "ACTIVE"
                          ? "success"
                          : log.status === "UNDER_MAINTENANCE"
                          ? "warning"
                          : "danger"
                      }
                    >
                      {log.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs max-w-xs truncate">
                    {log.notes || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Log Maintenance Dialog */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} title="Log Bus Maintenance Status">
        <form onSubmit={handleLogSubmit} className="flex flex-col gap-4 py-2">
          <Select
            label="Select Bus Vehicle"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            options={buses.map((b) => ({ value: b.id, label: `${b.bus_number} (${b.type})` }))}
          />

          <Select
            label="New Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "OPERATIONAL", label: "Operational / Ready for Service" },
              { value: "UNDER_MAINTENANCE", label: "Under Maintenance" },
              { value: "OUT_OF_SERVICE", label: "Out of Service" },
              { value: "DECOMMISSIONED", label: "Decommissioned" },
            ]}
          />

          <Input
            label="Maintenance Notes / Root Cause"
            placeholder="e.g. Brake pad replacement, engine oil change completed"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLogging}>
              Submit Log Entry →
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
