import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Icon rendered inside the field, left-aligned (e.g. a location/bus pin for search forms). */
  icon?: ReactNode;
  /** Fully-rounded pill shape, for search-form fields (Passenger home search). Default false — admin/conductor forms use the softer rounded-xl shape. */
  pill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, icon, pill = false, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-500 dark:text-brand-400">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={cn(hintId, errorId) || undefined}
            className={cn(
              "w-full border bg-white text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400",
              pill ? "rounded-pill py-3" : "rounded-xl py-2.5",
              icon ? "pl-11 pr-4" : "px-3.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
              "dark:bg-surface-dark dark:text-slate-100 dark:placeholder:text-slate-600",
              error ? "border-danger-500" : "border-border-light dark:border-border-dark",
              props.disabled && "cursor-not-allowed opacity-60",
              className,
            )}
            {...props}
          />
        </div>
        {hint && !error && (
          <p id={hintId} className="text-xs text-slate-500 dark:text-slate-500">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger-600 dark:text-danger-500">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
