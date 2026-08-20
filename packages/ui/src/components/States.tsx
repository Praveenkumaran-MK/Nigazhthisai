import type { ReactNode } from "react";
import { LogoLoader } from "./LogoLoader";
import { Button } from "./Button";

/**
 * The standard full-block loading state. Uses the branded LogoLoader
 * rather than a generic spinner — this is the single place most data
 * fetches render their pending state, so swapping it here rebrands
 * loading across all three apps at once.
 */
export function LoadingState({ label = "Loading…", tone }: { label?: string; tone?: "navy" | "light" }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <LogoLoader size="lg" label={label} tone={tone} />
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border-light py-12 text-center dark:border-border-dark">
      {icon && <div className="mb-1 text-slate-400 dark:text-slate-600">{icon}</div>}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-card border border-danger-500/30 bg-danger-500/5 py-10 text-center"
    >
      <p className="text-sm font-medium text-danger-600 dark:text-danger-500">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-500">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
