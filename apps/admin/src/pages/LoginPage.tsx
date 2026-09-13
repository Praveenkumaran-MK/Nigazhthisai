import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, BrandLogo } from "@sbt/ui";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useAdminI18n } from "../lib/i18n";
import { Mail, Lock, ArrowRight } from "lucide-react";

export function LoginPage() {
  const { login, error, status } = useAdminAuth();
  const { lang, setLang, t } = useAdminI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === "signed-in") {
      navigate("/dashboard", { replace: true });
    }
  }, [status, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email.trim(), password);
    } catch {
      /* error surfaced via useAdminAuth().error */
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-tr from-slate-100 via-[#F0F4FA] to-slate-200 p-6">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl shadow-navy-950/10 border border-slate-100 flex flex-col gap-6">
        {/* Language Switcher in Login Card */}
        <div className="absolute top-6 right-6 inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200/60">
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
              lang === "en"
                ? "bg-[#0D2A5D] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang("ta")}
            className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
              lang === "ta"
                ? "bg-[#0D2A5D] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            TA
          </button>
        </div>

        {/* Logo & Portal Branding */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D2A5D]/5 border border-[#0D2A5D]/10 mb-3 shadow-sm">
            <BrandLogo variant="mark" tone="navy" className="h-9 w-9" />
          </div>
          <h1 className="text-xl font-extrabold tracking-wider text-[#0D2A5D]">
            {t("NIGAZHTHISAI")}
          </h1>
          <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            {t("MANAGEMENT PORTAL")}
          </p>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t("EMAIL ADDRESS")}
            </label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="admin@nigazhthisai.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#D97F00] focus:ring-4 focus:ring-[#D97F00]/10 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t("PASSWORD")}
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#D97F00] focus:ring-4 focus:ring-[#D97F00]/10 focus:outline-none transition-all"
              />
            </div>
          </div>

          {error && <Alert tone="danger" title="Login failed">{error}</Alert>}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-[#0D2A5D] hover:bg-[#0A2149] text-white font-bold text-xs uppercase tracking-wider py-3 shadow-lg shadow-[#0D2A5D]/20 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <span>{isLoading ? t("SIGNING IN…") : t("SIGN IN")}</span>
            {!isLoading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {t("FORGOT PASSWORD? CONTACT ADMINISTRATOR")}
        </p>
      </div>
    </div>
  );
}
