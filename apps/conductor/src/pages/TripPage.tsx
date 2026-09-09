import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Badge,
  LoadingState,
  StatusIndicator,
  useToast,
  AppHeader,
  TransitBusRunner,
  ConductorHero,
  Dialog,
  Select,
  QRDisplay,
} from "@sbt/ui";
import type { Trip, TripStop, TripOccupancy, Stop } from "@sbt/shared-types";
import { startTrip, departStopAndExpireTickets, listTripStops, getTripOccupancy } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";
import { useConductorAuth } from "../hooks/useConductorAuth";
import { useWakeLock } from "../hooks/useWakeLock";
import { useGpsTelemetry } from "../hooks/useGpsTelemetry";
import { useSosLongPress } from "../hooks/useSosLongPress";
import { createAlert } from "@sbt/supabase-client";
import { PocketMode } from "../components/PocketMode";

interface StopRow extends TripStop {
  stop: Stop;
}

interface IssuedTicket {
  ticket_id: string;
  pnr: string;
  fare: number;
  passenger_count: number;
  concession_type: string;
  qr_payload: string;
  qr_signature: string;
  created_at: string;
}

export function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { conductor } = useConductorAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [occupancy, setOccupancy] = useState<TripOccupancy | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [pocketMode, setPocketMode] = useState(false);
  const [departingStopId, setDepartingStopId] = useState<string | null>(null);

  // Cash Ticket Issuance State
  const [showIssueTicket, setShowIssueTicket] = useState(false);
  const [originStopId, setOriginStopId] = useState<string>("");
  const [destStopId, setDestStopId] = useState<string>("");
  const [passengerCount, setPassengerCount] = useState<number>(1);
  const [concessionType, setConcessionType] = useState<string>("NONE");
  const [isIssuing, setIsIssuing] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<IssuedTicket | null>(null);

  const wakeLock = useWakeLock();

  const loadTrip = useCallback(async () => {
    if (!tripId) return;
    const { data } = await supabase.from("trips").select("*").eq("id", tripId).single();
    setTrip(data as Trip);
    const tripStops = await listTripStops(supabase, tripId);
    const { data: stopRows } = await supabase.from("stops").select("*").in(
      "id",
      tripStops.map((s) => s.stop_id),
    );
    const stopById = new Map((stopRows ?? []).map((s) => [s.id, s as Stop]));
    const rows = tripStops.map((s) => ({ ...s, stop: stopById.get(s.stop_id)! }));
    setStops(rows);

    if (rows.length > 0 && !originStopId) {
      const firstStopId = rows[0]?.stop_id;
      const lastStopId = rows[rows.length - 1]?.stop_id;
      if (firstStopId) setOriginStopId(firstStopId);
      if (lastStopId && rows.length > 1) setDestStopId(lastStopId);
    }

    setOccupancy(await getTripOccupancy(supabase, tripId));
  }, [tripId, originStopId]);

  useEffect(() => {
    void loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`trip-live:${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` }, () => void loadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_stops", filter: `trip_id=eq.${tripId}` }, () => void loadTrip())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_occupancy", filter: `trip_id=eq.${tripId}` }, () => void loadTrip())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, loadTrip]);

  useEffect(() => {
    if (trip?.status === "COMPLETED") {
      void wakeLock.release();
    }
  }, [trip?.status, wakeLock.release]);

  useEffect(() => {
    return () => {
      void wakeLock.release();
    };
  }, []);

  const telemetry = useGpsTelemetry({
    busId: trip?.bus_id ?? "",
    tripId: trip?.id ?? "",
    routeId: trip?.route_id ?? "",
    conductorId: conductor?.id ?? "",
    enabled: trip?.status === "ACTIVE" && Boolean(conductor),
  });

  const handleStartService = async () => {
    if (!tripId) return;
    setIsStarting(true);
    void wakeLock.request();
    try {
      const updated = await startTrip(supabase, tripId);
      setTrip(updated);
      push({ tone: "success", title: "Service started", description: "Broadcasting your live location." });
    } catch (e) {
      push({ tone: "danger", title: "Could not start service", description: e instanceof Error ? e.message : undefined });
    } finally {
      setIsStarting(false);
    }
  };

  const handleDepart = async (stopId: string) => {
    if (!tripId) return;
    setDepartingStopId(stopId);
    try {
      await departStopAndExpireTickets(supabase, tripId, stopId);
      push({ tone: "info", title: "Stop marked as departed" });
      await loadTrip();
    } catch (e) {
      push({ tone: "danger", title: "Could not update stop", description: e instanceof Error ? e.message : undefined });
    } finally {
      setDepartingStopId(null);
    }
  };

  const handleSos = async () => {
    if (!conductor) return;
    try {
      await createAlert(supabase, {
        trip_id: trip?.id ?? null,
        bus_id: trip?.bus_id ?? null,
        conductor_id: conductor.id,
        severity: "SOS",
        message: "SOS triggered by conductor",
        latitude: telemetry.lastTelemetry?.latitude ?? null,
        longitude: telemetry.lastTelemetry?.longitude ?? null,
      });
      push({ tone: "danger", title: "SOS sent", description: "Admin has been alerted." });
    } catch (e) {
      push({ tone: "danger", title: "SOS failed to send", description: e instanceof Error ? e.message : undefined });
    }
  };
  const sos = useSosLongPress(handleSos);

  // Handle Cash Ticket Issuance
  const handleIssueCashTicket = async () => {
    if (!tripId || !originStopId || !destStopId) return;
    setIsIssuing(true);
    try {
      const { data, error } = await supabase.rpc("generate_passenger_cash_ticket", {
        p_trip_id: tripId,
        p_origin_stop_id: originStopId,
        p_dest_stop_id: destStopId,
        p_passenger_count: passengerCount,
        p_concession_type: concessionType,
      });

      if (error) throw error;
      setIssuedTicket(data as IssuedTicket);
      push({ tone: "success", title: "Ticket Issued", description: `PNR: ${data.pnr} • ₹${data.fare}` });
      await loadTrip();
    } catch (err: any) {
      push({ tone: "danger", title: "Issuance failed", description: err.message });
    } finally {
      setIsIssuing(false);
    }
  };

  if (!trip) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label="Loading trip…" />
      </div>
    );
  }

  if (pocketMode) {
    return <PocketMode telemetryStatus={telemetry.status} onExit={() => setPocketMode(false)} sos={sos} />;
  }

  return (
    <div className="flex flex-col min-h-dvh bg-slate-950 text-slate-100">
      <AppHeader
        sticky
        title={<Badge tone={trip.status === "ACTIVE" ? "success" : "neutral"}>{trip.status}</Badge>}
        subtitle={
          <span className="inline-flex items-center gap-1">
            GPS:
            <StatusIndicator
              status={telemetry.status === "watching" ? "online" : telemetry.status === "denied" ? "error" : "connecting"}
              label={telemetry.status}
            />
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowIssueTicket(true)}>
              🎟️ Issue Ticket
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/trip/${trip.id}/scan`)}>
              📷 Scan
            </Button>
          </div>
        }
      >
        {trip.status === "ACTIVE" && stops.length > 1 && (
          <TransitBusRunner
            label="Route progress"
            progress={(Math.max(0, stops.findIndex((s) => s.stop_id === trip.current_stop_id)) / Math.max(1, stops.length - 1)) * 100}
            stops={stops.map((s, i) => ({
              label: s.stop.name,
              atPercent: (i / Math.max(1, stops.length - 1)) * 100,
              done: s.status === "DEPARTED",
            }))}
          />
        )}
      </AppHeader>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-5 pb-28">
        {trip.status === "SCHEDULED" && (
          <>
            <ConductorHero className="h-40 w-full" />
            <Button size="lg" isLoading={isStarting} onClick={handleStartService}>
              Start Service →
            </Button>
          </>
        )}

        {trip.status === "ACTIVE" && occupancy && (
          <Card className="border-slate-800 bg-slate-900/90">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Occupancy</p>
                <p className="mt-1 text-2xl font-bold text-slate-100">
                  {occupancy.current_passenger_count} / {occupancy.capacity}
                </p>
              </div>
              <Badge tone={occupancy.capacity - occupancy.current_passenger_count > 5 ? "success" : "danger"}>
                {Math.max(0, occupancy.capacity - occupancy.current_passenger_count)} seats left
              </Badge>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (occupancy.current_passenger_count / Math.max(1, occupancy.capacity)) * 100)}%` }}
              />
            </div>
          </Card>
        )}

        <Card className="border-slate-800 bg-slate-900/90">
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500 font-semibold">Route Stops Sequence</p>
          <ol className="flex flex-col gap-2">
            {stops.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-950/80 p-3 border border-slate-800/60">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{s.stop.name}</p>
                  <Badge tone={s.status === "DEPARTED" ? "neutral" : s.status === "ARRIVED" ? "brand" : "neutral"}>
                    {s.status}
                  </Badge>
                </div>
                {s.stop_id === trip.current_stop_id && s.status !== "DEPARTED" && trip.status === "ACTIVE" && (
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={departingStopId === s.stop_id}
                    onClick={() => handleDepart(s.stop_id)}
                  >
                    Departed →
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </Card>

        {trip.status === "ACTIVE" && (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPocketMode(true)}>
              Pocket Mode
            </Button>
            <Button
              variant="danger"
              className="flex-1 select-none font-bold"
              {...sos.handlers}
              style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.35) ${sos.progress * 100}%, transparent ${sos.progress * 100}%)` }}
            >
              {sos.isPressing ? "Hold for SOS…" : "SOS (hold)"}
            </Button>
          </div>
        )}
      </div>

      {/* Cash / Walk-in Ticket Issuance Modal */}
      <Dialog
        open={showIssueTicket}
        onClose={() => {
          setShowIssueTicket(false);
          setIssuedTicket(null);
        }}
        title={issuedTicket ? "Ticket Issued Successfully" : "Issue Cash / Walk-in Ticket"}
      >
        {issuedTicket ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <Badge tone="success" className="text-sm px-3 py-1">
              PAID & VALIDATED (CASH)
            </Badge>
            <div className="font-mono text-2xl font-bold tracking-widest text-emerald-400">
              PNR: {issuedTicket.pnr}
            </div>

            {issuedTicket.qr_payload && (
              <div className="p-3 bg-white rounded-xl shadow-lg">
                <QRDisplay value={issuedTicket.qr_payload} size={180} />
              </div>
            )}

            <div className="text-sm text-slate-300 space-y-1 w-full bg-slate-900/80 p-3 rounded-lg border border-slate-800 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Passengers:</span>
                <span>{issuedTicket.passenger_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Concession:</span>
                <span>{issuedTicket.concession_type}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-400 text-base pt-1 border-t border-slate-800">
                <span>Total Collected:</span>
                <span>₹{issuedTicket.fare.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2 w-full mt-2">
              <Button
                className="flex-1"
                size="lg"
                onClick={() => {
                  setIssuedTicket(null);
                  setShowIssueTicket(false);
                }}
              >
                Done
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                size="lg"
                onClick={() => {
                  setIssuedTicket(null);
                }}
              >
                Issue Another
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <Select
              label="Boarding Stop (From)"
              value={originStopId}
              onChange={(e) => setOriginStopId(e.target.value)}
              options={stops.map((s) => ({ value: s.stop_id, label: s.stop.name }))}
            />

            <Select
              label="Destination Stop (To)"
              value={destStopId}
              onChange={(e) => setDestStopId(e.target.value)}
              options={stops.map((s) => ({ value: s.stop_id, label: s.stop.name }))}
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Passengers"
                value={String(passengerCount)}
                onChange={(e) => setPassengerCount(Number(e.target.value))}
                options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} Passenger${n > 1 ? "s" : ""}` }))}
              />

              <Select
                label="Concession"
                value={concessionType}
                onChange={(e) => setConcessionType(e.target.value)}
                options={[
                  { value: "NONE", label: "None (Full Fare)" },
                  { value: "STUDENT", label: "Student (50% Off)" },
                  { value: "SENIOR", label: "Senior (50% Off)" },
                  { value: "MONTHLY_PASS", label: "Pass Holder (75% Off)" },
                  { value: "FREEDOM_FIGHTER", label: "Free Pass" },
                ]}
              />
            </div>

            <Button
              className="mt-2 w-full"
              size="lg"
              isLoading={isIssuing}
              onClick={handleIssueCashTicket}
            >
              Collect Cash & Print Ticket →
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
