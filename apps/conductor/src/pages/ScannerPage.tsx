import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Alert, Badge, Card, Input, WheelchairIcon, Dialog } from "@sbt/ui";
import { Camera, Keyboard, ArrowLeft, Bus, QrCode } from "lucide-react";
import { validateTicket, verifyBusQr, endTrip } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useCameraScanner } from "../hooks/useCameraScanner";
import { useConductorAuth } from "../hooks/useConductorAuth";
import { useConductorI18n } from "../lib/i18n";

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
  const { tripId: paramTripId } = useParams<{ tripId?: string }>();
  const navigate = useNavigate();
  const { conductor, logout } = useConductorAuth();
  const { t } = useConductorI18n();

  const [activeTripId, setActiveTripId] = useState<string | undefined>(paramTripId);
  const [tripInfo, setTripInfo] = useState<{
    bus_id?: string;
    bus_number?: string;
    registration_number?: string;
    route_name?: string;
    is_wheelchair_accessible?: boolean;
    status?: string;
  } | null>(null);
  const [mode, setMode] = useState<"camera" | "pnr">("camera");
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [pnrInput, setPnrInput] = useState("");

  // Bus QR Re-Scan End Shift State
  const [pendingEndShiftQr, setPendingEndShiftQr] = useState<string | null>(null);
  const [isEndingShift, setIsEndingShift] = useState(false);

  // Helper to accurately identify a Bus QR payload vs passenger ticket
  const isVehicleBusQr = useCallback(
    (value: string, knownBusId?: string, knownBusNum?: string, knownReg?: string): boolean => {
      const clean = (value || "").trim();
      if (!clean) return false;
      const upper = clean.toUpperCase();
      const lower = clean.toLowerCase();

      // 1. Standard pipe-delimited vehicle payload: <bus_id>|<bus_number>|<district_id>|<epoch>.<signature>
      if (clean.includes("|")) return true;

      // 2. BUS prefix
      if (upper.startsWith("BUS:") || upper.startsWith("BUS-")) return true;

      // 3. Direct match with known bus id, number, or registration
      if (knownBusId && (lower === knownBusId.toLowerCase() || lower.startsWith(knownBusId.toLowerCase()))) return true;
      if (knownBusNum && (upper === knownBusNum.toUpperCase() || upper.includes(knownBusNum.toUpperCase()))) return true;
      if (knownReg && (upper === knownReg.toUpperCase() || upper.includes(knownReg.toUpperCase()))) return true;

      // 4. Standalone UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(clean)) return true;

      return false;
    },
    [],
  );

  // Resolve trip if not in route params
  useEffect(() => {
    async function resolveTrip() {
      const tid = paramTripId;
      if (tid) {
        setActiveTripId(tid);
        const { data } = await supabase
          .from("trips")
          .select("id, status, bus_id, buses(id, bus_number, registration_number, is_wheelchair_accessible), routes(route_number, name)")
          .eq("id", tid)
          .maybeSingle();
        if (data) {
          const bus = Array.isArray(data.buses) ? data.buses[0] : data.buses;
          const route = Array.isArray(data.routes) ? data.routes[0] : data.routes;
          setTripInfo({
            bus_id: (data as any).bus_id || bus?.id,
            bus_number: bus?.bus_number,
            registration_number: bus?.registration_number,
            is_wheelchair_accessible: bus?.is_wheelchair_accessible,
            route_name: route?.route_number ? `${route.route_number} - ${route.name}` : route?.name,
            status: (data as any).status,
          });
        }
      } else if (conductor?.id) {
        // First try to find an active or scheduled trip
        const { data: activeData } = await supabase
          .from("trips")
          .select("id, status, bus_id, buses(id, bus_number, registration_number, is_wheelchair_accessible), routes(route_number, name)")
          .eq("conductor_id", conductor.id)
          .in("status", ["ACTIVE", "SCHEDULED"])
          .order("created_at", { ascending: false })
          .limit(1);

        let chosenTrip = activeData && activeData.length > 0 ? activeData[0] : null;

        // If bus returned late and trip was already completed/ended, get the most recent trip
        if (!chosenTrip) {
          const { data: recentData } = await supabase
            .from("trips")
            .select("id, status, bus_id, buses(id, bus_number, registration_number, is_wheelchair_accessible), routes(route_number, name)")
            .eq("conductor_id", conductor.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (recentData && recentData.length > 0) {
            chosenTrip = recentData[0];
          }
        }

        if (chosenTrip) {
          const first: any = chosenTrip;
          setActiveTripId(first.id);
          const bus = Array.isArray(first.buses) ? first.buses[0] : first.buses;
          const route = Array.isArray(first.routes) ? first.routes[0] : first.routes;
          setTripInfo({
            bus_id: first.bus_id || bus?.id,
            bus_number: bus?.bus_number,
            registration_number: bus?.registration_number,
            is_wheelchair_accessible: bus?.is_wheelchair_accessible,
            route_name: route?.route_number ? `${route.route_number} - ${route.name}` : route?.name,
            status: first.status,
          });
        }
      }
    }
    void resolveTrip();
  }, [paramTripId, conductor?.id]);

  const effectiveTripId = paramTripId || activeTripId;

  const handleDecoded = useCallback(
    async (value: string) => {
      if (isValidating || cooldown || isEndingShift) return;

      const clean = (value || "").trim();
      if (!clean) return;

      setIsValidating(true);
      setCooldown(true);

      // 1. INTERCEPT BUS QR CODES (Never let vehicle QR code fall through to ticket validator)
      const isBusPlate = isVehicleBusQr(
        clean,
        tripInfo?.bus_id,
        tripInfo?.bus_number,
        tripInfo?.registration_number,
      );

      if (isBusPlate) {
        if ("vibrate" in navigator) {
          navigator.vibrate([150, 70, 150]);
        }

        // Parse bus number from QR code payload if available (<bus_id>|<bus_number>|...)
        let detectedBusNum = tripInfo?.bus_number;
        if (clean.includes("|")) {
          const parts = clean.split("|");
          if (parts[1] && parts[1].length > 1) {
            detectedBusNum = parts[1];
          }
        } else if (clean.toUpperCase().startsWith("BUS:")) {
          detectedBusNum = clean.slice(4);
        }

        const isCompleted = tripInfo?.status === "COMPLETED";

        setPendingEndShiftQr(clean);
        setFeedback({
          tone: "warning",
          title: isCompleted ? "Bus Session Concluded" : "Bus QR Plate Detected",
          message: isCompleted
            ? `Bus #${detectedBusNum ?? "assigned vehicle"} shift has already concluded. Choose Sign Out below.`
            : `Scanned Bus #${detectedBusNum ?? "assigned vehicle"}. Confirm below to end the ride & complete your shift.`,
        });
        setIsValidating(false);
        return;
      }

      // 2. PASSENGER TICKET VALIDATION FLOW
      if (!effectiveTripId) {
        setFeedback({
          tone: "warning",
          title: "No Active Trip Assigned",
          message: "Please start or select a trip before scanning passenger tickets, or switch to Manual PNR mode.",
        });
        setIsValidating(false);
        window.setTimeout(() => setCooldown(false), 2000);
        return;
      }

      try {
        const ticket = await validateTicket(supabase, { qr_payload: clean, trip_id: effectiveTripId });
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
      } catch (e: any) {
        if ("vibrate" in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        const errMessage = e?.message || (e instanceof Error ? e.message : "Invalid or expired ticket");
        setFeedback({
          tone: "danger",
          title: "Ticket Rejected",
          message: errMessage,
        });
      } finally {
        setIsValidating(false);
        window.setTimeout(() => setCooldown(false), 2000);
      }
    },
    [isValidating, cooldown, isEndingShift, effectiveTripId, tripInfo, isVehicleBusQr],
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
        p_trip_id: effectiveTripId || null,
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
        <Button
          variant="ghost"
          size="sm"
          className="inline-flex items-center gap-1.5"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/dashboard");
            }
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("Back")}</span>
        </Button>

        {tripInfo && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Bus className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span className="font-semibold text-slate-200">Bus #{tripInfo.bus_number}</span>
            {tripInfo.is_wheelchair_accessible && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-bold" title="Handicap Accessible Vehicle">
                <WheelchairIcon size={12} className="text-blue-400" />
                <span>Handicap</span>
              </span>
            )}
            {tripInfo.route_name && <span className="hidden sm:inline">• {tripInfo.route_name}</span>}
          </div>
        )}

        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition ${
              mode === "camera" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setMode("camera")}
          >
            <Camera className="h-3.5 w-3.5" />
            <span>{t("QR Camera")}</span>
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition ${
              mode === "pnr" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setMode("pnr")}
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span>{t("Manual PNR")}</span>
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
              {t("Align Passenger QR Code")}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col justify-center gap-4">
          <Card className="border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-100">{t("Manual Ticket Validation")}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {t("Enter the 8-character PNR code or Ticket ID from the passenger's screen / receipt.")}
            </p>

            <form onSubmit={handlePnrSubmit} className="mt-4 flex flex-col gap-3">
              <Input
                label={t("Passenger PNR Code")}
                placeholder="e.g. TN84A12B"
                value={pnrInput}
                onChange={(e) => setPnrInput(e.target.value.toUpperCase())}
                autoFocus
                className="font-mono text-lg tracking-widest uppercase"
              />

              {/* Keypad Shortcuts */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "ENT", "CLR"].map((k) => (
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
                {isValidating ? t("Validating...") : t("Validate Ticket →")}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* Feedback Panel */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        {status === "camera-denied" && mode === "camera" && (
          <Alert tone="danger" title={t("Camera permission denied")}>
            {t("Enable camera access in your browser settings or switch to Manual PNR mode.")}
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

      {/* End Shift & Complete Ride Confirmation Modal */}
      <Dialog
        open={Boolean(pendingEndShiftQr)}
        onClose={() => setPendingEndShiftQr(null)}
        title={tripInfo?.status === "COMPLETED" ? "Vehicle Session Concluded" : "End Shift & Complete Ride?"}
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              tripInfo?.status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            }`}
          >
            <Bus className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {tripInfo?.status === "COMPLETED" ? "Bus Ride Completed / Concluded" : "Vehicle QR Plate Scanned"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              You scanned the QR plate for{" "}
              <strong className="text-white">
                Bus #{tripInfo?.bus_number ?? (pendingEndShiftQr?.includes("|") ? pendingEndShiftQr.split("|")[1] : "assigned bus")}
              </strong>.
              {tripInfo?.status === "COMPLETED"
                ? " This vehicle shift has already concluded. Would you like to sign out now?"
                : " Would you like to end this ride, stop GPS broadcasting, and complete your shift?"}
            </p>
          </div>
          <div className="w-full rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs text-slate-300 font-mono text-left space-y-1">
            <div>• Trip status: <strong className="text-emerald-400">COMPLETED</strong></div>
            <div>• Remaining active tickets: <strong className="text-amber-400">EXPIRED</strong></div>
            <div>• Live GPS broadcasting: <strong className="text-rose-400">STOPPED</strong></div>
          </div>
          <div className="flex flex-col gap-2 w-full mt-2">
            <Button
              className="w-full font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40"
              size="lg"
              isLoading={isEndingShift}
              onClick={async () => {
                setIsEndingShift(true);
                try {
                  if (effectiveTripId && pendingEndShiftQr && tripInfo?.status !== "COMPLETED") {
                    await endTrip(supabase, effectiveTripId, pendingEndShiftQr);
                  }
                  if ("vibrate" in navigator) {
                    navigator.vibrate([200, 100, 200]);
                  }
                  setPendingEndShiftQr(null);
                  await logout();
                } catch (err: any) {
                  setFeedback({
                    tone: "danger",
                    title: "Shift Sign Out Failed",
                    message: err.message || "Failed to sign out",
                  });
                  setPendingEndShiftQr(null);
                } finally {
                  setIsEndingShift(false);
                }
              }}
            >
              ✓ End Shift & Sign Out Now
            </Button>
            <div className="flex gap-2 w-full">
              <Button
                variant="secondary"
                className="flex-1 font-bold"
                onClick={() => setPendingEndShiftQr(null)}
                disabled={isEndingShift}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className="flex-1 font-bold text-slate-300 hover:text-white"
                disabled={isEndingShift}
                onClick={async () => {
                  if (effectiveTripId && pendingEndShiftQr && tripInfo?.status !== "COMPLETED") {
                    setIsEndingShift(true);
                    try {
                      await endTrip(supabase, effectiveTripId, pendingEndShiftQr);
                    } catch (err: any) {
                      console.warn("End trip warning:", err);
                    } finally {
                      setIsEndingShift(false);
                    }
                  }
                  setPendingEndShiftQr(null);
                  navigate("/dashboard");
                }}
              >
                End Ride Only (Stay Logged In)
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

