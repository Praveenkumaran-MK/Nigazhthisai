import { useCallback, useEffect, useRef, useState } from "react";

export type WakeLockState = "unsupported" | "released" | "active" | "failed";

/**
 * navigator.wakeLock support is inconsistent across browsers/platforms
 * (spec §30/§33). A Wake Lock failure must never block GPS tracking — this
 * hook only ever reports its own state and re-acquires the lock on
 * visibilitychange (the spec requires re-requesting after the tab regains
 * foreground visibility, since the OS releases the lock when backgrounded).
 */
export function useWakeLock() {
  const [state, setState] = useState<WakeLockState>("wakeLock" in navigator ? "released" : "unsupported");
  const lockRef = useRef<WakeLockSentinel | null>(null);
  // Tracks whether the caller *wants* an active lock (request() called,
  // release() not yet called) — distinct from whether one is currently
  // held, since the OS releases the underlying lock whenever the tab is
  // backgrounded regardless of what the caller wants.
  const wantLockRef = useRef(false);

  const request = useCallback(async () => {
    if (!("wakeLock" in navigator)) {
      setState("unsupported");
      return;
    }
    wantLockRef.current = true;
    try {
      lockRef.current = await navigator.wakeLock.request("screen");
      setState("active");
      lockRef.current.addEventListener("release", () => {
        lockRef.current = null;
        setState((prev) => (prev === "unsupported" ? prev : "released"));
      });
    } catch {
      setState("failed");
    }
  }, []);

  const release = useCallback(async () => {
    wantLockRef.current = false;
    await lockRef.current?.release();
    lockRef.current = null;
    setState("released");
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && wantLockRef.current && lockRef.current === null) {
        void request();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [request]);

  return { state, request, release };
}
