import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ConductorPresenceState, GpsTelemetry, RealtimeConnectionState } from "@sbt/shared-types";
import { gpsBroadcastEvent, routeChannelName } from "@sbt/shared-types";

export interface RouteChannelHandle {
  channel: RealtimeChannel;
  unsubscribe: () => void;
}

/**
 * Subscribes to a route's GPS Broadcast + Presence channel. Used by
 * Passenger (read-only) and Admin (read-only, fleet-wide) clients.
 */
export function subscribeToRouteTelemetry(
  client: SupabaseClient,
  routeId: string,
  handlers: {
    onTelemetry: (payload: GpsTelemetry) => void;
    onPresenceSync?: (state: Record<string, ConductorPresenceState[]>) => void;
    onConnectionStateChange?: (state: RealtimeConnectionState) => void;
  },
): RouteChannelHandle {
  const channel = client.channel(routeChannelName(routeId), {
    // No presence `key` override here: this is a read-only subscriber, so it
    // doesn't track its own presence — it only reads whatever key each
    // conductor's own channel (see openConductorTelemetryChannel) tracked
    // under, which is now that conductor's id, not the shared route id.
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: gpsBroadcastEvent }, ({ payload }) => {
    handlers.onTelemetry(payload as GpsTelemetry);
  });

  if (handlers.onPresenceSync) {
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<ConductorPresenceState>();
      handlers.onPresenceSync?.(state as unknown as Record<string, ConductorPresenceState[]>);
    });
  }

  channel.subscribe((status) => {
    if (!handlers.onConnectionStateChange) return;
    switch (status) {
      case "SUBSCRIBED":
        handlers.onConnectionStateChange("connected");
        break;
      case "CHANNEL_ERROR":
        handlers.onConnectionStateChange("error");
        break;
      case "TIMED_OUT":
        handlers.onConnectionStateChange("reconnecting");
        break;
      case "CLOSED":
        handlers.onConnectionStateChange("disconnected");
        break;
      default:
        handlers.onConnectionStateChange("connecting");
    }
  });

  return {
    channel,
    unsubscribe: () => {
      client.removeChannel(channel);
    },
  };
}

export interface ConductorTelemetryChannelHandle extends RouteChannelHandle {
  broadcastPosition: (telemetry: GpsTelemetry) => Promise<void>;
  trackPresence: (state: ConductorPresenceState) => Promise<void>;
  untrackPresence: () => Promise<void>;
}

const PRESENCE_HEARTBEAT_MS = 20_000;

/**
 * Publisher-side channel: used only by the Conductor PWA.
 *
 * Fixes vs. the original version:
 * - Presence is now keyed by `conductorId`, not the shared `routeId` — every
 *   conductor on the same route was previously publishing into one shared
 *   presence bucket, making per-conductor join/leave tracking meaningless.
 * - `channel.track()` is only ever called once the channel has actually
 *   reached `SUBSCRIBED` (per supabase-js's documented contract), instead of
 *   firing immediately after `.subscribe()` — calling it earlier races the
 *   join and can silently drop the presence push on a slow connection.
 * - `broadcastPosition()` calls made before the channel joins are held and
 *   flushed once it does, instead of firing into a not-yet-joined channel.
 * - A periodic re-`track()` heartbeat keeps `lastSeen` actually advancing;
 *   previously it was stamped once at trip start and never touched again by
 *   this module, so admin's "last seen" only ever changed as a side effect
 *   of the caller's own GPS handler, not from here.
 */
export function openConductorTelemetryChannel(
  client: SupabaseClient,
  routeId: string,
  conductorId: string,
  onConnectionStateChange?: (state: RealtimeConnectionState) => void,
): ConductorTelemetryChannelHandle {
  const channel = client.channel(routeChannelName(routeId), {
    config: { broadcast: { self: false, ack: false }, presence: { key: conductorId } },
  });

  let joined = false;
  let pendingBroadcast: GpsTelemetry | null = null;
  let lastPresenceState: ConductorPresenceState | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      joined = true;
      if (pendingBroadcast) {
        void channel.send({ type: "broadcast", event: gpsBroadcastEvent, payload: pendingBroadcast });
        pendingBroadcast = null;
      }
      if (lastPresenceState) {
        void channel.track(lastPresenceState);
      }
      if (!heartbeatId) {
        heartbeatId = setInterval(() => {
          if (joined && lastPresenceState) {
            void channel.track({ ...lastPresenceState, lastSeen: Date.now() });
          }
        }, PRESENCE_HEARTBEAT_MS);
      }
    } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
      joined = false;
    }

    if (!onConnectionStateChange) return;
    if (status === "SUBSCRIBED") onConnectionStateChange("connected");
    else if (status === "CHANNEL_ERROR") onConnectionStateChange("error");
    else if (status === "TIMED_OUT") onConnectionStateChange("reconnecting");
    else if (status === "CLOSED") onConnectionStateChange("disconnected");
    else onConnectionStateChange("connecting");
  });

  return {
    channel,
    unsubscribe: () => {
      if (heartbeatId) clearInterval(heartbeatId);
      client.removeChannel(channel);
    },
    broadcastPosition: async (telemetry) => {
      if (!joined) {
        pendingBroadcast = telemetry;
        return;
      }
      await channel.send({ type: "broadcast", event: gpsBroadcastEvent, payload: telemetry });
    },
    trackPresence: async (state) => {
      lastPresenceState = state;
      if (joined) {
        await channel.track(state);
      }
    },
    untrackPresence: async () => {
      lastPresenceState = null;
      if (joined) {
        await channel.untrack();
      }
    },
  };
}

/** Generic Postgres Changes subscription for persistent-state tables (tickets, trips, alerts, occupancy). */
export function subscribeToTableChanges<T extends object>(
  client: SupabaseClient,
  opts: { table: string; filter?: string; schema?: string },
  onChange: (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: T | null; old: Partial<T> | null }) => void,
): () => void {
  const channelName = `changes:${opts.table}:${opts.filter ?? "all"}`;
  // supabase-js's `.on()` overloads don't expose a typed "postgres_changes"
  // signature that fits a generic table name; casting the whole channel to
  // `any` here is the documented workaround (see supabase-js #1284) rather
  // than fighting overload inference with `never`, which failed to compile.
  const channel = (client.channel(channelName) as any).on(
    "postgres_changes",
    {
      event: "*",
      schema: opts.schema ?? "public",
      table: opts.table,
      filter: opts.filter,
    },
    (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: T; old: Partial<T> }) => {
      onChange({ eventType: payload.eventType, new: payload.new ?? null, old: payload.old ?? null });
    },
  ).subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
