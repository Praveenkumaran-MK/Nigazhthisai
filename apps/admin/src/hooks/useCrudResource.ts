import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface CrudResourceOptions {
  /** Table targeted by insert/update/delete. */
  table: string;
  /** Table/view queried for reads; defaults to `table`. Use a decoding view
   * (e.g. `stops_public`) here when the write table has PostGIS columns. */
  readTable?: string;
  orderBy?: string;
}

/**
 * Generic Supabase table CRUD hook shared by every admin resource page
 * (stops, routes, fares, buses, conductors, schedules) — spec §41 requires
 * "reusable components" rather than one bespoke implementation per entity.
 * RLS (admin-only write policies, migration 007) is the real enforcement
 * layer; this hook only orchestrates client-side request/loading/error
 * state around it.
 */
export function useCrudResource<T extends { id: string }>({ table, readTable, orderBy }: CrudResourceOptions) {
  const [rows, setRows] = useState<T[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    setError(null);
    let query = supabase.from(readTable ?? table).select("*");
    if (orderBy) query = query.order(orderBy);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setRows((data ?? []) as T[]);
    setStatus("success");
  }, [table, readTable, orderBy]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // `supabase` is an untyped SupabaseClient (no generated Database<> generic
  // — see README, no `supabase gen types` step is wired up), so `.from(table)`
  // with a runtime string table name can't statically know the row shape.
  // Casting `input` to `never` here is the standard supabase-js workaround
  // for that library-boundary gap (see supabase-js #1258), not a general
  // escape hatch — every other input value in this file stays fully typed.
  const create = useCallback(
    async (input: Partial<T>) => {
      const { error: err } = await supabase.from(table).insert(input as never);
      if (err) throw new Error(err.message);
      await reload();
    },
    [table, reload],
  );

  const update = useCallback(
    async (id: string, input: Partial<T>) => {
      const { error: err } = await supabase.from(table).update(input as never).eq("id", id);
      if (err) throw new Error(err.message);
      await reload();
    },
    [table, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from(table).delete().eq("id", id);
      if (err) throw new Error(err.message);
      await reload();
    },
    [table, reload],
  );

  return { rows, status, error, reload, create, update, remove };
}
