import { useCallback, useState } from "react";

export type GeolocationStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable" | "timeout";

export interface GeolocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * One-shot geolocation request (not a watcher — that's useGpsWatcher in the
 * conductor app). Handles every failure mode explicitly per spec §20 so the
 * UI can always fall back to manual stop selection instead of getting stuck.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [position, setPosition] = useState<GeolocationResult | null>(null);

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus("granted");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus("denied");
        else if (err.code === err.TIMEOUT) setStatus("timeout");
        else setStatus("unavailable");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, []);

  return { status, position, request };
}
