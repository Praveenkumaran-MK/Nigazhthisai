import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { cn } from "../utils/cn";

export interface QRDisplayProps {
  value: string;
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Renders a high-density QR code on a <canvas>. `value` is expected to be
 * the server-generated, signed ticket QR payload (see
 * @sbt/supabase-client createSecureTicket) — this component never
 * constructs or signs a payload itself.
 */
export function QRDisplay({ value, size = 240, className, label }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    setReady(false);
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1, errorCorrectionLevel: "H" })
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, [value, size]);

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className="relative rounded-xl border border-border-light bg-white p-3 dark:border-border-dark">
        {!ready && (
          <div
            aria-hidden="true"
            className="absolute inset-3 animate-pulse rounded-md bg-slate-200 dark:bg-[#141414]"
            style={{ width: size, height: size }}
          />
        )}
        <canvas ref={canvasRef} width={size} height={size} role="img" aria-label={label ?? "Ticket QR code"} />
      </div>
      {label && <p className="text-xs text-slate-500 dark:text-slate-500">{label}</p>}
    </div>
  );
}
