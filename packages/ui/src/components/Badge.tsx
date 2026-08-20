import type { HTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-[#141414] dark:text-slate-300",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
  success: "bg-green-50 text-success-600 dark:bg-success-500/10 dark:text-success-500",
  warning: "bg-amber-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-500",
  danger: "bg-red-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
