import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, ErrorState } from "@sbt/ui";
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
          adminEmail: null, // emails are in auth.users, not profiles — don't expose
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

  if (status === "error") {
    return <ErrorState description={error ?? undefined} onRetry={load} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Districts</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          All transit districts under the State Transit Authority. Assign district admins via the Admin Users page.
        </p>
      </div>

      {status === "loading" && (
        <p className="text-sm text-slate-500">Loading districts…</p>
      )}

      {status === "success" && districts.length === 0 && (
        <EmptyState
          title="No districts configured"
          description="Districts are seeded via SQL migration. Run supabase/seed.sql to populate them."
        />
      )}

      {status === "success" && districts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {districts.map((d) => (
            <Card key={d.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{d.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Code: <span className="font-mono">{d.code}</span> · {d.state}
                  </p>
                </div>
                <Badge tone={d.is_active ? "success" : "neutral"}>
                  {d.is_active ? "Active" : "Inactive"}
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

              <div className="flex items-center gap-2 border-t border-border-light pt-3 dark:border-border-dark">
                <span className="text-xs text-slate-500">Admin:</span>
                {d.adminName ? (
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{d.adminName}</span>
                ) : (
                  <Badge tone="warning">Unassigned</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
