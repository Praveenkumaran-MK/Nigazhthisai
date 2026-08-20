export interface BusIllustrationProps {
  className?: string;
}

/**
 * A detailed, colorful bus illustration (not a plain line icon) for hero
 * sections and empty states — matching the reference app's illustrated
 * (rather than purely iconographic) visual style. Pure inline SVG, no
 * image asset, so it themes cleanly and costs nothing to load.
 */
export function BusIllustration({ className }: BusIllustrationProps) {
  return (
    <svg viewBox="0 0 200 140" fill="none" className={className} aria-hidden="true">
      {/* Ground shadow */}
      <ellipse cx="100" cy="128" rx="78" ry="8" fill="black" opacity="0.12" />

      {/* Body */}
      <rect x="16" y="30" width="168" height="76" rx="18" fill="#eafaf7" />
      <rect x="16" y="30" width="168" height="76" rx="18" stroke="#174945" strokeOpacity="0.08" strokeWidth="2" />

      {/* Roof accent stripe */}
      <path d="M20 46h160" stroke="#2fa89a" strokeWidth="6" strokeLinecap="round" />

      {/* Windshield + destination board */}
      <rect x="150" y="40" width="26" height="30" rx="6" fill="#0a1528" />
      <rect x="154" y="45" width="18" height="7" rx="2" fill="#45c2b1" />

      {/* Passenger windows */}
      <rect x="28" y="40" width="26" height="26" rx="6" fill="#0a1528" />
      <rect x="60" y="40" width="26" height="26" rx="6" fill="#0a1528" />
      <rect x="92" y="40" width="26" height="26" rx="6" fill="#0a1528" />
      <rect x="124" y="40" width="18" height="26" rx="6" fill="#0a1528" />

      {/* Door */}
      <rect x="20" y="76" width="16" height="24" rx="3" fill="#ffffff" stroke="#2fa89a" strokeWidth="2" />
      <line x1="28" y1="78" x2="28" y2="98" stroke="#2fa89a" strokeWidth="2" />

      {/* Route badge */}
      <rect x="146" y="80" width="30" height="16" rx="4" fill="#152647" />
      <text x="161" y="91.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ffffff" fontFamily="inherit">
        12A
      </text>

      {/* Headlight + bumper */}
      <circle cx="180" cy="92" r="4" fill="#ffd166" />
      <rect x="16" y="98" width="168" height="6" rx="3" fill="#174945" opacity="0.15" />

      {/* Wheels */}
      <circle cx="56" cy="110" r="14" fill="#0a1528" />
      <circle cx="56" cy="110" r="5.5" fill="#eafaf7" />
      <circle cx="150" cy="110" r="14" fill="#0a1528" />
      <circle cx="150" cy="110" r="5.5" fill="#eafaf7" />
    </svg>
  );
}
