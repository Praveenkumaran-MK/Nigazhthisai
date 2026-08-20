export interface RouteVisualizationProps {
  originLabel: string;
  destinationLabel: string;
  originSubLabel?: string;
  destinationSubLabel?: string;
  /** Small caption centered above the line, e.g. "1h 45m" or "Non-stop". */
  centerLabel?: string;
  className?: string;
}

function BusGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-brand-500 dark:text-brand-400" aria-hidden="true">
      <path
        d="M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 11h16" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7.5" cy="18.5" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="18.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

/**
 * The origin-dot / dashed-line-with-vehicle / destination-dot journey strip
 * used throughout the reference flight-booking design (bus search results,
 * live-map header, admin fleet cards) — the single most recognizable visual
 * signature of this design language, so it lives here once rather than
 * being redrawn per screen.
 */
export function RouteVisualization({
  originLabel,
  destinationLabel,
  originSubLabel,
  destinationSubLabel,
  centerLabel,
  className,
}: RouteVisualizationProps) {
  return (
    <div className={className}>
      {/* slate-600, not slate-400: this label carries the fare, and at 400
          it washed out against the translucent glass panel it renders on
          in the search header. */}
      {centerLabel && (
        <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {centerLabel}
        </p>
      )}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-col items-start">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{originLabel}</span>
          {originSubLabel && <span className="text-xs text-slate-500 dark:text-slate-500">{originSubLabel}</span>}
        </div>

        <div className="flex flex-1 items-center gap-1.5 px-1">
          <span className="h-2 w-2 shrink-0 rounded-full border-2 border-brand-500 bg-white dark:bg-black" aria-hidden="true" />
          <span className="relative flex-1 border-t-2 border-dotted border-brand-300 dark:border-brand-700">
            <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white dark:bg-black">
              <BusGlyph />
            </span>
          </span>
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
        </div>

        <div className="flex flex-1 flex-col items-end text-right">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{destinationLabel}</span>
          {destinationSubLabel && (
            <span className="text-xs text-slate-500 dark:text-slate-500">{destinationSubLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}
