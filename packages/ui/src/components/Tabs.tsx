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
}

export function Tabs({ items, defaultValue, className }: TabsProps) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const baseId = useId();

  return (
    <div className={className}>
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
                "-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                selected
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
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
