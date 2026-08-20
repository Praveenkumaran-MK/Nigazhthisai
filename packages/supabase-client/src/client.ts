import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the calling app's
 * import.meta.env. Every app must call createSupabaseClient() exactly once
 * (see each app's src/lib/supabase.ts) instead of instantiating its own
 * client inline in components.
 */
// Structural shape rather than Vite's ImportMetaEnv (an ambient type declared
// per-app in vite-env.d.ts, not visible when this package compiles on its
// own) or a Record (whose index-signature requirement ImportMetaEnv doesn't
// satisfy). Any app's `import.meta.env` is structurally assignable to this.
export interface SupabaseEnvSource {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export function readSupabaseEnv(env: SupabaseEnvSource): SupabaseEnv {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.",
    );
  }

  return { url, anonKey };
}

let singleton: SupabaseClient | null = null;

export function createSupabaseClient(env: SupabaseEnv): SupabaseClient {
  if (singleton) return singleton;

  singleton = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });

  return singleton;
}
