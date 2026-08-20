import { useEffect, useRef, useState } from "react";
import type { GpsCoordinate } from "@sbt/shared-types";
import { usePushNotifications } from "./usePushNotifications";

const GEOFENCE_RADIUS_METERS = 100;
const POLL_INTERVAL_MS = 20_000; // battery-conscious: poll, don't watchPosition continuously

export function haversineMeters(a: GpsCoordinate, b: GpsCoordinate): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface UseGeofenceAlightingOptions {
  destination: GpsCoordinate | null;
  /** Monitoring stops automatically once this becomes false (ticket expired/completed/cancelled). */
  active: boolean;
}

/**
 * Polls geolocation at a low frequency (not watchPosition) while a ticket is
 * active, and fires a single "Have you alighted?" notification the first
 * time the passenger enters the 100m geofence around their destination —
 * never repeats for the same ticket, and stops entirely once `active`
 * becomes false.
 */
export function useGeofenceAlighting({ destination, active }: UseGeofenceAlightingOptions) {
  const [hasNotified, setHasNotified] = useState(false);
  const [withinGeofence, setWithinGeofence] = useState(false);
  const { permission, requestPermission, notify } = usePushNotifications();
  const notifiedRef = useRef(false);

  useEffect(() => {
    notifiedRef.current = false;
    setHasNotified(false);
  }, [destination?.latitude, destination?.longitude]);

  useEffect(() => {
    if (!active || !destination) return;
    if (permission === "default") void requestPermission();

    let cancelled = false;

    const poll = () => {
      if (!("geolocation" in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const distance = haversineMeters(
            { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            destination,
          );
          const inside = distance <= GEOFENCE_RADIUS_METERS;
          setWithinGeofence(inside);
          if (inside && !notifiedRef.current) {
            notifiedRef.current = true;
            setHasNotified(true);
            notify("Have you alighted?", {
              body: "You're near your destination stop. Tap to confirm your ticket is complete.",
              tag: "geofence-alighting",
            });
          }
        },
        () => {
          /* silently ignore transient geolocation errors during polling */
        },
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
      );
    };

    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, destination, permission, requestPermission, notify]);

  return { withinGeofence, hasNotified };
}
