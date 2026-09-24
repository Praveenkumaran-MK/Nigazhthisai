import React, { useState } from "react";
import {
  Phone,
  PhoneCall,
  AlertTriangle,
  MessageSquare,
  HelpCircle,
  X,
  Send,
  ShieldAlert,
  Radio,
} from "lucide-react";
import { Button } from "@sbt/ui";
import type { SosChatMessage } from "../pages/DashboardPage";

interface EmergencySosModalProps {
  open: boolean;
  onClose: () => void;
  activeAlertId: string | null;
  sosMessages: SosChatMessage[];
  sosMsgInput: string;
  setSosMsgInput: (val: string) => void;
  onSendSosMsg: (preset?: string) => Promise<void>;
  isSendingSosMsg: boolean;
  onTriggerSos: () => Promise<void>;
  districtName?: string;
  initialTab?: "helpline" | "chat" | "guide";
}

export function EmergencySosModal({
  open,
  onClose,
  activeAlertId,
  sosMessages,
  sosMsgInput,
  setSosMsgInput,
  onSendSosMsg,
  isSendingSosMsg,
  onTriggerSos,
  districtName = "Krishnagiri",
  initialTab = "helpline",
}: EmergencySosModalProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "helpline" | "guide">(initialTab);
  const [isTriggering, setIsTriggering] = useState(false);

  if (!open) return null;

  const handleTriggerEmergency = async () => {
    setIsTriggering(true);
    try {
      await onTriggerSos();
      setActiveTab("chat");
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative flex flex-col w-full max-w-lg max-h-[88dvh] sm:max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100">
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-12 h-1 rounded-full bg-slate-700" />
        </div>
        {/* Top Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 3 Header Segmented Tabs (matching Image 3) */}
        <div className="flex items-center gap-1.5 p-3.5 pt-4 border-b border-slate-800/80 bg-slate-950/60 overflow-x-auto">
          {/* Tab 1: Live Assistant */}
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === "chat"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Live Assistant</span>
            {activeAlertId && (
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          {/* Tab 2: Helpline & SOS (Active in reference) */}
          <button
            type="button"
            onClick={() => setActiveTab("helpline")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === "helpline"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <PhoneCall className="h-3.5 w-3.5 text-amber-400" />
            <span>Helpline & SOS</span>
          </button>

          {/* Tab 3: Trip Guide & FAQ */}
          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === "guide"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Trip Guide & FAQ</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* ========================================================================= */}
          {/* TAB: HELPLINE & SOS (EXACT REPLICA OF IMAGE 3)                           */}
          {/* ========================================================================= */}
          {activeTab === "helpline" && (
            <div className="flex flex-col gap-4">
              {/* Card 1: TOLL-FREE HELPLINE */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                      Toll-Free Helpline
                    </span>
                    <h2 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
                      1800-425-425
                    </h2>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-950/70 border border-indigo-500/30 text-indigo-400">
                    <Phone className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Available 24 hours daily for bus schedule verification, lost baggage inquiries, and ticket queries across all 38 districts.
                </p>
                <div className="mt-4">
                  <a
                    href="tel:1800425425"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-xs sm:text-sm font-bold text-white shadow-md transition active:scale-[0.99]"
                  >
                    <Phone className="h-4 w-4" />
                    <span>CALL TOLL-FREE HELPLINE</span>
                  </a>
                </div>
              </div>

              {/* Card 2: DISTRICT TRANSPORT DESK */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                    {districtName.toUpperCase()} DISTRICT TRANSPORT DESK
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400 font-mono">
                    +91 0422-2435678 • Central Bus Depot
                  </p>
                </div>
                <a
                  href="tel:+914222435678"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-white border border-slate-700 transition"
                >
                  Call
                </a>
              </div>

              {/* Card 3: IMMEDIATE DANGER OR MEDICAL EMERGENCY? */}
              <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4 sm:p-5 shadow-sm">
                <div className="flex items-center gap-2 text-rose-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Immediate Danger or Medical Emergency?
                  </h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-rose-200/90">
                  Trigger an emergency SOS beacon to broadcast live vehicle GPS coordinates and passenger details to police patrol and depot control.
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleTriggerEmergency}
                    disabled={isTriggering}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 py-3.5 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-rose-950/60 transition active:scale-[0.99] disabled:opacity-50"
                  >
                    <Radio className={`h-4 w-4 ${isTriggering ? "animate-spin" : "animate-pulse"}`} />
                    <span>
                      {isTriggering
                        ? "BROADCASTING EMERGENCY BEACON..."
                        : "TRIGGER EMERGENCY SOS BEACON"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: LIVE ASSISTANT (CONTROL ROOM DISPATCHER CHAT)                        */}
          {/* ========================================================================= */}
          {activeTab === "chat" && (
            <div className="flex flex-col gap-3">
              {/* Header Status */}
              <div className="flex items-center justify-between rounded-xl bg-slate-950/80 border border-slate-800 p-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-400" />
                  <div>
                    <p className="text-xs font-bold text-white uppercase tracking-wider">
                      Control Room Dispatch Channel
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Direct secure channel with district transit headquarters.
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    activeAlertId
                      ? "bg-rose-900/60 text-rose-300 border border-rose-600/50 animate-pulse"
                      : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  }`}
                >
                  {activeAlertId ? "SOS ACTIVE" : "MONITORED"}
                </span>
              </div>

              {/* Messages Container */}
              <div className="flex flex-col gap-2.5 min-h-[220px] max-h-[340px] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5">
                {sosMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-slate-400">
                    <MessageSquare className="h-8 w-8 text-slate-600 mb-1.5" />
                    <p className="font-semibold text-slate-300">No dispatch messages yet.</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                      Send a message below or trigger an SOS beacon to alert control room operators immediately.
                    </p>
                  </div>
                ) : (
                  sosMessages.map((msg) => {
                    const isConductor = msg.sender_role === "conductor";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                          isConductor
                            ? "self-end bg-amber-600/90 text-white rounded-tr-none"
                            : "self-start bg-indigo-950/80 border border-indigo-500/40 text-indigo-100 rounded-tl-none"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[10px] font-bold opacity-80 mb-1">
                          <span>{isConductor ? "You (Conductor)" : "Control Room (Dispatcher)"}</span>
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="font-medium">{msg.message}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Preset Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Medical assistance needed",
                  "Traffic roadblock / delayed",
                  "Vehicle mechanical issue",
                  "Patrol / Security requested",
                  "Situation under control",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onSendSosMsg(chip)}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-600 hover:text-white transition"
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              {/* Chat Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sosMsgInput}
                  onChange={(e) => setSosMsgInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSendSosMsg();
                    }
                  }}
                  placeholder="Type an urgent message to control room..."
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                />
                <Button
                  size="sm"
                  onClick={() => onSendSosMsg()}
                  disabled={!sosMsgInput.trim() || isSendingSosMsg}
                  className="px-4 font-bold bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: TRIP GUIDE & FAQ                                                     */}
          {/* ========================================================================= */}
          {activeTab === "guide" && (
            <div className="flex flex-col gap-3 text-xs">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-amber-400" />
                  <span>Standard Operating Procedures</span>
                </h3>
                <div className="mt-3 space-y-2.5 text-slate-300">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
                    <p className="font-bold text-amber-300">1. Medical Emergency / Passenger Faint</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Signal the driver to park safely on the shoulder. Trigger the Emergency SOS beacon and dial 108. Maintain airflow inside the bus.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
                    <p className="font-bold text-amber-300">2. Breakdown / Technical Fault</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Switch hazard lights on. Inform passengers calmly. Send a "Vehicle mechanical issue" update to the control room dispatcher for substitute vehicle dispatch.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
                    <p className="font-bold text-amber-300">3. Route Diversion / Roadblock</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Always confirm alternate route clearance with depot control room before deviating from the scheduled transit path.
                    </p>
                  </div>
                </div>
              </div>

              {/* Emergency Numbers Quick List */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2.5">
                  Universal Emergency Services
                </h4>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <a
                    href="tel:112"
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5 hover:border-slate-700"
                  >
                    <span className="text-slate-300 font-sans">Police Patrol</span>
                    <span className="font-bold text-amber-400">112</span>
                  </a>
                  <a
                    href="tel:108"
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5 hover:border-slate-700"
                  >
                    <span className="text-slate-300 font-sans">Ambulance</span>
                    <span className="font-bold text-amber-400">108</span>
                  </a>
                  <a
                    href="tel:181"
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5 hover:border-slate-700"
                  >
                    <span className="text-slate-300 font-sans">Women Helpline</span>
                    <span className="font-bold text-amber-400">181</span>
                  </a>
                  <a
                    href="tel:1098"
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5 hover:border-slate-700"
                  >
                    <span className="text-slate-300 font-sans">Childline</span>
                    <span className="font-bold text-amber-400">1098</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
