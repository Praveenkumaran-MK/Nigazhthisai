import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { signInConductor, signOut } from "@sbt/supabase-client";
import type { Conductor } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";

interface ConductorAuthValue {
  session: Session | null;
  conductor: Conductor | null;
  // "unlinked": a real, authenticated Supabase user exists but has no
  // matching `conductors.user_id` row (e.g. link_conductor_account never
  // ran — see the compensating-delete note in ConductorsPage.tsx). Kept
  // distinct from "signed-in" so callers can show an explicit message
  // instead of a permanent spinner while waiting for `conductor` to
  // populate, which it never will.
  status: "loading" | "signed-out" | "signed-in" | "unlinked";
  login: (governmentId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const ConductorAuthContext = createContext<ConductorAuthValue | null>(null);

export function ConductorAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [conductor, setConductor] = useState<Conductor | null>(null);
  const [status, setStatus] = useState<"loading" | "signed-out" | "signed-in" | "unlinked">("loading");
  const [error, setError] = useState<string | null>(null);

  const loadConductorProfile = async (userId: string) => {
    const { data } = await supabase.from("conductors").select("*").eq("user_id", userId).maybeSingle();
    const loaded = (data as Conductor | null) ?? null;
    setConductor(loaded);
    setStatus(loaded ? "signed-in" : "unlinked");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        void loadConductorProfile(data.session.user.id);
      } else {
        setStatus("signed-out");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        // Deferred: supabase-js explicitly warns against calling other
        // supabase.* methods synchronously inside this callback — it runs
        // while the client's internal auth lock is held, and `.from(...)`
        // re-enters that lock, which can hang until the lock times out
        // (observable on every TOKEN_REFRESHED, i.e. ~hourly, or on tab
        // refocus). Deferring with setTimeout(...,0) lets the callback
        // return and release the lock first.
        setTimeout(() => {
          void loadConductorProfile(newSession.user.id);
        }, 0);
      } else {
        setConductor(null);
        setStatus("signed-out");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (governmentId: string, password: string) => {
    setError(null);
    try {
      await signInConductor(supabase, governmentId, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      throw e;
    }
  };

  const logout = async () => {
    await signOut(supabase);
  };

  return (
    <ConductorAuthContext.Provider value={{ session, conductor, status, login, logout, error }}>
      {children}
    </ConductorAuthContext.Provider>
  );
}

export function useConductorAuth(): ConductorAuthValue {
  const ctx = useContext(ConductorAuthContext);
  if (!ctx) throw new Error("useConductorAuth must be used within ConductorAuthProvider");
  return ctx;
}
