import { dayLabel, inr, nextMonthLabel, pct } from "./format";
import { primaryCard } from "./store";
import type { AppState, GuardianFacts, Severity } from "./types";

/**
 * LAYER 1 — DETERMINISTIC RULES ENGINE.
 *
 * Owns EVERY number in the product: utilisation, the paydown to reach 30%,
 * affordability against the safety buffer, severity, timing, and the
 * directional score-impact band. The LLM layer never computes — it only
 * narrates the structured facts produced here.
 *
 * Design principle: use the model for what it is good at (language, empathy,
 * explanation) and rules for what it must never get wrong (financial math,
 * thresholds, actions). That boundary is the product design.
 */

const UTILISATION_TARGET = 0.3;
const TRIGGER_UTILISATION = 0.3;
// Wide enough to cover the seeded scenario (statement on the 30th, today the
// 20th). The Guardian acts as soon as it can, not at the last minute.
const TRIGGER_DAYS_BEFORE_STATEMENT = 10;
const LIMIT_INCREASE_REQUEST = 100_000;

export function severityFor(utilisation: number): Severity {
  if (utilisation >= 0.75) return "red";
  if (utilisation >= 0.5) return "orange";
  if (utilisation >= TRIGGER_UTILISATION) return "amber";
  return "none";
}

/** Evaluates the Utilisation Guardian moment for the primary card (Card A). */
export function evaluate(state: AppState): GuardianFacts {
  const { bank, score, demo } = state;
  const card = primaryCard(state);

  const utilisation = card.balance / card.limit;
  const utilisationPct = Math.round(utilisation * 100);

  // Frozen demo clock: statement day 5, today the 2nd → 3 days.
  const daysUntilStatement = (card.statementDay - demo.today + 31) % 31;

  const targetBalance30 = Math.round(UTILISATION_TARGET * card.limit);
  const paydownTo30 = Math.max(0, card.balance - targetBalance30);

  const bankDataAvailable = bank.balance !== null;
  const spareAboveBuffer = bankDataAvailable
    ? Math.max(0, (bank.balance as number) - bank.safetyBuffer)
    : 0;

  // The harm-aware number: never suggest money he doesn't safely have.
  const affordableNow = Math.min(paydownTo30, spareAboveBuffer);
  const shortfall = paydownTo30 - affordableNow;
  const splitRequired = shortfall > 0;

  const balanceAfterNow = card.balance - affordableNow;
  const utilisationAfterNowPct = Math.round((balanceAfterNow / card.limit) * 100);
  const utilisationAfterFullPct = Math.round(
    ((card.balance - paydownTo30) / card.limit) * 100
  );

  const utilisationAtNewLimitPct = Math.round(
    (card.balance / LIMIT_INCREASE_REQUEST) * 100
  );

  const severity = severityFor(utilisation);

  const triggerReasons: string[] = [];
  if (daysUntilStatement <= TRIGGER_DAYS_BEFORE_STATEMENT)
    triggerReasons.push(`statement cuts in ${daysUntilStatement} days`);
  if (utilisation >= TRIGGER_UTILISATION)
    triggerReasons.push(`utilisation ${utilisationPct}% ≥ 30%`);
  if (!demo.nudgedThisCycle) triggerReasons.push("not yet nudged this cycle");

  const triggered =
    daysUntilStatement <= TRIGGER_DAYS_BEFORE_STATEMENT &&
    utilisation >= TRIGGER_UTILISATION &&
    !demo.nudgedThisCycle;

  const statementDate = dayLabel(demo.monthLabel, card.statementDay);
  // A due day earlier in the month than the statement day belongs to the
  // next month (statement Sep 30 → payment due Oct 22).
  const dueMonth =
    card.dueDay < card.statementDay ? nextMonthLabel(demo.monthLabel) : demo.monthLabel;
  const dueDate = dayLabel(dueMonth, card.dueDay);

  return {
    triggered,
    triggerReasons,
    severity,
    utilisation,
    utilisationPct,
    daysUntilStatement,
    statementDate,
    dueDate,
    targetBalance30,
    paydownTo30,
    affordableNow,
    shortfall,
    splitRequired,
    bankBalance: bank.balance,
    bankDataAvailable,
    safetyBuffer: bank.safetyBuffer,
    scoreCurrent: score.current,
    scoreImpactBand: score.impactBandEstimate,
    projected: {
      balanceAfterNow,
      utilisationAfterNowPct,
      utilisationAfterFullPct,
    },
    limitIncrease: {
      requestedLimit: LIMIT_INCREASE_REQUEST,
      utilisationAtNewLimitPct,
    },
    // Pre-formatted strings: the LLM must repeat these verbatim, never derive.
    display: {
      issuer: card.issuer,
      utilisation: pct(utilisation),
      limit: inr(card.limit),
      balance: inr(card.balance),
      targetBalance30: inr(targetBalance30),
      paydownTo30: inr(paydownTo30),
      affordableNow: inr(affordableNow),
      shortfall: inr(shortfall),
      safetyBuffer: inr(bank.safetyBuffer),
      bankBalance: bank.balance !== null ? inr(bank.balance) : "unavailable",
      statementDate,
      dueDate,
      daysUntilStatement: `${daysUntilStatement} days`,
      scoreImpactBand: score.impactBandEstimate,
      utilisationAfterNow: `${utilisationAfterNowPct}%`,
      requestedLimit: inr(LIMIT_INCREASE_REQUEST),
      utilisationAtNewLimit: `${utilisationAtNewLimitPct}%`,
    },
  };
}

/** Projected utilisation for an arbitrary paydown amount (used by UI + log). */
export function utilisationAfterPaydown(state: AppState, amount: number): number {
  const card = primaryCard(state);
  return (card.balance - amount) / card.limit;
}
