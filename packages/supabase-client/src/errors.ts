/// <reference types="vite/client" />
import type { AppError } from "@sbt/shared-types";

const KNOWN_RPC_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Please wait a moment while we set up your session, then try again.",
  INVALID_PASSENGER_COUNT: "Passenger count must be between 1 and 6.",
  PAYMENTS_DISABLED: "Ticket purchases are temporarily unavailable. Please try again shortly.",
  INVALID_TRIP: "This bus is no longer accepting new tickets for that stop.",
  ORIGIN_ALREADY_DEPARTED: "This bus has already left your stop. Please choose another bus.",
  NO_FARE_CONFIGURED: "Fare is not available for this origin/destination combination.",
  SERVER_MISCONFIGURED: "Something went wrong on our end. Please try again later.",
  NOT_AUTHORIZED: "You are not authorized to perform this action.",
  TICKET_NOT_FOUND: "This QR code does not match a known ticket.",
  TICKET_SIGNATURE_INVALID: "This ticket could not be verified and may be fraudulent.",
  WRONG_TRIP: "This ticket was issued for a different bus/trip.",
  ALREADY_VALIDATED: "This ticket has already been validated.",
  TICKET_EXPIRED: "This ticket has expired.",
  TICKET_CANCELLED: "This ticket has been cancelled.",
  TICKET_NOT_PAID: "This ticket has not been paid for.",
  INVALID_STOP_TRANSITION: "This stop has already been marked as departed.",
  INVALID_TRIP_STATE: "This trip cannot be started from its current state.",
  NOT_CURRENT_STOP: "This is not the bus's current stop — departures must happen in order.",
  BUS_FULL: "This bus is full — no seats are currently available.",
  SCHEDULE_NOT_PLANNED: "This schedule has already been confirmed or cancelled.",
  RATE_LIMITED: "You're doing that a bit too fast — please wait a moment and try again.",
};

/**
 * Converts a raw Supabase/PostgREST error (which may leak a Postgres
 * exception message via RPC) into a stable, user-safe AppError. RPC
 * functions in supabase/migrations/...008_functions.sql raise exceptions
 * with a leading UPPER_SNAKE_CASE code (e.g. "TICKET_EXPIRED: ..."); we
 * parse that code out and show a friendly message instead of raw SQL text.
 */
export function toAppError(error: unknown): AppError {
  if (error && typeof error === "object" && "message" in error) {
    const rawMessage = String((error as { message: unknown }).message ?? "");
    const codeMatch = rawMessage.match(/^([A-Z_]+):?/);
    const code = codeMatch?.[1] ?? "UNKNOWN_ERROR";
    const friendly = KNOWN_RPC_MESSAGES[code];
    if (!friendly && import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn("Unmapped Supabase error (shown to user as a generic message):", rawMessage);
    }
    return {
      code,
      message: friendly ?? "Something went wrong. Please try again.",
      cause: error,
    };
  }
  return { code: "UNKNOWN_ERROR", message: "Something went wrong. Please try again.", cause: error };
}
