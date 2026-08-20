import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Button, Card, Badge, EmptyState, MapFrame } from "@sbt/ui";
import type { Alert as SosAlert, Conductor, Bus } from "@sbt/shared-types";
import { listActiveAlerts, acknowledgeAlert, resolveAlert, subscribeToTableChanges } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

const sosIcon = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 0 0 4px rgba(220,38,38,0.4)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const severityTone = { INFO: "brand", WARNING: "warning", CRITICAL: "danger", SOS: "danger" } as const;

export function AlertsPage() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [audioArmed, setAudioArmed] = useState(false);
  const [flash, setFlash] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Explicitly `number` (browser DOM lib's setTimeout return type) rather
  // than `ReturnType<typeof window.setTimeout>` — @types/node's ambient
  // `setTimeout` (pulled in transitively) resolves that to NodeJS.Timeout
  // instead, which the actual window.setTimeout(...) call below can't satisfy.
  const flashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    listActiveAlerts(supabase).then(setAlerts);
    supabase.from("buses").select("*").then(({ data }) => setBuses((data ?? []) as Bus[]));
    supabase.from("conductors").select("*").then(({ data }) => setConductors((data ?? []) as Conductor[]));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToTableChanges<SosAlert>(supabase, { table: "alerts" }, (payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const inserted = payload.new;
        setAlerts((prev) => {
          // Dedupe against the initial listActiveAlerts() fetch (which can
          // race this subscription) and against any duplicate delivery of
          // the same event.
          if (prev.some((a) => a.id === inserted.id)) return prev;
          return [inserted, ...prev];
        });
        setFlash(true);
        if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = window.setTimeout(() => setFlash(false), 4000);
        if (inserted.severity === "SOS" && audioArmed) playAlarm();
      } else if (payload.eventType === "UPDATE" && payload.new) {
        setAlerts((prev) => prev.map((a) => (a.id === payload.new!.id ? payload.new! : a)).filter((a) => a.status !== "RESOLVED"));
      }
    });
    return () => {
      unsubscribe();
      if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioArmed]);

  // Browser autoplay policies block audio until a user gesture; this button
  // both unlocks the AudioContext and communicates that alarms are live.
  const armAudio = () => {
    audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    setAudioArmed(true);
  };

  const playAlarm = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  };

  const busLabel = (id: string | null) => buses.find((b) => b.id === id)?.bus_number ?? "Unknown bus";
  const conductorLabel = (id: string | null) => conductors.find((c) => c.id === id)?.display_name ?? "Unknown conductor";

  const handleAck = async (id: string) => {
    await acknowledgeAlert(supabase, id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "ACKNOWLEDGED" } : a)));
  };
  const handleResolve = async (id: string) => {
    await resolveAlert(supabase, id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const geoTagged = alerts.filter((a) => a.latitude !== null && a.longitude !== null);

  return (
    <div className={`flex h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row ${flash ? "animate-pulse" : ""}`}>
      <div className="flex flex-col gap-3 lg:w-96">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">SOS Command Center</h1>
          {!audioArmed && (
            <Button size="sm" variant="outline" onClick={armAudio}>
              Enable alarm sound
            </Button>
          )}
        </div>

        {alerts.length === 0 && <EmptyState title="No active alerts" description="You're all clear." />}

        <div className="flex flex-col gap-2 overflow-y-auto">
          {alerts.map((alert) => (
            <Card key={alert.id} className={alert.severity === "SOS" ? "border-danger-500" : undefined}>
              <div className="flex items-center justify-between">
                <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge>
                <span className="text-xs text-slate-500">{new Date(alert.created_at).toLocaleTimeString()}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{alert.message}</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                {busLabel(alert.bus_id)} — {conductorLabel(alert.conductor_id)}
              </p>
              <div className="mt-3 flex gap-2">
                {alert.status === "ACTIVE" && (
                  <Button size="sm" variant="outline" onClick={() => handleAck(alert.id)}>
                    Acknowledge
                  </Button>
                )}
                <Button size="sm" onClick={() => handleResolve(alert.id)}>
                  Resolve
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <MapFrame heightClassName="flex-1">
        <MapContainer center={[10.787, 79.1378]} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geoTagged.map((alert) => (
            <Marker key={alert.id} position={[alert.latitude!, alert.longitude!]} icon={sosIcon}>
              <Popup>
                {alert.severity} — {busLabel(alert.bus_id)}
                <br />
                {alert.message}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </MapFrame>
    </div>
  );
}
