import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Bus, EtmDevice } from "@sbt/shared-types";
import { Dialog, Button, Select, Input, Badge, Card } from "@sbt/ui";

interface MaintenanceLog {
  id: string;
  resource_type: "BUS" | "ETM";
  resource_label: string;
  status: string;
  notes: string | null;
  battery_level?: number | null;
  created_at: string;
}

export function MaintenancePage() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [etms, setEtms] = useState<EtmDevice[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [activeTab, setActiveTab] = useState<"ALL" | "BUS" | "ETM">("ALL");
  const [loading, setLoading] = useState(true);

  // New Maintenance Entry Modal
  const [showModal, setShowModal] = useState(false);
  const [resourceType, setResourceType] = useState<"BUS" | "ETM">("BUS");
  const [resourceId, setResourceId] = useState("");
  const [status, setStatus] = useState("UNDER_MAINTENANCE");
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [notes, setNotes] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [busRes, etmRes, busLogsRes, etmLogsRes] = await Promise.all([
        supabase.from("buses").select("*").order("bus_number"),
        supabase.from("etm_devices").select("*").order("device_serial"),
        supabase.from("bus_maintenance_logs").select("*, buses(bus_number)").order("created_at", { ascending: false }).limit(50),
        supabase.from("etm_maintenance_logs").select("*, etm_devices(device_serial)").order("created_at", { ascending: false }).limit(50),
      ]);

      const busList = (busRes.data ?? []) as Bus[];
      const etmList = (etmRes.data ?? []) as EtmDevice[];

      setBuses(busList);
      setEtms(etmList);

      if (busList.length > 0 && !resourceId && busList[0]) {
        setResourceId(busList[0].id);
      }

      const combinedLogs: MaintenanceLog[] = [
        ...(busLogsRes.data ?? []).map((l: any) => ({
          id: l.id,
          resource_type: "BUS" as const,
          resource_label: `Bus #${l.buses?.bus_number ?? "N/A"}`,
          status: l.status,
          notes: l.notes,
          created_at: l.created_at,
        })),
        ...(etmLogsRes.data ?? []).map((l: any) => ({
          id: l.id,
          resource_type: "ETM" as const,
          resource_label: `ETM: ${l.etm_devices?.device_serial ?? "N/A"}`,
          status: l.status,
          notes: l.notes,
          battery_level: l.battery_level,
          created_at: l.created_at,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setLogs(combinedLogs);
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
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_status: status,
        p_battery_level: resourceType === "ETM" ? batteryLevel : null,
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

  const filteredLogs = logs.filter((l) => activeTab === "ALL" || l.resource_type === activeTab);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Fleet & ETM Maintenance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track repairs, diagnostic logs, and operational availability for buses and ETMs.
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
        </Card>
        <Card className="p-4 border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase">Inactive Buses & Faulty ETMs</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {buses.filter((b) => !b.is_active).length + etms.filter((e) => e.status === "FAULTY" || e.status === "OFFLINE").length}
          </p>
        </Card>
        <Card className="p-4 border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase">Active ETM Devices</p>
          <p className="mt-1 text-2xl font-bold text-cyan-600">
            {etms.filter((e) => e.status === "ACTIVE").length} / {etms.length}
          </p>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        {(["ALL", "BUS", "ETM"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === tab
                ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "ALL" ? "All Activity Logs" : tab === "BUS" ? "Bus Fleet Logs" : "ETM Device Logs"}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {["Resource", "Type", "Status", "Notes", "Battery", "Logged At"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading logs…
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No maintenance records found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{log.resource_label}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{log.resource_type}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        log.status === "OPERATIONAL" || log.status === "ACTIVE"
                          ? "success"
                          : log.status === "UNDER_MAINTENANCE" || log.status === "CHARGING"
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
                  <td className="px-4 py-3 text-xs font-mono">
                    {log.battery_level != null ? `${log.battery_level}%` : "—"}
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
      <Dialog open={showModal} onClose={() => setShowModal(false)} title="Log Maintenance Status">
        <form onSubmit={handleLogSubmit} className="flex flex-col gap-4 py-2">
          <Select
            label="Resource Category"
            value={resourceType}
            onChange={(e) => {
              const val = e.target.value as "BUS" | "ETM";
              setResourceType(val);
              if (val === "BUS" && buses.length > 0 && buses[0]) setResourceId(buses[0].id);
              if (val === "ETM" && etms.length > 0 && etms[0]) setResourceId(etms[0].id);
            }}
            options={[
              { value: "BUS", label: "Bus Vehicle" },
              { value: "ETM", label: "ETM Device" },
            ]}
          />

          <Select
            label={resourceType === "BUS" ? "Select Bus" : "Select ETM Device"}
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            options={
              resourceType === "BUS"
                ? buses.map((b) => ({ value: b.id, label: `${b.bus_number} (${b.type})` }))
                : etms.map((e) => ({ value: e.id, label: `${e.device_serial} (${e.status})` }))
            }
          />

          <Select
            label="New Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={
              resourceType === "BUS"
                ? [
                    { value: "OPERATIONAL", label: "Operational / Ready" },
                    { value: "UNDER_MAINTENANCE", label: "Under Maintenance" },
                    { value: "OUT_OF_SERVICE", label: "Out of Service" },
                    { value: "DECOMMISSIONED", label: "Decommissioned" },
                  ]
                : [
                    { value: "ACTIVE", label: "Active / Deployed" },
                    { value: "CHARGING", label: "Charging Depot" },
                    { value: "FAULTY", label: "Faulty / Hardware Defect" },
                    { value: "UNDER_REPAIR", label: "Under Repair" },
                    { value: "OFFLINE", label: "Offline Storage" },
                  ]
            }
          />

          {resourceType === "ETM" && (
            <Input
              type="number"
              label="Battery Level %"
              min={0}
              max={100}
              value={String(batteryLevel)}
              onChange={(e) => setBatteryLevel(Number(e.target.value))}
            />
          )}

          <Input
            label="Maintenance Notes / Root Cause"
            placeholder="e.g. Brake pad replacement completed"
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
