import type { ExplainKind, Explanation, GuardianFacts, LlmSource } from "./types";

/**
 * LAYER 2 — LLM (LANGUAGE ONLY).
 *
 * Takes the rules engine's structured facts and produces the plain-language,
 * first-time-user-friendly explanation. It EXPLAINS numbers; it never invents
 * or computes them — every figure it may mention arrives pre-formatted in
 * `facts.display`, and a post-generation guard discards any response that
 * contains a number we didn't supply.
 *
 * Provider-agnostic behind LLM_PROVIDER:
 *   "ollama"   — local open model (recommended default: keyless, offline, free)
 *   "hf"       — Hugging Face Inference API (HF_API_TOKEN)
 *   "frontier" — Anthropic (ANTHROPIC_API_KEY) or OpenAI (OPENAI_API_KEY)
 *   unset      — deterministic templated explanation (zero-setup fallback)
 *
 * Production intent: a small self-hosted open model for this high-volume
 * vernacular explanation workload (cost at scale + PII / RBI data
 * localisation); a frontier API is only a fallback for rare hard cases.
 * Any failure, timeout or unsafe output falls back to the template —
 * the app never blocks on the LLM.
 */

const TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Deterministic templates — the zero-setup fallback AND the style anchor
// handed to whichever model runs. All numbers are interpolated from the
// rules engine's pre-formatted display strings.
// ---------------------------------------------------------------------------

function template(facts: GuardianFacts, kind: ExplainKind): string {
  const d = facts.display;
  switch (kind) {
    case "alert":
      return `Action needed before ${d.statementDate} — you’re using ${d.utilisation} of your ${d.limit} limit, and your statement cuts in ${d.daysUntilStatement}.`;

    case "recommendation": {
      if (!facts.bankDataAvailable) {
        return `Your statement cuts in ${d.daysUntilStatement} and you’re using ${d.utilisation} of your limit — the bureau records that snapshot even if you pay in full later, which can cost you roughly ${d.scoreImpactBand} (an estimate, not a promise). Getting under 30% means paying ${d.paydownTo30}. I can’t see your bank balance right now, so I won’t suggest moving money on a guess — reconnect your bank and I’ll work out a safe amount.`;
      }
      if (!facts.splitRequired) {
        return `Your statement cuts in ${d.daysUntilStatement}. You’re using ${d.utilisation} of your limit, and the bureau records that snapshot even though you’ll pay it off later — that can cost you roughly ${d.scoreImpactBand} (an estimate, not a promise). Paying ${d.paydownTo30} now gets you under 30% and keeps your ${d.safetyBuffer} cushion intact. Want me to do it?`;
      }
      return `Your statement cuts in ${d.daysUntilStatement}. You’re using ${d.utilisation} of your limit, and the bureau records that snapshot even though you’ll pay it off later — that can cost you roughly ${d.scoreImpactBand} (an estimate, not a promise). To get under 30% you’d pay ${d.paydownTo30}, but I’d only move ${d.affordableNow} now so you keep a ${d.safetyBuffer} cushion for essentials, then ${d.shortfall} on ${d.dueDate} with your due amount. Want me to do the ${d.affordableNow} now?`;
    }

    case "action-summary":
      return `Moved ${d.affordableNow} to your card to protect your score before the ${d.statementDate} statement. Utilisation ${d.utilisation} → ${d.utilisationAfterNow}.${
        facts.splitRequired
          ? ` Scheduled ${d.shortfall} for ${d.dueDate} with your due amount.`
          : ""
      } Your ${d.safetyBuffer} essentials cushion stayed untouched.`;

    case "out-of-scope":
      return `I’m your credit guardian, not a general assistant — I only help protect your credit score and card health. For this one, try a general app. Anything utilisation-related, I’m on it.`;
  }
}

// ---------------------------------------------------------------------------
// Number guard: the model may only repeat numbers we supplied. If a response
// contains ANY numeric token not present in the facts, we discard it and
// serve the template instead. This makes "the LLM never does arithmetic"
// enforced, not just prompted.
// ---------------------------------------------------------------------------

function allowedNumbers(facts: GuardianFacts): Set<string> {
  const allowed = new Set<string>(["30", "100"]); // the 30% rule; percentages
  const add = (v: unknown) => {
    for (const m of String(v).matchAll(/\d[\d,]*/g)) {
      allowed.add(m[0].replaceAll(",", ""));
    }
  };
  Object.values(facts.display).forEach(add);
  [
    facts.utilisationPct,
    facts.daysUntilStatement,
    facts.scoreCurrent,
    facts.scoreImpactBand,
    facts.projected.utilisationAfterNowPct,
    facts.projected.utilisationAfterFullPct,
    facts.limitIncrease.utilisationAtNewLimitPct,
    facts.statementDate,
    facts.dueDate,
  ].forEach(add);
  return allowed;
}

export function violatesNumberGuard(text: string, facts: GuardianFacts): boolean {
  const allowed = allowedNumbers(facts);
  for (const m of text.matchAll(/\d[\d,]*/g)) {
    if (!allowed.has(m[0].replaceAll(",", ""))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Provider adapters — plain fetch, no SDKs, one interface.
// ---------------------------------------------------------------------------

function systemPrompt(facts: GuardianFacts, kind: ExplainKind): string {
  return [
    "You are Utilisation Guardian, a warm, plain-English credit copilot for a first-time Indian cardholder.",
    "HARD RULES:",
    "- Use ONLY the numbers in FACTS, verbatim as formatted. NEVER calculate, convert, or invent a number.",
    "- The score impact is a directional estimate — say so; never promise score outcomes.",
    "- A credit-limit increase is NOT extra money to spend; if you mention it, say exactly that.",
    "- No financial jargon. Under 120 words. No markdown, plain sentences.",
    `TASK: rewrite the REFERENCE text in your own warmer words (same meaning, same numbers) for: ${kind}.`,
    `FACTS: ${JSON.stringify(facts.display)}`,
    `REFERENCE: ${template(facts, kind)}`,
  ].join("\n");
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOllama(prompt: string): Promise<string> {
  const model = process.env.OLLAMA_MODEL || "llama3.2";
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const res = await timedFetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? "";
}

async function callHuggingFace(prompt: string): Promise<string> {
  const token = process.env.HF_API_TOKEN;
  if (!token) throw new Error("HF_API_TOKEN missing");
  const model = process.env.HF_MODEL || "meta-llama/Llama-3.3-70B-Instruct";
  const res = await timedFetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`hf ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callFrontier(prompt: string): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    const res = await timedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }
  if (process.env.OPENAI_API_KEY) {
    const res = await timedFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
  throw new Error("no frontier key configured");
}

// ---------------------------------------------------------------------------
// The single public entry point.
// ---------------------------------------------------------------------------

export async function explain(
  facts: GuardianFacts,
  kind: ExplainKind
): Promise<Explanation> {
  // Out-of-scope requests are refused cheaply — no provider call, no tokens.
  if (kind === "out-of-scope") {
    return { text: template(facts, kind), source: "template" };
  }

  const provider = process.env.LLM_PROVIDER as LlmSource | undefined;
  const fallback: Explanation = { text: template(facts, kind), source: "template" };
  if (!provider || provider === "template") return fallback;

  try {
    const prompt = systemPrompt(facts, kind);
    let text: string;
    if (provider === "ollama") text = await callOllama(prompt);
    else if (provider === "hf") text = await callHuggingFace(prompt);
    else if (provider === "frontier") text = await callFrontier(prompt);
    else return fallback;

    // Reasoning-style open models may wrap deliberation in <think> tags — drop it.
    text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // Guard: empty, rambling, or containing numbers we didn't supply → template.
    if (!text || text.length > 900 || violatesNumberGuard(text, facts)) {
      console.warn(
        `[llm] ${provider} response discarded by output guard (empty/too long/unsupplied number) — serving template`
      );
      return fallback;
    }
    return { text, source: provider };
  } catch (err) {
    // Never block the product on the model — but say why in the server logs.
    console.warn(
      `[llm] ${provider} call failed — serving template:`,
      err instanceof Error ? err.message : err
    );
    return fallback;
  }
}
