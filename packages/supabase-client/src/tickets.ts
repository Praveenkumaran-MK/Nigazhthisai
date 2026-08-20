import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateTicketInput, Ticket, ValidateTicketInput } from "@sbt/shared-types";
import { toAppError } from "./errors";

/**
 * The ONLY way to create a ticket. total_fare is computed server-side inside
 * create_secure_ticket() from fare_matrix — this function intentionally has
 * no fare/status parameter, so a malicious client cannot smuggle one in.
 */
export async function createSecureTicket(client: SupabaseClient, input: CreateTicketInput): Promise<Ticket> {
  const { data, error } = await client.rpc("create_secure_ticket", {
    p_trip_id: input.trip_id,
    p_origin_stop_id: input.origin_stop_id,
    p_dest_stop_id: input.dest_stop_id,
    p_passenger_count: input.passenger_count,
  });
  if (error) throw toAppError(error);
  return data as unknown as Ticket;
}

export async function getTicket(client: SupabaseClient, ticketId: string): Promise<Ticket | null> {
  const { data, error } = await client.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (error) throw toAppError(error);
  return data as Ticket | null;
}

/** Atomic, conductor-only. Server rejects double-validation, wrong trip, expiry, etc. */
export async function validateTicket(client: SupabaseClient, input: ValidateTicketInput): Promise<Ticket> {
  const { data, error } = await client.rpc("validate_ticket", {
    p_qr_payload: input.qr_payload,
    p_trip_id: input.trip_id,
  });
  if (error) throw toAppError(error);
  return data as unknown as Ticket;
}
