import { evaluate } from "./rulesEngine";
import { inr } from "./format";
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
  const { settings, bank, card } = state;

  const deny = (
    code: PolicyVerdict["code"],
    reason: string,
    adaptedAmount?: number
  ): PolicyVerdict => ({ allow: false, code, reason, adaptedAmount, checks });

  // 0. Guardian switched off → warn-only, no actions of any kind.
  const guardianOn = settings.utilGuard !== "off";
  checks.push({
    name: "Guardian enabled",
    pass: guardianOn,
    detail: guardianOn
      ? `Autonomy is "${settings.utilGuard}"`
      : "Utilisation Guardian is off — warn-only mode",
  });
  if (!guardianOn)
    return deny(
      "DENIED_GUARDIAN_OFF",
      "The Guardian is set to off, so it only warns. Turn it to “Ask first” or “Autonomous” in settings to act."
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
