import { NextRequest, NextResponse } from "next/server";
import { checkPolicy } from "@/lib/policy";
import { evaluate } from "@/lib/rulesEngine";
import { appendLog, getState, primaryCard } from "@/lib/store";
import { dayLabel, inr, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Mocked bank-debit latency — makes the action feel real in the demo. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pre-statement paydown. EVERY request passes through the policy/guardrail
 * gate first — there is no code path that moves money without a verdict.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount);
  const consent = body?.consent === true;
  const initiator = body?.initiator === "agent" ? "agent" : "user";

  const state = getState();
  const verdict = checkPolicy(state, { type: "paydown", amount, consent, initiator });

  if (!verdict.allow) {
    // Guardrail health is auditable: denials are logged too.
    appendLog({
      date: dayLabel(state.demo.monthLabel, state.demo.today),
      type: "policy-deny",
      amount: Number.isFinite(amount) ? amount : undefined,
      note: `Blocked a ${Number.isFinite(amount) ? inr(amount) : ""} paydown — ${verdict.reason}`,
    });
    return NextResponse.json({ ok: false, verdict }, { status: 403 });
  }

  const factsBefore = evaluate(state);
  const before = factsBefore.utilisation;

  // --- Mocked bank debit (simulated latency, deterministic success) ---
  await sleep(1200);

  const card = primaryCard(state);
  card.balance -= amount;
  state.bank.balance = (state.bank.balance as number) - amount;
  state.demo.nudgedThisCycle = true;

  const after = card.balance / card.limit;

  // Schedule the remainder (the affordability-adjusted split) if still above 30%.
  const remaining = Math.max(0, card.balance - factsBefore.targetBalance30);
  const dueDate = factsBefore.dueDate;
  if (remaining > 0) {
    state.scheduled.push({
      date: dueDate,
      amount: remaining,
      note: `Second leg of the split — clears with your due amount on ${dueDate}.`,
    });
  }

  const today = dayLabel(state.demo.monthLabel, state.demo.today);
  const entry = appendLog({
    date: today,
    type: initiator === "agent" ? "auto-paydown" : "paydown",
    amount,
    before,
    after,
    note: `Moved ${inr(amount)} from ${card.issuer} savings to your card to protect your score before the ${factsBefore.statementDate} statement. Utilisation ${pct(before)} → ${pct(after)}.${remaining > 0 ? ` Scheduled ${inr(remaining)} for ${dueDate}.` : ""}${initiator === "agent" ? " (Autonomous, within your cap.)" : ""}`,
  });

  return NextResponse.json({
    ok: true,
    verdict,
    entry,
    state,
    facts: evaluate(state),
  });
}
