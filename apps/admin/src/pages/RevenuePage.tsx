import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { District } from "@sbt/shared-types";
import { StatCard, Card } from "@sbt/ui";

interface BreakdownItem {
  group_key: string;
  label: string;
  total_revenue: number;
  tickets_count: number;
  cash_revenue?: number;
  digital_revenue?: number;
  bus_number?: string;
  bus_type?: string;
  route_code?: string;
}

interface AnalyticsResult {
  start_date: string;
  end_date: string;
  group_by: string;
  district_id: string | null;
  total_revenue: number;
  total_tickets: number;
  breakdown: BreakdownItem[];
}

export function RevenuePage() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [groupBy, setGroupBy] = useState<"day" | "bus" | "route" | "concession" | "payment_method">("day");
  const [dateRange, setDateRange] = useState<"7" | "30" | "90">("30");
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("districts")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data: d }) => setDistricts(d ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = parseInt(dateRange, 10);
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);

      const { data: result, error: err } = await supabase.rpc("get_revenue_analytics", {
        p_district_id: selectedDistrict || null,
        p_start_date: start.toISOString().split("T")[0],
        p_end_date: end.toISOString().split("T")[0],
        p_group_by: groupBy,
      });

      if (err) throw err;
      setAnalytics(result as AnalyticsResult);
    } catch (e: any) {
      setError(e.message ?? "Failed to load revenue analytics");
    } finally {
      setLoading(false);
    }
  }, [selectedDistrict, groupBy, dateRange]);

  useEffect(() => { void load(); }, [load]);

  const maxRevenue = Math.max(...(analytics?.breakdown ?? []).map((b) => Number(b.total_revenue)), 1);

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Revenue & Fare Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time financial breakdown across buses, dates, routes, and concessions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {districts.length > 0 && (
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">All Districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Net Revenue"
          value={`₹${(analytics?.total_revenue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
        />
        <StatCard
          label="Total Tickets Sold"
          value={analytics?.total_tickets ?? 0}
        />
        <StatCard
          label="Average Fare / Ticket"
          value={`₹${(analytics?.total_tickets ? (analytics.total_revenue / analytics.total_tickets) : 0).toFixed(2)}`}
        />
      </div>

      {/* Breakdown Dimension Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        {[
          { key: "day", label: "📅 By Day" },
          { key: "bus", label: "🚌 By Bus" },
          { key: "route", label: "🛣️ By Route" },
          { key: "concession", label: "🎓 By Concession" },
          { key: "payment_method", label: "💳 By Payment Method" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setGroupBy(tab.key as any)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              groupBy === tab.key
                ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Breakdown Table & Visual Bars */}
      <Card className="p-5 border-slate-200 dark:border-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
          Revenue Breakdown ({groupBy.toUpperCase()})
        </h2>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading breakdown data…</div>
        ) : (analytics?.breakdown.length ?? 0) === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No revenue records found for this period.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {analytics?.breakdown.map((item) => {
              const pct = maxRevenue > 0 ? Math.round((Number(item.total_revenue) / maxRevenue) * 100) : 0;
              return (
                <div key={item.group_key} className="flex flex-col gap-1 py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">{item.tickets_count} tickets</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        ₹{Number(item.total_revenue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-brand-600 dark:bg-brand-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
