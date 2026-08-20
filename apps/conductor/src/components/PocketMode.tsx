import type { GpsWatchStatus } from "../hooks/useGpsTelemetry";

interface PocketModeProps {
  telemetryStatus: GpsWatchStatus;
  onExit: () => void;
  sos: {
    progress: number;
    isPressing: boolean;
    handlers: Record<string, () => void>;
  };
}

/**
 * Pure #000000 canvas, minimal rendering, non-essential inputs locked away
 * (spec §33). Telemetry keeps running via the same useGpsTelemetry instance
 * in TripPage — this component only changes what's rendered, not what's
 * subscribed, so GPS/broadcast/presence are unaffected by entering/exiting
 * Pocket Mode.
 *
 * PLATFORM LIMITATION (documented per spec §1.3/§33): no web/PWA API can
 * guarantee JS keeps running once the OS locks the screen or backgrounds
 * the browser. This mode maximizes reliability while the screen stays on
 * and the tab stays foregrounded (Wake Lock + this minimal-render surface);
 * it cannot promise telemetry continues if the OS suspends the tab.
 */
export function PocketMode({ telemetryStatus, onExit, sos }: PocketModeProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black">
      <p className="text-xs uppercase tracking-widest text-slate-600">
        {telemetryStatus === "watching" ? "Tracking active" : "Tracking paused"}
      </p>
      <div
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: telemetryStatus === "watching" ? "#16a34a" : "#525252" }}
        aria-hidden="true"
      />
      <button
        type="button"
        className="mt-8 select-none rounded-full border border-[#1f1f1f] px-8 py-4 text-sm font-medium text-slate-500"
        {...sos.handlers}
        style={{
          backgroundImage: `linear-gradient(90deg, #7f1d1d ${sos.progress * 100}%, transparent ${sos.progress * 100}%)`,
        }}
      >
        {sos.isPressing ? "Hold for SOS…" : "SOS (hold)"}
      </button>
      <button type="button" onClick={onExit} className="mt-10 text-xs text-slate-700 underline">
        Exit pocket mode
      </button>
    </div>
  );
}
