import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics for the LLM layer. Reports which provider the
 * runtime is configured with (never the key itself), and with ?probe=1
 * makes one real provider call so misconfiguration shows up as an actual
 * error message instead of a silent template fallback.
 */
export async function GET(req: NextRequest) {
  const provider = process.env.LLM_PROVIDER ?? null;

  const status = {
    provider,
    model:
      provider === "hf"
        ? process.env.HF_MODEL || "meta-llama/Llama-3.3-70B-Instruct (default)"
        : provider === "ollama"
          ? process.env.OLLAMA_MODEL || "llama3.2 (default)"
          : provider === "frontier"
            ? process.env.ANTHROPIC_MODEL || process.env.OPENAI_MODEL || "provider default"
            : null,
    keyPresent:
      provider === "hf"
        ? Boolean(process.env.HF_API_TOKEN)
        : provider === "frontier"
          ? Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
          : provider === "ollama"
            ? "not needed"
            : false,
  };

  if (req.nextUrl.searchParams.get("probe") !== "1") {
    return NextResponse.json(status);
  }

  // Live probe: one minimal call to the configured provider.
  let probe: { ok: boolean; detail: string };
  try {
    if (provider === "hf") {
      const modelOverride = req.nextUrl.searchParams.get("model");
      const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
        },
        body: JSON.stringify({
          model: modelOverride || process.env.HF_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.text();
      probe = res.ok
        ? { ok: true, detail: "hf responded" }
        : { ok: false, detail: `hf ${res.status}: ${body.slice(0, 300)}` };
    } else if (provider === "frontier" || provider === "ollama") {
      probe = { ok: false, detail: `probe implemented for hf only; provider is ${provider}` };
    } else {
      probe = { ok: false, detail: "LLM_PROVIDER is not set in this deployment's runtime" };
    }
  } catch (err) {
    probe = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ ...status, probe });
}
