import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Alert, Select, Spinner } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { choosePaymentProvider } from "../lib/paymentProvider";

interface AuthorityConfig {
  upi_id: string;
  is_payments_enabled: boolean;
}

type ConcessionType =
  | "NORMAL"
  | "STUDENT"
  | "SENIOR_CITIZEN"
  | "FREEDOM_FIGHTER"
  | "MONTHLY_PASS";

/** Discount fraction applied client-side for display only.
 *  The RPC always re-computes the authoritative amount server-side. */
const CONCESSION_DISCOUNT: Record<ConcessionType, number> = {
  NORMAL: 0,
  STUDENT: 0.5,
  SENIOR_CITIZEN: 0.5,
  FREEDOM_FIGHTER: 1.0,
  MONTHLY_PASS: 0.75,
};

export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const tripId = params.get("tripId") ?? "";
  const originStopId = params.get("originStopId") ?? "";
  const destStopId = params.get("destStopId") ?? "";
  const displayFare = Number(params.get("fare") ?? "0");

  const [passengerCount, setPassengerCount] = useState("1");
  const [concessionType, setConcessionType] = useState<ConcessionType>("NORMAL");
  const [config, setConfig] = useState<AuthorityConfig | null>(null);
  const [paymentStep, setPaymentStep] = useState<"idle" | "processing" | "paid" | "creating" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("transport_authority_config")
      .select("upi_id, is_payments_enabled")
      .maybeSingle()
      .then(({ data }) => setConfig(data as AuthorityConfig | null));
  }, []);

  const discount = CONCESSION_DISCOUNT[concessionType];
  const baseFareTotal = displayFare * Number(passengerCount);
  const effectiveFare = Math.max(0, parseFloat((baseFareTotal * (1 - discount)).toFixed(2)));

  const concessionOptions: { value: ConcessionType; label: string }[] = [
    { value: "NORMAL",          label: t("concNormal") },
    { value: "STUDENT",         label: t("concStudent") },
    { value: "SENIOR_CITIZEN",  label: t("concSenior") },
    { value: "MONTHLY_PASS",    label: t("concMonthlyPass") },
    { value: "FREEDOM_FIGHTER", label: t("concFreedomFighter") },
  ];

  const handlePay = async () => {
    setErrorMessage(null);
    if (config === null) {
      setErrorMessage(t("loadingPayment"));
      setPaymentStep("error");
      return;
    }
    if (!config.is_payments_enabled) {
      setErrorMessage(t("paymentsUnavailable"));
      setPaymentStep("error");
      return;
    }
    setPaymentStep("processing");
    try {
      const provider = choosePaymentProvider();
      const result = await provider.pay({
        amount: effectiveFare,
        currency: "INR",
        payeeUpiId: config.upi_id,
        description: "Bus ticket",
      });
      if (!result.success) throw new Error("Payment was not completed");
      setPaymentStep("paid");

      setPaymentStep("creating");
      // Call the updated 5-arg create_secure_ticket RPC (migration 027)
      const { data, error } = await supabase.rpc("create_secure_ticket", {
        p_trip_id: tripId,
        p_origin_stop_id: originStopId,
        p_dest_stop_id: destStopId,
        p_passenger_count: Number(passengerCount),
        p_concession_type: concessionType,
      });

      if (error) throw error;
      const ticket = data as { id: string } | null;
      if (!ticket) throw new Error("Ticket creation failed — no data returned.");
      navigate(`/ticket/${ticket.id}`, { replace: true });
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Something went wrong");
      setPaymentStep("error");
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 pb-24 pt-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("checkout")}</h1>

      <Card>
        <div className="flex flex-col gap-4">
          <Select
            label={t("numberOfPassengers")}
            value={passengerCount}
            onChange={(e) => setPassengerCount(e.target.value)}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          />

          <Select
            label={t("concessionType")}
            value={concessionType}
            onChange={(e) => setConcessionType(e.target.value as ConcessionType)}
            options={concessionOptions}
          />

          {/* Fare breakdown */}
          <div className="flex flex-col gap-1 border-t border-border-light pt-3 dark:border-border-dark">
            {discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 line-through dark:text-slate-600">
                  ₹{baseFareTotal.toFixed(2)}
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  -{Math.round(discount * 100)}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-500">{t("totalFare")}</span>
              <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                ₹{effectiveFare.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="border-dashed">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("payingTo")}
        </p>
        <p className="mt-1 font-mono text-sm text-slate-600 dark:text-slate-400">
          {config?.upi_id ?? "…"}
        </p>
      </Card>

      {errorMessage && (
        <Alert tone="danger" title={t("paymentFailed")}>
          {errorMessage}
        </Alert>
      )}

      <Button
        size="lg"
        className="w-full"
        isLoading={paymentStep === "processing" || paymentStep === "creating"}
        disabled={config === null}
        onClick={handlePay}
      >
        {paymentStep === "processing" && (
          <>
            <Spinner size="sm" /> {t("processingPayment")}
          </>
        )}
        {paymentStep === "creating" && t("issuingTicket")}
        {(paymentStep === "idle" || paymentStep === "error") &&
          `${t("payButton")} ₹${effectiveFare.toFixed(2)}`}
        {paymentStep === "paid" && t("paymentReceived")}
      </Button>
    </div>
  );
}
