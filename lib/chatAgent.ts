import { rawChat, type ProviderMessage } from "./llm";
import { extractNumericTokens, screenChatMessage, verifyChatAnswer } from "./policy";
import { getTool, toolCatalog, TOOLS } from "./tools";
import { dayLabel } from "./format";
import type {
  ActionProposal,
  AppState,
  ChatMessage,
  ChatReply,
  ToolTrace,
} from "./types";

/**
 * THE GROUNDED CHAT AGENT.
 *
 * The model orchestrates and explains; it computes nothing. Every numeric
 * claim must come from a tool in lib/tools.ts, enforced two ways:
 *  1. The system prompt gives the model NO numbers — it must call tools.
 *  2. verifyChatAnswer() rejects any answer containing a number that no
 *     tool returned this turn (one corrective retry, then canned fallback).
 *
 * Protocol: provider-agnostic manual JSON tool-calling — each model turn
 * must be exactly one JSON object: {"tool": name, "args": {...}} or
 * {"answer": "..."}. Works on any chat model, no native function-calling
 * needed. With no provider configured, a canned intent engine answers the
 * seeded questions — still via real tool calls, so still grounded/traced.
 */

const MAX_TOOL_CALLS = 6;

function systemPrompt(state: AppState): string {
  // Deliberately number-free: the model must fetch every figure via tools.
  const cards = state.cards.map((c) => `${c.id} (${c.issuer})`).join(", ");
  const emis = state.emis.length
    ? state.emis.map((e) => e.name).join(", ")
    : "none";
  return [
    `You are Utilisation Guardian, a warm, plain-English credit copilot for ${state.user.name}, a first-time cardholder in ${state.user.city}. Today is ${dayLabel(state.demo.monthLabel, state.demo.today)}.`,
    `Their cards: ${cards}. EMIs: ${emis}. Primary card: ${state.primaryCardId}.`,
    "",
    "HARD RULES:",
    "- You know NO numbers. For ANY numeric or factual claim (balances, dates, utilisation, score impact, plans), call a tool first and repeat its figures verbatim.",
    "- Score/eligibility statements are directional estimates — say so, never promise.",
    "- A credit-limit increase is never 'more money to spend'.",
    "- You cannot move money. If the user wants to act, call proposeAction — it gives them a review button; never claim you executed anything.",
    "- Only credit/card/payment topics. Refuse anything else in one polite line.",
    "",
    "TOOLS:",
    toolCatalog(),
    "",
    "PROTOCOL — reply with EXACTLY ONE JSON object and nothing else:",
    '  {"tool": "<name>", "args": {...}}   to call a tool (results come back as TOOL RESULT messages)',
    '  {"answer": "<plain-English answer, under 130 words>"}   when ready to answer',
    "Chain tools as needed (max 6 per turn). Answer conversationally; do not mention tools or JSON in the answer text.",
  ].join("\n");
}

function parseModelTurn(
  raw: string
): { tool?: string; args?: Record<string, unknown>; answer?: string } | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], raw, raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const obj = JSON.parse(c.trim());
      if (obj && typeof obj === "object" && ("tool" in obj || "answer" in obj)) return obj;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function summarizeResult(result: unknown): string {
  const s = JSON.stringify(result);
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}

interface TurnContext {
  trace: ToolTrace[];
  allowed: Set<string>;
  proposal?: ActionProposal;
}

function execTool(
  state: AppState,
  name: string,
  args: Record<string, unknown>,
  ctx: TurnContext
): { result?: unknown; error?: string } {
  const tool = getTool(name);
  if (!tool) return { error: `unknown tool "${name}" — valid: ${TOOLS.map((t) => t.name).join(", ")}` };
  try {
    const result = tool.run(state, args ?? {});
    ctx.trace.push({ tool: name, args: args ?? {}, resultSummary: summarizeResult(result) });
    for (const n of extractNumericTokens(JSON.stringify(result))) ctx.allowed.add(n);
    const maybe = result as { proposal?: ActionProposal };
    if (name === "proposeAction" && maybe.proposal) ctx.proposal = maybe.proposal;
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runChat(state: AppState, messages: ChatMessage[]): Promise<ChatReply> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Guardrail 1: cheap scope screen — no tokens spent on out-of-scope asks.
  const scope = screenChatMessage(lastUser);
  if (!scope.allowed) {
    return { text: scope.refusal!, source: "canned", trace: [] };
  }

  const ctx: TurnContext = { trace: [], allowed: new Set() };
  // The user's own message may contain numbers (e.g. "I need ₹10,000 for rent")
  // — quoting the user back is always safe.
  for (const n of extractNumericTokens(lastUser)) ctx.allowed.add(n);

  const convo: ProviderMessage[] = [
    { role: "system", content: systemPrompt(state) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    let retriedGuard = false;
    for (let step = 0; step <= MAX_TOOL_CALLS + 2; step++) {
      const result = await rawChat(convo, 600);
      if (result === null) return cannedAnswer(state, lastUser); // no provider configured

      const turn = parseModelTurn(result.text);
      if (!turn) {
        convo.push(
          { role: "assistant", content: result.text },
          { role: "user", content: 'FORMAT ERROR: reply with exactly one JSON object — {"tool":...} or {"answer":...}.' }
        );
        continue;
      }

      if (turn.tool && ctx.trace.length < MAX_TOOL_CALLS) {
        const { result: toolResult, error } = execTool(state, turn.tool, turn.args ?? {}, ctx);
        convo.push(
          { role: "assistant", content: JSON.stringify(turn) },
          {
            role: "user",
            content: error
              ? `TOOL ERROR (${turn.tool}): ${error}`
              : `TOOL RESULT (${turn.tool}): ${JSON.stringify(toolResult)}`,
          }
        );
        continue;
      }

      const answer = String(turn.answer ?? "").trim();
      if (!answer) {
        convo.push(
          { role: "assistant", content: JSON.stringify(turn) },
          { role: "user", content: 'Tool budget reached — give your {"answer": ...} now, using only figures from tool results.' }
        );
        continue;
      }

      // Guardrail 2: every number must trace to a tool result.
      const verdict = verifyChatAnswer(answer, ctx.allowed);
      if (!verdict.ok) {
        if (!retriedGuard) {
          retriedGuard = true;
          convo.push(
            { role: "assistant", content: JSON.stringify(turn) },
            {
              role: "user",
              content: `NUMBER GUARD: your answer contains figures no tool returned (${verdict.offending.join(", ")}). Rewrite using only tool-result figures, or call the tool you need.`,
            }
          );
          continue;
        }
        console.warn(`[chat] number guard tripped twice (${verdict.offending.join(", ")}) — serving canned answer`);
        return cannedAnswer(state, lastUser);
      }

      return { text: answer, source: result.source, trace: ctx.trace, actionProposal: ctx.proposal };
    }
    console.warn("[chat] turn budget exhausted — serving canned answer");
    return cannedAnswer(state, lastUser);
  } catch (err) {
    console.warn("[chat] provider failed — serving canned answer:", err instanceof Error ? err.message : err);
    return cannedAnswer(state, lastUser);
  }
}

// ---------------------------------------------------------------------------
// Canned fallback: keyword intents for the seeded questions. Answers are
// still built from REAL tool calls — grounded and traced, just templated
// wording. This is what runs with zero LLM configuration.
// ---------------------------------------------------------------------------

// Canned answers read dynamic tool JSON — a typed escape hatch is cleaner
// than casting every field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolJson = Record<string, any>;

function cannedAnswer(state: AppState, question: string): ChatReply {
  const ctx: TurnContext = { trace: [], allowed: new Set() };
  const q = question.toLowerCase();
  const call = (name: string, args: Record<string, unknown> = {}) =>
    execTool(state, name, args, ctx).result as ToolJson;

  const reply = (text: string): ChatReply => ({
    text,
    source: "canned",
    trace: ctx.trace,
    actionProposal: ctx.proposal,
  });

  // "I need ₹10k for rent" → re-plan with a reserve.
  const reserveMatch = q.match(/(?:need|keep|hold|set aside|reserve).{0,24}?₹?\s?(\d[\d,]*)\s*(k)?/);
  if (reserveMatch && /rent|need|keep|aside|reserve/.test(q)) {
    const amount = Number(reserveMatch[1].replaceAll(",", "")) * (reserveMatch[2] ? 1000 : 1);
    const plan = call("buildPlan", { reserves: [{ amount, reason: "held back for you" }] });
    return reply(
      `Understood — I’ve set that aside and re-planned. With ${plan.deployableToday} left to work with: ${formatSteps(plan)} Your ${plan.cushionUntouched} cushion stays untouched on top of what you’re holding back.`
    );
  }

  if (/pay (it|this|that) down|go ahead|do it|yes.*pay|pay now/.test(q)) {
    const obligations = call("getObligations");
    const deployableStr = String(obligations.deployableToday);
    const amount = Number(deployableStr.replace(/[₹,]/g, ""));
    call("proposeAction", { type: "paydown", cardId: state.primaryCardId, amount });
    return reply(
      `Happy to — but money only moves with your explicit yes. I’ve prepared the ${deployableStr} paydown for review; approve it on the consent screen and I’ll do the rest.`
    );
  }

  if (/pay in full|full every month|why does this matter|already pay/.test(q)) {
    const timing = call("getStatementTiming", {});
    const util = call("getUtilisation", {});
    const impact = call("projectScoreImpact", { utilisationPct: parseInt(String(util.utilisation)) });
    return reply(
      `Paying in full protects you from interest — but not from the snapshot. ${timing.snapshotFact} Yours cuts on ${timing.statementDate}, and right now it would record ${util.utilisation} of your ${util.limit} limit. That's roughly ${impact.impactBand}. Getting the balance down before ${timing.statementDate} is what changes the story.`
    );
  }

  if (/loan|eligib|borrow/.test(q)) {
    const signal = call("loanEligibilitySignal");
    return reply(
      `Honest answer: it's "${signal.signalNow}" right now — ${signal.reasons.join("; ")}. ${signal.ifReportedUnder30.note}. That's a directional read from your data, not a promise — the lender decides.`
    );
  }

  if (/minimum|min due|min-due/.test(q)) {
    const obligations = call("getObligations");
    const card = obligations.obligations.find((o: ToolJson) => o.kind === "card");
    return reply(
      `Paying the minimum (${card.minimumDue}) keeps you out of "late" territory, but it doesn't help the snapshot: on ${card.statementDate} the bureau still sees ${card.utilisation}, and interest starts compounding on the rest. Minimum due is a floor for emergencies, not a strategy.`
    );
  }

  if (/which card|first|priorit|plan|emi|skip/.test(q)) {
    const plan = call("buildPlan", {});
    return reply(
      `Here's the order that protects you most with the ${plan.deployableToday} you can safely move: ${formatSteps(plan)}${
        plan.leftUnpaidDeliberately?.length
          ? ` ${plan.leftUnpaidDeliberately.map((u: ToolJson) => `${u.card} stays untouched at ${u.utilisation} — ${u.why}.`).join(" ")}`
          : ""
      }`
    );
  }

  // Default: a grounded overview.
  const obligations = call("getObligations");
  return reply(
    `Here's where you stand: ${obligations.deployableToday} can move safely today (bank ${obligations.bankBalance}, cushion ${obligations.safetyCushion} protected). Ask me things like "why does this matter if I pay in full?", "which card should I pay first?", or "will this help me get a loan?" — I'll work it out from your actual data.`
  );
}

function formatSteps(plan: ToolJson): string {
  return (plan.steps as ToolJson[])
    .map((s) => `${s.order}) ${s.amount} to ${s.pay} — ${s.why}.`)
    .join(" ");
}
