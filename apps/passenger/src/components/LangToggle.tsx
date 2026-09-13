import { useI18n } from "../lib/i18n";

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div className={`inline-flex rounded-full bg-slate-900/80 p-0.5 border border-white/20 backdrop-blur shadow-sm ${className || ""}`}>
      <button
        type="button"
        aria-label="English"
        onClick={() => setLang("en")}
        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all ${
          lang === "en" ? "bg-[#D97F00] text-navy-950 shadow-sm" : "text-slate-300 hover:text-white"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        aria-label="Tamil"
        onClick={() => setLang("ta")}
        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all ${
          lang === "ta" ? "bg-[#D97F00] text-navy-950 shadow-sm" : "text-slate-300 hover:text-white"
        }`}
      >
        TA
      </button>
    </div>
  );
}
