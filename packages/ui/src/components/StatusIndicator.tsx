import { cn } from "../utils/cn";

export type StatusTone = "online" | "offline" | "connecting" | "error";

const toneClasses: Record<StatusTone, string> = {
  online: "bg-success-500",
  offline: "bg-slate-400 dark:bg-slate-600",
  connecting: "bg-warning-500 animate-pulse",
  error: "bg-danger-500",
};

const toneLabels: Record<StatusTone, string> = {
  online: "Online",
  offline: "Offline",
  connecting: "Connecting",
  error: "Connection error",
};

export interface StatusIndicatorProps {
  status: StatusTone;
  label?: string;
  className?: string;
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400", className)}>
      <span className={cn("h-2 w-2 rounded-full", toneClasses[status])} aria-hidden="true" />
      {label ?? toneLabels[status]}
    </span>
  );
}
