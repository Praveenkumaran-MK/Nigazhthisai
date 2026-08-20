/**
 * Realtime payload contracts. GPS telemetry travels exclusively over
 * Broadcast (never Postgres Changes); Presence represents online conductors;
 * Postgres Changes covers persistent row mutations (tickets, trips, alerts).
 */

export interface GpsTelemetry {
  busId: string;
  tripId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  /** meters; from GeolocationPosition.coords.accuracy */
  accuracy: number;
  /** degrees, 0-360, or null if unavailable */
  heading: number | null;
  /** meters/second, or null if unavailable */
  speed: number | null;
  /** epoch millis */
  timestamp: number;
}

export const gpsBroadcastEvent = "gps-telemetry" as const;

export function routeChannelName(routeId: string): string {
  return `room:route_${routeId}`;
}

export interface ConductorPresenceState {
  conductorId: string;
  busId: string;
  tripId: string;
  routeId: string;
  status: "online" | "idle";
  /** epoch millis of last heartbeat */
  lastSeen: number;
}

export type RealtimeConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

export interface PostgresChangePayload<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T | null;
  old: Partial<T> | null;
}
