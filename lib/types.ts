/**
 * Shared types for the three-layer architecture.
 *
 * Layer 1 — rulesEngine.ts : deterministic, owns every number.
 * Layer 2 — llm.ts         : language only, never computes.
 * Layer 3 — policy.ts      : guardrail gate before any action executes.
 */

export type AutonomyLevel = "off" | "ask" | "auto";

export type Severity = "none" | "amber" | "orange" | "red";

export interface UserProfile {
  name: string;
  age: number;
  incomeBand: string;
  city: string;
}

export interface Card {
  id: string; // "hdfc", "icici"
  issuer: string;
  limit: number;
  balance: number;
  statementDay: number;
  dueDay: number;
}

export interface Emi {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  monthLabel: string;
  /** what missing it costs — directional, plain words */
  consequence: string;
}

export type Scenario = "simple" | "messy";

export interface Bank {
  /** null = signal missing → policy layer forces propose-only */
  balance: number | null;
  salaryDay: number;
  safetyBuffer: number;
}

export interface Score {
  current: number;
  impactBandEstimate: string;
}

export interface Settings {
  utilGuard: AutonomyLevel;
  autoCap: number;
  autopayGuard: AutonomyLevel;
}

export type ActionType =
  | "paydown"
  | "scheduled-paydown"
  | "limit-increase"
  | "auto-paydown"
  | "autopay-arm"
  | "autopay-payment"
  | "policy-deny"
  | "settings-change";

export interface ActionLogEntry {
  id: string;
  /** Display date, e.g. "Sep 2" (frozen demo clock) */
  date: string;
  type: ActionType;
  amount?: number;
  /** utilisation before/after, as fraction (0.82) */
  before?: number;
  after?: number;
  note: string;
}

export interface ScheduledPayment {
  date: string; // "Sep 22"
  amount: number;
  note: string;
}

export interface DemoClock {
  /** Day of month "today" in the frozen demo, e.g. 2 */
  today: number;
  monthLabel: string; // "Sep"
  nudgedThisCycle: boolean;
}

export interface AppState {
  user: UserProfile;
  scenario: Scenario;
  cards: Card[];
  /** the card the Utilisation Guardian flow centres on (Card A) */
  primaryCardId: string;
  emis: Emi[];
  bank: Bank;
  score: Score;
  settings: Settings;
  autopay: { armed: boolean; note: string | null };
  actionLog: ActionLogEntry[];
  scheduled: ScheduledPayment[];
  demo: DemoClock;
}

/**
 * Structured output of the rules engine. This object is the ONLY thing the
 * LLM layer is allowed to talk about — every number arrives pre-computed and
 * pre-formatted so the model never does arithmetic.
 */
export interface GuardianFacts {
  triggered: boolean;
  triggerReasons: string[];
  severity: Severity;

  utilisation: number; // 0.82
  utilisationPct: number; // 82
  daysUntilStatement: number; // 3
  statementDate: string; // "Sep 5"
  dueDate: string; // "Sep 22"

  targetBalance30: number; // 18000
  paydownTo30: number; // 31200
  affordableNow: number; // 23000
  shortfall: number; // 8200
  splitRequired: boolean;

  bankBalance: number | null;
  bankDataAvailable: boolean;
  safetyBuffer: number; // 15000

  scoreCurrent: number; // 761
  scoreImpactBand: string; // "~20–40 pts" — DIRECTIONAL ESTIMATE, never a promise

  projected: {
    balanceAfterNow: number; // 26200
    utilisationAfterNowPct: number; // 44
    utilisationAfterFullPct: number; // 30
  };

  limitIncrease: {
    requestedLimit: number; // 100000
    utilisationAtNewLimitPct: number; // 49
  };

  /** Pre-formatted display strings — the LLM must use these verbatim. */
  display: Record<string, string>;
}

export type PolicyActionType = "paydown" | "limit-increase" | "autopay";

export interface PolicyRequest {
  type: PolicyActionType;
  amount?: number;
  /** explicit user consent for this specific action (the tap) */
  consent: boolean;
  /** who initiated it: the user tapping, or the agent acting on its own */
  initiator: "user" | "agent";
}

export type PolicyCode =
  | "ALLOWED"
  | "ALLOWED_ADAPTED"
  | "DENIED_GUARDIAN_OFF"
  | "DENIED_NO_CONSENT"
  | "DENIED_OVER_AUTO_CAP"
  | "DENIED_BREACHES_BUFFER"
  | "DENIED_MISSING_SIGNAL"
  | "DENIED_INVALID_AMOUNT";

export interface PolicyVerdict {
  allow: boolean;
  code: PolicyCode;
  reason: string;
  /** if the requested amount was unsafe but a smaller one is fine */
  adaptedAmount?: number;
  /** which checks ran, for the legible audit trail */
  checks: { name: string; pass: boolean; detail: string }[];
}

export type LlmSource = "ollama" | "hf" | "frontier" | "template";

export type ExplainKind =
  | "alert"
  | "recommendation"
  | "action-summary"
  | "out-of-scope";

export interface Explanation {
  text: string;
  source: LlmSource;
}

// ---- Grounded chat (the addendum's conversational layer) ----

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** One deterministic tool invocation the model made while answering. */
export interface ToolTrace {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

/** A consent-gated action the model may PROPOSE from chat — never execute. */
export interface ActionProposal {
  type: "paydown" | "limit-increase";
  cardId: string;
  amount?: number;
  label: string;
}

export interface ChatReply {
  text: string;
  source: LlmSource | "canned";
  trace: ToolTrace[];
  actionProposal?: ActionProposal;
}
