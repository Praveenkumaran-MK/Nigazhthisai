import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  title: string;
  icon?: ReactNode;
}

const toneClasses: Record<AlertTone, string> = {
  info: "border-brand-500/30 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300",
  success: "border-success-500/30 bg-green-50 text-green-800 dark:bg-success-500/10 dark:text-success-400",
  warning: "border-warning-500/30 bg-amber-50 text-amber-800 dark:bg-warning-500/10 dark:text-warning-400",
  danger: "border-danger-500/30 bg-red-50 text-red-800 dark:bg-danger-500/10 dark:text-danger-400",
};

export function Alert({ className, tone = "info", title, icon, children, ...props }: AlertProps) {
  return (
    <div role="alert" className={cn("flex gap-3 rounded-lg border p-3.5 text-sm", toneClasses[tone], className)} {...props}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div>
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
    </div>
  );
}
