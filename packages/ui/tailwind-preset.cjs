/**
 * Shared Tailwind design tokens for all three PWAs. Each app's
 * tailwind.config.ts does `presets: [require("@sbt/ui/tailwind-preset")]`.
 *
 * Palette: deep navy (#0D2A5D) as the dominant/structural color, amber
 * (#D97F00) as the single accent for active state, indicators, progress
 * and key CTAs.
 *
 * CONTRAST NOTE (this is why there are two ambers):
 *   #D97F00 on white  = 2.99:1  -> fails WCAG AA for text (needs 4.5:1)
 *   #D97F00 on navy   = 4.68:1  -> passes AA for text
 *   white   on navy   = 14.0:1  -> passes AAA
 * So `brand.500` (#D97F00) is used for NON-TEXT purposes on light surfaces
 * — icons, fills, borders, progress bars, large display type — where the
 * 3:1 threshold for UI components/graphical objects applies, and for text
 * on navy where it genuinely passes. For amber-colored *body text* on a
 * light background, use `brand.ink` (#8F5000, 6.5:1 on white) instead.
 * Picking the visually-identical-looking token in the wrong place is the
 * easiest way to silently fail an audit, hence the explicit naming.
 */
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          light: "#F8FAFC",
          // True black is retained for the Conductor app specifically: it's
          // an OLED battery-life requirement (Pocket Mode), not a style
          // preference. `slate.deep` below is the softer dark-surface color
          // for Passenger/Admin dark mode.
          dark: "#050E1F",
          oled: "#000000",
        },
        surface: {
          light: "#FFFFFF",
          dark: "#0A1F45",
          deep: "#071735",
        },
        border: {
          light: "#E2E8F0",
          dark: "#13294F",
        },
        navy: {
          50: "#EEF3FA",
          100: "#D6E2F2",
          200: "#A9C0E0",
          300: "#7295C9",
          400: "#3E63A0",
          500: "#1B4079",
          600: "#0D2A5D", // primary
          700: "#0A1F45",
          800: "#071735",
          900: "#050E1F",
        },
        brand: {
          50: "#FFF7EB",
          100: "#FFEAC9",
          200: "#FFD28E",
          300: "#F7B24D",
          400: "#E89620",
          500: "#D97F00", // accent — indicators/fills/large type only on light
          600: "#B36400",
          700: "#8F5000",
          800: "#6B3C00",
          900: "#4A2A00",
          /** Text-safe amber for light backgrounds (6.5:1 on white). */
          ink: "#8F5000",
        },
        danger: { 500: "#EF4444", 600: "#DC2626" },
        warning: { 500: "#F59E0B", 600: "#D97706" },
        success: { 500: "#22C55E", 600: "#16A34A" },
        sos: { 500: "#DC2626", 600: "#B91C1C" },
      },
      borderRadius: {
        card: "1rem",
        pill: "9999px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      backgroundImage: {
        "dot-grid": "radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)",
        "navy-depth": "linear-gradient(160deg, #0D2A5D 0%, #071735 100%)",
        "amber-sheen": "linear-gradient(120deg, #D97F00 0%, #F7B24D 50%, #D97F00 100%)",
      },
      boxShadow: {
        // Subtle border-glow treatments, not neon.
        "glow-amber": "0 0 0 1px rgba(217,127,0,0.35), 0 8px 24px -8px rgba(217,127,0,0.45)",
        "glow-navy": "0 0 0 1px rgba(13,42,93,0.15), 0 12px 32px -12px rgba(7,23,53,0.55)",
        glass: "0 8px 32px -12px rgba(5,14,31,0.45)",
      },
      keyframes: {
        "logo-draw": {
          "0%": { strokeDashoffset: "var(--dash)" },
          "70%,100%": { strokeDashoffset: "0" },
        },
        "pin-pulse": {
          "0%,100%": { opacity: "1", transform: "translate3d(0,0,0) scale(1)" },
          "50%": { opacity: "0.55", transform: "translate3d(0,-8%,0) scale(1.08)" },
        },
        "road-dash": {
          "0%": { transform: "translate3d(0,0,0)" },
          "100%": { transform: "translate3d(-32px,0,0)" },
        },
        "bus-bob": {
          "0%,100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-2px,0)" },
        },
        // 5px, not 10px: IsoStage clips overflow (so a scene can never cover
        // the controls beneath it), and the SVG letterboxes to exactly fill
        // its box height — so the float has to stay inside the scene's own
        // internal margin or the top/bottom edges visibly clip.
        "iso-float": {
          "0%,100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-5px,0)" },
        },
        "sheen-slide": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
      },
      animation: {
        "pin-pulse": "pin-pulse 1.6s cubic-bezier(0.4,0,0.2,1) infinite",
        "road-dash": "road-dash 0.6s linear infinite",
        "bus-bob": "bus-bob 1.2s cubic-bezier(0.4,0,0.2,1) infinite",
        "iso-float": "iso-float 6s cubic-bezier(0.4,0,0.2,1) infinite",
        "sheen-slide": "sheen-slide 3s linear infinite",
      },
      transitionTimingFunction: {
        transit: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
