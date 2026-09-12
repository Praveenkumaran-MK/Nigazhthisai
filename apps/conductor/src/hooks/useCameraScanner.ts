import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, BarcodeFormat, DecodeHintType } from "@zxing/library";

export type ScannerStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "camera-denied"
  | "camera-unavailable"
  | "unsupported";

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): {
        detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
      };
      getSupportedFormats: () => Promise<string[]>;
    };
  }
}

/**
 * High-performance, fail-safe dual-engine camera QR scanner.
 *
 * 1. Checks if the native BarcodeDetector API is truly supported and functional.
 * 2. If native BarcodeDetector is unavailable or errors at runtime, seamlessly
 *    falls back to @zxing/library without hanging on DOM event listeners.
 * 3. Throttles decode attempts to ~8-10 scans/sec on requestAnimationFrame to
 *    preserve 60fps UI fluidity and prevent CPU/battery drain.
 */
export function useCameraScanner(onResult: (value: string) => void) {
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const rafRef = useRef<number>();
  const barcodeDetectorRef = useRef<InstanceType<NonNullable<Window["BarcodeDetector"]>> | null>(null);
  const cancelledRef = useRef(false);

  // Keep latest onResult reference across renders without restarting the stream
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    barcodeDetectorRef.current = null;
    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset();
      } catch {
        /* noop */
      }
      zxingReaderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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
      // Prefer high-res environment camera for fast QR recognition
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch {
      try {
        // Fallback to any available video device (e.g. laptop webcam in development)
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        setStatus("camera-denied");
        return;
      }
    }

    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.setAttribute("muted", "true");

    try {
      await video.play();
    } catch (playErr) {
      console.warn("[CameraScanner] video.play() warning:", playErr);
    }

    if (cancelledRef.current) return;
    setStatus("scanning");

    // 1. Check if native BarcodeDetector is truly available and supports qr_code
    let detector: InstanceType<NonNullable<Window["BarcodeDetector"]>> | null = null;
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const DetectorClass = window.BarcodeDetector;
        if (typeof DetectorClass === "function" && typeof DetectorClass.getSupportedFormats === "function") {
          const supported = await DetectorClass.getSupportedFormats();
          if (Array.isArray(supported) && supported.includes("qr_code")) {
            detector = new DetectorClass({ formats: ["qr_code"] });
          }
        }
      } catch (err) {
        console.info("[CameraScanner] Native BarcodeDetector not usable, using ZXing fallback:", err);
      }
    }
    barcodeDetectorRef.current = detector;

    // 2. Prepare ZXing reader with dedicated QR optimization hints
    const reader = new BrowserQRCodeReader();
    const hints = new Map<DecodeHintType, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.hints = hints;
    zxingReaderRef.current = reader;

    // 3. Robust frame decoding loop (runs ~8-10 times/second)
    const SCAN_INTERVAL_MS = 120;
    let lastScanTime = 0;
    let isDecoding = false;

    const frameLoop = async (timestamp: number) => {
      if (cancelledRef.current || !videoRef.current) return;

      const v = videoRef.current;
      if (
        !isDecoding &&
        timestamp - lastScanTime >= SCAN_INTERVAL_MS &&
        v.readyState >= 2 &&
        v.videoWidth > 0 &&
        v.videoHeight > 0
      ) {
        isDecoding = true;
        lastScanTime = timestamp;

        // Try native BarcodeDetector if available
        if (barcodeDetectorRef.current) {
          try {
            const barcodes = await barcodeDetectorRef.current.detect(v);
            const first = barcodes?.[0];
            if (first?.rawValue) {
              console.info("[CameraScanner] QR decoded via BarcodeDetector:", first.rawValue);
              onResultRef.current(first.rawValue);
              isDecoding = false;
              return;
            }
          } catch (err) {
            console.warn("[CameraScanner] BarcodeDetector runtime error, falling back to ZXing:", err);
            barcodeDetectorRef.current = null;
          }
        }

        // Try ZXing engine
        if (zxingReaderRef.current) {
          try {
            const res = zxingReaderRef.current.decode(v);
            if (cancelledRef.current) return;
            if (res) {
              const text = res.getText();
              if (text) {
                console.info("[CameraScanner] QR decoded via ZXing:", text);
                onResultRef.current(text);
                isDecoding = false;
                return;
              }
            }
          } catch {
            // NotFoundException or ChecksumException is normal when no QR code is inside frame
          }
        }

        isDecoding = false;
      }

      if (!cancelledRef.current) {
        rafRef.current = requestAnimationFrame(frameLoop);
      }
    };

    rafRef.current = requestAnimationFrame(frameLoop);
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, status, start, stop };
}
