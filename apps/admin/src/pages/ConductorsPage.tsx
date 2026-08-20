import { useState } from "react";
import { Button, DataTable, Dialog, Input, Alert, Badge, useToast, ErrorState } from "@sbt/ui";
import type { Conductor } from "@sbt/shared-types";
import { toAppError } from "@sbt/supabase-client";
import { useCrudResource } from "../hooks/useCrudResource";
import { supabase } from "../lib/supabase";

function randomTempPassword(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function ConductorsPage() {
  const { rows, status, error, reload } = useCrudResource<Conductor>({ table: "conductors", orderBy: "display_name" });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [governmentId, setGovernmentId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    let conductorRowId: string | null = null;
    try {
      const { data: conductorRow, error: insertError } = await supabase
        .from("conductors")
        .insert({ government_id: governmentId.trim(), display_name: displayName.trim(), phone: phone.trim() || null })
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
          body: JSON.stringify({ governmentId: governmentId.trim(), displayName: displayName.trim(), temporaryPassword }),
        },
      );

      // Check response.ok BEFORE parsing JSON — an undeployed function or a
      // gateway error returns an HTML/text body, and calling .json() on
      // that throws a SyntaxError that used to mask the real problem.
      if (!response.ok) {
        let message = `Server error (status ${response.status})`;
        try {
          const errorBody = await response.json();
          // Route the edge function's error code through the same
          // UPPER_SNAKE_CASE -> friendly-message mapping used for every
          // other RPC error (e.g. RATE_LIMITED), instead of showing the
          // raw code verbatim.
          message = errorBody.error ? toAppError({ message: errorBody.error }).message : message;
        } catch {
          /* non-JSON error body; keep the generic status message */
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
      // Compensating delete: if the conductors row was inserted but a later
      // step (edge function call, link_conductor_account) failed, the row
      // would otherwise sit "unlinked" forever and permanently block retry
      // via the unique(government_id) constraint. NOTE: if the edge
      // function DID create the auth user but link_conductor_account then
      // failed, this leaves that auth user orphaned (role stays
      // 'passenger') — deleting an auth.users row requires the service
      // role, which this client-side code intentionally never holds.
      // Acceptable residual gap: retry provisions a fresh conductor row
      // with a fresh synthetic email, so it doesn't block the admin.
      if (conductorRowId) {
        await supabase.from("conductors").delete().eq("id", conductorRowId);
        await reload();
      }
      setFormError(err instanceof Error ? err.message : "Could not create conductor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeDialog = () => {
    setOpen(false);
    setIssuedCredentials(null);
    setFormError(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Conductors</h1>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Creating a conductor provisions a real login (see supabase/functions/provision-conductor).
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
          ]}
          rows={rows}
          getRowId={(c) => c.id}
          isLoading={status === "loading"}
          emptyTitle="No conductors yet"
        />
      )}

      <Dialog open={open} onClose={closeDialog} title="Add conductor">
        {issuedCredentials ? (
          <div className="flex flex-col gap-3">
            <Alert tone="success" title="Account created">
              Share these one-time credentials with the conductor securely (they should change the
              password on first login — password change UI is out of scope for this demo build).
            </Alert>
            <div className="rounded-lg bg-slate-50 p-3 font-mono text-sm dark:bg-[#0a0a0a]">
              <p>Email: {issuedCredentials.email}</p>
              <p>Temporary password: {issuedCredentials.password}</p>
            </div>
            {/* Must clear issuedCredentials too, not just close — otherwise
                reopening "Add conductor" showed this conductor's temporary
                password again instead of a blank form. */}
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
    </div>
  );
}
