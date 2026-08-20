import { cn } from "../utils/cn";

export type LogoLoaderSize = "sm" | "md" | "lg";

export interface LogoLoaderProps {
  size?: LogoLoaderSize;
  /** Visible caption beneath the mark. */
  label?: string;
  /** `light` for use on navy/dark surfaces. */
  tone?: "navy" | "light";
  className?: string;
}

const sizeClasses: Record<LogoLoaderSize, string> = {
  sm: "h-6 w-6",
  md: "h-10 w-10",
  lg: "h-16 w-16",
};

/**
 * Brand loading indicator: the logo's skeleton draws itself via
 * stroke-dashoffset while the amber pin pulses.
 *
 * Implementation detail worth knowing: the BrandLogo mark is *fill*-based,
 * and fills cannot be stroke-drawn. So this traces a single-stroke
 * SKELETON of the same geometry (stem → crossbar → arch → terminal)
 * rather than reusing BrandLogo directly. If you replace the logo artwork
 * in BrandLogo.tsx, update this skeleton path to match, or the loader will
 * drift from the brand mark.
 *
 * `pathLength={1}` normalizes the path so the dash animation is
 * length-independent — no measuring the path in JS, and it keeps working
 * if the geometry changes.
 *
 * Motion is `transform`/`opacity`-only (GPU-composited) and fully disabled
 * under `prefers-reduced-motion`, where it degrades to a static mark with
 * an accessible busy state.
 */
export function LogoLoader({ size = "md", label, tone = "navy", className }: LogoLoaderProps) {
  const body = tone === "light" ? "#FFFFFF" : "#0D2A5D";

  return (
    <div
      className={cn("inline-flex flex-col items-center gap-2.5", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <svg viewBox="0 0 64 64" fill="none" className={cn(sizeClasses[size], "sbt-logo-loader")} aria-hidden="true">
        <path
          d="M9 60V29.5h26.5M24.5 33V13.5C24.5 8.25 29 4 34.5 4S44.5 8.25 44.5 13.5V33M55.25 33v25"
          stroke={body}
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="sbt-logo-loader__trace"
        />
        <g className="sbt-logo-loader__pin">
          <path
            d="M55.25 12c-3.73 0-6.75 3.02-6.75 6.75 0 4.6 5.03 9.9 6.2 11.05a.78.78 0 0 0 1.1 0c1.17-1.15 6.2-6.45 6.2-11.05 0-3.73-3.02-6.75-6.75-6.75Z"
            fill="#D97F00"
          />
          <circle cx="55.25" cy="18.75" r="2.9" fill="#FFFFFF" />
        </g>
      </svg>
      {label && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
