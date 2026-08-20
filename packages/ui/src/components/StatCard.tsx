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
    <Card className={cn("flex items-start justify-between", className)}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
        {trend && (
          <p
            className={cn(
              "mt-1 text-xs font-medium",
              trend.direction === "up" && "text-success-600 dark:text-success-500",
              trend.direction === "down" && "text-danger-600 dark:text-danger-500",
              trend.direction === "flat" && "text-slate-500",
            )}
          >
            {trend.label}
          </p>
        )}
      </div>
      {icon && <div className="text-slate-400 dark:text-slate-600">{icon}</div>}
    </Card>
  );
}
