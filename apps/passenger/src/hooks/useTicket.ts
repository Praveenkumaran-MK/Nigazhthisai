import { useCallback, useState } from "react";
import type { CreateTicketInput, Ticket } from "@sbt/shared-types";
import { createSecureTicket, getTicket } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

export function useCreateTicket() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const create = useCallback(async (input: CreateTicketInput) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await createSecureTicket(supabase, input);
      setTicket(result);
      setStatus("success");
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create ticket";
      setError(message);
      setStatus("error");
      throw e;
    }
  }, []);

  return { create, ticket, status, error };
}

/**
 * Lists every ticket belonging to this browser's anonymous session. No
 * client-side filtering needed — the `tickets_owner_read` RLS policy
 * (migration 007) already scopes `select *` to
 * `passenger_session_id = auth.uid()`.
 */
export function useMyTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const reload = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase.from("tickets").select("*").order("created_at", { ascending: false });
    if (error) {
      setStatus("error");
      return;
    }
    setTickets((data ?? []) as Ticket[]);
    setStatus("success");
  }, []);

  return { tickets, status, reload };
}

export function useLoadTicket(ticketId: string | undefined) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const reload = useCallback(async () => {
    if (!ticketId) return;
    setStatus("loading");
    try {
      const result = await getTicket(supabase, ticketId);
      setTicket(result);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, [ticketId]);

  return { ticket, status, reload };
}
