import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAdminAuth } from "../hooks/useAdminAuth";
import type { District, EtmDevice, Bus, Conductor } from "@sbt/shared-types";
import { Dialog, Button, Select, Input } from "@sbt/ui";

interface EtmWithRelations extends EtmDevice {
  bus_number?: string;
  conductor_name?: string;
  district_name?: string;
}

export function EtmPage() {
  const { profile } = useAdminAuth();
  const [devices, setDevices] = useState<EtmWithRelations[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    device_serial: "",
    district_id: "",
    status: "ACTIVE" as EtmDevice["status"],
    battery_level: 100,
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Assign Modal state
  const [assigningDevice, setAssigningDevice] = useState<EtmWithRelations | null>(null);
  const [assignConductorId, setAssignConductorId] = useState("");
  const [assignBusId, setAssignBusId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("etm_devices")
        .select(`
          *,
          buses ( bus_number ),
          conductors ( display_name ),
          districts ( name )
        `)
        .order("created_at", { ascending: false });

      if (err) throw err;

      setDevices(
        (data ?? []).map((d: any) => ({
          ...d,
          bus_number: d.buses?.bus_number ?? null,
          conductor_name: d.conductors?.display_name ?? null,
          district_name: d.districts?.name ?? null,
        }))
      );

      const [distRes, busRes, condRes] = await Promise.all([
        supabase.from("districts").select("*").eq("is_active", true).order("name"),
        supabase.from("buses").select("*").eq("status", "ACTIVE").order("bus_number"),
        supabase.from("conductors").select("*").eq("is_active", true).order("display_name"),
      ]);

      setDistricts(distRes.data ?? []);
      setBuses((busRes.data ?? []) as Bus[]);
      setConductors((condRes.data ?? []) as Conductor[]);
    } catch (e: any) {
      setError(e.message ?? "Failed to load ETM devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.device_serial.trim()) return;
    setSaving(true);
    try {
      const payload = {
        device_serial: form.device_serial.trim().toUpperCase(),
        district_id: form.district_id || profile?.district_id || null,
        status: form.status,
        battery_level: form.battery_level,
      };

      if (editingId) {
        const { error: err } = await supabase
          .from("etm_devices")
          .update(payload)
          .eq("id", editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("etm_devices")
          .insert(payload);
        if (err) throw err;
      }

      setShowAdd(false);
      setEditingId(null);
      setForm({ device_serial: "", district_id: "", status: "ACTIVE", battery_level: 100 });
      await load();
    } catch (e: any) {
      alert("Save failed: " + (e.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningDevice) return;
    setAssigning(true);
    try {
      const { error: err } = await supabase.rpc("assign_etm", {
        p_etm_device_id: assigningDevice.id,
        p_conductor_id: assignConductorId || null,
        p_bus_id: assignBusId || null,
        p_notes: assignNotes.trim() || null,
      });

      if (err) throw err;
      setAssigningDevice(null);
      setAssignConductorId("");
      setAssignBusId("");
      setAssignNotes("");
      await load();
    } catch (e: any) {
      alert("Assignment failed: " + (e.message ?? "Unknown error"));
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (deviceId: string) => {
    if (!confirm("Are you sure you want to unassign this ETM device?")) return;
    try {
      const { error: err } = await supabase.rpc("unassign_etm", {
        p_etm_device_id: deviceId,
      });
      if (err) throw err;
      await load();
    } catch (e: any) {
      alert("Unassignment failed: " + (e.message ?? "Unknown error"));
    }
  };

  const statusColor: Record<string, string> = {
    ACTIVE:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    OFFLINE:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    CHARGING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    FAULTY:   "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };

  const batteryColor = (level: number | null) => {
    if (!level) return "text-slate-400";
    if (level > 50) return "text-emerald-600";
    if (level > 20) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ETM Devices & Live Linking</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage Electronic Ticketing Machines with live bus & conductor assignments.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); setForm({ device_serial: "", district_id: "", status: "ACTIVE", battery_level: 100 }); }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          + Add Device
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Add / Edit form */}
      {showAdd && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
            {editingId ? "Edit Device" : "Register New ETM Device"}
          </h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Serial Number *</label>
              <input
                required
                placeholder="ETM-001"
                value={form.device_serial}
                onChange={e => setForm(f => ({ ...f, device_serial: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">District</label>
              <select
                value={form.district_id}
                onChange={e => setForm(f => ({ ...f, district_id: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">— All districts —</option>
                {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as EtmDevice["status"] }))}
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option>ACTIVE</option>
                <option>OFFLINE</option>
                <option>CHARGING</option>
                <option>FAULTY</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Battery %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.battery_level}
                onChange={e => setForm(f => ({ ...f, battery_level: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : editingId ? "Update" : "Register"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setEditingId(null); }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Devices table */}
      {loading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading devices…</div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          No ETM devices registered. Add the first device above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {["Serial", "District", "Assigned Bus", "Conductor", "Status", "Battery", "Last Sync", "Actions"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {devices.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800 dark:text-slate-200">{d.device_serial}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.district_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-semibold">{d.bus_number ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.conductor_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-semibold tabular-nums ${batteryColor(d.battery_level)}`}>
                    {d.battery_level != null ? `${d.battery_level}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                    {d.last_synced_at ? new Date(d.last_synced_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setAssigningDevice(d);
                          setAssignBusId(d.assigned_bus_id ?? "");
                          setAssignConductorId(d.assigned_conductor_id ?? "");
                          setAssignNotes("");
                        }}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                      >
                        Assign ETM
                      </button>
                      {(d.assigned_bus_id || d.assigned_conductor_id) && (
                        <button
                          onClick={() => handleUnassign(d.id)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                        >
                          Unassign
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingId(d.id);
                          setForm({
                            device_serial: d.device_serial,
                            district_id: d.district_id ?? "",
                            status: d.status,
                            battery_level: d.battery_level ?? 100,
                          });
                          setShowAdd(true);
                        }}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign ETM Modal */}
      <Dialog
        open={Boolean(assigningDevice)}
        onClose={() => setAssigningDevice(null)}
        title={`Assign ETM: ${assigningDevice?.device_serial ?? ""}`}
      >
        <form onSubmit={handleAssignSubmit} className="flex flex-col gap-4 py-2">
          <Select
            label="Assign to Bus"
            value={assignBusId}
            onChange={(e) => setAssignBusId(e.target.value)}
            options={[
              { value: "", label: "— No Bus Assigned —" },
              ...buses.map((b) => ({ value: b.id, label: `${b.bus_number} (${b.type})` })),
            ]}
          />

          <Select
            label="Assign to Conductor"
            value={assignConductorId}
            onChange={(e) => setAssignConductorId(e.target.value)}
            options={[
              { value: "", label: "— No Conductor Assigned —" },
              ...conductors.map((c) => ({ value: c.id, label: `${c.display_name} (${c.government_id})` })),
            ]}
          />

          <Input
            label="Assignment Notes (Optional)"
            placeholder="e.g. Shift 1 Morning Route"
            value={assignNotes}
            onChange={(e) => setAssignNotes(e.target.value)}
          />

          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" type="button" onClick={() => setAssigningDevice(null)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={assigning}>
              Confirm Assignment →
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
