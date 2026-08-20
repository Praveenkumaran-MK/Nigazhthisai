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

  const search = useCallback(async (routeId: string, originStopId: string) => {
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setError(null);
    try {
      const result = await listEligibleBuses(supabase, routeId, originStopId);
      if (requestId !== requestIdRef.current) return; // a newer search has since started
      setBuses(result);
      setStatus("success");
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : "Could not load buses");
      setStatus("error");
    }
  }, []);

  return { buses, status, error, search };
}
