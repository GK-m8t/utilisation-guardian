import { NextRequest, NextResponse } from "next/server";
import { appendLog, getState, resetState } from "@/lib/store";
import { dayLabel, inr } from "@/lib/format";
import type { AutonomyLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEVELS: AutonomyLevel[] = ["off", "ask", "auto"];
const LABELS: Record<AutonomyLevel, string> = {
  off: "Off — warn only",
  ask: "Ask first",
  auto: "Autonomous within cap",
};

/** Update the trust dials, the auto-move cap, or the demo scenario. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Scenario switch re-seeds the whole demo (fresh state, fresh log).
  if (body?.scenario === "simple" || body?.scenario === "messy") {
    if (body.scenario !== getState().scenario) {
      const state = resetState(body.scenario);
      return NextResponse.json({ ok: true, settings: state.settings, scenario: state.scenario });
    }
  }

  const state = getState();
  const changes: string[] = [];

  if (LEVELS.includes(body?.utilGuard) && body.utilGuard !== state.settings.utilGuard) {
    state.settings.utilGuard = body.utilGuard;
    changes.push(`utilisation autonomy → ${LABELS[state.settings.utilGuard]}`);
  }

  if (LEVELS.includes(body?.autopayGuard) && body.autopayGuard !== state.settings.autopayGuard) {
    state.settings.autopayGuard = body.autopayGuard;
    if (body.autopayGuard === "off") state.autopay = { armed: false, note: null };
    changes.push(`autopay autonomy → ${LABELS[state.settings.autopayGuard]}`);
  }

  const cap = Number(body?.autoCap);
  if (Number.isFinite(cap) && cap >= 0 && cap !== state.settings.autoCap) {
    state.settings.autoCap = Math.round(cap);
    changes.push(`auto-move cap → ${inr(state.settings.autoCap)}`);
  }

  if (changes.length > 0) {
    appendLog({
      date: dayLabel(state.demo.monthLabel, state.demo.today),
      type: "settings-change",
      note: `You updated the Guardian: ${changes.join("; ")}.`,
    });
  }

  return NextResponse.json({ ok: true, settings: state.settings, scenario: state.scenario });
}
