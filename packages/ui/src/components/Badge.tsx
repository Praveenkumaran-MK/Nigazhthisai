import type { HTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type BadgeTone = "neutral" | "primary" | "brand" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-[#0D2A5D] border border-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  primary: "bg-[#0D2A5D]/10 text-[#0D2A5D] border border-[#0D2A5D]/20 dark:bg-[#0D2A5D]/40 dark:text-blue-200",
  brand: "bg-amber-50 text-[#D97F00] border border-[#D97F00]/30 dark:bg-[#D97F00]/20 dark:text-amber-300",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400",
  danger: "bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-400",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
