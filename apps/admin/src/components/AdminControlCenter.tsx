import { useState } from "react";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useAdminAuth } from "../hooks/useAdminAuth";

interface FeatureConfig {
  key: string;
  name: string;
  defaultDescription: string;
}

const CONTROL_FEATURES: FeatureConfig[] = [
  { key: "dashboard", name: "DASHBOARD", defaultDescription: "Overview and core operational telemetry" },
  { key: "live_monitoring", name: "LIVE MONITORING", defaultDescription: "Live radar GPS map and active fleet trackers" },
  { key: "revenue_analytics", name: "REVENUE ANALYTICS", defaultDescription: "Realtime ticket collections and fare charts" },
  { key: "operations_module", name: "OPERATIONS MODULE", defaultDescription: "Stops, fares matrix and conductor roster" },
  { key: "buses_management", name: "BUSES MANAGEMENT", defaultDescription: "Fleet registration, depot status and buses" },
  { key: "routes_management", name: "ROUTES MANAGEMENT", defaultDescription: "Route paths, stop sequences and waypoints" },
  { key: "trips_management", name: "TRIPS MANAGEMENT", defaultDescription: "Daily dispatches, trip assigner and timetable" },
  { key: "operational_alerts", name: "OPERATIONAL ALERTS", defaultDescription: "SOS response desk, idle radar and alerts" },
  { key: "shops_management", name: "SHOPS MANAGEMENT", defaultDescription: "ETM inventory, maintenance bay and bus QR" },
  { key: "support_faq", name: "SUPPORT & FAQ", defaultDescription: "Passenger grievance desk and help queries" },
];

export function AdminControlCenter() {
  const { profile } = useAdminAuth();
  const isMasterAdmin = profile?.role === "master_admin";
  const { flags, toggleFlag, updatingKey } = useFeatureFlags();
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const handleToggle = async (key: string, currentVal: boolean) => {
    if (!isMasterAdmin) {
      setFeedback({ msg: "Master Admin authority required to alter feature flags.", type: "error" });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    const nextVal = !currentVal;
    try {
      await toggleFlag(key, nextVal);
      const feature = CONTROL_FEATURES.find((f) => f.key === key);
      setFeedback({
        msg: `${feature?.name || key} is now ${nextVal ? "ENABLED" : "RESTRICTED"} for normal admins`,
        type: "success",
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to toggle feature";
      setFeedback({ msg: errorMsg, type: "error" });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-[#0a192f] border border-blue-950/80 shadow-2xl p-6 transition-all">
      {/* Top Banner Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-blue-900/40">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-950 border border-blue-800/50 text-amber-400 shadow-inner">
            {/* Gear / Controls Icon */}
            <svg className="h-6 w-6 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-black tracking-widest text-white uppercase sm:text-base">
              Admin Control Center
            </h2>
            <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Toggle feature accessibility for normal admins
            </p>
          </div>
        </div>

        {/* Master Authority Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-400 shadow-sm">
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z"
                clipRule="evenodd"
              />
            </svg>
            Master Authority Active
          </div>
        </div>
      </div>

      {/* Realtime Toast / Notification banner */}
      {feedback && (
        <div
          className={`mt-4 flex items-center justify-between rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all ${
            feedback.type === "success"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
          }`}
        >
          <span>{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* 10 Feature Switches Grid */}
      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {CONTROL_FEATURES.map((feature) => {
          const isEnabled = flags[feature.key] ?? true;
          const isBusy = updatingKey === feature.key;

          return (
            <div
              key={feature.key}
              className={`group flex items-center justify-between rounded-xl bg-[#0f244a]/95 p-4 border transition-all duration-200 hover:border-slate-600 ${
                isEnabled
                  ? "border-blue-900/60 shadow-sm"
                  : "border-rose-950/80 bg-[#161a29]/95 opacity-85"
              }`}
            >
              {/* Feature Icon + Title + Status */}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isEnabled
                      ? "bg-[#162d59] border-blue-700/40 text-slate-300"
                      : "bg-rose-950/40 border-rose-900/50 text-rose-400"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>

                <div className="flex flex-col">
                  <span className="text-xs font-black tracking-wide text-white uppercase group-hover:text-amber-300 transition-colors">
                    {feature.name}
                  </span>
                  <span
                    className={`text-[10px] font-bold tracking-wider uppercase ${
                      isEnabled ? "text-slate-400" : "text-rose-400 font-extrabold"
                    }`}
                  >
                    {isEnabled ? "ACCESS GRANTED" : "ACCESS REVOKED"}
                  </span>
                </div>
              </div>

              {/* iOS / Tailwind Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                disabled={isBusy}
                onClick={() => void handleToggle(feature.key, isEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-[#0a192f] ${
                  isEnabled ? "bg-[#e8590c] hover:bg-[#f76707]" : "bg-slate-700 hover:bg-slate-600"
                } ${isBusy ? "opacity-50 cursor-wait" : ""}`}
              >
                <span className="sr-only">Toggle {feature.name}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
