import { dayLabel, inr, nextMonthLabel, pct } from "./format";
import { severityFor } from "./rulesEngine";
import { getCard, primaryCard } from "./store";
import type { ActionProposal, AppState, Card } from "./types";

/**
 * THE DETERMINISTIC TOOL BELT.
 *
 * These are the only functions allowed to produce numbers for the chat
 * layer. The model orchestrates and explains; every figure in an answer
 * must trace back to a result returned from here. All math is plain
 * TypeScript delegating to the rules engine's logic.
 */

export interface ToolResult {
  [key: string]: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON-schema-lite, shown to the model in the system prompt */
  params: Record<string, string>;
  run: (state: AppState, args: Record<string, unknown>) => ToolResult;
}

// ---- date helpers on the frozen demo clock ----

function daysUntil(today: number, day: number): number {
  return (day - today + 31) % 31;
}

function statementDateOf(state: AppState, card: Card): { label: string; days: number } {
  const { today, monthLabel } = state.demo;
  const month = card.statementDay >= today ? monthLabel : nextMonthLabel(monthLabel);
  return { label: dayLabel(month, card.statementDay), days: daysUntil(today, card.statementDay) };
}

function dueDateOf(state: AppState, card: Card): string {
  const { today, monthLabel } = state.demo;
  const stmtMonth = card.statementDay >= today ? monthLabel : nextMonthLabel(monthLabel);
  const dueMonth = card.dueDay > card.statementDay ? stmtMonth : nextMonthLabel(stmtMonth);
  return dayLabel(dueMonth, card.dueDay);
}

function requireCard(state: AppState, args: Record<string, unknown>): Card {
  const id = String(args.cardId ?? state.primaryCardId).toLowerCase();
  const card = getCard(state, id);
  if (!card) throw new Error(`unknown cardId "${id}" — valid: ${state.cards.map((c) => c.id).join(", ")}`);
  return card;
}

function deployable(state: AppState, extraReserve = 0): number {
  if (state.bank.balance === null) return 0;
  return Math.max(0, state.bank.balance - state.bank.safetyBuffer - extraReserve);
}

function impactBandFor(utilisationPct: number): string {
  if (utilisationPct >= 75) return "~20–40 pts at stake (estimate, not a promise)";
  if (utilisationPct >= 50) return "~15–30 pts at stake (estimate, not a promise)";
  if (utilisationPct >= 30) return "~5–15 pts at stake (estimate, not a promise)";
  return "little to no utilisation risk at this level (estimate, not a promise)";
}

// ---- the tools ----

export const TOOLS: ToolDef[] = [
  {
    name: "getUtilisation",
    description: "Current balance, limit and utilisation of one card.",
    params: { cardId: "string — 'hdfc' or 'icici' (omit for the primary card)" },
    run(state, args) {
      const card = requireCard(state, args);
      const utilisation = card.balance / card.limit;
      return {
        cardId: card.id,
        issuer: card.issuer,
        balance: inr(card.balance),
        limit: inr(card.limit),
        utilisation: pct(utilisation),
        severity: severityFor(utilisation),
      };
    },
  },
  {
    name: "getStatementTiming",
    description:
      "Statement-cut and due dates for one card, plus why the statement date matters (the bureau snapshot).",
    params: { cardId: "string (omit for the primary card)" },
    run(state, args) {
      const card = requireCard(state, args);
      const stmt = statementDateOf(state, card);
      return {
        cardId: card.id,
        issuer: card.issuer,
        today: dayLabel(state.demo.monthLabel, state.demo.today),
        statementDate: stmt.label,
        daysUntilStatement: stmt.days,
        dueDate: dueDateOf(state, card),
        snapshotFact:
          "The credit bureau records the balance on the statement date — paying in full later does not change what gets reported.",
      };
    },
  },
  {
    name: "simulatePaydown",
    description:
      "What paying an amount onto a card does: resulting utilisation, and whether it's affordable without breaching the safety cushion.",
    params: { cardId: "string", amount: "number — rupees to pay" },
    run(state, args) {
      const card = requireCard(state, args);
      const amount = Math.round(Number(args.amount));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number");
      const capped = Math.min(amount, card.balance);
      const after = (card.balance - capped) / card.limit;
      const maxSafe = deployable(state);
      return {
        cardId: card.id,
        amount: inr(capped),
        utilisationBefore: pct(card.balance / card.limit),
        utilisationAfter: pct(after),
        affordableWithoutBreachingCushion: capped <= maxSafe,
        maxSafeToday: inr(maxSafe),
        cushionProtected: inr(state.bank.safetyBuffer),
      };
    },
  },
  {
    name: "projectScoreImpact",
    description:
      "Directional score-impact band for a utilisation level. ALWAYS an estimate, never a promise.",
    params: { utilisationPct: "number — e.g. 82" },
    run(_state, args) {
      const u = Math.round(Number(args.utilisationPct));
      if (!Number.isFinite(u)) throw new Error("utilisationPct must be a number");
      return {
        utilisation: `${u}%`,
        impactBand: impactBandFor(u),
        label: "directional estimate, not a promise",
      };
    },
  },
  {
    name: "getObligations",
    description:
      "Everything owed this cycle — every card (balance, utilisation, statement/due dates, minimum due) and every EMI — sorted by urgency.",
    params: {},
    run(state) {
      const cards = state.cards.map((card) => {
        const stmt = statementDateOf(state, card);
        return {
          kind: "card" as const,
          cardId: card.id,
          issuer: card.issuer,
          balance: inr(card.balance),
          limit: inr(card.limit),
          utilisation: pct(card.balance / card.limit),
          severity: severityFor(card.balance / card.limit),
          statementDate: stmt.label,
          daysUntilStatement: stmt.days,
          dueDate: dueDateOf(state, card),
          minimumDue: inr(Math.max(200, Math.round((card.balance * 0.05) / 10) * 10)),
        };
      });
      const emis = state.emis.map((e) => ({
        kind: "emi" as const,
        name: e.name,
        amount: inr(e.amount),
        dueDate: dayLabel(e.monthLabel, e.dueDay),
        daysUntilDue: daysUntil(state.demo.today, e.dueDay),
        mustPay: true,
        ifMissed: e.consequence,
      }));
      return {
        bankBalance: state.bank.balance !== null ? inr(state.bank.balance) : "unavailable",
        safetyCushion: inr(state.bank.safetyBuffer),
        deployableToday: inr(deployable(state)),
        obligations: [...emis, ...cards].sort(
          (a, b) =>
            ("daysUntilDue" in a ? a.daysUntilDue : a.daysUntilStatement) -
            ("daysUntilDue" in b ? b.daysUntilDue : b.daysUntilStatement)
        ),
      };
    },
  },
  {
    name: "loanEligibilitySignal",
    description:
      "Directional read on loan eligibility from utilisation, score band and recent enquiries. Hedged — likely / uncertain / unlikely, never a promise.",
    params: {},
    run(state) {
      const totalBalance = state.cards.reduce((s, c) => s + c.balance, 0);
      const totalLimit = state.cards.reduce((s, c) => s + c.limit, 0);
      const overall = totalBalance / totalLimit;
      const overallPct = Math.round(overall * 100);
      const signal = overallPct >= 70 ? "unlikely" : overallPct >= 40 ? "uncertain" : "likely";
      const reasons = [
        `score ${state.score.current} is a solid band`,
        `reported utilisation across cards is ${pct(overall)} ${overallPct >= 40 ? "— lenders read >40% as stretched" : "— comfortably low"}`,
        "no recent hard enquiries on file",
      ];
      // What changes if utilisation is brought under 30% before the snapshot.
      const target = Math.round(0.3 * totalLimit);
      return {
        signalNow: signal,
        reasons,
        ifReportedUnder30: {
          signal: "likely",
          note: `getting total reported balances under ${inr(target)} (30%) before statements cut flips the biggest negative`,
        },
        label: "directional signal from your data — not a promise, lenders decide",
      };
    },
  },
  {
    name: "buildPlan",
    description:
      "The prioritised payment plan for the money that can be moved safely today. Optional reserves let the user hold money back (e.g. rent). Hard obligations (EMIs) come first, then the riskiest statement.",
    params: {
      reserves:
        "optional array of {amount: number, reason: string} — cash the user needs to keep aside",
    },
    run(state, args) {
      const reserves = Array.isArray(args.reserves)
        ? (args.reserves as { amount: number; reason?: string }[])
            .map((r) => ({ amount: Math.round(Number(r.amount)) || 0, reason: String(r.reason ?? "set aside") }))
            .filter((r) => r.amount > 0)
        : [];
      const reserveTotal = reserves.reduce((s, r) => s + r.amount, 0);
      let cash = deployable(state, reserveTotal);
      const steps: { order: number; pay: string; amount: string; why: string }[] = [];
      let order = 1;

      // 1. Hard obligations first — an EMI default outweighs any utilisation hit.
      for (const emi of [...state.emis].sort((a, b) => a.dueDay - b.dueDay)) {
        if (cash >= emi.amount) {
          cash -= emi.amount;
          steps.push({
            order: order++,
            pay: `${emi.name} (due ${dayLabel(emi.monthLabel, emi.dueDay)})`,
            amount: inr(emi.amount),
            why: `non-negotiable — ${emi.consequence}`,
          });
        } else {
          steps.push({
            order: order++,
            pay: `${emi.name} — SHORTFALL`,
            amount: inr(emi.amount),
            why: `cannot be covered after your reserves; freeing ${inr(emi.amount - cash)} elsewhere must come first`,
          });
          cash = 0;
        }
      }

      // 2. Cards above 30%, soonest statement + highest utilisation first.
      const risky = state.cards
        .map((c) => ({ card: c, u: c.balance / c.limit, stmt: statementDateOf(state, c) }))
        .filter((x) => x.u > 0.3)
        .sort((a, b) => a.stmt.days - b.stmt.days || b.u - a.u);
      const projected: Record<string, string> = {};
      for (const { card, u, stmt } of risky) {
        const toThirty = card.balance - Math.round(0.3 * card.limit);
        const payNow = Math.min(cash, toThirty);
        if (payNow > 0) {
          cash -= payNow;
          const after = (card.balance - payNow) / card.limit;
          projected[card.id] = pct(after);
          steps.push({
            order: order++,
            pay: `${card.issuer} card (statement ${stmt.label})`,
            amount: inr(payNow),
            why: `biggest and soonest score risk — drops the snapshot from ${pct(u)} to ${pct(after)}${payNow < toThirty ? `; the remaining ${inr(toThirty - payNow)} goes with the ${dueDateOf(state, card)} due payment` : ""}`,
          });
        }
      }

      // 3. Cards already at/below 30% are left alone, and that's deliberate.
      const untouched = state.cards
        .filter((c) => c.balance / c.limit <= 0.3)
        .map((c) => ({
          card: `${c.issuer}`,
          utilisation: pct(c.balance / c.limit),
          why: "already at the safe line with a later statement — money does more elsewhere",
        }));

      return {
        deployableToday: inr(deployable(state, reserveTotal)),
        reservesHeld: reserves.map((r) => ({ amount: inr(r.amount), reason: r.reason })),
        cushionUntouched: inr(state.bank.safetyBuffer),
        steps,
        leftUnpaidDeliberately: untouched,
        cashRemaining: inr(cash),
        projectedUtilisation: projected,
      };
    },
  },
  {
    name: "proposeAction",
    description:
      "Propose a consent-gated action (paydown or limit-increase). NEVER executes — it hands the user a button that routes through the consent screen and the policy gate.",
    params: {
      type: "'paydown' | 'limit-increase'",
      cardId: "string",
      amount: "number — rupees (paydown only)",
    },
    run(state, args) {
      const card = requireCard(state, args);
      const type = args.type === "limit-increase" ? "limit-increase" : "paydown";
      const amount = type === "paydown" ? Math.round(Number(args.amount)) || undefined : undefined;
      const proposal: ActionProposal = {
        type,
        cardId: card.id,
        amount,
        label:
          type === "paydown"
            ? `Review & approve: move ${amount ? inr(amount) : "the safe amount"} to ${card.issuer}`
            : `Review & approve: request a limit increase from ${card.issuer}`,
      };
      return {
        proposal,
        note: "Action proposed only — nothing moves without the user's explicit consent on the review screen.",
      };
    },
  },
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Tool catalog text for the system prompt. */
export function toolCatalog(): string {
  return TOOLS.map(
    (t) =>
      `- ${t.name}(${Object.entries(t.params)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}) — ${t.description}`
  ).join("\n");
}
