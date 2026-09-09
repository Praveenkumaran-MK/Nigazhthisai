import { useState, useCallback } from "react";
import { Button, DataTable, Dialog, Input, Alert, Badge, useToast, ErrorState } from "@sbt/ui";
import type { Conductor } from "@sbt/shared-types";
import { toAppError } from "@sbt/supabase-client";
import { useCrudResource } from "../hooks/useCrudResource";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { supabase } from "../lib/supabase";

function randomTempPassword(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function ConductorsPage() {
  const { profile } = useAdminAuth();
  const { rows, status, error, reload } = useCrudResource<Conductor>({ table: "conductors", orderBy: "display_name" });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [governmentId, setGovernmentId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Conductor state
  const [editingConductor, setEditingConductor] = useState<Conductor | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGovId, setEditGovId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    let conductorRowId: string | null = null;
    try {
      const { data: conductorRow, error: insertError } = await supabase
        .from("conductors")
        .insert({
          government_id: governmentId.trim(),
          display_name: displayName.trim(),
          phone: phone.trim() || null,
          district_id: profile?.district_id ?? null,
        })
        .select()
        .single();
      if (insertError) throw new Error(insertError.message);
      conductorRowId = conductorRow.id;

      const temporaryPassword = randomTempPassword();
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
            governmentId: governmentId.trim(),
            displayName: displayName.trim(),
            temporaryPassword,
            role: "conductor",
            district_id: profile?.district_id ?? undefined,
          }),
        },
      );

      if (!response.ok) {
        let message = `Server error (status ${response.status})`;
        try {
          const errorBody = await response.json();
          message = errorBody.error ? toAppError({ message: errorBody.error }).message : message;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(message);
      }
      const provisionResult = await response.json();

      const { error: linkError } = await supabase.rpc("link_conductor_account", {
        p_conductor_id: conductorRowId,
        p_user_id: provisionResult.userId,
      });
      if (linkError) throw new Error(linkError.message);

      setIssuedCredentials({ email: provisionResult.email, password: temporaryPassword });
      setGovernmentId("");
      setDisplayName("");
      setPhone("");
      await reload();
      push({ tone: "success", title: "Conductor account created" });
    } catch (err) {
      if (conductorRowId) {
        await supabase.from("conductors").delete().eq("id", conductorRowId);
        await reload();
      }
      setFormError(err instanceof Error ? err.message : "Could not create conductor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConductor) return;
    setIsEditing(true);
    try {
      const { error: err } = await supabase.rpc("update_conductor_profile", {
        p_conductor_id: editingConductor.id,
        p_display_name: editName.trim(),
        p_phone_number: editPhone.trim() || null,
        p_government_id: editGovId.trim(),
        p_is_active: editActive,
      });

      if (err) throw err;

      setEditingConductor(null);
      await reload();
      push({ tone: "success", title: "Conductor profile updated" });
    } catch (err: any) {
      alert("Failed to update conductor: " + err.message);
    } finally {
      setIsEditing(false);
    }
  };

  const closeDialog = useCallback(() => {
    setOpen(false);
    setIssuedCredentials(null);
    setFormError(null);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Conductors Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Manage conductor accounts, government IDs, and operational status.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Add conductor</Button>
      </div>

      {status === "error" ? (
        <ErrorState description={error ?? undefined} onRetry={reload} />
      ) : (
        <DataTable
          columns={[
            { key: "display_name", header: "Name", render: (c) => c.display_name },
            { key: "government_id", header: "Government ID", render: (c) => c.government_id },
            { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
            {
              key: "status",
              header: "Status",
              render: (c) => <Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Active" : "Inactive"}</Badge>,
            },
            { key: "linked", header: "Login", render: (c) => (c.user_id ? <Badge tone="brand">Linked</Badge> : <Badge tone="warning">Not linked</Badge>) },
            {
              key: "actions",
              header: "",
              render: (c) => (
                <button
                  type="button"
                  onClick={() => {
                    setEditingConductor(c);
                    setEditName(c.display_name);
                    setEditPhone(c.phone ?? "");
                    setEditGovId(c.government_id);
                    setEditActive(c.is_active);
                  }}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  Edit Profile
                </button>
              ),
            },
          ]}
          rows={rows}
          getRowId={(c) => c.id}
          isLoading={status === "loading"}
          emptyTitle="No conductors yet"
        />
      )}

      {/* Add Conductor Dialog */}
      <Dialog open={open} onClose={closeDialog} title="Add conductor">
        {issuedCredentials ? (
          <div className="flex flex-col gap-3">
            <Alert tone="success" title="Account created">
              Share these one-time credentials with the conductor securely.
            </Alert>
            <div className="rounded-lg bg-slate-50 p-3 font-mono text-sm dark:bg-[#0a0a0a]">
              <p>Email: {issuedCredentials.email}</p>
              <p>Temporary password: {issuedCredentials.password}</p>
            </div>
            <Button onClick={closeDialog}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <Input label="Government ID" required value={governmentId} onChange={(e) => setGovernmentId(e.target.value)} placeholder="TN-MTC-8492" />
            <Input label="Display name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {formError && <Alert tone="danger" title="Could not create conductor">{formError}</Alert>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Create
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Edit Conductor Dialog */}
      <Dialog open={Boolean(editingConductor)} onClose={() => setEditingConductor(null)} title="Edit Conductor Profile">
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
          <Input label="Display Name" required value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input label="Government ID" required value={editGovId} onChange={(e) => setEditGovId(e.target.value)} />
          <Input label="Phone Number" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="edit-active"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="edit-active" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Active Operational Status
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" onClick={() => setEditingConductor(null)} disabled={isEditing}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isEditing}>
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
