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
import type {
  Alert as SosAlert,
  AlertMessage,
  PassengerEmergencyMessage,
  PassengerEmergencyChat,
  Conductor,
  Bus,
  District,
} from "@sbt/shared-types";
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
  const [passengerChatIds, setPassengerChatIds] = useState<Record<string, string>>({});
  const [passengerChats, setPassengerChats] = useState<Record<string, PassengerEmergencyChat>>({});
  const [passengerMessages, setPassengerMessages] = useState<Record<string, PassengerEmergencyMessage[]>>({});
  const [messageInput, setMessageInput] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const CANNED_DISPATCH_RESPONSES = [
    { label: "🚑 Ambulance Dispatched", text: "Ambulance & medical emergency team have been dispatched to your bus coordinates." },
    { label: "👮 Police Alerted", text: "Transit police patrol has been notified of your bus location and is responding." },
    { label: "🚌 Conductor Alerted", text: "The bus conductor has been instructed to assist you immediately." },
    { label: "🛡️ Help Approaching", text: "Control Room is actively tracking your bus via live GPS. Stay safe, help is approaching." },
  ];

  const audioCtxRef = useRef<AudioContext | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    listActiveAlerts(supabase).then(setAlerts);
    supabase.from("buses").select("*").then(({ data }) => setBuses((data ?? []) as Bus[]));
    supabase.from("conductors").select("*").then(({ data }) => setConductors((data ?? []) as Conductor[]));
    supabase.from("districts").select("id, name").order("name").then(({ data }) => setDistricts((data ?? []) as Pick<District, "id" | "name">[]));
  }, []);

  const [scanningIdle, setScanningIdle] = useState(false);

  // Automated continuous background idle bus scanner (runs every 60 seconds)
  const scanIdle = async () => {
    setScanningIdle(true);
    let rpcSucceeded = false;
    try {
      const { data, error } = await supabase.rpc("check_idle_buses");
      if (!error) {
        rpcSucceeded = true;
        const count = Number(data ?? 0);
        if (count > 0) {
          const refreshed = await listActiveAlerts(supabase);
          setAlerts(refreshed);
        }
      }
    } catch {
      rpcSucceeded = false;
    }

    // Client-side fallback idle detection routine (works even if RPC or gps_logs is missing)
    if (!rpcSucceeded) {
      try {
        const { data: activeTrips } = await supabase
          .from("trips")
          .select("id, bus_id, conductor_id, district_id, status, started_at, gps_last_updated_at, last_telemetry_at, buses(bus_number)")
          .eq("status", "ACTIVE");

        if (activeTrips && activeTrips.length > 0) {
          const now = Date.now();
          let newAlertCount = 0;

          for (const trip of activeTrips) {
            const lastActivity = (trip as any).last_telemetry_at || (trip as any).gps_last_updated_at || trip.started_at;
            if (!lastActivity) continue;

            const elapsedMins = (now - new Date(lastActivity).getTime()) / 60000;
            // Idle alert threshold: >= 10 minutes without telemetry movement
            if (elapsedMins >= 10) {
              const { data: existing } = await supabase
                .from("alerts")
                .select("id")
                .eq("trip_id", trip.id)
                .in("status", ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"])
                .limit(1);

              if (!existing || existing.length === 0) {
                const busObj = Array.isArray(trip.buses) ? trip.buses[0] : trip.buses;
                const busNum = (busObj as any)?.bus_number || "assigned vehicle";
                await supabase.from("alerts").insert({
                  trip_id: trip.id,
                  bus_id: trip.bus_id,
                  conductor_id: trip.conductor_id,
                  district_id: trip.district_id,
                  severity: "WARNING",
                  status: "OPEN",
                  title: `Bus #${busNum} Idle Detected`,
                  message: `Vehicle #${busNum} has had no GPS movement or telemetry heartbeat for ${Math.round(elapsedMins)} minutes while on an active service trip.`,
                });
                newAlertCount++;
              }
            }
          }

          if (newAlertCount > 0) {
            const refreshed = await listActiveAlerts(supabase);
            setAlerts(refreshed);
          }
        }
      } catch (err) {
        console.error("Client idle scanner error:", err);
      }
    }
    setScanningIdle(false);
  };

  useEffect(() => {
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
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return;

    const isPassengerAlert = alert.source_role === "passenger" || Boolean(alert.chat_id);

    if (isPassengerAlert) {
      let chatId = alert.chat_id || passengerChatIds[alertId];
      if (!chatId) {
        let pChat: any = null;
        if (alert.chat_id) {
          const { data } = await supabase.from("passenger_emergency_chats").select("*").eq("id", alert.chat_id).maybeSingle();
          pChat = data;
        } else if (alert.trip_id) {
          const { data } = await supabase.from("passenger_emergency_chats").select("*").eq("trip_id", alert.trip_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          pChat = data;
        } else if (alert.bus_id) {
          const { data } = await supabase.from("passenger_emergency_chats").select("*").eq("bus_id", alert.bus_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          pChat = data;
        }
        if (pChat) {
          chatId = pChat.id;
          setPassengerChatIds((prev) => ({ ...prev, [alertId]: pChat.id }));
          setPassengerChats((prev) => ({ ...prev, [alertId]: pChat as PassengerEmergencyChat }));
        }
      }

      if (chatId) {
        const { data: pMsgs } = await supabase
          .from("passenger_emergency_messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true });
        setPassengerMessages((prev) => ({ ...prev, [chatId]: (pMsgs ?? []) as PassengerEmergencyMessage[] }));
      }
    } else {
      const { data } = await supabase
        .from("alert_messages")
        .select("*")
        .eq("alert_id", alertId)
        .order("created_at");
      setMessages((prev) => ({ ...prev, [alertId]: (data ?? []) as AlertMessage[] }));
    }
  };

  useEffect(() => {
    if (!expandedAlertId) return;
    void loadMessages(expandedAlertId);

    const alert = alerts.find((a) => a.id === expandedAlertId);
    const isPassengerAlert = alert?.source_role === "passenger" || Boolean(alert?.chat_id);

    let channel: any = null;

    if (isPassengerAlert) {
      const resolveAndSub = async () => {
        let chatId = alert?.chat_id || passengerChatIds[expandedAlertId];
        if (!chatId) {
          let pChat: any = null;
          if (alert?.chat_id) {
            const { data } = await supabase.from("passenger_emergency_chats").select("id").eq("id", alert.chat_id).maybeSingle();
            pChat = data;
          } else if (alert?.trip_id) {
            const { data } = await supabase.from("passenger_emergency_chats").select("id").eq("trip_id", alert.trip_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
            pChat = data;
          }
          if (pChat) chatId = pChat.id;
        }

        if (chatId) {
          const targetChatId = chatId;
          setPassengerChatIds((prev) => ({ ...prev, [expandedAlertId]: targetChatId }));
          channel = supabase
            .channel(`admin-emg-chat-${targetChatId}`)
            .on(
              "postgres_changes",
              { event: "INSERT", schema: "public", table: "passenger_emergency_messages", filter: `chat_id=eq.${targetChatId}` },
              (payload) => {
                const newMsg = payload.new as PassengerEmergencyMessage;
                setPassengerMessages((prev) => {
                  const curr = prev[targetChatId] ?? [];
                  if (curr.some((m) => m.id === newMsg.id)) return prev;
                  return { ...prev, [targetChatId]: [...curr, newMsg] };
                });
              }
            )
            .subscribe();
        }
      };
      void resolveAndSub();
    } else {
      channel = supabase
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
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [expandedAlertId, alerts]);

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
    const alert = alerts.find((a) => a.id === id);
    const chatId = alert?.chat_id || passengerChatIds[id];
    if (chatId) {
      try {
        await supabase.rpc("resolve_emergency_chat", {
          p_chat_id: chatId,
          p_notes: "Resolved by Control Room Admin",
        });
      } catch (e) {
        console.warn("Could not resolve passenger emergency chat session:", e);
      }
    }
    await resolveAlert(supabase, id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSendMessage = async (alertId: string, presetText?: string) => {
    const text = (presetText ?? messageInput[alertId] ?? "").trim();
    if (!text) return;
    setSendingId(alertId);
    try {
      const alert = alerts.find((a) => a.id === alertId);
      const isPassengerAlert = alert?.source_role === "passenger" || Boolean(alert?.chat_id);

      if (isPassengerAlert) {
        let chatId = alert?.chat_id || passengerChatIds[alertId];
        if (!chatId) {
          let pChat: any = null;
          if (alert?.chat_id) {
            const { data } = await supabase.from("passenger_emergency_chats").select("id").eq("id", alert.chat_id).maybeSingle();
            pChat = data;
          } else if (alert?.trip_id) {
            const { data } = await supabase.from("passenger_emergency_chats").select("id").eq("trip_id", alert.trip_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
            pChat = data;
          }
          if (pChat) chatId = pChat.id;
        }

        if (chatId) {
          const { error: rpcErr } = await supabase.rpc("send_emergency_message", {
            p_chat_id: chatId,
            p_message: text,
          });
          if (rpcErr) throw rpcErr;
        } else {
          throw new Error("No active passenger emergency chat session found for this alert.");
        }
      } else {
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
      }
      setMessageInput((prev) => ({ ...prev, [alertId]: "" }));
    } catch (err: any) {
      console.error("Failed to send message:", err);
      alert("Failed to send reply: " + (err.message ?? "Unknown error"));
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

          {/* Manual Scan Fleet Button */}
          <button
            type="button"
            onClick={() => void scanIdle()}
            disabled={scanningIdle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 disabled:opacity-50 transition"
            title="Scan active fleet vehicles for stationary idle alerts"
          >
            <ActivityIcon className={`h-3.5 w-3.5 text-emerald-500 ${scanningIdle ? "animate-spin" : ""}`} />
            <span>{scanningIdle ? "Scanning Fleet…" : "Scan Fleet Idle"}</span>
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
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1.5 ${
                        alert.source_role === "passenger" || alert.chat_id
                          ? "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800 shadow-xs"
                          : "text-brand-600 hover:bg-brand-50 dark:text-brand-400"
                      }`}
                    >
                      <span>
                        {expandedAlertId === alert.id
                          ? "Hide Chat"
                          : alert.source_role === "passenger" || alert.chat_id
                          ? "💬 Passenger SOS Chat"
                          : "Responder Chat"}
                      </span>
                    </button>
                  </div>

                  {/* Message thread */}
                  {expandedAlertId === alert.id && (
                    <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                      {/* Dual-Mode Message Feed: Passenger SOS vs Conductor/System */}
                      {alert.source_role === "passenger" || alert.chat_id ? (
                        <div>
                          {/* Passenger Emergency Details Bar */}
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-purple-100 dark:border-purple-900/40">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                Passenger Emergency Stream
                              </span>
                              {passengerChats[alert.id]?.emergency_type && (
                                <Badge tone="danger">{passengerChats[alert.id]?.emergency_type}</Badge>
                              )}
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 animate-pulse">
                              ● Live Connected
                            </span>
                          </div>

                          {/* Quick Canned Dispatch Response Chips */}
                          <div className="mb-2.5 flex flex-wrap gap-1">
                            {CANNED_DISPATCH_RESPONSES.map((chip) => (
                              <button
                                key={chip.label}
                                type="button"
                                disabled={sendingId === alert.id}
                                onClick={() => void handleSendMessage(alert.id, chip.text)}
                                className="rounded-md border border-purple-200 bg-purple-50/70 px-2 py-0.5 text-[10px] font-semibold text-purple-800 hover:bg-purple-100 dark:border-purple-900/60 dark:bg-purple-950/50 dark:text-purple-300 transition"
                                title={chip.text}
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>

                          {/* Passenger Messages Stream */}
                          <div className="flex flex-col gap-2 max-h-52 overflow-y-auto mb-2.5 pr-1">
                            {(() => {
                              const chatId = alert.chat_id || passengerChatIds[alert.id];
                              const pMsgs = (chatId ? passengerMessages[chatId] : null) ?? [];
                              if (pMsgs.length === 0) {
                                return (
                                  <p className="text-xs text-slate-400 text-center py-3">
                                    No live messages in stream. Send an immediate reassurance below.
                                  </p>
                                );
                              }
                              return pMsgs.map((msg) => {
                                const isMe = msg.sender_role === "admin";
                                return (
                                  <div
                                    key={msg.id}
                                    className={`rounded-xl px-3 py-2 text-xs max-w-[85%] leading-relaxed ${
                                      isMe
                                        ? "bg-brand-600 text-white self-end rounded-tr-none shadow-xs"
                                        : msg.sender_role === "passenger"
                                        ? "bg-purple-50 text-purple-950 border border-purple-200 dark:bg-purple-950/80 dark:border-purple-800/60 dark:text-purple-100 self-start rounded-tl-none shadow-xs"
                                        : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100 self-start rounded-tl-none"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 font-bold text-[10px] opacity-75 mb-0.5">
                                      <span>
                                        {isMe
                                          ? "Control Room (You)"
                                          : msg.sender_role === "passenger"
                                          ? "Passenger SOS"
                                          : msg.sender_role}
                                      </span>
                                      <span>•</span>
                                      <span className="font-normal opacity-80 font-mono">
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                    <p>{msg.message}</p>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Chat Input */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Type immediate reply to passenger…"
                              value={messageInput[alert.id] ?? ""}
                              onChange={(e) => setMessageInput((prev) => ({ ...prev, [alert.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && void handleSendMessage(alert.id)}
                              className="flex-1 rounded-lg border border-purple-200 bg-white text-slate-900 px-3 py-1.5 text-xs focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSendMessage(alert.id)}
                              disabled={sendingId === alert.id || !(messageInput[alert.id] ?? "").trim()}
                              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50 transition"
                            >
                              {sendingId === alert.id ? "…" : "Reply"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {/* Conductor & Telemetry Alert Messages Stream */}
                          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-2">
                            {(messages[alert.id] ?? []).length === 0 && (
                              <p className="text-xs text-slate-400 text-center py-2">
                                No messages yet. Send instructions below.
                              </p>
                            )}
                            {(messages[alert.id] ?? []).map((msg) => (
                              <div
                                key={msg.id}
                                className={`rounded-lg px-3 py-2 text-xs max-w-[85%] ${
                                  msg.sender_role === "admin"
                                    ? "bg-brand-600 text-white self-end rounded-tr-none"
                                    : "bg-slate-100 dark:bg-slate-700 self-start rounded-tl-none"
                                }`}
                              >
                                <p className="font-semibold opacity-70 mb-0.5 capitalize">{msg.sender_role}</p>
                                <p>{msg.message}</p>
                                <p className="opacity-50 mt-0.5 text-[10px]">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Type response instructions…"
                              value={messageInput[alert.id] ?? ""}
                              onChange={(e) => setMessageInput((prev) => ({ ...prev, [alert.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && void handleSendMessage(alert.id)}
                              className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSendMessage(alert.id)}
                              disabled={sendingId === alert.id || !(messageInput[alert.id] ?? "").trim()}
                              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition"
                            >
                              {sendingId === alert.id ? "…" : "Send"}
                            </button>
                          </div>
                        </div>
                      )}
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

