import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Alert, Badge, Card, Input } from "@sbt/ui";
import { Camera, Keyboard, ArrowLeft } from "lucide-react";
import { validateTicket } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useCameraScanner } from "../hooks/useCameraScanner";

type ScanFeedback = {
  tone: "success" | "danger" | "warning";
  title?: string;
  message: string;
  details?: {
    pnr?: string;
    passengerCount?: number;
    concession?: string;
    stops?: string;
    fare?: number;
  };
} | null;

export function ScannerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"camera" | "pnr">("camera");
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [pnrInput, setPnrInput] = useState("");

  const handleDecoded = useCallback(
    async (value: string) => {
      if (isValidating || cooldown || !tripId) return;
      setIsValidating(true);
      setCooldown(true);
      try {
        const ticket = await validateTicket(supabase, { qr_payload: value, trip_id: tripId });
        if ("vibrate" in navigator) {
          navigator.vibrate([120]);
        }
        setFeedback({
          tone: "success",
          title: "Ticket Validated",
          message: `PNR: ${ticket.pnr ?? "N/A"} — ${ticket.passenger_count} Passenger(s)`,
          details: {
            pnr: ticket.pnr ?? undefined,
            passengerCount: ticket.passenger_count,
            fare: ticket.total_fare,
          },
        });
      } catch (e) {
        if ("vibrate" in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        setFeedback({
          tone: "danger",
          title: "Ticket Rejected",
          message: e instanceof Error ? e.message : "Invalid or expired ticket",
        });
      } finally {
        setIsValidating(false);
        window.setTimeout(() => setCooldown(false), 2000);
      }
    },
    [isValidating, cooldown, tripId],
  );

  const { videoRef, status, start, stop } = useCameraScanner(handleDecoded);

  useEffect(() => {
    if (mode === "camera") {
      void start();
    } else {
      stop();
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handlePnrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPnr = pnrInput.trim().toUpperCase();
    if (!cleanPnr || isValidating) return;

    setIsValidating(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.rpc("validate_ticket_by_pnr", {
        p_pnr: cleanPnr,
        p_trip_id: tripId || null,
      });

      if (error) throw error;

      const isSuccessful = Boolean(data?.success || data?.valid);
      if (isSuccessful) {
        if ("vibrate" in navigator) {
          navigator.vibrate([120]);
        }
        const fromStop = data.from_stop ?? data.origin_stop_name ?? "Origin";
        const toStop = data.to_stop ?? data.dest_stop_name ?? "Destination";
        const fare = data.total_fare ?? data.fare ?? 0;
        setFeedback({
          tone: "success",
          title: "Valid Ticket — Boarding Allowed",
          message: `${data.passenger_count} Passenger(s) • ${fromStop} → ${toStop}`,
          details: {
            pnr: data.pnr,
            passengerCount: data.passenger_count,
            concession: data.concession_type,
            stops: `${fromStop} → ${toStop}`,
            fare: fare,
          },
        });
        setPnrInput("");
      } else {
        if ("vibrate" in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        setFeedback({
          tone: "danger",
          title: data?.error_code || "Validation Failed",
          message: data?.message || "Invalid ticket details",
        });
      }
    } catch (err: any) {
      if ("vibrate" in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
      setFeedback({
        tone: "danger",
        title: "Validation Error",
        message: err.message || "Failed to validate ticket",
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 p-4 backdrop-blur">
        <Button variant="ghost" size="sm" className="inline-flex items-center gap-1.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition ${
              mode === "camera" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setMode("camera")}
          >
            <Camera className="h-3.5 w-3.5" />
            <span>QR Camera</span>
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition ${
              mode === "pnr" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setMode("pnr")}
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span>Manual PNR</span>
          </button>
        </div>
        <Badge tone={mode === "camera" ? (status === "scanning" ? "success" : "neutral") : "brand"}>
          {mode === "camera" ? status : "Manual"}
        </Badge>
      </div>

      {/* Main View Area */}
      {mode === "camera" ? (
        <div className="relative flex-1 overflow-hidden bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400/60 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
            <span className="rounded bg-slate-950/80 px-3 py-1 text-xs text-emerald-300 font-mono">
              Align Passenger QR Code
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col justify-center gap-4">
          <Card className="border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-100">Manual Ticket Validation</h2>
            <p className="mt-1 text-xs text-slate-400">
              Enter the 8-character PNR code or Ticket ID from the passenger's screen / receipt.
            </p>

            <form onSubmit={handlePnrSubmit} className="mt-4 flex flex-col gap-3">
              <Input
                label="Passenger PNR Code"
                placeholder="e.g. TN84A12B"
                value={pnrInput}
                onChange={(e) => setPnrInput(e.target.value.toUpperCase())}
                autoFocus
                className="font-mono text-lg tracking-widest uppercase"
              />

              {/* Keypad Shortcuts */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "ETM", "CLR"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === "CLR") setPnrInput("");
                      else setPnrInput((prev) => prev + k);
                    }}
                    className="rounded bg-slate-800 py-2 text-sm font-mono font-semibold text-slate-200 hover:bg-slate-700 active:scale-95 transition"
                  >
                    {k}
                  </button>
                ))}
              </div>

              <Button
                type="submit"
                size="lg"
                className="mt-2 w-full"
                disabled={!pnrInput.trim() || isValidating}
              >
                {isValidating ? "Validating..." : "Validate Ticket →"}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* Feedback Panel */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        {status === "camera-denied" && mode === "camera" && (
          <Alert tone="danger" title="Camera permission denied">
            Enable camera access in your browser settings or switch to Manual PNR mode.
          </Alert>
        )}
        {feedback && (
          <Alert tone={feedback.tone} title={feedback.title ?? "Validation Result"}>
            <div>
              <p className="font-medium">{feedback.message}</p>
              {feedback.details && (
                <div className="mt-2 text-xs opacity-90 font-mono space-y-0.5">
                  {feedback.details.pnr && <div>PNR: {feedback.details.pnr}</div>}
                  {feedback.details.stops && <div>Route: {feedback.details.stops}</div>}
                  {feedback.details.concession && <div>Concession: {feedback.details.concession}</div>}
                  {feedback.details.fare && <div>Fare Paid: ₹{feedback.details.fare}</div>}
                </div>
              )}
            </div>
          </Alert>
        )}
      </div>
    </div>
  );
}
