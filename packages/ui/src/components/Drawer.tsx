import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 h-full w-full max-w-sm overflow-y-auto border-border-light bg-white p-5 shadow-xl",
          "dark:border-border-dark dark:bg-surface-dark",
          side === "right" ? "ml-auto border-l" : "mr-auto border-r",
        )}
      >
        {title && <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
        {children}
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
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-bottom relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-border-light bg-white p-5 shadow-2xl dark:border-border-dark dark:bg-surface-dark"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        {title && <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
