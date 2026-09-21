import { NextRequest, NextResponse } from "next/server";
import { checkPolicy } from "@/lib/policy";
import { evaluate } from "@/lib/rulesEngine";
import { appendLog, getState, primaryCard } from "@/lib/store";
import { dayLabel, inr, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Autopay Guard. Two intents, both policy-gated:
 *  - "arm": set up the standing instruction (always needs explicit consent).
 *  - "simulate-due-date": demo control — runs the due-date payment now.
 *    Pays the statement amount only while the safety cushion holds; if the
 *    full amount would breach it, it pays the safe part and alerts about
 *    the rest. Never silent, never below the buffer.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const intent = body?.intent === "simulate-due-date" ? "simulate-due-date" : "arm";
  const consent = body?.consent === true;

  const state = getState();
  const today = dayLabel(state.demo.monthLabel, state.demo.today);
  const card = primaryCard(state);
  const facts = evaluate(state);

  if (intent === "arm") {
    const verdict = checkPolicy(state, { type: "autopay", consent, initiator: "user" });
    if (!verdict.allow) {
      appendLog({ date: today, type: "policy-deny", note: `Blocked arming autopay — ${verdict.reason}` });
      return NextResponse.json({ ok: false, verdict }, { status: 403 });
    }
    await sleep(900);
    state.autopay = {
      armed: true,
      note: `Pays your ${card.issuer} statement amount on ${facts.dueDate}, only while your ${inr(state.bank.safetyBuffer)} cushion stays intact — otherwise it alerts you instead.`,
    };
    const entry = appendLog({
      date: today,
      type: "autopay-arm",
      note: `Autopay armed for the ${card.issuer} card: ${state.autopay.note}`,
    });
    return NextResponse.json({ ok: true, verdict, entry, state });
  }

  // ---- simulate-due-date ----
  if (!state.autopay.armed) {
    return NextResponse.json(
      { ok: false, error: "Autopay isn’t armed yet — arm it first." },
      { status: 400 }
    );
  }

  const statementAmount = card.balance; // mock: the bill equals today's balance
  if (statementAmount <= 0) {
    return NextResponse.json(
      { ok: false, error: "Nothing to pay — the card balance is already zero." },
      { status: 400 }
    );
  }

  let verdict = checkPolicy(state, {
    type: "autopay",
    amount: statementAmount,
    consent,
    initiator: state.settings.autopayGuard === "auto" ? "agent" : "user",
  });
  let amountPaid = statementAmount;
  let partial = false;

  // Full amount unsafe but a smaller one is fine → adapt, never silent.
  if (!verdict.allow && verdict.code === "DENIED_BREACHES_BUFFER" && verdict.adaptedAmount) {
    partial = true;
    amountPaid = verdict.adaptedAmount;
    verdict = checkPolicy(state, {
      type: "autopay",
      amount: amountPaid,
      consent,
      initiator: state.settings.autopayGuard === "auto" ? "agent" : "user",
    });
  }

  if (!verdict.allow) {
    appendLog({
      date: facts.dueDate,
      type: "policy-deny",
      note: `Autopay held back a ${inr(statementAmount)} payment — ${verdict.reason}`,
    });
    return NextResponse.json({ ok: false, verdict }, { status: 403 });
  }

  // --- Mocked due-date debit ---
  await sleep(1200);
  const before = card.balance / card.limit;
  card.balance -= amountPaid;
  state.bank.balance = (state.bank.balance as number) - amountPaid;
  const after = card.balance / card.limit;

  const entry = appendLog({
    date: facts.dueDate,
    type: "autopay-payment",
    amount: amountPaid,
    before,
    after,
    note: partial
      ? `Autopay paid ${inr(amountPaid)} of your ${inr(statementAmount)} ${card.issuer} bill — paying it all would have broken your ${inr(state.bank.safetyBuffer)} cushion, so you’ve been alerted about the remaining ${inr(statementAmount - amountPaid)}. Utilisation ${pct(before)} → ${pct(after)}.`
      : `Autopay paid your ${inr(amountPaid)} ${card.issuer} bill on ${facts.dueDate}, cushion intact. Utilisation ${pct(before)} → ${pct(after)}.`,
  });

  return NextResponse.json({ ok: true, verdict, entry, partial, state, facts: evaluate(state) });
}
