import { cn } from "../utils/cn";

export interface TransitBusRunnerStop {
  label?: string;
  /** 0–100 position along the track. */
  atPercent: number;
  done?: boolean;
}

export interface TransitBusRunnerProps {
  /** 0–100. Ignored when `indeterminate`. */
  progress?: number;
  /** Continuous looping run — for screen transitions / unknown duration. */
  indeterminate?: boolean;
  stops?: TransitBusRunnerStop[];
  label?: string;
  className?: string;
}

function BusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 26" fill="none" className={className} aria-hidden="true">
      <rect x="1" y="2" width="38" height="18" rx="4.5" fill="#0D2A5D" />
      <rect x="4.5" y="5.5" width="7.5" height="6.5" rx="1.6" fill="#BFD3EE" />
      <rect x="14.5" y="5.5" width="7.5" height="6.5" rx="1.6" fill="#BFD3EE" />
      <rect x="24.5" y="5.5" width="7.5" height="6.5" rx="1.6" fill="#BFD3EE" />
      <rect x="33.5" y="8" width="5" height="5" rx="1.4" fill="#D97F00" />
      <rect x="1" y="15" width="38" height="2.5" fill="#071735" opacity="0.5" />
      <circle cx="10" cy="21" r="4" fill="#071735" />
      <circle cx="10" cy="21" r="1.5" fill="#BFD3EE" />
      <circle cx="30" cy="21" r="4" fill="#071735" />
      <circle cx="30" cy="21" r="1.5" fill="#BFD3EE" />
    </svg>
  );
}

/**
 * A bus travelling a road from origin to destination, driven by
 * `progress` (0–100) or looping when `indeterminate`.
 *
 * All motion is GPU-composited: the amber fill uses `scaleX` from a left
 * origin, and the bus rides the right edge of a full-width layer
 * translated by `progress - 100`%. Because that layer is exactly the
 * width of the track, a percentage translate on it resolves to a
 * percentage of the track — so the bus lands precisely at `progress`
 * without ever animating `left`/`width` (which would trigger layout on
 * every frame).
 */
export function TransitBusRunner({
  progress = 0,
  indeterminate = false,
  stops,
  label,
  className,
}: TransitBusRunnerProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
          {!indeterminate && (
            <span className="text-xs font-bold tabular-nums text-brand-ink dark:text-brand-300">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}

      <div
        className="relative h-11 select-none"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
        aria-label={label ?? "Journey progress"}
      >
        {/* Road */}
        <div className="absolute inset-x-0 bottom-0 h-3 overflow-hidden rounded-pill bg-navy-100 dark:bg-navy-700">
          {/* Travelled portion */}
          <div
            className="h-full origin-left rounded-pill bg-brand-500 transition-transform duration-700 ease-transit will-change-transform"
            style={{ transform: `scaleX(${indeterminate ? 1 : clamped / 100})` }}
          />
          {/* Moving lane dashes */}
          <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden" aria-hidden="true">
            <div className="sbt-road-dashes h-0.5 w-[200%] motion-safe:animate-road-dash" />
          </div>
        </div>

        {/* Stop markers */}
        {stops?.map((stop, i) => (
          <div
            key={`${stop.label ?? "stop"}-${i}`}
            className="absolute bottom-0 h-3 -translate-x-1/2"
            style={{ left: `${Math.min(100, Math.max(0, stop.atPercent))}%` }}
          >
            <span
              className={cn(
                "block h-3 w-1.5 rounded-pill",
                stop.done ? "bg-brand-700" : "bg-navy-300 dark:bg-navy-500",
              )}
              title={stop.label}
            />
          </div>
        ))}

        {/* Bus rides the right edge of a full-width translated layer */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-1.5 will-change-transform",
            indeterminate ? "sbt-bus-loop" : "transition-transform duration-700 ease-transit",
          )}
          style={indeterminate ? undefined : { transform: `translate3d(${clamped - 100}%, 0, 0)` }}
          aria-hidden="true"
        >
          <div className="flex justify-end">
            <BusGlyph className="h-7 w-11 translate-x-1/2 motion-safe:animate-bus-bob" />
          </div>
        </div>
      </div>
    </div>
  );
}
