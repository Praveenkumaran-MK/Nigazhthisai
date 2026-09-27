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
 * Grid layout guarantees symmetrical 33.3% column width for each tab,
 * completely preventing misalignment or right-side edge clipping.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/95 backdrop-blur-md shadow-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary Navigation"
    >
      <div className="mx-auto flex max-w-md items-center h-16 px-2">
        {items.map((item) => (
          <div key={item.key} className="flex-1 min-w-0 flex items-center justify-center h-full">
            {item.active ? (
              <button
                type="button"
                onClick={item.onClick}
                aria-current="page"
                className="group relative -top-3 flex flex-col items-center justify-center focus:outline-none px-2"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0a192f] text-white shadow-lg shadow-navy-950/25 transition-transform active:scale-95 ring-4 ring-white">
                  <span className="h-5 w-5 text-white flex items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
                    {item.icon}
                  </span>
                </div>
                <span className="mt-1 text-[10px] font-black uppercase tracking-wider text-[#0a192f] truncate max-w-[90px] text-center">
                  {item.label}
                </span>
                <span className="mt-0.5 h-1 w-1 rounded-full bg-[#0a192f]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className="flex w-full flex-col items-center justify-center gap-1 py-1 text-slate-400 hover:text-slate-700 transition-colors focus:outline-none"
              >
                <span className="h-5 w-5 text-slate-400 flex items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
                  {item.icon}
                </span>
                <span className="text-[10px] font-semibold tracking-wide truncate max-w-[90px] text-center">
                  {item.label}
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
