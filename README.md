# Utilisation Guardian

A youth credit copilot that takes **real, permissioned agentic action** to protect a first-time cardholder's credit score — before the statement cuts, not after. Proof-of-concept for the Oolka AI PM case study: it feels like a real fintech app, but every external system (bank, bureau, issuer) is mocked.

## The insight

First-time cardholders believe *"I pay my bill in full, so my score is safe."* It's false. Bureaus snapshot the card balance on the **statement generation date**, not after payment — so someone who spends heavily and pays in full a week later is still reported at high utilisation, quietly costing 20–40 points. Almost nobody knows this. It's preventable by an agent that acts **before** the statement date.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. **No API key, no database, no configuration required** — the LLM layer degrades to a deterministic templated explanation, and state lives in memory (there's a "Reset the demo scenario" button under Activity).

The seeded scenario: George, 24, Bengaluru. HDFC card, ₹60,000 limit, ₹49,200 balance (**82% utilisation**), statement on the 30th, today is the 20th. Bank balance ₹38,000, of which ₹15,000 is needed for essentials until salary. Score 761.

## The architecture — three layers, one boundary

> Use the model for what it's good at (language, empathy, explanation) and rules for what it must never get wrong (financial math, thresholds, actions). **That boundary is the product design.**

| Layer | File | Owns |
|---|---|---|
| 1 — Rules engine | `lib/rulesEngine.ts` | **Every number.** Utilisation, the paydown-to-30% amount, affordability vs. the safety buffer, severity tiers, timing, the directional score-impact band. Deterministic TypeScript — the LLM never does arithmetic. |
| 2 — Language | `lib/llm.ts` | **Words only.** Takes the rules engine's pre-formatted facts and explains them plainly. Provider-agnostic; a post-generation guard discards any response containing a number the rules engine didn't supply. |
| 3 — Policy gate | `lib/policy.ts` | **When NOT to act.** Consent, safety buffer, autonomy cap, missing-signal checks — run before *any* action executes. Every denial is logged. |

The harm-aware recommendation this produces: getting under 30% needs **₹31,200**, but George only has ₹38,000 with ₹15,000 needed for essentials. A naive agent would tell him to pay money he doesn't have. This one moves **₹23,000 now** and schedules **₹8,200 for Oct 22**, with his due amount.

### Guardrails (the "when not to act" rules)

- Never execute without consent — unless autonomy is granted **and** the amount is within the user's cap **and** above the safety buffer.
- Never recommend a paydown that breaches the essentials buffer; adapt or split instead.
- Missing bank signal → propose-only. Never guess with someone's money.
- A limit increase is never framed as "more to spend."
- Score impact is always labelled a directional estimate, never a promise.
- Out-of-scope requests are refused cheaply — no model call at all.

Hard invariant: **zero un-consented actions.** Verifiable in `lib/policy.ts` — every action route passes through `checkPolicy()` and there is no other code path that moves money.

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

## Screens

1. **Home** — utilisation dial (the 30% safe line is a physical notch on the gauge), proactive alert before the statement date.
2. **Guardian explainer** — the statement-snapshot timeline, plain-language why, severity, directional impact.
3. **Affordability & consent** — the split plan, the cushion made visible, one explicit yes per action.
4. **Confirmation + activity log** — "here's exactly what I did," the 82% → 44% dial morph, every action (and every guardrail denial) in plain words.
5. **Autonomy settings** — the trust dial: off / ask first / autonomous with a user-set cap.

On wide screens, a side rail narrates the architecture live: the numbers the rules engine computed, where the words came from, and the checks the last action passed or failed.

## API surface

- `GET /api/state` — full snapshot (`POST` resets the demo)
- `POST /api/guardian/evaluate` — rules engine: detection, amounts, severity, impact band
- `POST /api/guardian/explain` — LLM layer (`{ kind: "alert" | "recommendation" | "action-summary" | "out-of-scope" }`)
- `POST /api/actions/paydown` — mocked bank debit; policy-gated
- `POST /api/actions/limit-increase` — mocked issuer request; policy-gated
- `PATCH /api/settings` — autonomy level + cap

External calls are mocked with simulated latency and deterministic outcomes.

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
