import { useCallback, useEffect, useRef, useState } from "react";

const LONG_PRESS_MS = 1500;

/**
 * Requires a sustained press (not a tap) before firing, to reduce accidental
 * SOS activation per spec §38. Exposes press progress (0-1) so the UI can
 * render a fill/countdown affordance.
 */
export function useSosLongPress(onTrigger: () => void) {
  const [progress, setProgress] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>();

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const elapsed = Date.now() - startRef.current;
    const pct = Math.min(1, elapsed / LONG_PRESS_MS);
    setProgress(pct);
    if (pct >= 1) {
      startRef.current = null;
      setIsPressing(false);
      setProgress(0);
      onTrigger();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onTrigger]);

  const onPressStart = useCallback(() => {
    startRef.current = Date.now();
    setIsPressing(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const onPressEnd = useCallback(() => {
    startRef.current = null;
    setIsPressing(false);
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // A press in progress when this component unmounts (e.g. the conductor
  // navigates away mid-press) would otherwise keep ticking via the
  // already-scheduled rAF and could still call onTrigger() — filing an SOS
  // — after the component is gone.
  useEffect(() => {
    return () => {
      startRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    progress,
    isPressing,
    handlers: {
      onPointerDown: onPressStart,
      onPointerUp: onPressEnd,
      onPointerLeave: onPressEnd,
      onPointerCancel: onPressEnd,
    },
  };
}
