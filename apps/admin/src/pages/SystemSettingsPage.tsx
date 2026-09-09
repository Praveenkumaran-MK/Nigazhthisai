import { useEffect, useState } from "react";
import { Button, Alert, Card, useToast } from "@sbt/ui";
import { supabase } from "../lib/supabase";

interface AuthorityConfig {
  id: string;
  authority_name: string | null;
  upi_id: string;
  is_payments_enabled: boolean;
  support_phone: string | null;
  support_email: string | null;
  updated_at: string;
}

interface SystemStats {
  totalDistricts: number;
  totalBuses: number;
  totalConductors: number;
  totalRoutes: number;
  totalStops: number;
  totalTickets: number;
}

export function SystemSettingsPage() {
  const { push } = useToast();
  const [config, setConfig] = useState<AuthorityConfig | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [authorityName, setAuthorityName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [supportPhone, setSupportPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [configRes, distRes, busRes, condRes, routeRes, stopRes, ticketRes] = await Promise.all([
          supabase.from("transport_authority_config").select("*").maybeSingle(),
          supabase.from("districts").select("id", { count: "exact", head: true }),
          supabase.from("buses").select("id", { count: "exact", head: true }),
          supabase.from("conductors").select("id", { count: "exact", head: true }),
          supabase.from("routes").select("id", { count: "exact", head: true }),
          supabase.from("stops").select("id", { count: "exact", head: true }),
          supabase.from("tickets").select("id", { count: "exact", head: true }),
        ]);

        const cfg = configRes.data as AuthorityConfig | null;
        setConfig(cfg);
        if (cfg) {
          setAuthorityName(cfg.authority_name ?? "");
          setUpiId(cfg.upi_id ?? "");
          setPaymentsEnabled(cfg.is_payments_enabled ?? false);
          setSupportPhone(cfg.support_phone ?? "");
          setSupportEmail(cfg.support_email ?? "");
        }

        setStats({
          totalDistricts: distRes.count ?? 0,
          totalBuses: busRes.count ?? 0,
          totalConductors: condRes.count ?? 0,
          totalRoutes: routeRes.count ?? 0,
          totalStops: stopRes.count ?? 0,
          totalTickets: ticketRes.count ?? 0,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };
    void loadAll();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        authority_name: authorityName.trim() || null,
        upi_id: upiId.trim(),
        is_payments_enabled: paymentsEnabled,
        support_phone: supportPhone.trim() || null,
        support_email: supportEmail.trim() || null,
      };

      const { error: saveErr } = config?.id
        ? await supabase.from("transport_authority_config").update(payload).eq("id", config.id)
        : await supabase.from("transport_authority_config").insert(payload);

      if (saveErr) throw new Error(saveErr.message);
      push({ tone: "success", title: "Settings saved", description: "System configuration updated." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
      push({ tone: "danger", title: "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const statCards = stats
    ? [
        { label: "Districts", value: stats.totalDistricts, icon: "🗺️" },
        { label: "Buses", value: stats.totalBuses, icon: "🚌" },
        { label: "Conductors", value: stats.totalConductors, icon: "👤" },
        { label: "Routes", value: stats.totalRoutes, icon: "🛣️" },
        { label: "Stops", value: stats.totalStops, icon: "📍" },
        { label: "Tickets Issued", value: stats.totalTickets, icon: "🎫" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">System Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          State Transit Authority configuration. Changes apply system-wide.
        </p>
      </div>

      {/* System-wide stats */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          System Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((s) => (
            <Card key={s.label} className="flex flex-col items-center gap-1 p-4 text-center">
              <span className="text-2xl">{s.icon}</span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{s.value.toLocaleString("en-IN")}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Config form */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Transport Authority Configuration
        </h2>
        <Card className="max-w-xl">
          {loading ? (
            <p className="text-sm text-slate-500">Loading configuration…</p>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-4">

              {/* Authority name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Authority Name
                </label>
                <input
                  type="text"
                  value={authorityName}
                  onChange={(e) => setAuthorityName(e.target.value)}
                  placeholder="e.g. Tamil Nadu State Transport Corporation"
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* UPI ID */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  UPI ID (for ticket payments)
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="transit-authority@upi"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-400">
                  This is re-validated server-side on every ticket purchase.
                </p>
              </div>

              {/* Support */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Support Phone
                  </label>
                  <input
                    type="tel"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="+91-XXXXX-XXXXX"
                    className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Support Email
                  </label>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="support@transit.gov.in"
                    className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Payments toggle */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Online Ticket Payments</p>
                  <p className="text-xs text-slate-500">
                    {paymentsEnabled
                      ? "Passengers can buy digital tickets via UPI."
                      : "Payments are disabled — conductors issue cash tickets only."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={paymentsEnabled}
                  onClick={() => setPaymentsEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    paymentsEnabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      paymentsEnabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {error && (
                <Alert tone="danger" title="Error">{error}</Alert>
              )}

              <div className="flex justify-end">
                <Button type="submit" isLoading={saving}>
                  Save settings
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>

      {/* Last updated */}
      {config?.updated_at && (
        <p className="text-xs text-slate-400">
          Last updated: {new Date(config.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </div>
  );
}
