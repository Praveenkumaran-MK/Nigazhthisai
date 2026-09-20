import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Card, EmptyState, LoadingState, WheelchairIcon } from "@sbt/ui";
import type { Stop } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";
import { useMyTickets } from "../hooks/useTicket";
import { useI18n } from "../lib/i18n";
import { Bus } from "lucide-react";

const statusTone = {
  CREATED: "neutral",
  PAID: "brand",
  VALIDATED: "success",
  EXPIRED: "neutral",
  CANCELLED: "danger",
} as const;

export function MyTicketsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { tickets, status, reload } = useMyTickets();
  const [stopsById, setStopsById] = useState<Map<string, Stop>>(new Map());
  const [busesByTripId, setBusesByTripId] = useState<Map<string, { bus_number: string; is_wheelchair_accessible?: boolean }>>(new Map());

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

    const tripIds = Array.from(new Set(tickets.map((t) => t.trip_id).filter(Boolean)));
    if (tripIds.length > 0) {
      supabase
        .from("trips")
        .select("id, buses(bus_number, is_wheelchair_accessible)")
        .in("id", tripIds)
        .then(({ data }) => {
          if (!data) return;
          const map = new Map<string, { bus_number: string; is_wheelchair_accessible?: boolean }>();
          for (const row of data as any[]) {
            const b = Array.isArray(row.buses) ? row.buses[0] : row.buses;
            if (b?.bus_number) {
              map.set(row.id, {
                bus_number: b.bus_number,
                is_wheelchair_accessible: b.is_wheelchair_accessible,
              });
            }
          }
          setBusesByTripId(map);
        });
    }
  }, [tickets]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-28 pt-8">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("myTickets")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{t("ticketsOnDevice")}</p>
      </header>

      {status === "loading" && <LoadingState label={t("loadingTickets")} />}

      {status === "success" && tickets.length === 0 && (
        <EmptyState
          title={t("noTicketsYet")}
          description={t("noTicketsDesc")}
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
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {origin?.name ?? "…"} → {dest?.name ?? "…"}
                  </p>
                  {ticket.trip_id && busesByTripId.get(ticket.trip_id) && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Bus #{busesByTripId.get(ticket.trip_id)!.bus_number}
                      </span>
                      {busesByTripId.get(ticket.trip_id)!.is_wheelchair_accessible && (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/25 px-1.5 py-0.2 text-[10px] font-bold" title="Handicap Accessible Vehicle">
                          <WheelchairIcon size={11} className="text-blue-500 dark:text-blue-400" />
                          <span>Accessible</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
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
                {ticket.passenger_count} {ticket.passenger_count === 1 ? t("passenger") : t("passengers")} · ₹{ticket.total_fare.toFixed(2)}
              </p>

              {Boolean(ticket.trip_id && (ticket.status === "PAID" || ticket.status === "VALIDATED")) && (
                <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/bus/${ticket.trip_id}?view=pipeline`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 transition"
                  >
                    <Bus className="h-3.5 w-3.5" />
                    <span>Track Live Bus →</span>
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
