import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Alert, Select, Spinner } from "@sbt/ui";
import { supabase } from "../lib/supabase";
import { useCreateTicket } from "../hooks/useTicket";
import { choosePaymentProvider } from "../lib/paymentProvider";

interface AuthorityConfig {
  upi_id: string;
  is_payments_enabled: boolean;
}

export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tripId = params.get("tripId") ?? "";
  const originStopId = params.get("originStopId") ?? "";
  const destStopId = params.get("destStopId") ?? "";
  const displayFare = Number(params.get("fare") ?? "0");

  const [passengerCount, setPassengerCount] = useState("1");
  const [config, setConfig] = useState<AuthorityConfig | null>(null);
  const [paymentStep, setPaymentStep] = useState<"idle" | "processing" | "paid" | "creating" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { create } = useCreateTicket();

  useEffect(() => {
    supabase
      .from("transport_authority_config")
      .select("upi_id, is_payments_enabled")
      .maybeSingle()
      .then(({ data }) => setConfig(data as AuthorityConfig | null));
  }, []);

  const handlePay = async () => {
    setErrorMessage(null);
    // Distinct from "explicitly disabled": `config` can still be null here
    // simply because its fetch hasn't resolved yet (e.g. a slow connection,
    // or a user tapping Pay immediately). Treating both cases identically
    // showed a permanent-looking "unavailable" error for what was really
    // just a loading race — the button below is now disabled while config
    // is null so this branch should only ever hit the real disabled case,
    // but the distinction is kept here too as a safety net.
    if (config === null) {
      setErrorMessage("Still loading payment configuration — please try again in a moment.");
      setPaymentStep("error");
      return;
    }
    if (!config.is_payments_enabled) {
      setErrorMessage("Ticket purchases are currently unavailable. Please try again later.");
      setPaymentStep("error");
      return;
    }
    setPaymentStep("processing");
    try {
      const provider = choosePaymentProvider();
      const result = await provider.pay({
        amount: displayFare * Number(passengerCount),
        currency: "INR",
        payeeUpiId: config.upi_id,
        description: "Bus ticket",
      });
      if (!result.success) throw new Error("Payment was not completed");
      setPaymentStep("paid");

      setPaymentStep("creating");
      // total_fare is NOT sent here — create_secure_ticket recomputes it
      // server-side from fare_matrix and rejects the request if the trip's
      // origin stop has already been departed, regardless of what the mock
      // payment step reported.
      const ticket = await create({
        trip_id: tripId,
        origin_stop_id: originStopId,
        dest_stop_id: destStopId,
        passenger_count: Number(passengerCount),
      });
      navigate(`/ticket/${ticket.id}`, { replace: true });
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Something went wrong");
      setPaymentStep("error");
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 pb-24 pt-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Checkout</h1>

      <Card>
        <div className="flex flex-col gap-4">
          <Select
            label="Number of passengers"
            value={passengerCount}
            onChange={(e) => setPassengerCount(e.target.value)}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          />
          <div className="flex items-center justify-between border-t border-border-light pt-3 text-sm dark:border-border-dark">
            <span className="text-slate-500 dark:text-slate-500">Total fare</span>
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              ₹{(displayFare * Number(passengerCount)).toFixed(2)}
            </span>
          </div>
        </div>
      </Card>

      <Card className="border-dashed">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mock payment (demo)</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Paying to: <span className="font-mono">{config?.upi_id ?? "…"}</span>
        </p>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-600">
          This is a simulated checkout — no real money moves. Fare and payee UPI are re-validated
          server-side before any ticket is issued.
        </p>
      </Card>

      {errorMessage && <Alert tone="danger" title="Payment failed">{errorMessage}</Alert>}

      <Button
        size="lg"
        className="w-full"
        isLoading={paymentStep === "processing" || paymentStep === "creating"}
        disabled={config === null}
        onClick={handlePay}
      >
        {paymentStep === "processing" && (
          <>
            <Spinner size="sm" /> Processing payment…
          </>
        )}
        {paymentStep === "creating" && "Issuing ticket…"}
        {(paymentStep === "idle" || paymentStep === "error") && `Pay ₹${(displayFare * Number(passengerCount)).toFixed(2)}`}
        {paymentStep === "paid" && "Payment received"}
      </Button>
    </div>
  );
}
