import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Card, EmptyState, LoadingState } from "@sbt/ui";
import type { Stop } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";
import { useMyTickets } from "../hooks/useTicket";

const statusTone = {
  CREATED: "neutral",
  PAID: "brand",
  VALIDATED: "success",
  EXPIRED: "neutral",
  CANCELLED: "danger",
} as const;

export function MyTicketsPage() {
  const navigate = useNavigate();
  const { tickets, status, reload } = useMyTickets();
  const [stopsById, setStopsById] = useState<Map<string, Stop>>(new Map());

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (tickets.length === 0) return;
    const ids = Array.from(new Set(tickets.flatMap((t) => [t.origin_stop_id, t.dest_stop_id])));
    supabase
      .from("stops_public")
      .select("*")
      .in("id", ids)
      .then(({ data }) => setStopsById(new Map(((data ?? []) as Stop[]).map((s) => [s.id, s]))));
  }, [tickets]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-28 pt-8">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My Tickets</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Tickets bought on this device.</p>
      </header>

      {status === "loading" && <LoadingState label="Loading your tickets…" />}

      {status === "success" && tickets.length === 0 && (
        <EmptyState
          title="No tickets yet"
          description="Tickets you buy will show up here — they're tied to this browser, not an account."
        />
      )}

      <div className="flex flex-col gap-3">
        {tickets.map((ticket) => {
          const origin = stopsById.get(ticket.origin_stop_id);
          const dest = stopsById.get(ticket.dest_stop_id);
          return (
            <Card
              key={ticket.id}
              className="cursor-pointer rounded-2xl transition-shadow hover:shadow-md"
              onClick={() => navigate(`/ticket/${ticket.id}`)}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {origin?.name ?? "…"} → {dest?.name ?? "…"}
                </p>
                <Badge tone={statusTone[ticket.status]}>{ticket.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                {new Date(ticket.created_at).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                {ticket.passenger_count} passenger{ticket.passenger_count === 1 ? "" : "s"} · ₹{ticket.total_fare.toFixed(2)}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
