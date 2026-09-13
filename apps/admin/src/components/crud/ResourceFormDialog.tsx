import { useEffect, useState } from "react";
import { Dialog, Input, Select, Button, Alert, WheelchairIcon } from "@sbt/ui";
import type { FormFieldConfig } from "./types";

export interface ResourceFormDialogProps {
  open: boolean;
  title: string;
  fields: FormFieldConfig[];
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

export function ResourceFormDialog({ open, title, fields, initialValues, onSubmit, onClose }: ResourceFormDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(initialValues ?? {});
      setError(null);
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      // Number-typed fields are kept as raw strings in `values` while being
      // edited (see the Input onChange below) so a trailing "." or a
      // temporarily-empty field isn't destructively coerced on every
      // keystroke; coerce only here, at submit time.
      const coerced: Record<string, unknown> = { ...values };
      for (const field of fields) {
        if (field.type === "number") {
          const raw = values[field.name];
          coerced[field.name] = raw === "" || raw === undefined || raw === null ? undefined : Number(raw);
        }
      }
      await onSubmit(coerced);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {fields.map((field) => {
          if (field.type === "select") {
            return (
              <Select
                key={field.name}
                label={field.label}
                required={field.required}
                value={String(values[field.name] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                options={field.optionsForValues ? field.optionsForValues(values) : field.options ?? []}
                placeholder={field.placeholder}
              />
            );
          }
          if (field.type === "checkbox") {
            const isWheelchair = field.name.includes("wheelchair") || field.name.includes("handicap") || field.name.includes("access");
            return (
              <label
                key={field.name}
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 cursor-pointer transition-all shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  {isWheelchair && <WheelchairIcon size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      {field.label}
                    </span>
                    {isWheelchair && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Enable if vehicle is equipped with ramp, designated wheelchair seats or low-floor facilities
                      </span>
                    )}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.checked }))}
                  className="h-5 w-5 rounded border-slate-300 text-[#0D2A5D] focus:ring-[#0D2A5D] cursor-pointer"
                />
              </label>
            );
          }
          return (
            <Input
              key={field.name}
              label={field.label}
              type={field.type}
              step={field.step}
              required={field.required}
              placeholder={field.placeholder}
              value={String(values[field.name] ?? "")}
              onChange={(e) => {
                // Keep the raw string for number fields — coercing to
                // Number() on every keystroke erased trailing "." and
                // silently turned a cleared field into 0 instead of empty.
                const raw = e.target.value;
                setValues((v) => ({ ...v, [field.name]: raw }));
              }}
            />
          );
        })}
        {error && <Alert tone="danger" title="Could not save">{error}</Alert>}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
