import { useEffect, useState } from "react";
import { Badge, Button, DataTable, EmptyState, ErrorState, Modal, Input, Select, PlusIcon, AlertTriangleIcon } from "@sbt/ui";
import type { Profile, District } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";

interface AdminUser extends Profile {
  districtName: string | null;
}

export function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [districts, setDistricts] = useState<Pick<District, "id" | "name">[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editDistrictId, setEditDistrictId] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "suspended">("active");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add District Admin Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addDistrictId, setAddDistrictId] = useState("");
  const [addPassword, setAddPassword] = useState("Admin@2026!");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = async () => {
    setStatus("loading");
    setError(null);
    try {
      const [profilesRes, districtsRes] = await Promise.all([
        supabase.from("profiles").select("*").in("role", ["admin", "master_admin"]).order("display_name"),
        supabase.from("districts").select("id, name").order("name"),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);

      const dList = (districtsRes.data ?? []) as Pick<District, "id" | "name">[];
      setDistricts(dList);
      const districtMap = new Map(dList.map((d) => [d.id, d.name]));

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

  const openEditModal = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setEditName(admin.display_name ?? admin.full_name ?? "");
    setEditDistrictId(admin.district_id ?? "");
    setEditStatus((admin.status as "active" | "suspended") || "active");
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editingAdmin) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("update_district_admin_profile", {
        p_user_id: editingAdmin.id,
        p_display_name: editName.trim() || null,
        p_district_id: editDistrictId ? editDistrictId : null,
        p_is_active: editStatus === "active",
      });

      if (rpcErr) throw new Error(rpcErr.message);

      setEditingAdmin(null);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update admin profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addEmail.trim() || !addDistrictId) {
      setCreateError("Please fill in all required fields (Name, Email, District).");
      return;
    }
    setIsCreating(true);
    setCreateError(null);

    try {
      // 1. First attempt: call create_district_admin_user RPC
      const { data, error: rpcErr } = await supabase.rpc("create_district_admin_user", {
        p_email: addEmail.trim(),
        p_password: addPassword,
        p_display_name: addName.trim(),
        p_phone: addPhone.trim() || null,
        p_district_id: addDistrictId,
      });

      if (rpcErr) {
        // 2. Fallback to provision-conductor edge function
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-conductor`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
            },
            body: JSON.stringify({
              displayName: addName.trim(),
              temporaryPassword: addPassword,
              role: "district_admin",
              district_id: addDistrictId,
            }),
          }
        );
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || rpcErr.message || "Failed to create district administrator");
        }
      }

      setIsAddModalOpen(false);
      setAddName("");
      setAddEmail("");
      setAddPhone("");
      setAddDistrictId("");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create administrator");
    } finally {
      setIsCreating(false);
    }
  };

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Admin Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            District administrators and master authority personnel across Nigazhthisai transit districts.
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
          <span>Add District Admin</span>
        </Button>
      </div>

      {status === "success" && admins.length === 0 && (
        <EmptyState
          title="No admin users found"
          description="Admin accounts can be provisioned using the '+ Add District Admin' button above."
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
            header: "District Jurisdiction",
            render: (a) => (
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {a.districtName ?? (a.role === "master_admin" ? "All Districts (Master)" : "—")}
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
          {
            key: "actions",
            header: "Actions",
            render: (a) => (
              <Button size="sm" variant="outline" onClick={() => openEditModal(a)}>
                Edit
              </Button>
            ),
          },
        ]}
        rows={admins}
        getRowId={(a) => a.id}
        isLoading={status === "loading"}
        emptyTitle="No admin users"
      />

      {/* Add District Admin Modal */}
      {isAddModalOpen && (
        <Modal
          open={true}
          onClose={() => !isCreating && setIsAddModalOpen(false)}
          title="Create District Administrator"
        >
          <form onSubmit={handleCreateAdmin} className="flex flex-col gap-4 py-2">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Full Display Name *
              </label>
              <Input
                required
                value={addName}
                onChange={(e) => {
                  setAddName(e.target.value);
                  if (!addEmail && e.target.value) {
                    setAddEmail(`${e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")}@admin.internal`);
                  }
                }}
                placeholder="e.g. Ramesh Kumar"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Login Email *
              </label>
              <Input
                required
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="e.g. ramesh@admin.internal"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Contact Phone
              </label>
              <Input
                type="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="e.g. 9876543210"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Assigned District Jurisdiction *
              </label>
              <Select
                required
                value={addDistrictId}
                onChange={(e) => setAddDistrictId(e.target.value)}
                options={[
                  { value: "", label: "Select Operating District…" },
                  ...districts.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                The administrator will possess regional control over routes, buses, and conductors in this district.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Temporary Password *
              </label>
              <Input
                required
                type="text"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating Admin…" : "Create Administrator"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Admin Modal */}
      {editingAdmin && (
        <Modal
          open={true}
          onClose={() => !isSaving && setEditingAdmin(null)}
          title={`Edit Administrator: ${editingAdmin.display_name ?? editingAdmin.full_name ?? "User"}`}
        >
          <div className="flex flex-col gap-4 py-2">
            {saveError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Display Name
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full display name"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                District Jurisdiction
              </label>
              <Select
                value={editDistrictId}
                onChange={(e) => setEditDistrictId(e.target.value)}
                options={[
                  { value: "", label: editingAdmin.role === "master_admin" ? "All Districts (Master Admin)" : "None / Unassigned" },
                  ...districts.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                District admins can only manage routes, conductors, and fleet within their assigned district.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Account Status
              </label>
              <Select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as "active" | "suspended")}
                options={[
                  { value: "active", label: "Active (Permitted)" },
                  { value: "suspended", label: "Suspended (Locked)" },
                ]}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingAdmin(null)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

