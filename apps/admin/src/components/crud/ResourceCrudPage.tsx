import { useMemo, useState } from "react";
import { Button, DataTable, ConfirmDialog, ErrorState, useToast } from "@sbt/ui";
import { useCrudResource } from "../../hooks/useCrudResource";
import { ResourceFormDialog } from "./ResourceFormDialog";
import type { ColumnConfig, FormFieldConfig } from "./types";

export interface ResourceCrudPageProps<T extends { id: string }> {
  title: string;
  description?: string;
  table: string;
  readTable?: string;
  orderBy?: string;
  columns: Array<ColumnConfig<T>>;
  fields: FormFieldConfig[];
  toFormValues?: (row: T) => Record<string, unknown>;
  /** Transforms form values before they are sent to Supabase (e.g. lat/lng -> PostGIS point). */
  transformSubmit?: (values: Record<string, unknown>) => Record<string, unknown>;
  emptyTitle?: string;
}

export function ResourceCrudPage<T extends { id: string }>({
  title,
  description,
  table,
  readTable,
  orderBy,
  columns,
  fields,
  toFormValues,
  transformSubmit,
  emptyTitle,
}: ResourceCrudPageProps<T>) {
  const { rows, status, error, create, update, remove, reload } = useCrudResource<T>({ table, readTable, orderBy });
  const { push } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openCreate = () => {
    setEditingRow(null);
    setFormOpen(true);
  };

  const openEdit = (row: T) => {
    setEditingRow(row);
    setFormOpen(true);
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    const payload = transformSubmit ? transformSubmit(values) : values;
    if (editingRow) {
      await update(editingRow.id, payload as Partial<T>);
      push({ tone: "success", title: `${title.replace(/s$/, "")} updated` });
    } else {
      await create(payload as Partial<T>);
      push({ tone: "success", title: `${title.replace(/s$/, "")} created` });
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await remove(pendingDeleteId);
      push({ tone: "success", title: "Deleted" });
    } catch (e) {
      push({ tone: "danger", title: "Could not delete", description: e instanceof Error ? e.message : undefined });
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  // Memoized on `editingRow`'s identity (stable across unrelated parent
  // re-renders/reloads — it only changes when openCreate/openEdit sets a
  // new one) so ResourceFormDialog's reset effect doesn't fire on every
  // render and wipe whatever the admin has typed so far.
  const initialValues = useMemo(
    () => (editingRow ? (toFormValues ? toFormValues(editingRow) : (editingRow as Record<string, unknown>)) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingRow],
  );

  const tableColumns = [
    ...columns,
    {
      key: "__actions",
      header: "",
      render: (row: T) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-danger-600" onClick={() => setPendingDeleteId(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          {description && <p className="text-sm text-slate-500 dark:text-slate-500">{description}</p>}
        </div>
        <Button onClick={openCreate}>Add {title.replace(/s$/, "")}</Button>
      </div>

      {status === "error" ? (
        <ErrorState description={error ?? undefined} onRetry={reload} />
      ) : (
        <DataTable
          columns={tableColumns}
          rows={rows}
          getRowId={(r) => r.id}
          isLoading={status === "loading"}
          emptyTitle={emptyTitle ?? `No ${title.toLowerCase()} yet`}
        />
      )}

      <ResourceFormDialog
        open={formOpen}
        title={editingRow ? `Edit ${title.replace(/s$/, "")}` : `Add ${title.replace(/s$/, "")}`}
        fields={fields}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete this record?"
        description="This cannot be undone."
        destructive
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
