import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Navy text on amber, NOT white: white on #D97F00 is 2.99:1 and fails
  // WCAG AA for text. navy-900 on amber is 6.3:1 — and reads like transit
  // signage, which suits the product.
  primary: "bg-brand-500 text-navy-900 shadow-sm shadow-brand-500/25 hover:bg-brand-400 disabled:bg-brand-500/40 disabled:text-navy-900/50",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-surface-dark dark:text-slate-100 dark:hover:bg-[#151515] border border-border-light dark:border-border-dark",
  danger: "bg-danger-600 text-white hover:bg-danger-500",
  outline:
    "border border-border-light dark:border-border-dark bg-transparent text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-[#0f0f0f]",
  ghost: "bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#0f0f0f]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-sm px-3.5 py-1.5 gap-1.5",
  md: "text-sm px-5 py-2.5 gap-2",
  lg: "text-base px-6 py-3.5 gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center rounded-pill font-semibold transition-colors",
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
