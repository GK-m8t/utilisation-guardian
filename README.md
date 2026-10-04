# Utilisation Guardian

A youth credit copilot that takes **real, permissioned agentic action** to protect a first-time cardholder's credit score — before the statement cuts, not after. Proof-of-concept for the Oolka AI PM case study: it feels like a real fintech app, but every external system (bank, bureau, issuer) is mocked.

## The insight

First-time cardholders believe *"I pay my bill in full, so my score is safe."* It's false. Bureaus snapshot the card balance on the **statement generation date**, not after payment — so someone who spends heavily and pays in full a week later is still reported at high utilisation, quietly costing 20–40 points. Almost nobody knows this. It's preventable by an agent that acts **before** the statement date.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. **No API key, no database, no configuration required** — the LLM layer degrades to a deterministic templated explanation, chat degrades to grounded canned answers, and state lives in memory (there's a "Reset the demo scenario" button under Activity).

Two seeded scenarios (switch in Settings):
- **One card** — George, 24, Bengaluru. HDFC card, ₹60,000 limit, ₹49,200 balance (**82% utilisation**), statement on the 30th, today is the 20th. Bank ₹38,000, of which ₹15,000 is essentials until salary. Score 761.
- **Real life (messy)** — the same, plus an ICICI card (₹40,000 limit, ₹12,000 = 30%, statement Oct 8) and a ₹6,500 personal-loan EMI due Sep 25 — a hard must-pay. Multiple obligations now compete for the same ₹23,000 of safely-deployable cash, which is what makes the agent's prioritisation and re-planning load-bearing.

## The architecture — three layers, one boundary

> Use the model for what it's good at (language, empathy, explanation) and rules for what it must never get wrong (financial math, thresholds, actions). **That boundary is the product design.**

| Layer | File | Owns |
|---|---|---|
| 1 — Rules engine | `lib/rulesEngine.ts` + `lib/tools.ts` | **Every number.** Utilisation, the paydown-to-30% amount, affordability vs. the safety buffer, severity tiers, timing, the directional score-impact band, the prioritised multi-obligation plan. Deterministic TypeScript — the LLM never does arithmetic. |
| 2 — Language | `lib/llm.ts` + `lib/chatAgent.ts` | **Words and orchestration only.** Explains pre-formatted facts, and in chat decides *which tools to call* — but is given no numbers and may only repeat figures a tool returned. A post-generation guard rejects anything else. |
| 3 — Policy gate | `lib/policy.ts` | **When NOT to act.** Consent, safety buffer, autonomy caps, missing-signal checks — run before *any* action executes (paydowns, limit increases, autopay). Chat gets its own gates: scope screening and the tool-number verifier. Every denial is logged. |

The harm-aware recommendation this produces: getting under 30% needs **₹31,200**, but George only has ₹38,000 with ₹15,000 needed for essentials. A naive agent would tell him to pay money he doesn't have. This one moves **₹23,000 now** and schedules **₹8,200 for Oct 22**, with his due amount.

### Guardrails (the "when not to act" rules)

- Never execute without consent — unless autonomy is granted **and** the amount is within the user's cap **and** above the safety buffer.
- Never recommend a paydown that breaches the essentials buffer; adapt or split instead.
- Missing bank signal → propose-only. Never guess with someone's money.
- A limit increase is never framed as "more to spend."
- Score impact is always labelled a directional estimate, never a promise.
- Out-of-scope requests are refused cheaply — no model call at all.

Hard invariant: **zero un-consented actions.** Verifiable in `lib/policy.ts` — every action route passes through `checkPolicy()` and there is no other code path that moves money. Saying "pay it down" in chat produces a *proposal button* that routes through the consent screen — chat cannot execute.

## The grounded chat layer (why the AI is load-bearing)

The "Ask" tab is a tool-using agent, not a free-text generator:

- The model is handed **no numbers** — for any numeric or factual claim it must call one of the deterministic tools in `lib/tools.ts` (`getUtilisation`, `simulatePaydown`, `projectScoreImpact`, `getStatementTiming`, `getObligations`, `loanEligibilitySignal`, `buildPlan`, `proposeAction`) and repeat the results verbatim.
- **Enforced, not just prompted:** `verifyChatAnswer()` in `lib/policy.ts` rejects any answer containing a figure no tool returned this turn (one corrective retry, then a grounded canned fallback).
- Every answer carries a collapsible **"How I worked this out"** trace listing the exact tool calls — the visible proof the AI is grounded in deterministic tools, not hallucinating money math.
- The tool protocol is **provider-agnostic JSON** (no native function-calling needed), so the same loop runs on a small open model — the reasoning is tool-grounded, which is precisely why a big frontier model isn't required.
- **Interactive re-planning** is the part if/else can't scale to: in the messy scenario, "which card should I pay first?" yields a prioritised plan (EMI first — a default is worse than any utilisation hit; then the 82% card; the 30% card deliberately untouched), and "I need ₹10,000 for rent" re-plans live under the new constraint.
- Out-of-scope asks (stocks, legal, general chat) are refused by a keyword screen **before** any model call — zero tokens.
- Session memory is per-session (client-held history); persistent cross-session agentic memory is the production extension.

## Autopay Guard

The second per-action autonomy dial: pays the statement amount on the due date **only while the safety cushion holds** — if paying in full would breach it, it pays the safe part and alerts about the rest, never overdrawing quietly. Arming always requires explicit consent; execution honours ask-first vs autonomous. Since the demo clock is frozen, a "fast-forward to the due date" button plays the payment out through the same policy gate and lands the same legible log entry.

## The LLM layer: open-model-first

Set `LLM_PROVIDER` in `.env.local` (see `.env.example`):

| Provider | Setup | Notes |
|---|---|---|
| *(unset)* | none | Deterministic templated explanation. The app never blocks on a model. |
| `ollama` | [Install Ollama](https://ollama.com), `ollama pull llama3.2` | **Recommended default.** Local open model: keyless, offline, free. |
| `hf` | `HF_API_TOKEN` | Hugging Face Inference API (default `meta-llama/Llama-3.3-70B-Instruct`). The easy way to get a live open model on a Vercel deploy. |
| `frontier` | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | Frontier API, for comparison. |

All providers sit behind one interface (`explain(facts, kind)`) — swapping is one env var. Any failure or timeout silently falls back to the template. The UI shows a small provenance badge ("words from…") so you can see which source produced the copy.

**Why open-model-first for production:** this workload is high-volume, short-form, vernacular explanation — exactly what a small self-hosted open model does well. At scale, per-call frontier pricing dominates unit economics; and the payloads contain financial PII, where RBI data-localisation expectations make keeping inference in-country and in-house the safer default. A frontier API remains a fallback for rare hard cases only.

## The product shape

- **First-run onboarding** (3 screens, skippable): meet the Guardian → connect your bank + set the essentials cushion → choose autonomy. The Guardian earns its permissions before it acts.
- **Three tabs — Home · Ask · Activity** — with Settings behind the header gear. Each guard's autonomy is controlled on its own surface.
- **Consent is a bottom sheet with slide-to-confirm**: the split, the cushion bar, a one-line trust row, and a deliberate gesture. Policy denials render *inside the sheet*, in place of the confirm control — the guardrail appears exactly where you acted. Success (the 82% → 44% morph) animates in-sheet.
- **Guardian explainer** is visual-first — the snapshot timeline, three stat tiles, a docked CTA — with depth handed off to Ask ("Why does this matter if I pay in full?" pre-fires in chat).
- **Ask** — the grounded chat, with per-answer "How I worked this out" tool traces and consent-gated action proposals that open the same sheet.
- **Autopay guard** — its own trust dial and armed rule; the buffer-aware partial-payment behaviour.
- **Demo harness is quarantined**: scenario switch, money overrides, due-date fast-forward, reset, and LLM status all live in a discreet "demo" drawer outside the product surface. The app itself carries zero demo furniture. Every recommendation, plan, and guardrail re-derives live from the money inputs — set the cushion above the bank balance and the Guardian drops to propose-only.

On wide screens, a side rail narrates the architecture live: the numbers the rules engine computed, where the words came from (including the last chat answer's tool chain), and the checks the last action passed or failed.

## API surface

- `GET /api/state` — full snapshot (`POST` resets the demo)
- `POST /api/guardian/evaluate` — rules engine: detection, amounts, severity, impact band
- `POST /api/guardian/explain` — LLM layer (`{ kind: "alert" | "recommendation" | "action-summary" | "out-of-scope" }`)
- `POST /api/chat` — grounded chat: `{ messages }` → answer + tool trace + optional consent-gated action proposal
- `POST /api/actions/paydown` — mocked bank debit; policy-gated
- `POST /api/actions/limit-increase` — mocked issuer request; policy-gated
- `POST /api/actions/autopay` — `{ intent: "arm" | "simulate-due-date" }`; policy-gated
- `PATCH /api/settings` — autonomy dials, auto-move cap, demo scenario
- `GET /api/llm-status` — deployment diagnostics (`?probe=1` makes one live provider call)

External calls are mocked with simulated latency and deterministic outcomes.

## Connectors (sandbox/test-mode only — no real data, ever)

Phase-2 integrations live behind `lib/connectors/`, each with the same contract as the LLM layer: env-selected, graceful mock fallback, provenance surfaced in the UI.

- **Bank (`BANK_PROVIDER`, default `aa-sim`)** — a self-hosted **Account Aggregator simulator** that mirrors the Setu Bridge consent contract: consent session → the aggregator's hosted consent screen (its own surface, not the Guardian's) → grant → FI data fetch, with a deterministic 6-month synthetic deposit payload. Onboarding's "Link HDFC savings" runs this flow for real; the linked card shows "via Account Aggregator (simulator) · consent on record". Why a simulator: the real Setu AA sandbox signup is geo-fenced to India (and production AA requires an FIU licence); the app-side flow is identical, so real keys are an env swap. Direct CIBIL access, for anyone unregulated, is legally impossible (CICRA specified-user regime) — the seam shows where it would plug in.
- **Payments (`PAY_PROVIDER=razorpay` + `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`)** — every executed move creates a **test-mode Razorpay Order**, and the action log shows the `order_…` receipt chip (openable in the Razorpay test dashboard). The connector refuses live keys (`rzp_live_…`) on principle. Without keys, receipts are simulated and labelled as such.

## Deploying

Standard Next.js — deploys to Vercel free tier as-is (`vercel` or import the repo). State is in-memory per serverless instance, which is fine for a demo; the reset button reseeds after cold starts. Optionally set `LLM_PROVIDER=hf` + `HF_API_TOKEN` (or `frontier` + a key) in the project's environment variables for live explanations.

## Success metrics (for the case study)

- **Activation:** % enabling the Guardian; autonomy-level mix.
- **Primary outcome:** average reported utilisation down; % of statements cutting under 30%.
- **North-star:** score improvement over 3–6 months, Guardian users vs. holdout control.
- **Trust:** consent-grant rate; opt-out rate.
- **Guardrail health:** % of recommendations flagged unaffordable and adapted; **zero un-consented actions** as a hard invariant.

## Scope

One flow only (the Utilisation Guardian). Autopay and disputes appear as disabled stubs for context. No auth, no real integrations, no database — prototype polish over breadth.
