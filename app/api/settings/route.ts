import { NextRequest, NextResponse } from "next/server";
import { appendLog, getState } from "@/lib/store";
import { dayLabel, inr } from "@/lib/format";
import type { AutonomyLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEVELS: AutonomyLevel[] = ["off", "ask", "auto"];
const LABELS: Record<AutonomyLevel, string> = {
  off: "Off — warn only",
  ask: "Ask first",
  auto: "Autonomous within cap",
};

/** Update the trust dial: autonomy level and/or the auto-move cap. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const state = getState();
  const changes: string[] = [];

  if (LEVELS.includes(body?.utilGuard) && body.utilGuard !== state.settings.utilGuard) {
    state.settings.utilGuard = body.utilGuard;
    changes.push(`autonomy → ${LABELS[state.settings.utilGuard]}`);
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

  return NextResponse.json({ ok: true, settings: state.settings });
}
