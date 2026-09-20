import { useCallback, useRef, useState } from "react";
import type { EligibleBus } from "@sbt/shared-types";
import { listEligibleBuses } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

export function useEligibleBuses() {
  const [buses, setBuses] = useState<EligibleBus[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // Guards against out-of-order responses: if `search` is called again
  // before an earlier call resolves (e.g. HomePage's effect re-running as
  // origin/destination change quickly), a slower earlier request could
  // otherwise resolve AFTER the newer one and clobber its results with
  // stale data.
  const requestIdRef = useRef(0);

  const search = useCallback(async (routeIdOrIds: string | string[], originStopId: string) => {
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setError(null);
    try {
      const ids = Array.isArray(routeIdOrIds)
        ? routeIdOrIds.filter(Boolean)
        : [routeIdOrIds].filter(Boolean);

      if (ids.length === 0 || !originStopId) {
        setBuses([]);
        setStatus("success");
        return;
      }

      const results = await Promise.all(
        ids.map((rId) => listEligibleBuses(supabase, rId, originStopId).catch(() => []))
      );

      if (requestId !== requestIdRef.current) return;

      const combined = results.flat();
      // Deduplicate by trip_id
      const unique = Array.from(new Map(combined.map((b) => [b.trip_id, b])).values());
      setBuses(unique);
      setStatus("success");
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : "Could not load buses");
      setStatus("error");
    }
  }, []);

  const setEmpty = useCallback(() => {
    setBuses([]);
    setStatus("success");
    setError(null);
  }, []);

  return { buses, status, error, search, setEmpty };
}
