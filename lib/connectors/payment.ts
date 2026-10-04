/**
 * PAYMENT CONNECTOR — sandbox/test-mode only, by design.
 *
 * `PAY_PROVIDER=razorpay` creates a real test-mode Razorpay Order for every
 * executed move, so the action log is receipt-backed with a `order_…` id you
 * can open in the Razorpay test dashboard. No real money ever moves — the
 * "debit" itself stays simulated; the receipt proves the integration seam.
 * Anything missing or failing degrades to a simulated receipt with a logged
 * reason (the same graceful-degradation contract as the LLM layer).
 */

export interface PaymentReceipt {
  provider: "razorpay-test" | "simulated";
  id: string;
}

function simulated(): PaymentReceipt {
  return { provider: "simulated", id: `sim_${Math.random().toString(36).slice(2, 11)}` };
}

export async function createPaymentReceipt(
  amountInr: number,
  note: string
): Promise<PaymentReceipt> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (process.env.PAY_PROVIDER !== "razorpay" || !keyId || !keySecret) {
    return simulated();
  }
  if (!keyId.startsWith("rzp_test_")) {
    // Hard sandbox-only invariant: never touch a live key.
    console.warn("[pay] RAZORPAY_KEY_ID is not a test key — refusing, using simulated receipt");
    return simulated();
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: Math.round(amountInr * 100), // paise
        currency: "INR",
        receipt: `ug-${Date.now()}`,
        notes: { purpose: note.slice(0, 250) },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`razorpay ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return { provider: "razorpay-test", id: data.id };
  } catch (err) {
    console.warn("[pay] razorpay test order failed — simulated receipt:", err instanceof Error ? err.message : err);
    return simulated();
  }
}

/** What the UI should say about the payment rail (for provenance chips). */
export function paymentProviderLabel(): "razorpay-test" | "simulated" {
  return process.env.PAY_PROVIDER === "razorpay" &&
    process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") &&
    process.env.RAZORPAY_KEY_SECRET
    ? "razorpay-test"
    : "simulated";
}
