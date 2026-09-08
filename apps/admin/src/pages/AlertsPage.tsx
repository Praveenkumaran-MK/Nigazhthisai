import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Button, Card, Badge, EmptyState, MapFrame } from "@sbt/ui";
import type { Alert as SosAlert, AlertMessage, Conductor, Bus } from "@sbt/shared-types";
import { listActiveAlerts, acknowledgeAlert, resolveAlert, subscribeToTableChanges } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

const sosIcon = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 0 0 4px rgba(220,38,38,0.4)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const passengerIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#7c3aed;border:3px solid white;box-shadow:0 0 0 4px rgba(124,58,237,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const severityTone = { INFO: "brand", WARNING: "warning", CRITICAL: "danger", SOS: "danger" } as const;

export function AlertsPage() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [audioArmed, setAudioArmed] = useState(false);
  const [flash, setFlash] = useState(false);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, AlertMessage[]>>({});
  const [messageInput, setMessageInput] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    listActiveAlerts(supabase).then(setAlerts);
    supabase.from("buses").select("*").then(({ data }) => setBuses((data ?? []) as Bus[]));
    supabase.from("conductors").select("*").then(({ data }) => setConductors((data ?? []) as Conductor[]));
  }, []);

  // Subscribe to new alerts
  useEffect(() => {
    const unsubscribe = subscribeToTableChanges<SosAlert>(supabase, { table: "alerts" }, (payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const inserted = payload.new;
        setAlerts((prev) => {
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

  // Load messages when an alert is expanded
  const loadMessages = async (alertId: string) => {
    const { data } = await supabase
      .from("alert_messages")
      .select("*")
      .eq("alert_id", alertId)
      .order("created_at");
    setMessages(prev => ({ ...prev, [alertId]: (data ?? []) as AlertMessage[] }));
  };

  // Subscribe to message changes for expanded alert
  useEffect(() => {
    if (!expandedAlertId) return;
    void loadMessages(expandedAlertId);

    const channel = supabase
      .channel(`alert-messages-${expandedAlertId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_messages", filter: `alert_id=eq.${expandedAlertId}` },
        (payload) => {
          setMessages(prev => ({
            ...prev,
            [expandedAlertId]: [...(prev[expandedAlertId] ?? []), payload.new as AlertMessage],
          }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [expandedAlertId]);

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

  const handleSendMessage = async (alertId: string) => {
    const text = (messageInput[alertId] ?? "").trim();
    if (!text) return;
    setSendingId(alertId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user?.id)
        .single();
      await supabase.from("alert_messages").insert({
        alert_id: alertId,
        sender_id: user!.id,
        sender_role: profile?.role ?? "admin",
        message: text,
      });
      setMessageInput(prev => ({ ...prev, [alertId]: "" }));
    } finally {
      setSendingId(null);
    }
  };

  const geoTagged = alerts.filter((a) => a.latitude !== null && a.longitude !== null);

  return (
    <div className={`flex h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row ${flash ? "animate-pulse" : ""}`}>
      <div className="flex flex-col gap-3 lg:w-96 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">SOS Command Center</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">🔴 Conductor SOS · 🟣 Passenger SOS</p>
          </div>
          {!audioArmed && (
            <Button size="sm" variant="outline" onClick={armAudio}>
              Enable alarm sound
            </Button>
          )}
        </div>

        {alerts.length === 0 && <EmptyState title="No active alerts" description="You're all clear." />}

        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <Card key={alert.id} className={alert.severity === "SOS" ? "border-danger-500" : undefined}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge>
                  {/* Source indicator */}
                  {alert.source_role === "passenger" ? (
                    <span className="text-[10px] rounded-full bg-purple-100 text-purple-700 px-1.5 py-0.5 font-semibold">Passenger</span>
                  ) : (
                    <span className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-semibold">Conductor</span>
                  )}
                </div>
                <span className="text-xs text-slate-500">{new Date(alert.created_at).toLocaleTimeString()}</span>
              </div>

              {alert.title && (
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.title}</p>
              )}
              {alert.message && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{alert.message}</p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
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
                <button
                  onClick={() => setExpandedAlertId(expandedAlertId === alert.id ? null : alert.id)}
                  className="rounded px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400"
                >
                  {expandedAlertId === alert.id ? "Hide Chat ▲" : "Chat ▼"}
                </button>
              </div>

              {/* Message thread */}
              {expandedAlertId === alert.id && (
                <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-2">
                    {(messages[alert.id] ?? []).length === 0 && (
                      <p className="text-xs text-slate-400 text-center">No messages yet. Send the first reply below.</p>
                    )}
                    {(messages[alert.id] ?? []).map(msg => (
                      <div
                        key={msg.id}
                        className={`rounded-lg px-3 py-2 text-xs max-w-[85%] ${
                          msg.sender_role === "conductor"
                            ? "bg-slate-100 dark:bg-slate-700 self-start"
                            : "bg-brand-600 text-white self-end"
                        }`}
                      >
                        <p className="font-semibold opacity-70 mb-0.5 capitalize">{msg.sender_role}</p>
                        <p>{msg.message}</p>
                        <p className="opacity-50 mt-0.5">{new Date(msg.created_at).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a message to conductor…"
                      value={messageInput[alert.id] ?? ""}
                      onChange={e => setMessageInput(prev => ({ ...prev, [alert.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleSendMessage(alert.id)}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                    <button
                      onClick={() => handleSendMessage(alert.id)}
                      disabled={sendingId === alert.id}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {sendingId === alert.id ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              )}
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
            <Marker
              key={alert.id}
              position={[alert.latitude!, alert.longitude!]}
              icon={alert.source_role === "passenger" ? passengerIcon : sosIcon}
            >
              <Popup>
                <strong>{alert.severity}</strong> — {busLabel(alert.bus_id)}
                <br />
                Source: {alert.source_role === "passenger" ? "🟣 Passenger" : "🔴 Conductor"}
                <br />
                {alert.title ?? alert.message}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </MapFrame>
    </div>
  );
}
