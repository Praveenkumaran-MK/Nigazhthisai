import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensurePassengerSession } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

/** Silently establishes the anonymous Supabase session on first mount (zero-login UX). */
export function usePassengerSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensurePassengerSession(supabase)
      .then((s) => !cancelled && setSession(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to start session"));
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, isReady: Boolean(session), error };
}
