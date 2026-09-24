import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../utils/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
  hideCloseButton?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: "sm:max-w-sm sm:w-full",
  md: "sm:max-w-md sm:w-full",
  lg: "sm:max-w-2xl sm:w-full",
  xl: "sm:max-w-4xl sm:w-full",
  full: "sm:max-w-[94vw] sm:w-full",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  hideCloseButton = false,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Responsive Modal Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200/80 bg-white shadow-2xl outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
          "dark:border-slate-800 dark:bg-slate-900",
          "max-h-[88dvh] sm:max-h-[90dvh]",
          "transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 sm:zoom-in-95",
          sizeClasses[size] ?? sizeClasses.md,
          className,
        )}
      >
        {/* Mobile Drag / Sheet Indicator */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header (Pinned) */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-3 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="dialog-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {title}
            </h2>
            {description && (
              <p id="dialog-description" className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
          {!hideCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 -mr-1.5 -mt-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Content Body (Scrollable with smooth scroll) */}
        <div className="px-5 sm:px-6 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {children}
        </div>

        {/* Footer (Pinned if present) */}
        {footer && (
          <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/40 rounded-b-2xl flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export const Modal = Dialog;
