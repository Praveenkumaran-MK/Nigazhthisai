import { useEffect, useState } from "react";
import { Button, Alert, Card, useToast, BusIcon, UserIcon, RouteIcon, MapPinIcon, FileTextIcon, ActivityIcon } from "@sbt/ui";
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

  // Form state
  const [authorityName, setAuthorityName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [isPaymentsEnabled, setIsPaymentsEnabled] = useState(true);
  const [supportPhone, setSupportPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, distRes, busRes, condRes, routeRes, stopRes, tktRes] = await Promise.all([
        supabase.from("transport_authority_config").select("*").limit(1).maybeSingle(),
        supabase.from("districts").select("id", { count: "exact", head: true }),
        supabase.from("buses").select("id", { count: "exact", head: true }),
        supabase.from("conductors").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
        supabase.from("stops").select("id", { count: "exact", head: true }),
        supabase.from("tickets").select("id", { count: "exact", head: true }),
      ]);

      if (cfgRes.error) throw new Error(cfgRes.error.message);

      const c = cfgRes.data as AuthorityConfig | null;
      if (c) {
        setConfig(c);
        setAuthorityName(c.authority_name ?? "");
        setUpiId(c.upi_id ?? "");
        setIsPaymentsEnabled(c.is_payments_enabled ?? true);
        setSupportPhone(c.support_phone ?? "");
        setSupportEmail(c.support_email ?? "");
      }

      setStats({
        totalDistricts: distRes.count ?? 0,
        totalBuses: busRes.count ?? 0,
        totalConductors: condRes.count ?? 0,
        totalRoutes: routeRes.count ?? 0,
        totalStops: stopRes.count ?? 0,
        totalTickets: tktRes.count ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        authority_name: authorityName.trim() || null,
        upi_id: upiId.trim(),
        is_payments_enabled: isPaymentsEnabled,
        support_phone: supportPhone.trim() || null,
        support_email: supportEmail.trim() || null,
      };

      const { error: err } = config?.id
        ? await supabase.from("transport_authority_config").update(payload).eq("id", config.id)
        : await supabase.from("transport_authority_config").insert(payload);

      if (err) throw new Error(err.message);

      push({ tone: "success", title: "Configuration saved", description: "System settings updated successfully." });
      await load();
    } catch (e) {
      push({ tone: "danger", title: "Save failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setSaving(false);
    }
  };

  const statCards = stats
    ? [
        { label: "Districts", value: stats.totalDistricts, icon: MapPinIcon },
        { label: "Buses", value: stats.totalBuses, icon: BusIcon },
        { label: "Conductors", value: stats.totalConductors, icon: UserIcon },
        { label: "Routes", value: stats.totalRoutes, icon: RouteIcon },
        { label: "Stops", value: stats.totalStops, icon: MapPinIcon },
        { label: "Tickets Issued", value: stats.totalTickets, icon: FileTextIcon },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">System Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nigazhthisai Transit Authority configuration. Changes apply system-wide.
        </p>
      </div>

      {/* System-wide stats */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          System Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-brand-600 dark:text-brand-400">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{s.value.toLocaleString("en-IN")}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
              </Card>
            );
          })}
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
                    {isPaymentsEnabled
                      ? "Passengers can buy digital tickets via UPI."
                      : "Payments are disabled — conductors issue cash tickets only."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPaymentsEnabled}
                  onClick={() => setIsPaymentsEnabled((v: boolean) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    isPaymentsEnabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      isPaymentsEnabled ? "translate-x-5" : "translate-x-0.5"
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
