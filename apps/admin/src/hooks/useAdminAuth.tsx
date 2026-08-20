import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { signInAdmin, signOut } from "@sbt/supabase-client";
import type { Profile } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";

interface AdminAuthValue {
  session: Session | null;
  profile: Profile | null;
  status: "loading" | "signed-out" | "signed-in" | "forbidden";
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AdminAuthValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const p = data as Profile | null;
    setProfile(p);
    setStatus(p?.role === "admin" ? "signed-in" : "forbidden");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void loadProfile(data.session.user.id);
      else setStatus("signed-out");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        // Deferred: supabase-js warns against calling other supabase.*
        // methods synchronously inside this callback — it runs while the
        // client's internal auth lock is held, and `.from(...)` re-enters
        // that lock, which can hang until the lock times out (observable
        // on every TOKEN_REFRESHED, i.e. ~hourly, or on tab refocus).
        setTimeout(() => {
          void loadProfile(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setStatus("signed-out");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      await signInAdmin(supabase, email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      throw e;
    }
  };

  const logout = async () => {
    await signOut(supabase);
  };

  return (
    <AdminAuthContext.Provider value={{ session, profile, status, login, logout, error }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
