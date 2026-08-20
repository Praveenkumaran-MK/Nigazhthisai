/**
 * Payment provider abstraction (spec §25). MockPaymentProvider simulates a
 * Razorpay-style checkout for development/demo. A future RazorpayPaymentProvider
 * can implement the same interface and be swapped in via choosePaymentProvider()
 * without touching any calling code. IMPORTANT: this layer only decides
 * whether to *show a successful mock payment UI* — it never creates the
 * ticket itself. The authoritative fare validation and ticket creation
 * happens entirely server-side in create_secure_ticket() regardless of what
 * this layer reports, so a compromised/patched client cannot mint a ticket
 * by lying about payment success. Note: the RPC checks whether payments are
 * enabled at all (transport_authority_config.is_payments_enabled) — it does
 * NOT itself validate a UPI id, since this mock flow never sends one to
 * check against; `payeeUpiId` below is display-only in the checkout UI.
 */

export interface PaymentRequest {
  amount: number;
  currency: "INR";
  payeeUpiId: string;
  description: string;
}

export interface PaymentResult {
  success: boolean;
  providerReference: string;
}

export interface PaymentProvider {
  readonly name: string;
  pay(request: PaymentRequest): Promise<PaymentResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock-razorpay-style";

  async pay(request: PaymentRequest): Promise<PaymentResult> {
    // Simulates network/processing latency of a real gateway modal.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return {
      success: true,
      providerReference: `MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}-${Math.round(request.amount * 100)}`,
    };
  }
}

export function choosePaymentProvider(): PaymentProvider {
  // Only the mock provider is wired up today. Swap this line for a real
  // RazorpayPaymentProvider() once Razorpay credentials/checkout.js are
  // integrated — no other call site needs to change.
  return new MockPaymentProvider();
}
