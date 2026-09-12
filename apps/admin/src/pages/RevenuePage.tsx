import { useEffect, useState, useCallback, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../lib/supabase";
import type { District } from "@sbt/shared-types";
import {
  StatCard,
  Card,
  Button,
  DollarSignIcon,
  CalendarIcon,
  DownloadIcon,
  FilterIcon,
  BusIcon,
  RouteIcon,
  ActivityIcon,
} from "@sbt/ui";

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
  const [presetRange, setPresetRange] = useState<"7" | "30" | "90" | "custom">("30");

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const thirtyDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  }, []);

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("districts")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data: d }) => setDistricts(d ?? []));
  }, []);

  const handlePresetChange = (preset: "7" | "30" | "90" | "custom") => {
    setPresetRange(preset);
    if (preset !== "custom") {
      const days = parseInt(preset, 10);
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await supabase.rpc("get_revenue_analytics", {
        p_district_id: selectedDistrict || null,
        p_start_date: startDate,
        p_end_date: endDate,
        p_group_by: groupBy,
      });

      if (err) throw err;
      setAnalytics(result as AnalyticsResult);
    } catch (e: any) {
      setError(e.message ?? "Failed to load revenue analytics");
    } finally {
      setLoading(false);
    }
  }, [selectedDistrict, groupBy, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxRevenue = Math.max(...(analytics?.breakdown ?? []).map((b) => Number(b.total_revenue)), 1);

  // Compute Cash vs Digital totals
  const { totalCash, totalDigital } = useMemo(() => {
    let cash = 0;
    let digital = 0;
    (analytics?.breakdown ?? []).forEach((b) => {
      if (b.cash_revenue != null) cash += Number(b.cash_revenue);
      if (b.digital_revenue != null) digital += Number(b.digital_revenue);
    });
    return { totalCash: cash, totalDigital: digital };
  }, [analytics]);

  const digitalRatio = (totalCash + totalDigital) > 0 ? Math.round((totalDigital / (totalCash + totalDigital)) * 100) : 0;

  // Export PDF with Nigazhthisai Brand
  const handleExportPdf = () => {
    const doc = new jsPDF();

    // Top Header Banner
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 32, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("NIGAZHTHISAI TRANSIT SYSTEMS", 14, 14);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text("Transit Operations & Financial Revenue Audit Report", 14, 22);

    // Metadata summary block
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text("EXECUTIVE AUDIT SUMMARY", 14, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Reporting Period: ${startDate} to ${endDate}`, 14, 49);
    const distName = selectedDistrict ? districts.find((d) => d.id === selectedDistrict)?.name : "All Operating Districts";
    doc.text(`District Scope: ${distName || "All Districts"}`, 14, 55);
    doc.text(`Generated At: ${new Date().toLocaleString("en-IN")}`, 14, 61);

    doc.text(`Total Revenue: Rs. ${(analytics?.total_revenue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 120, 49);
    doc.text(`Total Tickets Issued: ${(analytics?.total_tickets ?? 0).toLocaleString("en-IN")}`, 120, 55);
    doc.text(
      `Average Fare: Rs. ${(analytics?.total_tickets ? (analytics.total_revenue / analytics.total_tickets) : 0).toFixed(2)}`,
      120,
      61
    );

    // Breakdown Table Data
    const tableData = (analytics?.breakdown ?? []).map((item) => [
      item.label,
      item.tickets_count.toString(),
      item.cash_revenue != null ? `Rs. ${Number(item.cash_revenue).toLocaleString("en-IN")}` : "—",
      item.digital_revenue != null ? `Rs. ${Number(item.digital_revenue).toLocaleString("en-IN")}` : "—",
      `Rs. ${Number(item.total_revenue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);

    autoTable(doc, {
      startY: 70,
      head: [[`${groupBy.toUpperCase()} IDENTIFIER`, "TICKETS", "CASH FARE", "DIGITAL FARE", "NET REVENUE"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    // Footer with Page Numbers
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(140);
      doc.text(
        `Nigazhthisai Smart Transit Platform — Operational & Revenue Audit — Page ${i} of ${pageCount}`,
        14,
        287
      );
    }

    doc.save(`Nigazhthisai_Revenue_Audit_${startDate}_to_${endDate}.pdf`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DollarSignIcon className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Revenue & Financial Audits
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time financial breakdown, custom date range filtering, digital fare analytics, and branded audit PDF export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export PDF Button */}
          <Button
            size="sm"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <DownloadIcon className="h-4 w-4" />
            <span>Export Nigazhthisai PDF</span>
          </Button>
        </div>
      </div>

      {/* Date Range & District Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-[#112240]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Buttons */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
            {(["7", "30", "90", "custom"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetChange(preset)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  presetRange === preset
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                {preset === "custom" ? "Custom Range" : `${preset} Days`}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-medium">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPresetRange("custom");
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="font-medium">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPresetRange("custom");
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        {/* District Jurisdiction Select */}
        <div className="flex items-center gap-1.5">
          <FilterIcon className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">All Operating Districts</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-semibold">
          {error}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Net Revenue"
          value={`₹${(analytics?.total_revenue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
        />
        <StatCard
          label="Total Tickets Issued"
          value={(analytics?.total_tickets ?? 0).toLocaleString("en-IN")}
        />
        <StatCard
          label="Average Ticket Fare"
          value={`₹${(analytics?.total_tickets ? analytics.total_revenue / analytics.total_tickets : 0).toFixed(2)}`}
        />
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#112240]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Digital Fare Adoption</span>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{digitalRatio}%</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${digitalRatio}%` }} />
          </div>
        </div>
      </div>

      {/* Visual Analytics Chart Section */}
      <Card className="p-5 border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Interactive Revenue Distribution ({groupBy.toUpperCase()})
            </h2>
            <p className="text-xs text-slate-500">
              Visual comparisons across segments. Hover bars to inspect exact collections.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
              <span>Total Revenue</span>
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">Generating visual analytics…</div>
        ) : (analytics?.breakdown.length ?? 0) === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">No revenue data available for selected parameters.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Visual SVG Bar Chart */}
            <div className="h-44 w-full flex items-end gap-2 pt-6 pb-2 px-2 bg-slate-50/50 rounded-lg dark:bg-slate-900/30 overflow-x-auto">
              {analytics?.breakdown.map((item, idx) => {
                const heightPct = maxRevenue > 0 ? Math.max(Math.round((Number(item.total_revenue) / maxRevenue) * 100), 4) : 4;
                const isHovered = hoveredIndex === idx;

                return (
                  <div
                    key={item.group_key}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="flex-1 min-w-[36px] flex flex-col items-center gap-1 group relative cursor-pointer"
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-12 z-20 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] text-white shadow-lg dark:bg-white dark:text-slate-900 pointer-events-none">
                        <p className="font-bold">{item.label}</p>
                        <p>₹{Number(item.total_revenue).toLocaleString("en-IN")} · {item.tickets_count} tix</p>
                      </div>
                    )}
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        isHovered ? "bg-brand-500 shadow-sm" : "bg-brand-600/80 hover:bg-brand-500"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[10px] text-slate-500 font-medium truncate w-full text-center">
                      {item.label.slice(0, 7)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Breakdown Dimension Tabs & Detailed Table */}
      <div className="flex flex-col gap-4">
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
          {[
            { key: "day", label: "By Day", icon: CalendarIcon },
            { key: "bus", label: "By Bus", icon: BusIcon },
            { key: "route", label: "By Route", icon: RouteIcon },
            { key: "concession", label: "By Concession", icon: FilterIcon },
            { key: "payment_method", label: "By Payment Method", icon: DollarSignIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setGroupBy(tab.key as any)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition ${
                  groupBy === tab.key
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <Card className="p-5 border-slate-200 dark:border-slate-800">
          <div className="flex flex-col gap-3">
            {loading ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading breakdown rows…</div>
            ) : (analytics?.breakdown.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">No records found.</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {analytics?.breakdown.map((item) => {
                  const pct = maxRevenue > 0 ? Math.round((Number(item.total_revenue) / maxRevenue) * 100) : 0;
                  return (
                    <div
                      key={item.group_key}
                      className="flex flex-col gap-1.5 py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                    >
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
          </div>
        </Card>
      </div>
    </div>
  );
}
