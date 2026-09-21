import { evaluate } from "./rulesEngine";
import { inr } from "./format";
import { primaryCard } from "./store";
import type { AppState, PolicyRequest, PolicyVerdict } from "./types";

/**
 * LAYER 3 — POLICY / GUARDRAIL GATE.
 *
 * Runs BEFORE any action executes. Every action route must pass through
 * checkPolicy() — there is no other code path that mutates money state.
 *
 * The "when NOT to act" rules (spec §7):
 *  - Never execute without consent, unless autonomy = auto AND within the
 *    user-set cap AND above the safety buffer.
 *  - Never allow a paydown that overdraws the account or breaches the
 *    safety buffer before salary — adapt (offer the safe smaller amount).
 *  - Defer to propose-only when a required signal is missing (no bank data).
 *  - Guardian "off" means warn-only: no actions at all.
 *  - Limit increases always need explicit consent (never autonomous).
 */
export function checkPolicy(state: AppState, req: PolicyRequest): PolicyVerdict {
  const facts = evaluate(state);
  const checks: PolicyVerdict["checks"] = [];
  const { settings, bank } = state;
  const card = primaryCard(state);

  const deny = (
    code: PolicyVerdict["code"],
    reason: string,
    adaptedAmount?: number
  ): PolicyVerdict => ({ allow: false, code, reason, adaptedAmount, checks });

  // 0. The relevant per-action dial switched off → warn-only, no actions.
  const dial = req.type === "autopay" ? settings.autopayGuard : settings.utilGuard;
  const dialName = req.type === "autopay" ? "Autopay guard" : "Utilisation Guardian";
  const guardianOn = dial !== "off";
  checks.push({
    name: `${dialName} enabled`,
    pass: guardianOn,
    detail: guardianOn
      ? `Autonomy is "${dial}"`
      : `${dialName} is off — warn-only mode`,
  });
  if (!guardianOn)
    return deny(
      "DENIED_GUARDIAN_OFF",
      `The ${dialName} is set to off, so it only warns. Turn it to “Ask first” or “Autonomous” to act.`
    );

  if (req.type === "limit-increase") {
    // Structural fix; reversible-ish, but still consequential → always ask.
    checks.push({
      name: "Explicit consent",
      pass: req.consent,
      detail: req.consent
        ? "User approved the limit-increase request"
        : "Limit increases always need an explicit yes — never autonomous",
    });
    if (!req.consent)
      return deny(
        "DENIED_NO_CONSENT",
        "A limit-increase request always needs your explicit approval."
      );
    return {
      allow: true,
      code: "ALLOWED",
      reason: "Consented limit-increase request. Reminder: this lowers your ratio going forward — it is not extra money to spend.",
      checks,
    };
  }

  if (req.type === "autopay") {
    // Arming (amount undefined) is a setup action — always needs the user's yes.
    if (req.amount === undefined) {
      checks.push({
        name: "Explicit consent",
        pass: req.consent,
        detail: req.consent
          ? "User armed the autopay rule"
          : "Arming autopay needs an explicit yes",
      });
      if (!req.consent)
        return deny("DENIED_NO_CONSENT", "Arming autopay needs your explicit approval.");
      return {
        allow: true,
        code: "ALLOWED",
        reason:
          "Autopay armed. It pays on the due date only while your safety cushion stays intact — otherwise it alerts instead.",
        checks,
      };
    }

    // Executing the due-date payment.
    const payAmount = req.amount;
    checks.push({
      name: "Bank signal present",
      pass: facts.bankDataAvailable,
      detail: facts.bankDataAvailable
        ? `Linked bank balance known (${facts.display.bankBalance})`
        : "Bank balance unavailable — autopay never guesses",
    });
    if (!facts.bankDataAvailable)
      return deny(
        "DENIED_MISSING_SIGNAL",
        "I can’t see your bank balance, so autopay won’t run — I’ve alerted you instead."
      );

    const bankBal = bank.balance as number;
    const maxSafePay = Math.max(0, bankBal - bank.safetyBuffer);
    const safe = payAmount <= maxSafePay;
    checks.push({
      name: "Safety buffer protected",
      pass: safe,
      detail: safe
        ? `${inr(payAmount)} leaves ${inr(bankBal - payAmount)} ≥ ${inr(bank.safetyBuffer)} buffer`
        : `${inr(payAmount)} would breach the ${inr(bank.safetyBuffer)} buffer — most I’ll pay is ${inr(maxSafePay)}`,
    });
    if (!safe)
      return deny(
        "DENIED_BREACHES_BUFFER",
        `Paying ${inr(payAmount)} would dip into your ${inr(bank.safetyBuffer)} cushion. ${
          maxSafePay > 0
            ? `The most autopay will cover is ${inr(maxSafePay)} — the rest needs your call.`
            : "Nothing can be paid safely right now — you’ve been alerted instead."
        }`,
        maxSafePay > 0 ? maxSafePay : undefined
      );

    const authorised = req.consent || settings.autopayGuard === "auto";
    checks.push({
      name: "Consent or autonomous autopay",
      pass: authorised,
      detail: req.consent
        ? "User approved this payment"
        : settings.autopayGuard === "auto"
          ? "Autopay is autonomous — pays without asking while the buffer holds"
          : "Autopay is in ask-first mode and no approval was given",
    });
    if (!authorised)
      return deny(
        "DENIED_NO_CONSENT",
        "Autopay is set to ask first — approve the payment and I’ll make it."
      );

    return {
      allow: true,
      code: "ALLOWED",
      reason: `Autopay of ${inr(payAmount)} — due date honoured, buffer protected.`,
      checks,
    };
  }

  // ---- Paydown checks ----
  const amount = req.amount ?? 0;

  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= card.balance;
  checks.push({
    name: "Amount sane",
    pass: amountValid,
    detail: amountValid
      ? `${inr(amount)} is positive and ≤ card balance`
      : `Requested amount ${inr(amount)} is invalid (must be >0 and ≤ card balance ${inr(card.balance)})`,
  });
  if (!amountValid)
    return deny("DENIED_INVALID_AMOUNT", "That amount isn’t valid for this card.");

  // 1. Missing signal → propose-only. Never guess with someone's money.
  checks.push({
    name: "Bank signal present",
    pass: facts.bankDataAvailable,
    detail: facts.bankDataAvailable
      ? `Linked bank balance known (${facts.display.bankBalance})`
      : "Bank balance unavailable — deferring to propose-only",
  });
  if (!facts.bankDataAvailable)
    return deny(
      "DENIED_MISSING_SIGNAL",
      "I can’t see your bank balance right now, so I’ll only propose — I won’t move money on a guess."
    );

  // 2. Safety buffer: the payment must leave at least the buffer in the bank.
  const bankBalance = bank.balance as number;
  const maxSafe = Math.max(0, bankBalance - bank.safetyBuffer);
  const aboveBuffer = amount <= maxSafe;
  checks.push({
    name: "Safety buffer protected",
    pass: aboveBuffer,
    detail: aboveBuffer
      ? `${inr(amount)} leaves ${inr(bankBalance - amount)} ≥ ${inr(bank.safetyBuffer)} buffer`
      : `${inr(amount)} would leave ${inr(bankBalance - amount)}, breaching the ${inr(bank.safetyBuffer)} buffer`,
  });
  if (!aboveBuffer) {
    return deny(
      "DENIED_BREACHES_BUFFER",
      `Moving ${inr(amount)} would dip into the ${inr(
        bank.safetyBuffer
      )} you need for essentials before salary. ${
        maxSafe > 0
          ? `The most I’ll move is ${inr(maxSafe)}.`
          : "There’s no safe amount to move right now."
      }`,
      maxSafe > 0 ? maxSafe : undefined
    );
  }

  // 3. Consent, or autonomous-within-cap.
  if (req.consent) {
    checks.push({
      name: "Explicit consent",
      pass: true,
      detail: "User approved this exact amount",
    });
    return {
      allow: true,
      code: "ALLOWED",
      reason: `Consented paydown of ${inr(amount)} — buffer protected.`,
      checks,
    };
  }

  const isAutonomous = settings.utilGuard === "auto" && req.initiator === "agent";
  checks.push({
    name: "Autonomy grant",
    pass: isAutonomous,
    detail: isAutonomous
      ? `Autonomous mode active (cap ${inr(settings.autoCap)})`
      : "No consent given and autonomy is not enabled",
  });
  if (!isAutonomous)
    return deny(
      "DENIED_NO_CONSENT",
      "Nothing moves without your yes. Approve the action, or enable Autonomous mode with a cap."
    );

  const withinCap = amount <= settings.autoCap;
  checks.push({
    name: "Within autonomy cap",
    pass: withinCap,
    detail: withinCap
      ? `${inr(amount)} ≤ cap ${inr(settings.autoCap)}`
      : `${inr(amount)} exceeds your auto-cap of ${inr(settings.autoCap)}`,
  });
  if (!withinCap)
    return deny(
      "DENIED_OVER_AUTO_CAP",
      `That’s above your ${inr(settings.autoCap)} autonomy cap, so I’ll ask first instead of acting.`,
      Math.min(settings.autoCap, maxSafe)
    );

  return {
    allow: true,
    code: "ALLOWED",
    reason: `Autonomous paydown of ${inr(amount)} — within your ${inr(
      settings.autoCap
    )} cap and above the safety buffer.`,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Chat guardrails (addendum §"Chat guardrails").
// ---------------------------------------------------------------------------

export function extractNumericTokens(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) =>
    m[0].replaceAll(",", "")
  );
}

const OUT_OF_SCOPE = [
  /invest|stock|share market|mutual fund|sip\b|crypto|bitcoin|trading|ipo\b/i,
  /legal advice|lawyer|court|sue\b|lawsuit/i,
  /tax filing|income tax return|itr\b/i,
  /recipe|movie|weather|joke|poem|essay|homework|translate/i,
];

/**
 * Cheap pre-model scope screen: a credit guardian, not a general chatbot.
 * Runs before any provider call — refusals cost zero tokens.
 */
export function screenChatMessage(text: string): { allowed: boolean; refusal?: string } {
  if (OUT_OF_SCOPE.some((re) => re.test(text))) {
    return {
      allowed: false,
      refusal:
        "That’s outside what I do — I only help with your cards, score, and payments. For investments, legal or general questions, a different app is the right place. Anything credit-related, ask away.",
    };
  }
  return { allowed: true };
}

/**
 * Post-generation money guard: the model may only state numbers that a
 * deterministic tool returned this turn (plus a small whitelist of harmless
 * anchors like the 30% rule). Anything else fails verification.
 */
export function verifyChatAnswer(
  text: string,
  allowedNumbers: Set<string>
): { ok: boolean; offending: string[] } {
  const whitelist = new Set(["30", "100", "1", "2", "3"]);
  const offending = extractNumericTokens(text).filter(
    (n) => !allowedNumbers.has(n) && !whitelist.has(n)
  );
  return { ok: offending.length === 0, offending };
}
