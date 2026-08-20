import { cn } from "../utils/cn";

export interface TicketCountdownProps {
  label: string;
  expired?: boolean;
  className?: string;
}

/**
 * The green LCD-style "Ticket is valid till HH:MM" countdown from the
 * reference unified-ticket card. `label` is the already-formatted
 * countdown string — this component only renders it, live-ticking is the
 * caller's concern (see useCountdown).
 */
export function TicketCountdown({ label, expired, className }: TicketCountdownProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl px-4 py-3",
        expired ? "bg-slate-700" : "bg-success-600",
        className,
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-white/80">
        {expired ? "Ticket expired" : "Ticket valid till"}
      </span>
      <span className="font-mono text-3xl font-bold tabular-nums tracking-widest text-white">{label}</span>
    </div>
  );
}
