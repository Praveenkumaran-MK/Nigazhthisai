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
    <div className="overflow-x-auto rounded-card border border-border-light dark:border-border-dark">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-border-light bg-slate-50 dark:border-border-dark dark:bg-[#0a0a0a]">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light dark:divide-border-dark">
          {rows.map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && "cursor-pointer hover:bg-slate-50 dark:hover:bg-[#0a0a0a]")}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300", col.className)}>
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
