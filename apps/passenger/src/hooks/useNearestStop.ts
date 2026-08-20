import { useCallback, useState } from "react";
import type { NearestStopResult } from "@sbt/shared-types";
import { findNearestStop } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

export function useNearestStop() {
  const [stop, setStop] = useState<NearestStopResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (latitude: number, longitude: number) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await findNearestStop(supabase, latitude, longitude);
      setStop(result);
      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find nearby stops");
      setStatus("error");
    }
  }, []);

  return { stop, status, error, lookup };
}
