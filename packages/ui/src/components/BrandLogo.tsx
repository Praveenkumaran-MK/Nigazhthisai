import { cn } from "../utils/cn";
import { BRAND_LOGO_NAVY, BRAND_LOGO_LIGHT } from "../assets/logoData";

export type BrandLogoVariant = "mark" | "lockup" | "lockup-stacked";
export type BrandLogoTone = "navy" | "light";

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  /** `navy` for light backgrounds, `light` for navy/dark backgrounds. */
  tone?: BrandLogoTone;
  className?: string;
  /** Accessible name. Pass "" for decorative use alongside visible text. */
  title?: string;
  /** Optional custom subtitle (e.g. localized) */
  subtitle?: string;
}

/**
 * Official Nigazhthisai Brand Logo Mark (Raster Asset from Brand Master)
 */
function LogoMark({ tone, className, title }: { tone: BrandLogoTone; className?: string; title?: string }) {
  const src = tone === "light" ? BRAND_LOGO_LIGHT : BRAND_LOGO_NAVY;
  const alt = title || "Nigazhthisai";

  return (
    <img
      src={src}
      alt={alt}
      className={cn("object-contain select-none shrink-0", className)}
      draggable={false}
    />
  );
}

/**
 * The brand logo. `mark` is the glyph alone (headers, favicons, loaders);
 * `lockup` adds the wordmark beside it; `lockup-stacked` places it below
 * for splash/hero use.
 */
export function BrandLogo({ variant = "mark", tone = "navy", className, title = "Nigazhthisai", subtitle }: BrandLogoProps) {
  if (variant === "mark") {
    return <LogoMark tone={tone} className={cn("h-9 w-9", className)} title={title} />;
  }

  const stacked = variant === "lockup-stacked";
  // On a navy/dark surface (tone="light"), the name is amber — matching the
  // map-pin accent in the logo mark. On a light surface (tone="navy") it uses
  // navy-600 for consistent brand contrast.
  const nameColor = tone === "light" ? "text-[#D97F00]" : "text-navy-600";
  const subColor  = tone === "light" ? "text-white/60"  : "text-slate-500";

  return (
    <span
      className={cn("inline-flex items-center gap-2.5", stacked && "flex-col gap-2 text-center", className)}
      role="img"
      aria-label={title}
    >
      <LogoMark tone={tone} className={cn(stacked ? "h-14 w-14" : "h-9 w-9", "shrink-0")} />
      <span className={cn("flex flex-col leading-none", stacked && "items-center")}>
        <span className={cn("text-base font-bold tracking-tight", nameColor)}>Nigazhthisai</span>
        <span className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em]", subColor)}>
          {subtitle ?? "District Network"}
        </span>
      </span>
    </span>
  );
}
