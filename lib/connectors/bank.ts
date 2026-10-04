/**
 * BANK CONNECTOR — self-hosted Account Aggregator simulator.
 *
 * Mirrors the shape of the Setu AA sandbox contract (consent session →
 * hosted consent screen → redirect → FI data fetch) without any external
 * dependency, because the real Setu Bridge signup is geo-fenced to India.
 * The simulator is stateless across serverless instances by design: the
 * consent id alone deterministically yields the synthetic FI payload, and
 * the grant travels back via the redirect — no cross-request server state.
 *
 * Swapping to the real Setu AA sandbox later is an env change plus pointing
 * these two calls at bridge.setu.co — the app-side flow is identical.
 */

export type BankProvider = "aa-sim" | "mock";

export function bankProvider(): BankProvider {
  return process.env.BANK_PROVIDER === "mock" ? "mock" : "aa-sim";
}

export interface ConsentSession {
  id: string;
  status: "PENDING";
  url: string;
  vua: string;
  purpose: { text: string; code: string };
  dataRange: { from: string; to: string };
  fiTypes: string[];
  requester: string;
}

export function createConsentSession(): ConsentSession {
  const id = `cst_sim_${Math.random().toString(36).slice(2, 12)}`;
  return {
    id,
    status: "PENDING",
    url: `/aa-sim/consent/${id}`,
    vua: "george@aa-sim",
    purpose: {
      code: "101",
      text: "One-time fetch of your deposit account summary, to work out what you can safely move.",
    },
    dataRange: { from: "2026-04-01", to: "2026-09-20" },
    fiTypes: ["DEPOSIT"],
    requester: "Utilisation Guardian (FIU, simulated)",
  };
}

export interface FiTransaction {
  txnDate: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  narration: string;
  balance: number;
}

export interface FiPayload {
  status: "COMPLETED";
  consentId: string;
  accounts: {
    linkRefNumber: string;
    maskedAccNumber: string;
    fipName: string;
    type: "deposit";
    summary: { currentBalance: number; currency: "INR"; accType: "SAVINGS" };
    transactions: FiTransaction[];
  }[];
}

/** Synthetic 6-month FI payload — deterministic, ends at the demo balance. */
export function fetchFiData(consentId: string): FiPayload {
  const txns: FiTransaction[] = [];
  let balance = 31_500;
  const push = (txnDate: string, type: "CREDIT" | "DEBIT", amount: number, narration: string) => {
    balance = type === "CREDIT" ? balance + amount : balance - amount;
    txns.push({ txnDate, type, amount, narration, balance });
  };
  // last cycle, abbreviated: salary on the 1st, essentials out, ends at ₹38,000
  push("2026-09-01", "CREDIT", 55_000, "SALARY NEFT INTEGRA TECHNOLOGY");
  push("2026-09-02", "DEBIT", 18_000, "RENT UPI/mahesh.landlord@okhdfc");
  push("2026-09-04", "DEBIT", 9_600, "CC PAYMENT HDFC XXXX8231");
  push("2026-09-06", "DEBIT", 4_200, "UPI/zomato + groceries");
  push("2026-09-09", "DEBIT", 6_500, "ACH PERSONAL LOAN EMI");
  push("2026-09-12", "DEBIT", 3_800, "UPI misc spends");
  push("2026-09-15", "DEBIT", 7_400, "UPI travel + utilities");
  push("2026-09-18", "CREDIT", 1_000, "UPI refund flipkart");

  return {
    status: "COMPLETED",
    consentId,
    accounts: [
      {
        linkRefNumber: `lrn_${consentId.slice(-8)}`,
        maskedAccNumber: "XXXXXXXX4821",
        fipName: "HDFC Bank (simulated FIP)",
        type: "deposit",
        summary: { currentBalance: balance, currency: "INR", accType: "SAVINGS" },
        transactions: txns,
      },
    ],
  };
}
