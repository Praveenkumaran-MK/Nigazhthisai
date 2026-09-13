import { useState, useCallback, useEffect } from "react";
import { useCameraScanner } from "../hooks/useCameraScanner";
import { Camera, X, Zap, Keyboard, ShieldAlert, ShieldCheck, RefreshCw, Bus, CheckCircle2 } from "lucide-react";
import { Button, Input } from "@sbt/ui";

interface BusQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignedBus: {
    id: string;
    bus_number: string;
    registration_number?: string | null;
    type?: string | null;
  } | null;
  onVerify: (scannedValue: string) => Promise<void>;
}

export function BusQrScannerModal({
  isOpen,
  onClose,
  assignedBus,
  onVerify,
}: BusQrScannerModalProps) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [isVerifying, setIsVerifying] = useState(false);
  const [detectedText, setDetectedText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const handleScanResult = useCallback(
    async (value: string) => {
      if (isVerifying || cooldown || !isOpen) return;

      // Instant haptic and visual confirmation that QR was captured by camera
      if ("vibrate" in navigator) {
        navigator.vibrate([70]);
      }
      setDetectedText(value.length > 32 ? `${value.slice(0, 32)}…` : value);
      setIsVerifying(true);
      setErrorMessage(null);
      setCooldown(true);

      try {
        await onVerify(value);
      } catch (err: any) {
        if ("vibrate" in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        setErrorMessage(err.message || "Failed to verify bus QR code. Please try again or use manual entry.");
        // Allow re-scan after 2 seconds
        window.setTimeout(() => {
          setCooldown(false);
          setDetectedText(null);
        }, 2000);
      } finally {
        setIsVerifying(false);
      }
    },
    [isVerifying, cooldown, isOpen, onVerify]
  );

  const { videoRef, status, start, stop } = useCameraScanner(handleScanResult);

  // Manage camera lifecycle
  useEffect(() => {
    if (isOpen && mode === "camera") {
      setErrorMessage(null);
      setDetectedText(null);
      void start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [isOpen, mode, start, stop]);

  // Torch / Flashlight toggle
  const toggleTorch = async () => {
    try {
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities?.() ?? {}) as any;
        if (capabilities.torch) {
          await (track as any).applyConstraints({
            advanced: [{ torch: !torchOn }],
          });
          setTorchOn(!torchOn);
        }
      }
    } catch {
      // Ignore if torch unsupported
    }
  };

  const handleManualSubmit = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const clean = (overrideCode ?? manualCode).trim();
    if (!clean || isVerifying) return;

    if ("vibrate" in navigator) {
      navigator.vibrate([70]);
    }
    setDetectedText(clean);
    setIsVerifying(true);
    setErrorMessage(null);

    try {
      await onVerify(clean);
    } catch (err: any) {
      if ("vibrate" in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
      setErrorMessage(err.message || "Invalid bus verification code.");
      setDetectedText(null);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 p-4 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Bus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Verify Bus #{assignedBus?.bus_number ?? "Assigned"}
              </h2>
              <p className="text-xs text-slate-400">
                {assignedBus?.registration_number ? `${assignedBus.registration_number} · ` : ""}
                Scan official bus QR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 p-1.5">
          <button
            type="button"
            onClick={() => setMode("camera")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
              mode === "camera"
                ? "bg-emerald-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Camera className="h-4 w-4" />
            <span>Camera Scanner</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
              mode === "manual"
                ? "bg-emerald-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Keyboard className="h-4 w-4" />
            <span>Manual Code Entry</span>
          </button>
        </div>

        {/* Main Content Area */}
        {mode === "camera" ? (
          <div className="relative flex flex-col items-center bg-black p-4">
            {/* Viewfinder Frame */}
            <div
              className={`relative aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border-2 transition-all duration-300 bg-slate-900 shadow-inner ${
                detectedText
                  ? "border-emerald-400 ring-4 ring-emerald-500/50"
                  : "border-emerald-500/60"
              }`}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />

              {/* Viewfinder Corner Overlays */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute top-2 left-2 h-7 w-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <div className="absolute top-2 right-2 h-7 w-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <div className="absolute bottom-2 left-2 h-7 w-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <div className="absolute bottom-2 right-2 h-7 w-7 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                {/* Animated Scan Line */}
                {status === "scanning" && !isVerifying && (
                  <div className="absolute inset-x-4 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-scan" />
                )}
              </div>

              {/* Verifying Indicator Overlay */}
              {isVerifying && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 text-center z-10 animate-fade-in">
                  <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                  </div>
                  <p className="text-sm font-bold text-white">QR Code Detected!</p>
                  <p className="text-xs text-emerald-300 mt-1">
                    Validating identity for Bus #{assignedBus?.bus_number}…
                  </p>
                  {detectedText && (
                    <p className="mt-2 max-w-[240px] truncate rounded bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-400 border border-slate-800">
                      {detectedText}
                    </p>
                  )}
                </div>
              )}

              {/* Camera Starting Overlay */}
              {status === "starting" && !isVerifying && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 p-4 text-center">
                  <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin mb-2" />
                  <p className="text-xs text-slate-300 font-medium">Starting camera sensor…</p>
                </div>
              )}

              {status === "camera-denied" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center">
                  <ShieldAlert className="h-10 w-10 text-rose-400 mb-2" />
                  <p className="text-sm font-bold text-rose-300">Camera Permission Denied</p>
                  <p className="text-xs text-slate-400 mt-1">Please allow camera access or switch to Manual Code Entry.</p>
                </div>
              )}
            </div>

            {/* Subtitle / Instructions */}
            <p className="mt-3 text-center text-xs text-slate-400">
              Align the QR code sticker on <strong className="text-slate-200">Bus #{assignedBus?.bus_number}</strong> inside the frame.
            </p>

            {/* Quick Actions (Torch toggle & Quick Manual Fallback) */}
            <div className="mt-3 flex items-center gap-2.5">
              <button
                type="button"
                onClick={toggleTorch}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold border transition-all ${
                  torchOn
                    ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{torchOn ? "Torch On" : "Torch Off"}</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("manual")}
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span>Manual Entry</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-4 p-5 bg-slate-950">
            {/* Quick 1-Click Verification for Assigned Bus */}
            {assignedBus && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-white">Assigned to Trip</p>
                      <p className="text-xs text-emerald-300 font-mono">Bus #{assignedBus.bus_number}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5"
                    isLoading={isVerifying}
                    onClick={() => {
                      setManualCode(assignedBus.bus_number);
                      void handleManualSubmit(undefined, assignedBus.bus_number);
                    }}
                  >
                    Use This Bus
                  </Button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Bus Verification Code or Bus Number
              </label>
              <Input
                autoFocus
                placeholder={`e.g. ${assignedBus?.bus_number || "TN-24-N-1023"}`}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full uppercase font-mono tracking-wide"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Enter the assigned vehicle number or the verification token printed beneath the bus QR sticker.
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 text-sm"
              isLoading={isVerifying}
              disabled={!manualCode.trim()}
            >
              Verify Vehicle & Activate Service
            </Button>
          </form>
        )}

        {/* Error Feedback Display */}
        {errorMessage && (
          <div className="mx-4 mb-4 rounded-xl border border-rose-500/40 bg-rose-950/60 p-3.5 text-xs text-rose-200 shadow-md animate-shake">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold text-rose-300 block">Verification Failed</strong>
                <p className="mt-0.5 text-rose-200/90 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="border-t border-slate-800/80 bg-slate-900/40 p-3 text-center text-[11px] text-slate-500">
          Nigazhthisai Realtime Transit Authority Verification
        </div>
      </div>
    </div>
  );
}
