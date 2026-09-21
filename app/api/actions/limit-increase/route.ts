import { NextRequest, NextResponse } from "next/server";
import { checkPolicy } from "@/lib/policy";
import { evaluate } from "@/lib/rulesEngine";
import { appendLog, getState } from "@/lib/store";
import { dayLabel, inr } from "@/lib/format";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mocked issuer limit-increase request. Policy-gated like everything else.
 * The copy NEVER frames this as more room to spend — it lowers the ratio.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const consent = body?.consent === true;

  const state = getState();
  const verdict = checkPolicy(state, { type: "limit-increase", consent, initiator: "user" });

  if (!verdict.allow) {
    appendLog({
      date: dayLabel(state.demo.monthLabel, state.demo.today),
      type: "policy-deny",
      note: `Blocked a limit-increase request — ${verdict.reason}`,
    });
    return NextResponse.json({ ok: false, verdict }, { status: 403 });
  }

  const facts = evaluate(state);

  // --- Mocked issuer call: deterministic "submitted" outcome ---
  await sleep(1500);

  const entry = appendLog({
    date: dayLabel(state.demo.monthLabel, state.demo.today),
    type: "limit-increase",
    amount: facts.limitIncrease.requestedLimit,
    note: `Requested a limit increase to ${inr(facts.limitIncrease.requestedLimit)} from ${facts.display.issuer}. If approved, the same spend reports as ${facts.display.utilisationAtNewLimit} instead of ${facts.display.utilisation}. This is not extra money to spend — it lowers your reported ratio. Most issuer increases don’t trigger a hard enquiry.`,
  });

  return NextResponse.json({
    ok: true,
    verdict,
    status: "submitted",
    entry,
    state,
    facts: evaluate(state),
  });
}
