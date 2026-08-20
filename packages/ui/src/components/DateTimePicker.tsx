import { useId } from "react";
import { Input } from "./Input";

export interface DateTimePickerProps {
  label: string;
  value: string;
  onChange: (isoValue: string) => void;
  min?: string;
  error?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a Date using its LOCAL components — never toISOString(), which is UTC. */
function toLocalDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTimeInputValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Wraps native date + time inputs (broadest browser support, built-in
 * platform calendar UI, no extra dependency) and emits a combined ISO
 * datetime string. Rejects invalid/incomplete combinations by leaving the
 * previous value untouched until both parts are present.
 *
 * Display and `commit` both work in LOCAL time consistently. The previous
 * version derived the displayed date/time from `toISOString()` (UTC) while
 * `commit` parsed the typed value as local time (`new Date("...T...")`),
 * so re-editing the same field silently shifted the stored value by the
 * browser's UTC offset every time (and could roll the date back a day for
 * any local time before the offset's magnitude, e.g. before 05:30 in IST).
 */
export function DateTimePicker({ label, value, onChange, min, error }: DateTimePickerProps) {
  const id = useId();
  const parsed = value ? new Date(value) : null;
  const isValidParsed = parsed && !Number.isNaN(parsed.getTime());
  const datePart = isValidParsed ? toLocalDateInputValue(parsed) : "";
  const timePart = isValidParsed ? toLocalTimeInputValue(parsed) : "";

  const minParsed = min ? new Date(min) : null;
  const minDatePart = minParsed && !Number.isNaN(minParsed.getTime()) ? toLocalDateInputValue(minParsed) : undefined;

  const commit = (nextDate: string, nextTime: string) => {
    if (!nextDate || !nextTime) return;
    const candidate = new Date(`${nextDate}T${nextTime}:00`);
    if (Number.isNaN(candidate.getTime())) return;
    onChange(candidate.toISOString());
  };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</legend>
      <div className="flex gap-2">
        <Input
          id={`${id}-date`}
          type="date"
          aria-label={`${label} date`}
          min={minDatePart}
          value={datePart}
          onChange={(e) => commit(e.target.value, timePart || "09:00")}
        />
        <Input
          id={`${id}-time`}
          type="time"
          aria-label={`${label} time`}
          value={timePart}
          onChange={(e) => commit(datePart, e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-600 dark:text-danger-500">
          {error}
        </p>
      )}
    </fieldset>
  );
}
