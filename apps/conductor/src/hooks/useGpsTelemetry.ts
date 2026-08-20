import { useCallback, useEffect, useRef, useState } from "react";
import type { GpsTelemetry, RealtimeConnectionState } from "@sbt/shared-types";
import { openConductorTelemetryChannel, type ConductorTelemetryChannelHandle } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { haversineMeters } from "../lib/geo";

export type GpsWatchStatus = "idle" | "watching" | "denied" | "unavailable" | "error";

const BROADCAST_INTERVAL_MS = 4000; // within the 3-5s window required by spec §15/§31
const MIN_MOVE_METERS = 3; // avoid broadcasting identical/near-identical points

export interface UseGpsTelemetryOptions {
  busId: string;
  tripId: string;
  routeId: string;
  conductorId: string;
  enabled: boolean;
}

/**
 * Owns: geolocation.watchPosition + a Supabase Broadcast channel + Presence
 * tracking for one active trip. Broadcasts at most once per
 * BROADCAST_INTERVAL_MS (throttled, not on every watchPosition callback,
 * which can fire much more often) and skips broadcasting a point that
 * hasn't moved meaningfully, per spec §31 "do not broadcast duplicate
 * coordinates unnecessarily". Cleans up the watcher, channel and presence
 * on unmount or when `enabled` becomes false.
 */
export function useGpsTelemetry({ busId, tripId, routeId, conductorId, enabled }: UseGpsTelemetryOptions) {
  const [status, setStatus] = useState<GpsWatchStatus>("idle");
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("disconnected");
  const [lastTelemetry, setLastTelemetry] = useState<GpsTelemetry | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<ConductorTelemetryChannelHandle | null>(null);
  const lastBroadcastRef = useRef<{ at: number; latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }

    const channel = openConductorTelemetryChannel(supabase, routeId, conductorId, setConnectionState);
    channelRef.current = channel;
    void channel.trackPresence({
      conductorId,
      busId,
      tripId,
      routeId,
      status: "online",
      lastSeen: Date.now(),
    });

    setStatus("watching");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const last = lastBroadcastRef.current;
        const moved = !last || haversineMeters(last, point) >= MIN_MOVE_METERS;
        const dueForHeartbeat = !last || now - last.at >= BROADCAST_INTERVAL_MS;

        // Skip a point that hasn't moved meaningfully UNLESS a heartbeat is
        // due — a stationary conductor should still broadcast periodically
        // so Presence/last-seen stays accurate, not go silent.
        if (!moved && !dueForHeartbeat) return;
        // Still throttle to the interval even if the bus moved, to cap
        // broadcast frequency at the 3-5s band.
        if (last && moved && now - last.at < BROADCAST_INTERVAL_MS) return;

        const telemetry: GpsTelemetry = {
          busId,
          tripId,
          routeId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: now,
        };

        lastBroadcastRef.current = { at: now, latitude: point.latitude, longitude: point.longitude };
        setLastTelemetry(telemetry);
        void channel.broadcastPosition(telemetry);
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      void channel.untrackPresence();
      channel.unsubscribe();
      channelRef.current = null;
      setStatus("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, busId, tripId, routeId, conductorId]);

  const requestPermission = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      () => setStatus("watching"),
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
    );
  }, []);

  return { status, connectionState, lastTelemetry, requestPermission };
}
