import type { ReactNode } from "react";
import { cn } from "../utils/cn";

/**
 * ─── 3D hero scenes ─────────────────────────────────────────────────────
 * These are isometric SVG scenes composited with CSS 3D transforms rather
 * than WebGL. That was a deliberate call for this codebase:
 *
 *   • Three.js/Spline adds ~600KB+ to each bundle. The Conductor app is
 *     explicitly optimised for battery and OLED (Pocket Mode), so running
 *     a GL context on the trip screen works against a stated requirement.
 *   • These render instantly, work offline, cost no extra request, and
 *     animate purely on `transform`/`opacity` (GPU-composited, no layout).
 *
 * If you do want a real 3D scene later, `IsoStage` takes an `overlay`
 * slot: mount a <Spline scene=… /> or a Three.js canvas there and the SVG
 * beneath it becomes the loading/no-WebGL fallback automatically — no
 * call-site changes.
 * ────────────────────────────────────────────────────────────────────────
 */

export interface IsoStageProps {
  children: ReactNode;
  /** Optional real-3D layer (Spline/Three.js). SVG below acts as fallback. */
  overlay?: ReactNode;
  className?: string;
  label: string;
}

function IsoStage({ children, overlay, className, label }: IsoStageProps) {
  return (
    // `pointer-events-none`: these scenes are purely decorative and often sit
    // directly above interactive controls. Without it, any overflow silently
    // swallows clicks on the real button underneath.
    <div
      className={cn("sbt-iso-stage pointer-events-none relative overflow-hidden", className)}
      role="img"
      aria-label={label}
    >
      {/* h-full/w-full is load-bearing, not cosmetic: the child <svg> sizes
          with h-full, and a percentage height only resolves against a parent
          with a definite height. Leaving this div at height:auto made the
          SVG fall back to its intrinsic aspect ratio and overflow its box
          (a 200x150 scene in a full-width slot rendered ~90px too tall). */}
      <div className="sbt-iso-layer h-full w-full motion-safe:animate-iso-float">{children}</div>
      {/* The 3D overlay stays interactive — Spline/Three.js scenes may want
          orbit controls. */}
      {overlay && <div className="pointer-events-auto absolute inset-0">{overlay}</div>}
    </div>
  );
}

/**
 * Shared ground plate every scene sits on. Deliberately translucent white
 * rather than a solid light fill: all three scenes render on navy/black
 * surfaces, and a solid plate read as a bright slab that out-competed the
 * figures standing on it. Translucency also means the same component
 * works if a scene is ever placed on a light surface.
 */
function GroundPlate({ x = 100, y = 120 }: { x?: number; y?: number }) {
  return (
    <g>
      <path
        d={`M${x} ${y - 24} L${x + 82} ${y} L${x} ${y + 24} L${x - 82} ${y} Z`}
        fill="#FFFFFF"
        opacity="0.10"
      />
      <path d={`M${x} ${y - 24} L${x + 82} ${y} L${x} ${y + 24} Z`} fill="#FFFFFF" opacity="0.05" />
      <path
        d={`M${x} ${y - 24} L${x + 82} ${y} L${x} ${y + 24} L${x - 82} ${y} Z`}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
    </g>
  );
}

export interface HeroSceneProps {
  className?: string;
  overlay?: ReactNode;
}

/** Passenger app — a commuter waiting at a stop as the bus pulls in. */
export function CommuterHero({ className, overlay }: HeroSceneProps) {
  return (
    <IsoStage className={className} overlay={overlay} label="A commuter waiting at a bus stop as a bus arrives">
      <svg viewBox="0 0 200 150" fill="none" className="h-full w-full">
        <GroundPlate />

        {/* Bus shelter + stop sign */}
        <g>
          <path d="M20 44h62l-7 9H27l-7-9Z" fill="#3E63A0" />
          <rect x="26" y="53" width="4.5" height="52" rx="2" fill="#1B4079" />
          <rect x="74" y="53" width="4.5" height="52" rx="2" fill="#1B4079" />
          <rect x="30.5" y="70" width="43.5" height="26" rx="2" fill="#BFD3EE" opacity="0.35" />
          <rect x="30.5" y="96" width="43.5" height="9" rx="2" fill="#1B4079" />
          {/* Amber stop sign on its pole */}
          <rect x="86" y="52" width="3.5" height="53" rx="1.75" fill="#3E63A0" />
          <rect x="76" y="40" width="27" height="17" rx="4" fill="#D97F00" />
          <circle cx="89.5" cy="48.5" r="5" fill="#FFFFFF" />
        </g>

        {/* Commuter */}
        <g>
          <circle cx="56" cy="62" r="9" fill="#F1F5FB" />
          <path d="M47 75c0-5 4-8 9-8s9 3 9 8v18H47V75Z" fill="#D97F00" />
          <rect x="49.5" y="93" width="5.5" height="15" rx="2.5" fill="#F1F5FB" />
          <rect x="57.5" y="93" width="5.5" height="15" rx="2.5" fill="#F1F5FB" />
          <rect x="64" y="77" width="9" height="12" rx="2.5" fill="#3E63A0" />
        </g>

        {/* Arriving bus */}
        <g>
          <rect x="112" y="52" width="74" height="42" rx="8" fill="#F1F5FB" />
          <rect x="112" y="52" width="74" height="12" rx="8" fill="#D97F00" />
          <rect x="118" y="68" width="14" height="12" rx="3" fill="#0D2A5D" />
          <rect x="136" y="68" width="14" height="12" rx="3" fill="#0D2A5D" />
          <rect x="154" y="68" width="14" height="12" rx="3" fill="#0D2A5D" />
          <rect x="172" y="70" width="8" height="9" rx="2" fill="#3E63A0" />
          <rect x="112" y="86" width="74" height="4" fill="#0D2A5D" opacity="0.25" />
          <circle cx="130" cy="98" r="8.5" fill="#0A1F45" />
          <circle cx="130" cy="98" r="3.2" fill="#BFD3EE" />
          <circle cx="168" cy="98" r="8.5" fill="#0A1F45" />
          <circle cx="168" cy="98" r="3.2" fill="#BFD3EE" />
        </g>

        {/* Live ping above the bus */}
        <g className="motion-safe:animate-pin-pulse" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <circle cx="149" cy="28" r="13" fill="#D97F00" opacity="0.22" />
          <circle cx="149" cy="28" r="7" fill="#D97F00" />
          <circle cx="149" cy="28" r="2.6" fill="#FFFFFF" />
        </g>
      </svg>
    </IsoStage>
  );
}

/** Conductor app — ticket validation: scanner beam over a boarding pass. */
export function ConductorHero({ className, overlay }: HeroSceneProps) {
  return (
    <IsoStage className={className} overlay={overlay} label="A conductor's scanner validating a ticket">
      <svg viewBox="0 0 200 150" fill="none" className="h-full w-full">
        <GroundPlate />

        {/* Floating ticket */}
        <g transform="rotate(-8 66 74)">
          <rect x="30" y="52" width="72" height="46" rx="8" fill="#FFFFFF" stroke="#D7E2F1" strokeWidth="1.5" />
          <rect x="30" y="52" width="72" height="13" rx="8" fill="#0D2A5D" />
          <rect x="37" y="72" width="26" height="4" rx="2" fill="#BFD3EE" />
          <rect x="37" y="80" width="17" height="4" rx="2" fill="#D7E2F1" />
          {/* Perforation */}
          <line x1="72" y1="56" x2="72" y2="94" stroke="#D7E2F1" strokeWidth="1.5" strokeDasharray="3 3" />
          {/* Mini QR */}
          <rect x="78" y="70" width="18" height="18" rx="2" fill="#0D2A5D" />
          <rect x="81" y="73" width="4.5" height="4.5" fill="#FFFFFF" />
          <rect x="88.5" y="73" width="4.5" height="4.5" fill="#FFFFFF" />
          <rect x="81" y="80.5" width="4.5" height="4.5" fill="#FFFFFF" />
          <rect x="88.5" y="80.5" width="2.2" height="2.2" fill="#FFFFFF" />
        </g>

        {/* Scanner device — body lightened to #3E63A0 because this scene
            renders on the Conductor app's true-black canvas, where a navy
            #0D2A5D body would disappear into the background. */}
        <g transform="rotate(6 148 74)">
          <rect x="126" y="38" width="44" height="72" rx="9" fill="#3E63A0" />
          <rect x="131" y="46" width="34" height="56" rx="5" fill="#071735" />
          <rect x="143" y="41" width="10" height="2.5" rx="1.25" fill="#BFD3EE" />
          {/* Viewfinder corners */}
          <path d="M137 56v-4h5M159 52h5v4M164 92v4h-5M142 96h-5v-4" stroke="#D97F00" strokeWidth="2.2" strokeLinecap="round" />
          {/* Scan beam */}
          <rect
            x="135"
            y="72"
            width="26"
            height="2.5"
            rx="1.25"
            fill="#D97F00"
            className="motion-safe:animate-pin-pulse"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </g>

        {/* Validated check */}
        <g className="motion-safe:animate-pin-pulse" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <circle cx="104" cy="34" r="14" fill="#16A34A" />
          <path d="M97.5 34.5l4.5 4.5 8.5-9" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </IsoStage>
  );
}

/** Admin app — fleet command: live buses on a control-room grid. */
export function FleetCommandHero({ className, overlay }: HeroSceneProps) {
  return (
    <IsoStage className={className} overlay={overlay} label="A fleet command view of live buses on a district grid">
      <svg viewBox="0 0 200 150" fill="none" className="h-full w-full">
        <GroundPlate />

        {/* Isometric grid lines on the plate */}
        <g stroke="#A9C0E0" strokeWidth="1" opacity="0.7">
          <path d="M62 118L100 99M100 137L138 118M81 128L119 109" />
          <path d="M138 118L100 99M100 137L62 118M119 128L81 109" />
        </g>

        {/* Control screen — bezel lightened for separation from the
            navy-depth card this sits on. */}
        <g>
          <rect x="52" y="24" width="96" height="60" rx="8" fill="#3E63A0" />
          <rect x="58" y="30" width="84" height="42" rx="4" fill="#050E1F" />
          {/* Route lines on screen */}
          <path d="M64 62c12-6 16-20 30-20s20 12 32 6" stroke="#D97F00" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M64 50c14 2 22-10 34-6s18 14 28 8" stroke="#3E63A0" strokeWidth="2.4" strokeLinecap="round" />
          {/* Live pips */}
          <circle cx="94" cy="42" r="3.4" fill="#D97F00" />
          <circle cx="126" cy="56" r="3.4" fill="#22C55E" />
          <circle cx="70" cy="58" r="3.4" fill="#BFD3EE" />
          {/* Stand */}
          <rect x="92" y="84" width="16" height="9" fill="#3E63A0" />
          <rect x="80" y="93" width="40" height="4" rx="2" fill="#3E63A0" />
        </g>

        {/* Fleet pips on the ground grid */}
        <g>
          <g transform="translate(64 104)">
            <rect width="20" height="10" rx="2.5" fill="#F1F5FB" />
            <rect x="15" y="2.25" width="3.5" height="3.5" rx="1" fill="#D97F00" />
          </g>
          <g transform="translate(114 110)">
            <rect width="20" height="10" rx="2.5" fill="#BFD3EE" />
            <rect x="15" y="2.25" width="3.5" height="3.5" rx="1" fill="#D97F00" />
          </g>
        </g>

        {/* Signal arcs */}
        <g
          className="motion-safe:animate-pin-pulse"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          stroke="#D97F00"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M158 34a12 12 0 0 1 0 16" opacity="0.9" />
          <path d="M165 28a21 21 0 0 1 0 28" opacity="0.5" />
        </g>
      </svg>
    </IsoStage>
  );
}
