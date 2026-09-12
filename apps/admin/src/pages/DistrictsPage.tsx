import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, Input, PlusIcon, AlertTriangleIcon, MapPinIcon, TrashIcon } from "@sbt/ui";
import type { District } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";

interface DistrictWithAdmin extends District {
  adminName: string | null;
  adminEmail: string | null;
  busCount: number;
  conductorCount: number;
}

export function DistrictsPage() {
  const [districts, setDistricts] = useState<DistrictWithAdmin[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  // Add District Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [districtName, setDistrictName] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [stateName, setStateName] = useState("Tamil Nadu");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete District State
  const [deletingDistrict, setDeletingDistrict] = useState<DistrictWithAdmin | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = async () => {
    setStatus("loading");
    setError(null);
    try {
      const [distRes, profilesRes, busRes, condRes] = await Promise.all([
        supabase.from("districts").select("*").order("name"),
        supabase.from("profiles").select("id, display_name, full_name, district_id").eq("role", "admin"),
        supabase.from("buses").select("id, district_id"),
        supabase.from("conductors").select("id, district_id"),
      ]);

      if (distRes.error) throw new Error(distRes.error.message);

      const rawDistricts = (distRes.data ?? []) as District[];
      const admins = (profilesRes.data ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null; district_id: string | null }>;
      const buses = (busRes.data ?? []) as Array<{ id: string; district_id: string | null }>;
      const conductors = (condRes.data ?? []) as Array<{ id: string; district_id: string | null }>;

      const enriched: DistrictWithAdmin[] = rawDistricts.map((d) => {
        const admin = admins.find((a) => a.district_id === d.id) ?? null;
        return {
          ...d,
          adminName: admin?.display_name ?? admin?.full_name ?? null,
          adminEmail: null,
          busCount: buses.filter((b) => b.district_id === d.id).length,
          conductorCount: conductors.filter((c) => c.district_id === d.id).length,
        };
      });

      setDistricts(enriched);
      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load districts");
      setStatus("error");
    }
  };

  useEffect(() => { void load(); }, []);

  const handleCreateDistrict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!districtName.trim() || !districtCode.trim()) {
      setCreateError("District Name and Code are required.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);

    try {
      const { error: insertErr } = await supabase.from("districts").insert({
        name: districtName.trim(),
        code: districtCode.trim().toUpperCase(),
        state: stateName.trim() || "Tamil Nadu",
        is_active: true,
      });

      if (insertErr) throw new Error(insertErr.message);

      setIsAddModalOpen(false);
      setDistrictName("");
      setDistrictCode("");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create district");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDistrict = async () => {
    if (!deletingDistrict) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // 1. Try delete_district RPC
      const { error: rpcErr } = await supabase.rpc("delete_district", {
        p_district_id: deletingDistrict.id,
      });

      if (rpcErr) {
        // Fallback: manually unlink profiles, conductors, buses, routes then delete district
        await supabase.from("profiles").update({ district_id: null }).eq("district_id", deletingDistrict.id);
        await supabase.from("conductors").update({ district_id: null }).eq("district_id", deletingDistrict.id);
        await supabase.from("buses").update({ district_id: null }).eq("district_id", deletingDistrict.id);
        await supabase.from("routes").update({ district_id: null }).eq("district_id", deletingDistrict.id);
        const { error: delErr } = await supabase.from("districts").delete().eq("id", deletingDistrict.id);
        if (delErr) throw new Error(delErr.message);
      }

      setDeletingDistrict(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete district");
    } finally {
      setIsDeleting(false);
    }
  };

  if (status === "error") {
    return <ErrorState description={error ?? undefined} onRetry={load} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Districts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            All transit jurisdictions under Nigazhthisai Transit Authority. Assign district admins via the Admin Users page.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreateError(null);
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Add District</span>
        </Button>
      </div>

      {status === "loading" && (
        <p className="text-sm text-slate-500">Loading districts…</p>
      )}

      {status === "success" && districts.length === 0 && (
        <EmptyState
          title="No districts configured"
          description="Click '+ Add District' above to register a new operating district."
        />
      )}

      {status === "success" && districts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {districts.map((d) => {
            const hasAdmin = Boolean(d.adminName);
            const isOperational = d.is_active && hasAdmin;

            return (
              <Card key={d.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <MapPinIcon className="h-4 w-4 text-brand-500" />
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{d.name}</p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Code: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{d.code}</span> · {d.state}
                    </p>
                  </div>
                  <Badge tone={isOperational ? "success" : "neutral"}>
                    {isOperational ? "Active" : (!hasAdmin ? "Inactive (Unassigned)" : "Inactive")}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{d.busCount}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Buses</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{d.conductorCount}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Conductors</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border-light pt-3 dark:border-border-dark">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Admin:</span>
                    {d.adminName ? (
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{d.adminName}</span>
                    ) : (
                      <Badge tone="warning">Unassigned</Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-1.5 h-auto inline-flex items-center gap-1 text-xs font-semibold"
                    onClick={() => {
                      setDeleteError(null);
                      setDeletingDistrict(d);
                    }}
                  >
                    <TrashIcon className="h-3.5 w-3.5 text-rose-500" />
                    <span>Delete</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add District Modal */}
      {isAddModalOpen && (
        <Modal
          open={true}
          onClose={() => !isCreating && setIsAddModalOpen(false)}
          title="Add New Transit District"
        >
          <form onSubmit={handleCreateDistrict} className="flex flex-col gap-4 py-2">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                District Name *
              </label>
              <Input
                required
                value={districtName}
                onChange={(e) => {
                  setDistrictName(e.target.value);
                  if (!districtCode && e.target.value.length >= 3) {
                    setDistrictCode(e.target.value.slice(0, 3).toUpperCase());
                  }
                }}
                placeholder="e.g. Dindigul"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                District Code (3-4 characters) *
              </label>
              <Input
                required
                value={districtCode}
                onChange={(e) => setDistrictCode(e.target.value.toUpperCase())}
                placeholder="e.g. DGL"
                maxLength={6}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                State Jurisdiction
              </label>
              <Input
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                placeholder="Tamil Nadu"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Adding District…" : "Add District"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete District Confirmation Modal */}
      {deletingDistrict && (
        <Modal
          open={true}
          onClose={() => !isDeleting && setDeletingDistrict(null)}
          title="Delete Transit District"
        >
          <div className="flex flex-col gap-4 py-2">
            {deleteError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-sm text-slate-700 dark:text-slate-300">
              Are you sure you want to delete the transit district{" "}
              <span className="font-bold text-slate-900 dark:text-slate-100">
                "{deletingDistrict.name}" ({deletingDistrict.code})
              </span>
              ?
            </p>

            {(deletingDistrict.busCount > 0 || deletingDistrict.conductorCount > 0 || deletingDistrict.adminName) && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-300 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>District Resources Notice</span>
                </div>
                <p>
                  This district currently has{" "}
                  <strong className="font-bold">{deletingDistrict.busCount} buses</strong> and{" "}
                  <strong className="font-bold">{deletingDistrict.conductorCount} conductors</strong>
                  {deletingDistrict.adminName ? (
                    <> with assigned administrator <strong className="font-bold">{deletingDistrict.adminName}</strong></>
                  ) : null}
                  . Deleting the district will safely unlink these records by clearing their district association.
                </p>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeletingDistrict(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                onClick={handleDeleteDistrict}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting District…" : "Delete District"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
