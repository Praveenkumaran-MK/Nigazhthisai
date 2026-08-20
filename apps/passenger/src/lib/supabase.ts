import { createSupabaseClient, readSupabaseEnv } from "@sbt/supabase-client";

export const supabase = createSupabaseClient(readSupabaseEnv(import.meta.env));
