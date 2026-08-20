import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Alert, Badge } from "@sbt/ui";
import { validateTicket } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useCameraScanner } from "../hooks/useCameraScanner";

type ScanFeedback = { tone: "success" | "danger"; message: string } | null;

export function ScannerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const handleDecoded = useCallback(
    async (value: string) => {
      if (isValidating || cooldown || !tripId) return;
      setIsValidating(true);
      setCooldown(true);
      try {
        const ticket = await validateTicket(supabase, { qr_payload: value, trip_id: tripId });
        setFeedback({ tone: "success", message: `Valid ticket — ${ticket.passenger_count} passenger(s)` });
      } catch (e) {
        setFeedback({ tone: "danger", message: e instanceof Error ? e.message : "Invalid ticket" });
      } finally {
        setIsValidating(false);
        window.setTimeout(() => setCooldown(false), 1500);
      }
    },
    [isValidating, cooldown, tripId],
  );

  const { videoRef, status, start, stop } = useCameraScanner(handleDecoded);

  useEffect(() => {
    void start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          ← Back
        </Button>
        <Badge tone="neutral">{status}</Badge>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/40" />
      </div>

      <div className="p-4">
        {status === "camera-denied" && <Alert tone="danger" title="Camera permission denied">Enable camera access in your browser settings to scan tickets.</Alert>}
        {status === "unsupported" && <Alert tone="danger" title="Camera not supported">This browser does not support camera scanning.</Alert>}
        {feedback && (
          <Alert tone={feedback.tone} title={feedback.tone === "success" ? "Ticket accepted" : "Ticket rejected"}>
            {feedback.message}
          </Alert>
        )}
      </div>
    </div>
  );
}
