import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Primary operational button matching https://nigazhthisai.vercel.app/operations:
  // Deep Navy #0D2A5D, uppercase tracking, bold, crisp white text
  primary:
    "bg-[#0D2A5D] text-white shadow-md shadow-navy-950/20 hover:bg-[#0A2149] disabled:bg-[#0D2A5D]/40 disabled:text-white/50 uppercase tracking-wider text-xs font-bold active:scale-[0.98]",
  // Accent operational button: warm amber #D97F00
  accent:
    "bg-[#D97F00] text-white shadow-md shadow-brand-500/20 hover:bg-[#B36400] disabled:bg-[#D97F00]/40 disabled:text-white/50 uppercase tracking-wider text-xs font-bold active:scale-[0.98]",
  secondary:
    "bg-slate-100 text-[#0D2A5D] hover:bg-slate-200 border border-slate-200/80 font-bold uppercase tracking-wider text-xs active:scale-[0.98] dark:bg-surface-dark dark:text-slate-100 dark:hover:bg-[#151515] dark:border-border-dark",
  danger: "bg-danger-600 text-white hover:bg-danger-500 font-bold uppercase tracking-wider text-xs active:scale-[0.98]",
  outline:
    "border border-slate-200 dark:border-border-dark bg-transparent text-[#0D2A5D] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-[#0f0f0f] font-bold uppercase tracking-wider text-xs active:scale-[0.98]",
  ghost: "bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#0f0f0f] font-semibold text-xs active:scale-[0.98]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs px-3.5 py-1.5 gap-1.5",
  md: "text-xs px-5 py-2.5 gap-2",
  lg: "text-sm px-6 py-3.5 gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-bold transition-all",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {isLoading && (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
