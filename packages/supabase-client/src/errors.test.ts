import { describe, expect, it } from "vitest";
import { toAppError } from "./errors";

describe("toAppError", () => {
  it("extracts a known RPC error code and returns a friendly message", () => {
    const result = toAppError({ message: "TICKET_EXPIRED: ticket expired at ..." });
    expect(result.code).toBe("TICKET_EXPIRED");
    expect(result.message).toBe("This ticket has expired.");
  });

  it("never leaks raw Postgres exception text for known codes", () => {
    const result = toAppError({ message: "ORIGIN_ALREADY_DEPARTED: trip_stops row already departed at 2026-01-01" });
    expect(result.message).not.toContain("trip_stops");
  });

  it("falls back to a generic message for unrecognized errors", () => {
    const result = toAppError({ message: "duplicate key value violates unique constraint" });
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.message).toBe("Something went wrong. Please try again.");
  });

  it("handles non-object errors safely", () => {
    const result = toAppError("network failure");
    expect(result.code).toBe("UNKNOWN_ERROR");
  });
});
