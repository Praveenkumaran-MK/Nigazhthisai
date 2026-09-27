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
 * Mobile bottom tab bar with dynamic elevated state for the active tab.
 * Respects safe-area insets on modern mobile devices.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-md shadow-lg dark:border-border-dark dark:bg-surface-dark"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary Navigation"
    >
      <div className="mx-auto flex max-w-md items-center justify-around h-16 px-3">
        {items.map((item) => {
          if (item.active) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                aria-current="page"
                className="group relative -top-3.5 flex flex-col items-center focus:outline-none"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0a192f] text-white shadow-xl shadow-navy-950/30 transition-transform active:scale-95 ring-4 ring-white dark:ring-surface-dark">
                  <span className="h-6 w-6 text-white flex items-center justify-center [&>svg]:h-5 [&>svg]:w-5">{item.icon}</span>
                </div>
                <span className="mt-1 text-[10px] font-black uppercase tracking-wider text-[#0a192f] dark:text-white">
                  {item.label}
                </span>
                <span className="mt-0.5 h-1 w-1 rounded-full bg-[#0a192f] dark:bg-white" />
              </button>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
            >
              <span className="h-5 w-5 text-slate-400 flex items-center justify-center [&>svg]:h-5 [&>svg]:w-5">{item.icon}</span>
              <span className="text-[10px] tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
