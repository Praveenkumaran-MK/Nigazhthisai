import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../utils/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  side?: "left" | "right";
  children: ReactNode;
}

export function Drawer({ open, onClose, title, side = "right", children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 h-full w-full max-w-[88vw] sm:max-w-sm flex flex-col border-border-light bg-white shadow-2xl transition-transform animate-in duration-200",
          "dark:border-border-dark dark:bg-surface-dark",
          side === "right" ? "ml-auto border-l slide-in-from-right" : "mr-auto border-r slide-in-from-left",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800 shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">{title || "Menu"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Mobile-first sheet anchored to the viewport bottom (passenger/conductor apps). */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-bottom relative z-10 max-h-[88dvh] w-full flex flex-col rounded-t-3xl border-t border-border-light bg-white shadow-2xl dark:border-border-dark dark:bg-surface-dark transition-transform animate-in slide-in-from-bottom duration-200"
      >
        <div className="mx-auto mt-2.5 mb-1.5 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title || "Details"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bottom sheet"
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
