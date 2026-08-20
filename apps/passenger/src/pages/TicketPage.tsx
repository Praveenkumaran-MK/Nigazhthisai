import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BoardingPassCard, Badge, LoadingState, Alert, TicketCountdown } from "@sbt/ui";
import type { Stop, Bus } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";
import { useLoadTicket } from "../hooks/useTicket";
import { useGeofenceAlighting } from "../hooks/useGeofenceAlighting";
import { useCountdown } from "../hooks/useCountdown";

const statusTone = {
  CREATED: "neutral",
  PAID: "brand",
  VALIDATED: "success",
  EXPIRED: "neutral",
  CANCELLED: "danger",
} as const;

export function TicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { ticket, status, reload } = useLoadTicket(ticketId);
  const [originStop, setOriginStop] = useState<Stop | null>(null);
  const [destStop, setDestStop] = useState<Stop | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);

  useEffect(() => {
    void reload();
    // Live-updates on ticket status (VALIDATED by conductor, EXPIRED on
    // stop departure) via Postgres Changes rather than polling.
    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` },
        () => void reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (!ticket) return;
    supabase
      .from("stops_public")
      .select("*")
      .in("id", [ticket.origin_stop_id, ticket.dest_stop_id])
      .then(({ data }) => {
        const rows = (data ?? []) as Stop[];
        setOriginStop(rows.find((s) => s.id === ticket.origin_stop_id) ?? null);
        setDestStop(rows.find((s) => s.id === ticket.dest_stop_id) ?? null);
      });
    supabase.from("buses").select("*").eq("id", ticket.bus_id).single().then(({ data }) => setBus(data as Bus | null));
  }, [ticket]);

  const ticketActive = ticket?.status === "PAID" || ticket?.status === "VALIDATED";
  const { withinGeofence, hasNotified } = useGeofenceAlighting({
    destination: destStop?.location ?? null,
    active: Boolean(ticketActive),
  });
  const countdown = useCountdown(ticketActive ? (ticket?.expires_at ?? null) : null);

  if (status === "loading" || !ticket) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label="Loading ticket…" />
      </div>
    );
  }

  const createdAt = new Date(ticket.created_at);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-5 pb-24 pt-8">
      {ticketActive && <TicketCountdown label={countdown.label} expired={countdown.expired} className="w-full" />}

      <BoardingPassCard
        dateLabel={createdAt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        timeLabel={createdAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        originCode={originStop?.code ?? "—"}
        originName={originStop?.name ?? "Origin"}
        destinationCode={destStop?.code ?? "—"}
        destinationName={destStop?.name ?? "Destination"}
        operatorLabel="Thanjai Transit"
        statusBadge={<Badge tone={statusTone[ticket.status]}>{ticket.status}</Badge>}
        qrValue={`${ticket.qr_payload}.${ticket.qr_signature}`}
        fields={[
          { label: "Bus", value: bus?.bus_number ?? "—" },
          { label: "Type", value: bus ? bus.type.replace("_", "-") : "—" },
          { label: "Passengers", value: ticket.passenger_count },
          { label: "Fare paid", value: `₹${ticket.total_fare.toFixed(2)}` },
          { label: "Valid until", value: new Date(ticket.expires_at).toLocaleTimeString() },
          { label: "Status", value: ticket.status },
        ]}
      />

      {ticketActive && withinGeofence && (
        <Alert tone="info" title="Approaching your destination">
          {hasNotified ? "We've sent you a reminder to check you've alighted." : "You're near your stop."}
        </Alert>
      )}

      {ticket.status === "VALIDATED" && (
        <Alert tone="success" title="Ticket validated">
          Your ticket was scanned by the conductor. Enjoy your ride!
        </Alert>
      )}
      {ticket.status === "EXPIRED" && (
        <Alert tone="info" title="Trip complete">
          This ticket has expired — thanks for riding with us.
        </Alert>
      )}
    </div>
  );
}
