import { NextRequest, NextResponse } from "next/server";
import { explain } from "@/lib/llm";
import { evaluate } from "@/lib/rulesEngine";
import { getState } from "@/lib/store";
import type { ExplainKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: ExplainKind[] = ["alert", "recommendation", "action-summary", "out-of-scope"];

/**
 * LLM layer endpoint: language only. The rules engine computes the facts
 * server-side and hands them over pre-formatted — the model never sees raw
 * state and never computes. Falls back to a deterministic template when no
 * provider is configured, so this always answers.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind: ExplainKind = KINDS.includes(body?.kind) ? body.kind : "recommendation";
  const facts = evaluate(getState());
  const explanation = await explain(facts, kind);
  return NextResponse.json(explanation);
}
