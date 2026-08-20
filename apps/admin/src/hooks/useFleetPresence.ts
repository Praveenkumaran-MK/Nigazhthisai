import { useEffect, useRef, useState } from "react";
import type { ConductorPresenceState, GpsTelemetry } from "@sbt/shared-types";
import { subscribeToRouteTelemetry } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

export interface FleetBusState {
  busId: string;
  tripId: string;
  routeId: string;
  conductorId: string;
  lastSeen: number;
  position: { latitude: number; longitude: number; heading: number | null } | null;
}

/**
 * Subscribes to every route's Presence + Broadcast channel simultaneously
 * so the admin fleet map can show all currently active buses district-wide.
 * Presence is the source of truth for "who is online"; Broadcast supplies
 * the live coordinate shown on the map — neither is written to Postgres.
 */
export function useFleetPresence(routeIds: string[]) {
  const [buses, setBuses] = useState<Record<string, FleetBusState>>({});
  const handlesRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    handlesRef.current.forEach((unsub) => unsub());
    handlesRef.current = [];
    setBuses({});

    routeIds.forEach((routeId) => {
      const handle = subscribeToRouteTelemetry(supabase, routeId, {
        onTelemetry: (payload: GpsTelemetry) => {
          setBuses((prev) => ({
            ...prev,
            [payload.busId]: {
              ...(prev[payload.busId] ?? {
                busId: payload.busId,
                tripId: payload.tripId,
                routeId: payload.routeId,
                conductorId: prev[payload.busId]?.conductorId ?? "",
                lastSeen: Date.now(),
              }),
              tripId: payload.tripId,
              routeId: payload.routeId,
              lastSeen: Date.now(),
              position: { latitude: payload.latitude, longitude: payload.longitude, heading: payload.heading },
            },
          }));
        },
        onPresenceSync: (state) => {
          const presentBusIds = new Set<string>();
          Object.values(state)
            .flat()
            .forEach((entry) => {
              const presence = entry as unknown as ConductorPresenceState;
              presentBusIds.add(presence.busId);
              setBuses((prev) => ({
                ...prev,
                [presence.busId]: {
                  ...(prev[presence.busId] ?? { position: null }),
                  busId: presence.busId,
                  tripId: presence.tripId,
                  routeId: presence.routeId,
                  conductorId: presence.conductorId,
                  lastSeen: presence.lastSeen,
                },
              }));
            });
          // Drop buses on this route that are no longer present.
          setBuses((prev) => {
            const next = { ...prev };
            Object.values(next).forEach((bus) => {
              if (bus.routeId === routeId && !presentBusIds.has(bus.busId)) delete next[bus.busId];
            });
            return next;
          });
        },
      });
      handlesRef.current.push(handle.unsubscribe);
    });

    return () => {
      handlesRef.current.forEach((unsub) => unsub());
      handlesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIds.join(",")]);

  return Object.values(buses);
}
