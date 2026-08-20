import { cn } from "../utils/cn";

export type BrandLogoVariant = "mark" | "lockup" | "lockup-stacked";
export type BrandLogoTone = "navy" | "light";

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  /** `navy` for light backgrounds, `light` for navy/dark backgrounds. */
  tone?: BrandLogoTone;
  className?: string;
  /** Accessible name. Pass "" for decorative use alongside visible text. */
  title?: string;
}

/**
 * ────────────────────────────────────────────────────────────────────────
 * NOTE ON THIS ASSET
 * This is a hand-built geometric RECONSTRUCTION of the supplied raster
 * logo — a Tamil-inspired navy letterform with an amber map-pin terminal.
 * It is not traced from the original vector, so curve-for-curve it will
 * differ from the brand master.
 *
 * To swap in the real artwork: replace the <path> geometry inside
 * `LogoMark` below (keep the 0 0 64 64 viewBox and the `currentColor` /
 * `--logo-accent` conventions) and everything downstream — AppHeader,
 * LogoLoader, favicons, app icons — picks it up automatically. That is the
 * only file that needs to change.
 * ────────────────────────────────────────────────────────────────────────
 */
function LogoMark({ tone, className, title }: { tone: BrandLogoTone; className?: string; title?: string }) {
  const body = tone === "light" ? "#FFFFFF" : "#0D2A5D";
  const accent = "#D97F00";
  const labelled = Boolean(title);

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {/* Left stem + top crossbar (the "ⴖ" mass of the glyph) */}
      <path
        d="M5 25.5h30.5v8.5H14.5V60H5V25.5Z"
        fill={body}
      />
      {/* Sweeping arch rising from the crossbar and curving right */}
      <path
        d="M24.5 30V13.5C24.5 8.25 29 4 34.5 4S44.5 8.25 44.5 13.5v9"
        stroke={body}
        strokeWidth="8.5"
        strokeLinecap="square"
      />
      {/* Lower bowl/loop */}
      <path
        d="M24.5 38.5h9.75c6.9 0 12.5 5.6 12.5 12.5S41.15 63.5 34.25 63.5H21l7.5-9h5.75a3.5 3.5 0 1 0 0-7H24.5v-9Z"
        fill={body}
      />
      {/* Right terminal stroke */}
      <rect x="51" y="29" width="8.5" height="31" fill={body} />
      {/* Amber map pin capping the terminal */}
      <path
        d="M55.25 12c-3.73 0-6.75 3.02-6.75 6.75 0 4.6 5.03 9.9 6.2 11.05a.78.78 0 0 0 1.1 0c1.17-1.15 6.2-6.45 6.2-11.05 0-3.73-3.02-6.75-6.75-6.75Z"
        fill={accent}
      />
      <circle cx="55.25" cy="18.75" r="2.9" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * The brand logo. `mark` is the glyph alone (headers, favicons, loaders);
 * `lockup` adds the wordmark beside it; `lockup-stacked` places it below
 * for splash/hero use.
 */
export function BrandLogo({ variant = "mark", tone = "navy", className, title = "Thanjai Transit" }: BrandLogoProps) {
  if (variant === "mark") {
    return <LogoMark tone={tone} className={cn("h-9 w-9", className)} title={title} />;
  }

  const stacked = variant === "lockup-stacked";
  const textColor = tone === "light" ? "text-white" : "text-navy-600";
  const subColor = tone === "light" ? "text-white/60" : "text-slate-500";

  return (
    <span
      className={cn("inline-flex items-center gap-2.5", stacked && "flex-col gap-2 text-center", className)}
      role="img"
      aria-label={title}
    >
      <LogoMark tone={tone} className={cn(stacked ? "h-14 w-14" : "h-9 w-9", "shrink-0")} />
      <span className={cn("flex flex-col leading-none", stacked && "items-center")}>
        <span className={cn("text-base font-bold tracking-tight", textColor)}>Thanjai Transit</span>
        <span className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em]", subColor)}>
          District Network
        </span>
      </span>
    </span>
  );
}
