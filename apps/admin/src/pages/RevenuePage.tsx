import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { RevenueSummary, District } from "@sbt/shared-types";

interface BarBarProps { label: string; value: number; max: number; }
function HBar({ label, value, max }: BarBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-slate-600 dark:text-slate-400">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
        ₹{value.toLocaleString("en-IN")}
      </span>
    </div>
  );
}

export function RevenuePage() {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load districts for Master Admin filter
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
      const { data: result, error: err } = await supabase.rpc("get_revenue_summary", {
        p_district_id: selectedDistrict || null,
        p_from_date:   fromDate,
        p_to_date:     toDate,
      });
      if (err) throw err;
      setData(result as RevenueSummary);
    } catch (e: any) {
      setError(e.message ?? "Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  }, [selectedDistrict, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  const maxRouteRevenue = Math.max(...(data?.route_revenue ?? []).map(r => r.revenue), 1);
  const maxMonthRevenue = Math.max(...(data?.monthly_data ?? []).map(m => m.revenue), 1);

  const monthlyData = data?.monthly_data ?? [];
  const routeRevenue = data?.route_revenue ?? [];
  const totalRevenue = data?.total_revenue ?? 0;
  const totalTickets = data?.total_tickets ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Revenue Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">District-level financial overview from ticket sales.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          {districts.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">District</label>
              <select
                value={selectedDistrict}
                onChange={e => setSelectedDistrict(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">All Districts</option>
                {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading revenue data…</div>
      ) : !data ? null : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                ₹{totalRevenue.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Tickets Sold</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {totalTickets.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Avg. Revenue / Ticket</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                ₹{totalTickets > 0 ? Math.round(totalRevenue / totalTickets).toLocaleString("en-IN") : "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Monthly trend */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Monthly Revenue Trend</h2>
              {monthlyData.length === 0 ? (
                <p className="text-sm text-slate-400">No data for this period.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {monthlyData.map(m => (
                    <HBar key={m.month} label={m.month} value={m.revenue} max={maxMonthRevenue} />
                  ))}
                </div>
              )}
            </div>

            {/* Revenue by route */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Revenue by Route</h2>
              {routeRevenue.length === 0 ? (
                <p className="text-sm text-slate-400">No route data for this period.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {routeRevenue.slice(0, 10).map(r => (
                    <HBar
                      key={r.route}
                      label={`${r.number} · ${r.route}`}
                      value={r.revenue}
                      max={maxRouteRevenue}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Ticket breakdown table */}
          {monthlyData.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    {["Month", "Tickets", "Revenue"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {monthlyData.map(m => (
                    <tr key={m.month} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{m.month}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">{(m.tickets ?? 0).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                        ₹{(m.revenue ?? 0).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
