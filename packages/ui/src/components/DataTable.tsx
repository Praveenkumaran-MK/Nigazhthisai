import type { ReactNode } from "react";
import { LoadingState } from "./States";
import { EmptyState } from "./States";
import { cn } from "../utils/cn";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading,
  emptyTitle = "No results",
  emptyDescription,
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-surface-dark shadow-sm">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {rows.map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors",
                onRowClick ? "cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40" : "hover:bg-slate-50/30 dark:hover:bg-slate-800/20"
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("whitespace-nowrap px-6 py-4 text-xs font-semibold text-[#0D2A5D] dark:text-slate-200", col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Table = DataTable;
