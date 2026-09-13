import { useId, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  className?: string;
  variant?: "underline" | "pills";
}

export function Tabs({ items, defaultValue, className, variant = "pills" }: TabsProps) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const baseId = useId();

  return (
    <div className={className}>
      {variant === "pills" ? (
        <div
          role="tablist"
          className="inline-flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700"
        >
          {items.map((item) => {
            const selected = item.value === active;
            return (
              <button
                key={item.value}
                role="tab"
                id={`${baseId}-tab-${item.value}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${item.value}`}
                onClick={() => setActive(item.value)}
                className={cn(
                  "px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all",
                  selected
                    ? "bg-[#0D2A5D] text-white shadow-sm dark:bg-[#153E84]"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div role="tablist" className="flex gap-1 border-b border-border-light dark:border-border-dark">
          {items.map((item) => {
            const selected = item.value === active;
            return (
              <button
                key={item.value}
                role="tab"
                id={`${baseId}-tab-${item.value}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${item.value}`}
                onClick={() => setActive(item.value)}
                className={cn(
                  "-mb-px border-b-2 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors",
                  selected
                    ? "border-[#0D2A5D] text-[#0D2A5D] dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${baseId}-panel-${item.value}`}
          aria-labelledby={`${baseId}-tab-${item.value}`}
          hidden={item.value !== active}
          className="pt-4"
        >
          {item.value === active && item.content}
        </div>
      ))}
    </div>
  );
}
