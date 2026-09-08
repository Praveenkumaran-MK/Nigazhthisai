import { useEffect, useState } from "react";
import { Badge, DataTable, EmptyState, ErrorState } from "@sbt/ui";
import type { Profile, District } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";

interface AdminUser extends Profile {
  districtName: string | null;
}

export function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setStatus("loading");
    setError(null);
    try {
      const [profilesRes, districtsRes] = await Promise.all([
        supabase.from("profiles").select("*").in("role", ["admin", "master_admin"]).order("display_name"),
        supabase.from("districts").select("id, name"),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);

      const districts = (districtsRes.data ?? []) as Pick<District, "id" | "name">[];
      const districtMap = new Map(districts.map((d) => [d.id, d.name]));

      const enriched: AdminUser[] = (profilesRes.data ?? []).map((p) => ({
        ...(p as Profile),
        districtName: p.district_id ? (districtMap.get(p.district_id) ?? null) : null,
      }));

      setAdmins(enriched);
      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin users");
      setStatus("error");
    }
  };

  useEffect(() => { void load(); }, []);

  if (status === "error") {
    return <ErrorState description={error ?? undefined} onRetry={load} />;
  }

  const roleTone = (role: string): "brand" | "success" | "neutral" => {
    if (role === "master_admin") return "brand";
    if (role === "admin") return "success";
    return "neutral";
  };

  const roleLabel = (role: string): string => {
    if (role === "master_admin") return "Master Admin";
    if (role === "admin") return "District Admin";
    return role;
  };

  const statusTone = (s: string): "success" | "danger" | "neutral" =>
    s === "active" ? "success" : s === "suspended" ? "danger" : "neutral";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Admin Users</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          All admin and master admin accounts across the system. Provisioned via Supabase Auth.
        </p>
      </div>

      {status === "success" && admins.length === 0 && (
        <EmptyState
          title="No admin users found"
          description="Admin accounts are seeded via supabase/seed.sql or created through the Supabase Dashboard."
        />
      )}

      <DataTable
        columns={[
          {
            key: "name",
            header: "Name",
            render: (a) => (
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {a.display_name ?? a.full_name ?? "—"}
              </span>
            ),
          },
          {
            key: "role",
            header: "Role",
            render: (a) => <Badge tone={roleTone(a.role)}>{roleLabel(a.role)}</Badge>,
          },
          {
            key: "district",
            header: "District",
            render: (a) => (
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {a.districtName ?? (a.role === "master_admin" ? "All Districts" : "—")}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (a) => <Badge tone={statusTone(a.status)}>{a.status}</Badge>,
          },
          {
            key: "since",
            header: "Created",
            render: (a) =>
              new Date(a.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
          },
        ]}
        rows={admins}
        getRowId={(a) => a.id}
        isLoading={status === "loading"}
        emptyTitle="No admin users"
      />
    </div>
  );
}
