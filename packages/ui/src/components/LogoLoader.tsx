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

const sizeClasses: Record<LogoLoaderSize, { container: string; spinner: string }> = {
  sm: { container: "gap-1.5", spinner: "h-5 w-5 border-2" },
  md: { container: "gap-2.5", spinner: "h-8 w-8 border-2" },
  lg: { container: "gap-3", spinner: "h-12 w-12 border-[3px]" },
};

/**
 * Standard simple circular loader for all data states across Nigazhthisai apps.
 */
export function LogoLoader({ size = "md", label, tone = "navy", className }: LogoLoaderProps) {
  const conf = sizeClasses[size];
  const borderTone = tone === "light"
    ? "border-white/20 border-t-white"
    : "border-brand-500/20 border-t-brand-500 dark:border-brand-400/20 dark:border-t-brand-400";

  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center", conf.container, className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={cn(
          "animate-spin rounded-full transition-all",
          conf.spinner,
          borderTone
        )}
        aria-hidden="true"
      />
      {label && (
        <span className={cn("text-xs font-medium", tone === "light" ? "text-white/80" : "text-slate-500 dark:text-slate-400")}>
          {label}
        </span>
      )}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
