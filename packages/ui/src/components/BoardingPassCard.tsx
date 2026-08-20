import type { ReactNode } from "react";
import { QRDisplay } from "./QRDisplay";
import { RouteVisualization } from "./RouteVisualization";
import { cn } from "../utils/cn";

export interface BoardingPassField {
  label: string;
  value: ReactNode;
}

export interface BoardingPassCardProps {
  /** e.g. "Sun 24 Jan" */
  dateLabel: string;
  /** e.g. "08:30" */
  timeLabel: string;
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  /** e.g. "1h 45m · Non-stop" */
  durationLabel?: string;
  /** Operator wordmark row, e.g. "Thanjai Transit". */
  operatorLabel: string;
  /** 4-6 label/value pairs rendered in a 2-column grid, e.g. Bus/Boarding/Departs/Fare. */
  fields: BoardingPassField[];
  qrValue: string;
  statusBadge?: ReactNode;
  className?: string;
}

/**
 * A boarding-pass-styled ticket: deep-navy header with the route strip,
 * a torn-perforation divider, and a fields grid + QR beneath — matching
 * the reference design's boarding-pass screen, adapted from flight terms
 * (Gate/Flight/Class) to bus terms (Boarding stop/Bus number/Fare).
 */
export function BoardingPassCard({
  dateLabel,
  timeLabel,
  originCode,
  originName,
  destinationCode,
  destinationName,
  durationLabel,
  operatorLabel,
  fields,
  qrValue,
  statusBadge,
  className,
}: BoardingPassCardProps) {
  return (
    <div className={cn("w-full overflow-hidden rounded-3xl shadow-lg shadow-navy-900/10", className)}>
      {/* Navy header: date/time + route strip */}
      <div className="relative bg-navy-700 bg-dot-grid bg-[length:14px_14px] px-6 pb-8 pt-5 text-white">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{dateLabel}</span>
          <span className="font-medium">{timeLabel}</span>
        </div>
        <div className="mt-4">
          <RouteVisualization
            originLabel={originCode}
            originSubLabel={originName}
            destinationLabel={destinationCode}
            destinationSubLabel={destinationName}
            centerLabel={durationLabel}
          />
        </div>
      </div>

      {/* Perforated divider — dashed line with a punched notch on each edge */}
      <div className="relative bg-brand-500">
        <div className="absolute -left-3 top-0 h-6 w-6 -translate-y-1/2 rounded-full bg-canvas-light dark:bg-canvas-dark" />
        <div className="absolute -right-3 top-0 h-6 w-6 -translate-y-1/2 rounded-full bg-canvas-light dark:bg-canvas-dark" />
        <div className="border-t-2 border-dashed border-white/40" />
      </div>

      {/* Fields + QR */}
      <div className="bg-brand-500 px-6 py-6 text-white">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-wide">{operatorLabel}</span>
          {statusBadge}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-y-4">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-white/70">{field.label}</dt>
              <dd className="mt-0.5 text-sm font-bold">{field.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex justify-center rounded-2xl bg-white p-4">
          <QRDisplay value={qrValue} size={180} label="Show this to the conductor" />
        </div>
      </div>
    </div>
  );
}
