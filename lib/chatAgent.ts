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
    "- Figures must come from THIS turn's tool results. Even when confirming an earlier check ('did you check X?'), re-call the tool (it's free, data may have changed) before quoting the number.",
    "- NEVER say you will check, look at, or plan something. The user cannot see tools. If an answer needs a check, make the tool call NOW and answer with the result in the same turn. \"Let's check X\" is a failed answer.",
    "- Answer the user's actual question in your FIRST sentence, with specifics. Never restate a previous answer — every reply must add new information.",
    "- Weave the key results you fetched into the answer — the DATES as much as the amounts. Fetching getStatementTiming and then answering without a date is a failed answer.",
    "- When explaining the statement-snapshot problem, fetch the real dates with getStatementTiming first — never explain it dateless.",
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
    "",
    "EXAMPLE of a good turn:",
    'user: "When should I pay to be safe?"',
    'you: {"tool": "getStatementTiming", "args": {}}',
    '(TOOL RESULT arrives: statement date, days left, due date)',
    'you: {"tool": "getObligations", "args": {}}',
    '(TOOL RESULT arrives: deployable amount)',
    'you: {"answer": "Before <statement date from the result> — that\'s <days> days away, when the bureau takes its snapshot. You can safely move <deployable amount> today; paying by the <due date> alone won\'t help the snapshot."}',
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
  // Quoting the conversation back is always safe: the user's own numbers,
  // and figures the assistant already stated (those passed the guard when
  // first produced, i.e. they trace to a tool result transitively).
  for (const m of messages) {
    for (const n of extractNumericTokens(m.content)) ctx.allowed.add(n);
  }

  const convo: ProviderMessage[] = [
    { role: "system", content: systemPrompt(state) },
    // Tool memory: replay what the assistant checked on earlier turns, so
    // "did you check X?" gets a real answer instead of a re-statement.
    ...messages.map((m) => ({
      role: m.role,
      content:
        m.role === "assistant" && m.toolsUsed?.length
          ? `${m.content}\n[on that turn you checked: ${m.toolsUsed.join(", ")}]`
          : m.content,
    })),
  ];

  try {
    let guardRetries = 0;
    let retriedDeferral = false;
    for (let step = 0; step <= MAX_TOOL_CALLS + 2; step++) {
      const result = await rawChat(convo, 700, 0.3);
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

      // Quality guard: an answer that promises to check something is a
      // failed answer — the user never sees tools. Make it do the work now.
      const DEFERRAL =
        /let'?s (check|look|review|plan|see)|let me (check|look|pull|see)|i(['’]| wi)ll (check|look|pull|review)|we (can|should|['’]ll) (check|look|review)/i;
      if (DEFERRAL.test(answer) && !retriedDeferral && ctx.trace.length < MAX_TOOL_CALLS) {
        retriedDeferral = true;
        console.warn("[chat] deferral guard tripped — forcing the tool call now");
        convo.push(
          { role: "assistant", content: JSON.stringify(turn) },
          {
            role: "user",
            content:
              "You deferred ('let's check…'). The user never sees tool calls — call the tool NOW and give the answer with its actual results, no promises of future checks.",
          }
        );
        continue;
      }

      // Guardrail 2: every number must trace to a tool result from THIS turn.
      const verdict = verifyChatAnswer(answer, ctx.allowed);
      if (!verdict.ok) {
        if (guardRetries < 2) {
          guardRetries++;
          convo.push(
            { role: "assistant", content: JSON.stringify(turn) },
            {
              role: "user",
              content:
                guardRetries === 1
                  ? `NUMBER GUARD: your answer contains figures no tool returned this turn (${verdict.offending.join(", ")}). Call the tool that produces them (e.g. getUtilisation, getObligations), then answer with its fresh results.`
                  : `NUMBER GUARD again (${verdict.offending.join(", ")}). Reply with a {"tool": ...} call FIRST — do not answer until a tool has returned these figures.`,
            }
          );
          continue;
        }
        console.warn(`[chat] number guard tripped ${guardRetries + 1}x (${verdict.offending.join(", ")}) — serving canned answer`);
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

  // "I can only spare/pay ₹10,000" → simulate that exact paydown.
  const spareMatch = q.match(/(?:spare|only (?:have|pay|manage|afford)|can (?:pay|do|manage))\D{0,12}?₹?\s?(\d[\d,]*)\s*(k)?/);
  if (spareMatch) {
    const amount = Number(spareMatch[1].replaceAll(",", "")) * (spareMatch[2] ? 1000 : 1);
    if (amount > 0) {
      const sim = call("simulatePaydown", { cardId: state.primaryCardId, amount });
      return reply(
        `${sim.amount} today takes you from ${sim.utilisationBefore} to ${sim.utilisationAfter} at the snapshot — ${
          sim.affordableWithoutBreachingCushion
            ? `safely within your means (${sim.maxSafeToday} is the most you could move without touching your ${sim.cushionProtected} cushion)`
            : `though that would dip into your ${sim.cushionProtected} cushion — ${sim.maxSafeToday} is the most I'd move`
        }. Every bit under the snapshot helps, even if you don't reach 30%.`
      );
    }
  }

  if (/did you (check|look|verify)|have you (checked|looked)/.test(q)) {
    const util = call("getUtilisation", {});
    return reply(
      `Yes — just now: your ${String(util.issuer)} card is at ${util.utilisation} (${util.balance} of ${util.limit}).`
    );
  }

  if (/when (exactly )?(should|do|can) i pay|by when|what date|pay by|best (time|date)/.test(q)) {
    const timing = call("getStatementTiming", {});
    const obligations = call("getObligations");
    return reply(
      `Before ${timing.statementDate} — that's ${timing.daysUntilStatement} days away, when the bureau takes its snapshot. You can safely move ${obligations.deployableToday} today. Paying only by the ${timing.dueDate} due date avoids fees, but it's after the snapshot, so it won't protect your score.`
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
