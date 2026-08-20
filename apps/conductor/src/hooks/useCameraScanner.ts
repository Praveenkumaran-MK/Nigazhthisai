import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, NotFoundException, type Exception, type Result } from "@zxing/library";

export type ScannerStatus = "idle" | "starting" | "scanning" | "camera-denied" | "camera-unavailable" | "unsupported";

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

/**
 * Prefers the native BarcodeDetector API (fast, no extra decode work on the
 * main thread) and falls back to @zxing/library when unavailable — per spec
 * §34, BarcodeDetector is currently Chromium-only, so Safari/Firefox always
 * use the zxing path.
 */
export function useCameraScanner(onResult: (value: string) => void) {
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const rafRef = useRef<number>();
  const barcodeDetectorRef = useRef<InstanceType<NonNullable<Window["BarcodeDetector"]>> | null>(null);
  const cancelledRef = useRef(false);

  // `onResult` is often a fresh function identity on every render (e.g. a
  // useCallback closing over per-scan state in the caller). The decode loop
  // below is started once and would otherwise capture that first-render
  // closure forever — keeping it in a ref lets the caller's latest guard
  // logic (isValidating/cooldown) actually take effect on every frame,
  // instead of every frame re-running the closure from before the first
  // scan, which previously fired the "already validated" flow ~50x/sec.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    barcodeDetectorRef.current = null;
    zxingReaderRef.current?.reset();
    zxingReaderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    cancelledRef.current = false;
    setStatus("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch {
      setStatus("camera-denied");
      return;
    }
    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    if (cancelledRef.current) return;
    setStatus("scanning");

    if (window.BarcodeDetector) {
      barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      const detectLoop = async () => {
        if (cancelledRef.current || !videoRef.current || !barcodeDetectorRef.current) return;
        try {
          const results = await barcodeDetectorRef.current.detect(videoRef.current);
          if (cancelledRef.current) return;
          if (results[0]?.rawValue) {
            onResultRef.current(results[0].rawValue);
          }
        } catch {
          /* transient decode errors are expected between frames */
        }
        if (!cancelledRef.current) {
          rafRef.current = requestAnimationFrame(detectLoop);
        }
      };
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    // Fallback: @zxing/library. decodeFromVideoElementContinuously calls
    // back on every frame, resolving `result` on a hit and an `err`
    // (typically NotFoundException) on frames with no code — that's the
    // expected steady state between scans, not a failure.
    const reader = new BrowserQRCodeReader();
    zxingReaderRef.current = reader;
    await reader.decodeFromVideoElementContinuously(videoRef.current, (result: Result, err?: Exception) => {
      if (cancelledRef.current) return;
      // Despite the non-optional type, zxing invokes this callback with no
      // usable `result` on every frame that fails to decode — guard for it.
      if (result) onResultRef.current(result.getText());
      else if (err && !(err instanceof NotFoundException)) {
        // eslint-disable-next-line no-console
        console.warn("QR decode error", err);
      }
    });
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, status, start, stop };
}
