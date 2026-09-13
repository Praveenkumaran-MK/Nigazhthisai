import { useMemo, useState } from "react";
import { DataTable, ConfirmDialog, ErrorState, useToast } from "@sbt/ui";
import { useCrudResource } from "../../hooks/useCrudResource";
import { ResourceFormDialog } from "./ResourceFormDialog";
import type { ColumnConfig, FormFieldConfig } from "./types";
import { Search, Filter, Plus, Pencil, Trash2 } from "lucide-react";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("ALL");

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

  const initialValues = useMemo(
    () => (editingRow ? (toFormValues ? toFormValues(editingRow) : (editingRow as Record<string, unknown>)) : {}),
    [editingRow, toFormValues],
  );

  // Filter rows based on search query & district
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch =
        !searchQuery ||
        JSON.stringify(r).toLowerCase().includes(searchQuery.toLowerCase().trim());
      const rDistrict = (r as Record<string, unknown>).district;
      const matchDistrict =
        districtFilter === "ALL" ||
        !rDistrict ||
        String(rDistrict).toLowerCase() === districtFilter.toLowerCase();
      return matchSearch && matchDistrict;
    });
  }, [rows, searchQuery, districtFilter]);

  const tableColumns = [
    ...columns,
    {
      key: "__actions",
      header: "ACTIONS",
      render: (row: T) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-[#0D2A5D] hover:bg-slate-100 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPendingDeleteId(row.id)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Search & Filter Bar (matching https://nigazhthisai.vercel.app/operations/stops) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${title.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#D97F00] focus:ring-2 focus:ring-[#D97F00]/10 focus:outline-none transition-all shadow-sm"
            />
          </div>

          {/* District Filter Pill */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Filter className="h-3.5 w-3.5 text-[#D97F00]" />
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              aria-label="Filter district"
              className="bg-transparent text-xs font-bold text-slate-700 uppercase focus:outline-none"
            >
              <option value="ALL">ALL DISTRICTS</option>
              <option value="CHENNAI">CHENNAI</option>
              <option value="COIMBATORE">COIMBATORE</option>
              <option value="MADURAI">MADURAI</option>
              <option value="SALEM">SALEM</option>
              <option value="TIRUPPUR">TIRUPPUR</option>
            </select>
          </div>
        </div>

        {/* Primary CTA Button */}
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0D2A5D] hover:bg-[#0A2149] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#0D2A5D]/20 active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>CREATE NEW {title.replace(/s$/, "").toUpperCase()}</span>
        </button>
      </div>

      {description && (
        <p className="text-xs font-medium text-slate-500 -mt-2">
          {description}
        </p>
      )}

      {status === "error" ? (
        <ErrorState description={error ?? undefined} onRetry={reload} />
      ) : (
        <DataTable
          columns={tableColumns}
          rows={filteredRows}
          getRowId={(r) => r.id}
          isLoading={status === "loading"}
          emptyTitle={emptyTitle ?? `No ${title.toLowerCase()} found`}
        />
      )}

      <ResourceFormDialog
        open={formOpen}
        title={editingRow ? `Edit ${title.replace(/s$/, "")}` : `Create New ${title.replace(/s$/, "")}`}
        fields={fields}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete this record?"
        description="This action cannot be undone."
        destructive
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
