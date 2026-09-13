import type { ReactNode } from "react";
import { Card } from "./Card";
import { cn } from "../utils/cn";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  className?: string;
}

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn("rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-surface-dark p-5 shadow-sm flex flex-col justify-between gap-4", className)}>
      <div className="flex items-start justify-between">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-[#0D2A5D] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
            {icon}
          </div>
        )}
        {trend && (
          <div
            className={cn(
              "text-xs font-bold flex items-center gap-0.5",
              trend.direction === "up" && "text-[#D97F00]",
              trend.direction === "down" && "text-rose-500",
              trend.direction === "flat" && "text-slate-500",
            )}
          >
            <span>{trend.direction === "up" ? "↗" : trend.direction === "down" ? "↘" : "•"}</span>
            <span>{trend.label}</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-[#0D2A5D] dark:text-white">{value}</p>
      </div>
    </Card>
  );
}
