import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { cn } from "../utils/cn";

export type AppHeaderVariant = "navy" | "glass" | "plain";

export interface AppHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Leading slot — typically a back button. Replaces the logo when set. */
  leading?: ReactNode;
  /** Trailing slot — status indicators, actions, avatar. */
  actions?: ReactNode;
  variant?: AppHeaderVariant;
  /** Show the brand mark in the leading position. Default true. */
  showLogo?: boolean;
  /** Render the full logo + wordmark lockup instead of the mark alone. */
  showWordmark?: boolean;
  sticky?: boolean;
  /** Extra content rendered below the header row (search, route strip…). */
  children?: ReactNode;
  className?: string;
}

const variantClasses: Record<AppHeaderVariant, string> = {
  navy: "bg-navy-depth text-white",
  glass: "glass-surface text-slate-900 dark:text-slate-100",
  plain: "bg-surface-light text-slate-900 dark:bg-surface-dark dark:text-slate-100 border-b border-border-light dark:border-border-dark",
};

/**
 * The shared application header for all three apps.
 *
 * Responsive sizing is handled here rather than per-app so the brand mark
 * stays consistent: the logo steps up from 28px on phones to 36px from
 * `sm` — matching the taller header row on tablet/desktop — and the
 * wordmark is hidden below `sm` in lockup mode so long titles never
 * collide with the actions slot on a 360px screen.
 */
export function AppHeader({
  title,
  subtitle,
  leading,
  actions,
  variant = "navy",
  showLogo = true,
  showWordmark = false,
  sticky = false,
  children,
  className,
}: AppHeaderProps) {
  const tone = variant === "navy" ? "light" : "navy";

  return (
    <header
      className={cn(
        variantClasses[variant],
        sticky && "sticky top-0 z-30",
        variant === "navy" && "bg-dot-grid bg-[length:18px_18px]",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
        {leading ? (
          <div className="shrink-0">{leading}</div>
        ) : showLogo ? (
          showWordmark ? (
            <>
              <BrandLogo variant="lockup" tone={tone} className="hidden sm:inline-flex" />
              <BrandLogo variant="mark" tone={tone} className="h-7 w-7 sm:hidden" />
            </>
          ) : (
            <BrandLogo variant="mark" tone={tone} className="h-7 w-7 shrink-0 sm:h-9 sm:w-9" />
          )
        ) : null}

        {(title || subtitle) && (
          <div className="min-w-0 flex-1">
            {title && (
              <h1
                className={cn(
                  "truncate text-base font-semibold sm:text-lg",
                  variant === "navy" ? "text-white" : "text-slate-900 dark:text-slate-100",
                )}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                className={cn(
                  "truncate text-xs",
                  variant === "navy" ? "text-white/65" : "text-slate-500 dark:text-slate-400",
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        {!title && !subtitle && <div className="flex-1" />}

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6">{children}</div>}
    </header>
  );
}
