import { useEffect, useRef, useState } from "react";
import type { GpsTelemetry, RealtimeConnectionState } from "@sbt/shared-types";
import { subscribeToRouteTelemetry } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

export interface SmoothedPosition {
  latitude: number;
  longitude: number;
  heading: number | null;
  lastUpdated: number;
}

const STALE_AFTER_MS = 15_000;
const ANIMATION_DURATION_MS = 2_500;

/**
 * Subscribes to Broadcast GPS telemetry for a route and exposes a smoothly
 * interpolated marker position (rAF-driven lerp between the last two
 * reported points) rather than teleporting the marker on every update, plus
 * a staleness flag once telemetry stops arriving.
 */
export function useRealtimeBusTracking(routeId: string | null, busId: string | null) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("connecting");
  const [displayPosition, setDisplayPosition] = useState<SmoothedPosition | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [lastTelemetry, setLastTelemetry] = useState<GpsTelemetry | null>(null);

  const animationRef = useRef<number>();
  const fromRef = useRef<SmoothedPosition | null>(null);
  const toRef = useRef<GpsTelemetry | null>(null);
  const animationStartRef = useRef<number>(0);
  // Kept in sync with `displayPosition` state so the telemetry handler below
  // (registered once per route/bus, not re-created on every render) can
  // read the CURRENT displayed position instead of the value captured in
  // its closure at effect-creation time, which was always null — that bug
  // made `fromRef` always equal `toRef`, so the marker teleported on every
  // broadcast instead of gliding.
  const displayPositionRef = useRef<SmoothedPosition | null>(null);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    if (!routeId) return;

    const handle = subscribeToRouteTelemetry(supabase, routeId, {
      onTelemetry: (payload) => {
        if (busId && payload.busId !== busId) return;
        setLastTelemetry(payload);
        fromRef.current = displayPositionRef.current ?? {
          latitude: payload.latitude,
          longitude: payload.longitude,
          heading: payload.heading,
          lastUpdated: payload.timestamp,
        };
        toRef.current = payload;
        animationStartRef.current = performance.now();

        // (Re)start the animation loop only when a new point arrives,
        // instead of running an unconditional 60fps loop for the entire
        // lifetime of the page even when nothing is moving.
        if (!isAnimatingRef.current) {
          isAnimatingRef.current = true;
          animationRef.current = requestAnimationFrame(tick);
        }
      },
      onConnectionStateChange: setConnectionState,
    });

    return () => handle.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, busId]);

  function tick(now: number) {
    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to) {
      isAnimatingRef.current = false;
      return;
    }

    const t = Math.min(1, (now - animationStartRef.current) / ANIMATION_DURATION_MS);
    const next: SmoothedPosition = {
      latitude: from.latitude + (to.latitude - from.latitude) * t,
      longitude: from.longitude + (to.longitude - from.longitude) * t,
      heading: to.heading,
      lastUpdated: to.timestamp,
    };
    displayPositionRef.current = next;
    setDisplayPosition(next);

    if (t < 1) {
      animationRef.current = requestAnimationFrame(tick);
    } else {
      isAnimatingRef.current = false;
    }
  }

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      isAnimatingRef.current = false;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIsStale(Boolean(lastTelemetry) && Date.now() - (lastTelemetry?.timestamp ?? 0) > STALE_AFTER_MS);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [lastTelemetry]);

  return { connectionState, position: displayPosition, telemetry: lastTelemetry, isStale };
}
