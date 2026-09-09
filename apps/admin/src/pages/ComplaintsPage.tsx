import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Complaint, District } from "@sbt/shared-types";

const TYPES = ["CLEANLINESS", "DRIVER_BEHAVIOR", "OVERCROWDING", "SAFETY", "OVERCHARGING", "OTHER"] as const;
const STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;

const statusColor: Record<string, string> = {
  OPEN:       "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  IN_REVIEW:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  RESOLVED:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  DISMISSED:  "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
};

const typeLabel: Record<string, string> = {
  CLEANLINESS:     "🧹 Cleanliness",
  DRIVER_BEHAVIOR: "🚗 Driver Behavior",
  OVERCROWDING:    "👥 Overcrowding",
  SAFETY:          "⚠️ Safety",
  OVERCHARGING:    "💸 Overcharging",
  OTHER:           "📝 Other",
};

export function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterDistrict, setFilterDistrict] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = supabase
        .from("complaints")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      const { data, error: err } = await query;
      if (err) throw err;
      setComplaints(data ?? []);

      const { data: distData } = await supabase
        .from("districts")
        .select("*")
        .eq("is_active", true)
        .order("name");
      setDistricts(distData ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleStatusChange = async (complaint: Complaint, newStatus: Complaint["status"]) => {
    setUpdatingId(complaint.id);
    try {
      const { error: err } = await supabase
        .from("complaints")
        .update({
          status: newStatus,
          resolved_by: newStatus === "RESOLVED" ? (await supabase.auth.getUser()).data.user?.id : null,
          resolved_at: newStatus === "RESOLVED" ? new Date().toISOString() : null,
        })
        .eq("id", complaint.id);
      if (err) throw err;
      setComplaints(prev =>
        prev.map(c => c.id === complaint.id ? { ...c, status: newStatus } : c)
      );
    } catch (e: any) {
      alert("Update failed: " + (e.message ?? "Unknown error"));
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = complaints.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterType && c.type !== filterType) return false;
    if (filterDistrict && c.district_id !== filterDistrict) return false;
    return true;
  });

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = complaints.filter(c => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Passenger Complaints</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Review and resolve complaints filed by passengers.</p>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors border ${
              filterStatus === s
                ? statusColor[s] + " border-current"
                : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {s} ({counts[s]})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{typeLabel[t]}</option>)}
        </select>
        {districts.length > 0 && (
          <select
            value={filterDistrict}
            onChange={e => setFilterDistrict(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">All Districts</option>
            {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading complaints…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          No complaints match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {["Filed", "Type", "Description", "Status", "Actions"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{typeLabel[c.type] ?? c.type}</span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="truncate text-slate-600 dark:text-slate-400">{c.description ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "OPEN" && (
                      <div className="flex gap-2">
                        <button
                          disabled={updatingId === c.id}
                          onClick={() => handleStatusChange(c, "IN_REVIEW")}
                          className="rounded px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-60"
                        >
                          Review
                        </button>
                        <button
                          disabled={updatingId === c.id}
                          onClick={() => handleStatusChange(c, "DISMISSED")}
                          className="rounded px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    {c.status === "IN_REVIEW" && (
                      <button
                        disabled={updatingId === c.id}
                        onClick={() => handleStatusChange(c, "RESOLVED")}
                        className="rounded px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-60"
                      >
                        {updatingId === c.id ? "…" : "Mark Resolved"}
                      </button>
                    )}
                    {(c.status === "RESOLVED" || c.status === "DISMISSED") && (
                      <span className="text-xs text-slate-400">
                        {c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
