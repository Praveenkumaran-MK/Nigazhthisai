import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { Bus, BusQrResult, District } from "@sbt/shared-types";
import QRCode from "qrcode";
import { BusIcon, DownloadIcon } from "@sbt/ui";
import { Printer, Copy, Check } from "lucide-react";

interface BusWithQr extends Bus {
  district_name?: string;
}

export function BusQrPage() {
  const [buses, setBuses] = useState<BusWithQr[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDistrict, setFilterDistrict] = useState("");
  const [filterWheelchair, setFilterWheelchair] = useState(false);
  const [search, setSearch] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [qrPreviews, setQrPreviews] = useState<Record<string, string>>({}); // bus_id → data URL
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("buses")
        .select("*, districts(name)")
        .order("bus_number");
      if (err) throw err;

      setBuses(
        (data ?? []).map((b: any) => ({
          ...b,
          district_name: b.districts?.name ?? null,
        }))
      );

      const { data: distData } = await supabase
        .from("districts")
        .select("*")
        .eq("is_active", true)
        .order("name");
      setDistricts(distData ?? []);

      // Pre-render QR images for buses that already have a QR payload
      const previews: Record<string, string> = {};
      await Promise.all(
        (data ?? [])
          .filter((b: any) => b.bus_qr_payload && b.bus_qr_signature)
          .map(async (b: any) => {
            const qrString = `${b.bus_qr_payload}.${b.bus_qr_signature}`;
            previews[b.id] = await QRCode.toDataURL(qrString, { width: 180, margin: 1 });
          })
      );
      setQrPreviews(previews);
    } catch (e: any) {
      setError(e.message ?? "Failed to load buses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleGenerate = async (bus: BusWithQr) => {
    setGeneratingId(bus.id);
    try {
      const { data, error: err } = await supabase.rpc("generate_bus_qr", { p_bus_id: bus.id });
      if (err) throw err;
      const result = data as BusQrResult;
      const dataUrl = await QRCode.toDataURL(result.qr_string, { width: 180, margin: 1 });
      setQrPreviews(prev => ({ ...prev, [bus.id]: dataUrl }));
      // Update local state with new QR fields
      setBuses(prev =>
        prev.map(b =>
          b.id === bus.id
            ? { ...b, bus_qr_payload: result.qr_payload, bus_qr_signature: result.qr_signature, qr_generated_at: result.generated_at }
            : b
        )
      );
    } catch (e: any) {
      alert("Failed to generate QR: " + (e.message ?? "Unknown error"));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDownload = (bus: BusWithQr) => {
    const dataUrl = qrPreviews[bus.id];
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `bus-qr-${bus.bus_number.replace(/\s+/g, "-")}.png`;
    a.click();
  };

  const handlePrint = (bus: BusWithQr) => {
    const dataUrl = qrPreviews[bus.id];
    if (!dataUrl) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Bus QR — ${bus.bus_number}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:2rem}h2{margin-bottom:.5rem}p{font-size:.85rem;color:#555}</style>
      </head><body>
        <h2>Bus ${bus.bus_number}</h2>
        <p>${bus.registration_number ?? ""} · ${bus.district_name ?? ""} · ${bus.type}</p>
        <img src="${dataUrl}" style="width:200px;height:200px"/>
        <p style="margin-top:.5rem;font-size:.75rem;color:#999">Scan to verify bus identity before starting a trip</p>
      </body></html>
    `);
    w.print();
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = async (bus: BusWithQr) => {
    const code = bus.bus_qr_payload && bus.bus_qr_signature
      ? `${bus.bus_qr_payload}.${bus.bus_qr_signature}`
      : bus.bus_number;
    await navigator.clipboard.writeText(code);
    setCopiedId(bus.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = buses.filter(b => {
    if (filterDistrict && b.district_id !== filterDistrict) return false;
    if (filterWheelchair && !b.is_wheelchair_accessible) return false;
    if (search && !b.bus_number.toLowerCase().includes(search.toLowerCase()) &&
        !(b.registration_number ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Bus QR Codes</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Generate and print cryptographic QR codes for each bus. Conductors scan these at trip start to verify bus identity.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search bus number / reg…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-52 rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          value={filterDistrict}
          onChange={e => setFilterDistrict(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">All Districts</option>
          {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={filterWheelchair}
            onChange={e => setFilterWheelchair(e.target.checked)}
            className="rounded"
          />
          Wheelchair Accessible only
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading fleet…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No buses match the current filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(bus => (
            <div
              key={bus.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {/* Bus header */}
              <div className="flex items-start justify-between p-4 pb-2">
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-1.5">
                    <BusIcon className="h-4 w-4 text-brand-600" />
                    <span>{bus.bus_number}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {bus.registration_number ?? "No Reg"} · {bus.type}
                    {bus.is_wheelchair_accessible && <span className="ml-1 text-[10px] font-semibold text-emerald-600">Accessible</span>}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{bus.district_name ?? "—"}</p>
                </div>
                {bus.qr_generated_at && (
                  <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-semibold">
                    QR ✓
                  </span>
                )}
              </div>

              {/* QR preview */}
              <div className="flex items-center justify-center p-3">
                {qrPreviews[bus.id] ? (
                  <img
                    src={qrPreviews[bus.id]}
                    alt={`QR for bus ${bus.bus_number}`}
                    className="rounded-lg w-36 h-36 object-contain border border-slate-100"
                  />
                ) : (
                  <div className="flex w-36 h-36 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-600">
                    <span className="text-xs text-slate-400 text-center px-2">No QR generated yet</span>
                  </div>
                )}
              </div>

              {bus.qr_generated_at && (
                <p className="px-4 pb-1 text-center text-[10px] text-slate-400">
                  Generated {new Date(bus.qr_generated_at).toLocaleDateString()}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 p-4 pt-2 mt-auto">
                <button
                  onClick={() => handleGenerate(bus)}
                  disabled={generatingId === bus.id}
                  className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  {generatingId === bus.id ? "Generating…" : bus.qr_generated_at ? "Regenerate" : "Generate QR"}
                </button>
                {qrPreviews[bus.id] && (
                  <>
                    <button
                      onClick={() => handleDownload(bus)}
                      title="Download PNG"
                      className="rounded-lg border border-slate-300 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handlePrint(bus)}
                      title="Print"
                      className="rounded-lg border border-slate-300 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleCopyCode(bus)}
                      title="Copy Verification Token / Bus Number"
                      className={`rounded-lg border p-2 text-xs font-semibold transition-colors ${
                        copiedId === bus.id
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      }`}
                    >
                      {copiedId === bus.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
