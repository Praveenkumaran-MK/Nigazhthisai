import { useEffect, useState, useCallback } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  BusIcon,
  RouteIcon,
  UserIcon,
  AlertTriangleIcon,
  ShieldAlertIcon,
  CheckCircleIcon,
  ClockIcon,
  DollarSignIcon,
  UsersIcon,
  FileTextIcon,
  FilterIcon,
} from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { MessageSquare, AlertCircle } from "lucide-react";
import type { Complaint, District } from "@sbt/shared-types";

interface EnrichedComplaint extends Complaint {
  buses?: {
    id: string;
    bus_number: string;
    bus_type?: string;
  } | null;
  trips?: {
    id: string;
    conductor_id?: string | null;
    routes?: {
      id: string;
      name: string;
      route_number: string;
    } | null;
    conductors?: {
      id: string;
      display_name: string;
      phone?: string | null;
    } | null;
  } | null;
  districts?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

const TYPES = [
  "SAFETY",
  "OVERCROWDING",
  "OVERCHARGING",
  "DRIVER_BEHAVIOR",
  "CLEANLINESS",
  "OTHER",
] as const;

const STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;

const statusColor: Record<string, string> = {
  OPEN: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  IN_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  RESOLVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  DISMISSED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const typeLabel: Record<string, string> = {
  SAFETY: "Safety & Security",
  OVERCROWDING: "Overcrowding",
  OVERCHARGING: "Fare Overcharging",
  DRIVER_BEHAVIOR: "Driver / Crew Conduct",
  CLEANLINESS: "Cleanliness & Hygiene",
  OTHER: "General Grievance",
};

function TypeBadgeIcon({ type }: { type: string }) {
  switch (type) {
    case "SAFETY":
      return <ShieldAlertIcon className="h-3.5 w-3.5 text-rose-600" />;
    case "OVERCROWDING":
      return <UsersIcon className="h-3.5 w-3.5 text-amber-600" />;
    case "OVERCHARGING":
      return <DollarSignIcon className="h-3.5 w-3.5 text-indigo-600" />;
    case "DRIVER_BEHAVIOR":
      return <AlertTriangleIcon className="h-3.5 w-3.5 text-orange-600" />;
    case "CLEANLINESS":
      return <CheckCircleIcon className="h-3.5 w-3.5 text-teal-600" />;
    default:
      return <FileTextIcon className="h-3.5 w-3.5 text-slate-500" />;
  }
}

export function ComplaintsPage() {
  const [complaints, setComplaints] = useState<EnrichedComplaint[]>([]);
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
        .select(`
          *,
          buses (
            id,
            bus_number
          ),
          trips (
            id,
            conductor_id,
            routes (
              id,
              name,
              route_number
            ),
            conductors (
              id,
              display_name,
              phone
            )
          ),
          districts (
            id,
            name,
            code
          )
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      const { data, error: err } = await query;
      if (err) throw err;
      setComplaints((data as unknown as EnrichedComplaint[]) ?? []);

      const { data: distData } = await supabase
        .from("districts")
        .select("*")
        .eq("is_active", true)
        .order("name");
      setDistricts((distData as District[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = async (complaint: EnrichedComplaint, newStatus: Complaint["status"]) => {
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
      setComplaints((prev) =>
        prev.map((c) => (c.id === complaint.id ? { ...c, status: newStatus } : c))
      );
    } catch (e: any) {
      alert("Update failed: " + (e.message ?? "Unknown error"));
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = complaints.filter((c) => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterType && c.type !== filterType) return false;
    if (filterDistrict && c.district_id !== filterDistrict) return false;
    return true;
  });

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = complaints.filter((c) => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const safetyCount = complaints.filter((c) => c.type === "SAFETY" && (c.status === "OPEN" || c.status === "IN_REVIEW")).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileTextIcon className="h-5 w-5 text-brand-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Passenger Grievances & Service Audits
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Investigate reported incidents, evaluate crew conduct, and cross-reference bus and route telemetry.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          Refresh Grievances
        </Button>
      </div>

      {/* Top Overview KPI Dashboard Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#112240]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Grievances</span>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{complaints.length}</p>
          <span className="text-[10px] text-slate-500">Across all transit districts</span>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs dark:border-rose-950/60 dark:bg-rose-950/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">Open & Unresolved</span>
          <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">{counts.OPEN ?? 0}</p>
          <span className="text-[10px] text-rose-500">{safetyCount} flagged as safety concerns</span>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs dark:border-amber-950/60 dark:bg-amber-950/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Under Review</span>
          <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{counts.IN_REVIEW ?? 0}</p>
          <span className="text-[10px] text-amber-600">Active investigator assigned</span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-950/60 dark:bg-emerald-950/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Resolved Grievances</span>
          <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">{counts.RESOLVED ?? 0}</p>
          <span className="text-[10px] text-emerald-600">Remediation closed</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-y border-slate-100 py-3 dark:border-slate-800">
        {/* Status Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterStatus("")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors border ${
              filterStatus === ""
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent"
                : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            All ({complaints.length})
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors border ${
                filterStatus === s
                  ? statusColor[s] + " border-current"
                  : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {s.replace("_", " ")} ({counts[s] ?? 0})
            </button>
          ))}
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
            <FilterIcon className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none dark:text-slate-300"
            >
              <option value="">All Categories</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel[t]}
                </option>
              ))}
            </select>
          </div>

          {districts.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
              <select
                value={filterDistrict}
                onChange={(e) => setFilterDistrict(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none dark:text-slate-300"
              >
                <option value="">All Districts</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-500">Loading complaints and telemetry logs…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No grievances match the filter"
          description="Try changing the category, status, or district filters above."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => {
            const busNo = c.buses?.bus_number;
            const route = c.trips?.routes;
            const conductor = c.trips?.conductors;
            const districtName = c.districts?.name;

            return (
              <Card key={c.id} className="p-4 transition hover:border-brand-500/50">
                <div className="flex flex-col gap-3">
                  {/* Top Bar: Type, Ref, Time, District, Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800">
                        <TypeBadgeIcon type={c.type} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {typeLabel[c.type] ?? c.type}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          REF #{c.id.slice(0, 8).toUpperCase()}
                        </span>
                        {districtName && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {districtName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <ClockIcon className="h-3 w-3" />
                        {new Date(c.created_at).toLocaleString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusColor[c.status]}`}>
                        {c.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Customer Grievance Statement / Message */}
                  <div className="rounded-xl border border-amber-300/80 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-amber-50/30 p-3.5 dark:border-amber-800/60 dark:from-slate-800/90 dark:via-slate-800/70 dark:to-slate-900/80 shadow-xs">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-200/60 dark:border-slate-700/60">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Customer Complaint Message / Written Statement</span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Submitted by: {c.passenger_id ? `Passenger #${c.passenger_id.slice(0, 8)}` : "Verified Passenger"}
                      </span>
                    </div>

                    {c.description && c.description.trim() ? (
                      <div className="relative pl-3 border-l-2 border-amber-500 dark:border-amber-400 bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-r-lg">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                          "{c.description.trim()}"
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs italic text-slate-500 dark:text-slate-400 pl-1">
                        <AlertCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>No written message was entered by the customer. (Categorized as {typeLabel[c.type] ?? c.type})</span>
                      </div>
                    )}
                  </div>

                  {/* Metadata Chips: Customer, Bus, Route, Conductor */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2.5 py-0.5 font-bold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40">
                        <UserIcon className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                        <span>Customer: {c.passenger_id ? `Passenger #${c.passenger_id.slice(0, 8)}` : "Verified Rider"}</span>
                      </span>
                      {busNo && (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
                          <BusIcon className="h-3 w-3 text-blue-500" />
                          <span>Bus: {busNo}</span>
                        </span>
                      )}
                      {route && (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          <RouteIcon className="h-3 w-3 text-slate-400" />
                          <span>Route: {route.route_number || route.name} {route.name && route.route_number && route.name !== route.route_number ? `(${route.name})` : ""}</span>
                        </span>
                      )}
                      {conductor && (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          <UserIcon className="h-3 w-3 text-slate-400" />
                          <span>Conductor: {conductor.display_name} {conductor.phone ? `(${conductor.phone})` : ""}</span>
                        </span>
                      )}
                      {c.trip_id && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          Trip: #{c.trip_id.slice(0, 8)}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {c.status === "OPEN" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === c.id}
                            onClick={() => handleStatusChange(c, "IN_REVIEW")}
                          >
                            Mark In Review
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={updatingId === c.id}
                            onClick={() => handleStatusChange(c, "DISMISSED")}
                          >
                            Dismiss
                          </Button>
                        </>
                      )}
                      {c.status === "IN_REVIEW" && (
                        <Button
                          size="sm"
                          disabled={updatingId === c.id}
                          onClick={() => handleStatusChange(c, "RESOLVED")}
                        >
                          {updatingId === c.id ? "Updating…" : "Mark Resolved"}
                        </Button>
                      )}
                      {(c.status === "RESOLVED" || c.status === "DISMISSED") && (
                        <span className="text-[11px] text-slate-400">
                          Closed on {c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : "—"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
