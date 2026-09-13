import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Alert, Select, AppHeader } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { Ticket } from "@sbt/shared-types";

type ComplaintType =
  | "CLEANLINESS"
  | "DRIVER_BEHAVIOR"
  | "OVERCROWDING"
  | "SAFETY"
  | "OVERCHARGING"
  | "OTHER";

export function GrievancePage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [complaintType, setComplaintType] = useState<ComplaintType>("OTHER");
  const [description, setDescription] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [selectedTripId, setSelectedTripId] = useState("none");
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [step, setStep] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  // Load recent tickets so passenger can optionally link the complaint to a trip
  useEffect(() => {
    supabase
      .from("tickets")
      .select("id, trip_id, origin_stop_id, dest_stop_id, created_at, status")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setRecentTickets((data ?? []) as Ticket[]));
  }, []);

  const handleSubmit = async () => {
    setStep("submitting");
    setErrorMsg(null);
    try {
      // Resolve the trip_id from the selected ticket
      const tripId =
        selectedTripId !== "none"
          ? (recentTickets.find((t) => t.id === selectedTripId)?.trip_id ?? null)
          : null;

      // Call the existing file_complaint RPC (migration 024)
      // The RPC requires a trip_id; if no ticket selected we pass the most recent trip or null
      const resolvedTripId =
        tripId ?? (recentTickets[0]?.trip_id ?? null);

      if (!resolvedTripId) {
        throw new Error("Please link a trip to your complaint — or travel first and then file.");
      }

      const fullDescription = [
        description.trim(),
        contactInfo.trim() ? `Contact: ${contactInfo.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const { data, error } = await supabase.rpc("file_complaint", {
        p_trip_id: resolvedTripId,
        p_type: complaintType,
        p_description: fullDescription || null,
      });

      if (error) throw error;

      // data is the complaints row
      const complaint = data as { id: string } | null;
      setSuccessRef(complaint?.id?.slice(0, 8).toUpperCase() ?? "—");
      setStep("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t("grievanceFailed"));
      setStep("error");
    }
  };

  const typeOptions: { value: ComplaintType; label: string }[] = [
    { value: "CLEANLINESS", label: t("cleanliness") },
    { value: "DRIVER_BEHAVIOR", label: t("driverBehavior") },
    { value: "OVERCROWDING", label: t("overcrowding") },
    { value: "SAFETY", label: t("safety") },
    { value: "OVERCHARGING", label: t("overcharging") },
    { value: "OTHER", label: t("other") },
  ];

  const ticketOptions = [
    { value: "none", label: t("noRecentTickets") },
    ...recentTickets.map((tk) => ({
      value: tk.id,
      label: `${new Date(tk.created_at).toLocaleDateString()} — ${tk.status}`,
    })),
  ];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 pb-24 pt-8">
      <AppHeader
        title={t("grievanceTitle")}
        leading={
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t("back")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            ←
          </button>
        }
      />

      {step === "success" ? (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          {/* Success checkmark */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t("grievanceSuccess")}
              <span className="font-mono text-brand-600 dark:text-brand-400">#{successRef}</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Our team will review and respond within 48 hours.
            </p>
          </div>
          <Button onClick={() => navigate("/")} className="mt-2">
            {t("home")}
          </Button>
        </Card>
      ) : (
        <>
          {/* Description banner */}
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("grievanceDesc")}</p>

          <Card className="flex flex-col gap-4">
            {/* Complaint type */}
            <Select
              label={t("complaintType")}
              value={complaintType}
              onChange={(e) => setComplaintType(e.target.value as ComplaintType)}
              options={typeOptions}
            />

            {/* Link to a ticket */}
            <Select
              label={t("selectTrip")}
              value={selectedTripId}
              onChange={(e) => setSelectedTripId(e.target.value)}
              options={ticketOptions}
            />

            {/* Free-text description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t("description")}
              </label>
              <textarea
                id="grievance-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descPlaceholder")}
                className="w-full resize-none rounded-xl border border-border-light bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-border-dark dark:bg-surface-dark dark:text-slate-100 dark:placeholder-slate-600"
              />
            </div>

            {/* Optional contact details */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Contact Phone / Email (Optional — for resolution updates)
              </label>
              <input
                id="grievance-contact"
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="e.g. 9876543210 or your@email.com"
                className="w-full rounded-xl border border-border-light bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-border-dark dark:bg-surface-dark dark:text-slate-100 dark:placeholder-slate-600"
              />
            </div>
          </Card>

          {/* Severity legend */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { label: t("cleanliness"), color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
                { label: t("safety"), color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
                { label: t("overcharging"), color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                { label: t("driverBehavior"), color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
              ] as const
            ).map((chip) => (
              <span key={chip.label} className={`rounded-full px-3 py-1 text-xs font-semibold ${chip.color}`}>
                {chip.label}
              </span>
            ))}
          </div>

          {(step === "error" || errorMsg) && (
            <Alert tone="danger" title={t("grievanceFailed")}>
              {errorMsg}
            </Alert>
          )}

          <Button
            size="lg"
            className="w-full"
            isLoading={step === "submitting"}
            onClick={handleSubmit}
          >
            {step === "submitting" ? t("submitting") : t("submit")}
          </Button>
        </>
      )}
    </div>
  );
}
