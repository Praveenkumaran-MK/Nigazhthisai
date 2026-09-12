import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import {
  Button,
  Card,
  Badge,
  EmptyState,
  MapFrame,
  DataTable,
  Select,
  Input,
  BusIcon,
  UserIcon,
  AlertTriangleIcon,
  ShieldAlertIcon,
  SirenIcon,
  ActivityIcon,
  FilterIcon,
  HistoryIcon,
} from "@sbt/ui";
import type { Alert as SosAlert, AlertMessage, Conductor, Bus, District } from "@sbt/shared-types";
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
  const [districts, setDistricts] = useState<Pick<District, "id" | "name">[]>([]);
  const [districtFilter, setDistrictFilter] = useState("ALL");

  const [audioArmed, setAudioArmed] = useState(false);
  const [flash, setFlash] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "passenger" | "conductor" | "system">("ALL");
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
    supabase.from("districts").select("id, name").order("name").then(({ data }) => setDistricts((data ?? []) as Pick<District, "id" | "name">[]));
  }, []);

  // Automated continuous background idle bus scanner (runs every 60 seconds)
  useEffect(() => {
    const scanIdle = async () => {
      try {
        const { data } = await supabase.rpc("check_idle_buses");
        const count = Number(data ?? 0);
        if (count > 0) {
          const refreshed = await listActiveAlerts(supabase);
          setAlerts(refreshed);
        }
      } catch {
        // silent background automated scan
      }
    };

    void scanIdle();
    const intervalId = window.setInterval(scanIdle, 60000);
    return () => window.clearInterval(intervalId);
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

  const toggleSiren = () => {
    if (audioArmed) {
      if (audioCtxRef.current) {
        void audioCtxRef.current.suspend();
      }
      setAudioArmed(false);
    } else {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } else {
        void audioCtxRef.current.resume();
      }
      setAudioArmed(true);
    }
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

  const filteredAlerts = alerts.filter((a) => {
    if (sourceFilter !== "ALL" && (a.source_role || "system") !== sourceFilter) return false;
    if (districtFilter !== "ALL" && a.district_id !== districtFilter) return false;
    return true;
  });

  const geoTagged = filteredAlerts.filter((a) => a.latitude !== null && a.longitude !== null);

  const filteredHistory = historyAlerts.filter((a) => {
    if (districtFilter !== "ALL" && a.district_id !== districtFilter) return false;
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

  // Daily summary metrics
  const totalActiveIncidents = alerts.length;
  const criticalSosCount = alerts.filter((a) => a.severity === "SOS" || a.severity === "CRITICAL").length;
  const idleBusesCount = alerts.filter((a) => (a.source_role === "system") || (a.message?.toLowerCase().includes("idle"))).length;
  const acknowledgedCount = alerts.filter((a) => a.status === "ACKNOWLEDGED").length;

  return (
    <div className={`flex flex-col gap-4 ${flash ? "animate-pulse" : ""}`}>
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlertIcon className="h-5 w-5 text-rose-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Emergency & SOS Command Desk
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Continuous real-time incident telemetry, automated 60s idle fleet scanning, and live emergency responder chat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* District Filter Dropdown */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
            <FilterIcon className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none dark:text-slate-300"
            >
              <option value="ALL">All Districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Two-Way Siren Toggle */}
          <button
            type="button"
            onClick={toggleSiren}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs ${
              audioArmed
                ? "bg-rose-600 text-white hover:bg-rose-700 animate-pulse ring-2 ring-rose-500/40"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <SirenIcon className={`h-4 w-4 ${audioArmed ? "text-white" : "text-slate-400"}`} />
            <span>{audioArmed ? "Siren Armed (Click to Mute)" : "Siren Muted (Click to Arm)"}</span>
          </button>

          {/* View Tab Buttons */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setActiveTab("active")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                activeTab === "active"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <ActivityIcon className="h-3.5 w-3.5 text-rose-500" />
              <span>Active Alerts ({filteredAlerts.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                activeTab === "history"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <HistoryIcon className="h-3.5 w-3.5 text-slate-400" />
              <span>History & Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Daily Summary Analytics Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-[#112240]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Active Incidents</span>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{totalActiveIncidents}</p>
          <span className="text-[10px] text-slate-500">{acknowledgedCount} acknowledged</span>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 shadow-xs dark:border-rose-950/60 dark:bg-rose-950/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">Critical / SOS Signals</span>
          <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">{criticalSosCount}</p>
          <span className="text-[10px] text-rose-500">Requires emergency response</span>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-xs dark:border-amber-950/60 dark:bg-amber-950/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Idle / Stationary Buses</span>
          <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{idleBusesCount}</p>
          <span className="text-[10px] text-amber-600">Continuous 60s scan active</span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-xs dark:border-emerald-950/60 dark:bg-emerald-950/20">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">System Monitoring</span>
          <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">ACTIVE</p>
          <span className="text-[10px] text-emerald-600">Supabase Realtime synchronized</span>
        </div>
      </div>

      {/* ACTIVE ALERTS VIEW */}
      {activeTab === "active" && (
        <div className="flex h-[calc(100vh-16rem)] flex-col gap-4 lg:flex-row">
          <div className="flex flex-col gap-3 lg:w-96 overflow-y-auto">
            {/* Source Role Filter Pills */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {[
                { key: "ALL", label: "All Sources" },
                { key: "passenger", label: "Passenger SOS" },
                { key: "conductor", label: "Conductor SOS" },
                { key: "system", label: "Fleet Telemetry" },
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

            {filteredAlerts.length === 0 && (
              <EmptyState title="No active alerts" description="All clear across fleet operations for this filter." />
            )}

            <div className="flex flex-col gap-2">
              {filteredAlerts.map((alert) => (
                <Card key={alert.id} className={alert.severity === "SOS" || alert.severity === "CRITICAL" ? "border-rose-500 shadow-sm" : undefined}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge>
                      {alert.source_role === "passenger" ? (
                        <span className="text-[10px] rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 font-bold dark:bg-purple-950 dark:text-purple-300">
                          Passenger SOS
                        </span>
                      ) : alert.source_role === "conductor" ? (
                        <span className="text-[10px] rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 font-bold dark:bg-rose-950 dark:text-rose-300">
                          Conductor SOS
                        </span>
                      ) : (
                        <span className="text-[10px] rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-bold dark:bg-amber-950 dark:text-amber-300">
                          Fleet Telemetry
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{new Date(alert.created_at).toLocaleTimeString()}</span>
                  </div>

                  {alert.title && (
                    <p className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">{alert.title}</p>
                  )}
                  {alert.message && (
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{alert.message}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                      <BusIcon className="h-3 w-3 text-slate-400" />
                      {busLabel(alert.bus_id)}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="h-3 w-3 text-slate-400" />
                      {conductorLabel(alert.conductor_id)}
                    </span>
                  </div>

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
                      {expandedAlertId === alert.id ? "Hide Chat" : "Responder Chat"}
                    </button>
                  </div>

                  {/* Message thread */}
                  {expandedAlertId === alert.id && (
                    <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-2">
                        {(messages[alert.id] ?? []).length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-2">No messages yet. Send instructions below.</p>
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
                            <p className="opacity-50 mt-0.5 text-[10px]">{new Date(msg.created_at).toLocaleTimeString()}</p>
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
                    Source: {alert.source_role === "passenger" ? "Passenger SOS" : alert.source_role === "conductor" ? "Conductor SOS" : "Telemetry"}
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
              Refresh History
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

