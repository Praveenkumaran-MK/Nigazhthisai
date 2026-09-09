import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Button, Card, Badge, EmptyState, MapFrame, DataTable, Select, Input } from "@sbt/ui";
import type { Alert as SosAlert, AlertMessage, Conductor, Bus } from "@sbt/shared-types";
import { listActiveAlerts, acknowledgeAlert, resolveAlert, subscribeToTableChanges } from "@sbt/supabase-client";
import { supabase } from "../lib/supabase";

interface AlertHistoryItem extends SosAlert {
  bus_number_snapshot?: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
  trigger_type?: string | null;
}

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

const systemIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#f59e0b;border:3px solid white;box-shadow:0 0 0 4px rgba(245,158,11,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const severityTone = { INFO: "brand", WARNING: "warning", CRITICAL: "danger", SOS: "danger" } as const;

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [historyAlerts, setHistoryAlerts] = useState<AlertHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState("ALL");
  const [historySeverityFilter, setHistorySeverityFilter] = useState("ALL");
  const [historySearch, setHistorySearch] = useState("");

  const [buses, setBuses] = useState<Bus[]>([]);
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [audioArmed, setAudioArmed] = useState(false);
  const [flash, setFlash] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "passenger" | "conductor" | "system">("ALL");
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, AlertMessage[]>>({});
  const [messageInput, setMessageInput] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isScanningIdle, setIsScanningIdle] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    listActiveAlerts(supabase).then(setAlerts);
    supabase.from("buses").select("*").then(({ data }) => setBuses((data ?? []) as Bus[]));
    supabase.from("conductors").select("*").then(({ data }) => setConductors((data ?? []) as Conductor[]));
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setHistoryAlerts((data ?? []) as AlertHistoryItem[]);
    } catch (e) {
      console.error("Failed to load alert history", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      void loadHistory();
    }
  }, [activeTab]);

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
        if ((inserted.severity === "SOS" || inserted.severity === "CRITICAL") && audioArmed) {
          playAlarm();
        }
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
    setMessages((prev) => ({ ...prev, [alertId]: (data ?? []) as AlertMessage[] }));
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
          setMessages((prev) => ({
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

  const busLabel = (id: string | null, snapshot?: string | null) => {
    if (snapshot) return snapshot;
    return buses.find((b) => b.id === id)?.bus_number ?? "Unknown bus";
  };

  const conductorLabel = (id: string | null) => conductors.find((c) => c.id === id)?.display_name ?? "Unknown conductor";

  const handleAck = async (id: string) => {
    await acknowledgeAlert(supabase, id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "ACKNOWLEDGED" } : a)));
  };

  const handleResolve = async (id: string) => {
    await resolveAlert(supabase, id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleScanIdleBuses = async () => {
    setIsScanningIdle(true);
    setScanResult(null);
    try {
      const { data, error } = await supabase.rpc("check_idle_buses");
      if (error) throw error;
      const count = Number(data ?? 0);
      setScanResult(count > 0 ? `Flagged ${count} stationary/idle bus(es)!` : "All active fleet buses are on schedule.");
      // Refresh active alerts
      const refreshed = await listActiveAlerts(supabase);
      setAlerts(refreshed);
    } catch (err) {
      setScanResult(err instanceof Error ? `Error: ${err.message}` : "Failed to scan idle buses");
    } finally {
      setIsScanningIdle(false);
    }
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
      setMessageInput((prev) => ({ ...prev, [alertId]: "" }));
    } finally {
      setSendingId(null);
    }
  };

  const filteredAlerts = alerts.filter(
    (a) => sourceFilter === "ALL" || (a.source_role || "system") === sourceFilter
  );

  const geoTagged = filteredAlerts.filter((a) => a.latitude !== null && a.longitude !== null);

  const filteredHistory = historyAlerts.filter((a) => {
    if (historyStatusFilter !== "ALL" && a.status !== historyStatusFilter) return false;
    if (historySeverityFilter !== "ALL" && a.severity !== historySeverityFilter) return false;
    if (historySearch) {
      const query = historySearch.toLowerCase();
      const bus = busLabel(a.bus_id, a.bus_number_snapshot).toLowerCase();
      const title = (a.title ?? "").toLowerCase();
      const msg = (a.message ?? "").toLowerCase();
      return bus.includes(query) || title.includes(query) || msg.includes(query);
    }
    return true;
  });

  return (
    <div className={`flex flex-col gap-4 ${flash ? "animate-pulse" : ""}`}>
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Emergency & SOS Command Desk
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time critical incident management, SOS responses, and fleet idle monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleScanIdleBuses}
            disabled={isScanningIdle}
          >
            {isScanningIdle ? "Scanning Fleet…" : "⏱️ Scan Idle Buses"}
          </Button>

          {!audioArmed && (
            <Button size="sm" variant="outline" onClick={armAudio}>
              🔔 Enable Siren
            </Button>
          )}

          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setActiveTab("active")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                activeTab === "active"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              🔴 Active Alerts ({alerts.length})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                activeTab === "history"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              📜 Alert History & Audit
            </button>
          </div>
        </div>
      </div>

      {scanResult && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs font-semibold text-amber-800 flex items-center justify-between">
          <span>🔍 Fleet Scan: {scanResult}</span>
          <button onClick={() => setScanResult(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* ACTIVE ALERTS VIEW */}
      {activeTab === "active" && (
        <div className="flex h-[calc(100vh-12rem)] flex-col gap-4 lg:flex-row">
          <div className="flex flex-col gap-3 lg:w-96 overflow-y-auto">
            {/* Source Role Filter Pills */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {[
                { key: "ALL", label: "All Alerts" },
                { key: "passenger", label: "🟣 Passenger" },
                { key: "conductor", label: "🔴 Conductor" },
                { key: "system", label: "⚙️ Fleet/Idle" },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSourceFilter(f.key as any)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition ${
                    sourceFilter === f.key
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredAlerts.length === 0 && <EmptyState title="No active alerts" description="All clear across active fleet." />}

            <div className="flex flex-col gap-2">
              {filteredAlerts.map((alert) => (
                <Card key={alert.id} className={alert.severity === "SOS" || alert.severity === "CRITICAL" ? "border-danger-500" : undefined}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge>
                      {/* Source indicator */}
                      {alert.source_role === "passenger" ? (
                        <span className="text-[10px] rounded-full bg-purple-100 text-purple-700 px-1.5 py-0.5 font-semibold">Passenger SOS</span>
                      ) : alert.source_role === "conductor" ? (
                        <span className="text-[10px] rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 font-semibold">Conductor SOS</span>
                      ) : (
                        <span className="text-[10px] rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 font-semibold">Fleet Telemetry</span>
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
                    🚌 {busLabel(alert.bus_id)} — 👤 {conductorLabel(alert.conductor_id)}
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
                      {expandedAlertId === alert.id ? "Hide Chat ▲" : "Responder Chat ▼"}
                    </button>
                  </div>

                  {/* Message thread */}
                  {expandedAlertId === alert.id && (
                    <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-2">
                        {(messages[alert.id] ?? []).length === 0 && (
                          <p className="text-xs text-slate-400 text-center">No messages yet. Send instructions below.</p>
                        )}
                        {(messages[alert.id] ?? []).map((msg) => (
                          <div
                            key={msg.id}
                            className={`rounded-lg px-3 py-2 text-xs max-w-[85%] ${
                              msg.sender_role === "admin"
                                ? "bg-brand-600 text-white self-end"
                                : "bg-slate-100 dark:bg-slate-700 self-start"
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
                          placeholder="Type response instructions…"
                          value={messageInput[alert.id] ?? ""}
                          onChange={(e) => setMessageInput((prev) => ({ ...prev, [alert.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && handleSendMessage(alert.id)}
                          className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
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
                  icon={
                    alert.source_role === "passenger"
                      ? passengerIcon
                      : alert.source_role === "conductor"
                      ? sosIcon
                      : systemIcon
                  }
                >
                  <Popup>
                    <strong>{alert.severity}</strong> — {busLabel(alert.bus_id)}
                    <br />
                    Source: {alert.source_role === "passenger" ? "🟣 Passenger SOS" : alert.source_role === "conductor" ? "🔴 Conductor SOS" : "⚙️ Telemetry"}
                    <br />
                    {alert.title ?? alert.message}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </MapFrame>
        </div>
      )}

      {/* ALERT HISTORY & AUDIT VIEW */}
      {activeTab === "history" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48">
              <Input
                placeholder="Search bus, title, message…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
            <div className="w-36">
              <Select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                options={[
                  { value: "ALL", label: "All Statuses" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "ACKNOWLEDGED", label: "Acknowledged" },
                  { value: "RESOLVED", label: "Resolved" },
                ]}
              />
            </div>
            <div className="w-36">
              <Select
                value={historySeverityFilter}
                onChange={(e) => setHistorySeverityFilter(e.target.value)}
                options={[
                  { value: "ALL", label: "All Severities" },
                  { value: "SOS", label: "SOS" },
                  { value: "CRITICAL", label: "Critical" },
                  { value: "WARNING", label: "Warning" },
                  { value: "INFO", label: "Info" },
                ]}
              />
            </div>
            <Button size="sm" variant="outline" onClick={loadHistory} disabled={historyLoading}>
              🔄 Refresh History
            </Button>
          </div>

          <DataTable
            columns={[
              {
                key: "severity",
                header: "Severity",
                render: (a) => <Badge tone={severityTone[a.severity]}>{a.severity}</Badge>,
              },
              {
                key: "source",
                header: "Source",
                render: (a) => (
                  <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                    {a.source_role || "system"}
                  </span>
                ),
              },
              {
                key: "bus",
                header: "Bus No",
                render: (a) => (
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                    {busLabel(a.bus_id, a.bus_number_snapshot)}
                  </span>
                ),
              },
              {
                key: "details",
                header: "Incident Details",
                render: (a) => (
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{a.title ?? "Alert"}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{a.message}</p>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (a) => (
                  <Badge tone={a.status === "RESOLVED" ? "success" : a.status === "ACKNOWLEDGED" ? "brand" : "danger"}>
                    {a.status}
                  </Badge>
                ),
              },
              {
                key: "timestamp",
                header: "Raised At",
                render: (a) => (
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {new Date(a.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ),
              },
              {
                key: "resolved_at",
                header: "Resolved At",
                render: (a) => (
                  <span className="text-xs text-slate-500">
                    {a.resolved_at
                      ? new Date(a.resolved_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                ),
              },
            ]}
            rows={filteredHistory}
            getRowId={(a) => a.id}
            isLoading={historyLoading}
            emptyTitle="No alert history matches criteria"
          />
        </div>
      )}
    </div>
  );
}

