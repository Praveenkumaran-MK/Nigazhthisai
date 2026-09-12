import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, Input, PlusIcon, AlertTriangleIcon, MapPinIcon } from "@sbt/ui";
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
    </div>
  );
}
