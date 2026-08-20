import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export interface BottomNavItem {
  key: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}

/**
 * Persistent mobile bottom tab bar (matches the reference app's Home/
 * Services/Live/Tickets/Profile pattern). Only ever holds destinations that
 * are real, working screens — no placeholder tabs for features that don't
 * exist yet. Respects the safe-area inset for notched phones.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border-light bg-white dark:border-border-dark dark:bg-surface-dark"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "flex min-w-[64px] flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              item.active ? "text-brand-600 dark:text-brand-400" : "text-slate-400 dark:text-slate-600",
            )}
          >
            <span className={cn("h-6 w-6", item.active && "text-brand-600 dark:text-brand-400")}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
