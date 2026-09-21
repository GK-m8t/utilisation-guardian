"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGuardian } from "@/components/GuardianProvider";
import { Spinner } from "@/components/ui";
import type { ActionProposal, LlmSource, ToolTrace } from "@/lib/types";

interface Turn {
  role: "user" | "assistant";
  content: string;
  trace?: ToolTrace[];
  source?: LlmSource | "canned";
  actionProposal?: ActionProposal;
}

const SUGGESTIONS_SIMPLE = [
  "I pay in full every month — why does this matter?",
  "Will paying this down help me get a loan next month?",
  "Is it bad to just pay the minimum?",
];

const SUGGESTIONS_MESSY = [
  "Which card should I pay first?",
  "Can I skip the card and just pay my EMI?",
  "I need ₹10,000 for rent — re-plan?",
];

const SOURCE_NOTE: Record<string, string> = {
  canned: "grounded template — no model configured",
  ollama: "local open model",
  hf: "open model, Hugging Face",
  frontier: "frontier model",
  template: "template",
};

function TraceLine({ trace }: { trace: ToolTrace[] }) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  return (
    <div className="mt-2.5 border-t border-(--hairline) pt-2">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11.5px] italic text-faint transition-colors hover:text-mute"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 0.15s" }}
        >
          <path d="m3.5 2 3 3-3 3" />
        </svg>
        How I worked this out — {trace.length} tool{trace.length > 1 ? "s" : ""}
      </button>
      {open ? (
        <ol className="mt-1.5 flex flex-col gap-1">
          {trace.map((t, i) => (
            <li key={i} className="text-[11.5px] leading-relaxed text-faint">
              <span className="text-gold">{t.tool}</span>
              {Object.keys(t.args).length > 0 && (
                <span className="text-mute">({JSON.stringify(t.args)})</span>
              )}
              <span className="block truncate opacity-70">→ {t.resultSummary}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 truncate text-[11px] text-faint opacity-80">
          used: {trace.map((t) => t.tool).join(", ")}
        </p>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { state, loading, reportChatTrace } = useGuardian();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // Session memory: history survives tab switches (sessionStorage), cleared
  // on scenario change / reset. Production extension: persistent memory.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const saved = sessionStorage.getItem("guardian-chat");
      // one-time hydration from sessionStorage, client-only by design
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setTurns(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem("guardian-chat", JSON.stringify(turns));
    } catch {}
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  if (loading || !state) return null;

  const suggestions = state.scenario === "messy" ? SUGGESTIONS_MESSY : SUGGESTIONS_SIMPLE;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const history = [...turns, { role: "user" as const, content: q }];
    setTurns(history);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const reply = await res.json();
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reply.text ?? "Something went sideways — try that again.",
          trace: reply.trace ?? [],
          source: reply.source,
          actionProposal: reply.actionProposal,
        },
      ]);
      reportChatTrace(reply.trace ?? []);
    } catch {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: "I couldn’t reach the server — try again.", trace: [] },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <header className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <p className="lbl">Ask your Guardian</p>
        <h1 className="serif mt-1.5 text-[24px] leading-[1.15] text-cream">
          Your numbers. Straight answers.
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-3">
        {turns.length === 0 && (
          <div className="rise card px-5 py-4" style={{ "--d": "0.06s" } as React.CSSProperties}>
            <p className="text-[13.5px] leading-relaxed text-mute">
              Every figure I give you comes from your actual data, worked out by
              the same rules engine that guards your money — and you can expand
              any answer to see exactly how.
            </p>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p
                className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[13.5px] leading-relaxed text-cream"
                style={{ background: "color-mix(in srgb, var(--color-gold) 16%, transparent)" }}
              >
                {t.content}
              </p>
            </div>
          ) : (
            <div key={i} className="card max-w-[92%] px-4 py-3">
              <p className="whitespace-pre-wrap text-[13.5px] leading-[1.65] text-cream-2">
                {t.content}
              </p>
              {t.actionProposal && (
                <Link
                  href="/consent"
                  className="btn-gold mt-3 inline-flex w-full items-center justify-center px-4 py-2.5 text-[13.5px]"
                >
                  {t.actionProposal.label}
                </Link>
              )}
              {t.trace && <TraceLine trace={t.trace} />}
              {t.source && (
                <p className="mt-1.5 text-[10.5px] italic text-faint opacity-80">
                  words from {SOURCE_NOTE[t.source] ?? t.source}
                </p>
              )}
            </div>
          )
        )}

        {busy && (
          <div className="card flex w-max items-center gap-2 px-4 py-3 text-[13px] text-mute">
            <Spinner /> working it out from your data…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* suggestions + composer */}
      <div
        className="sticky bottom-0 flex flex-col gap-2.5 pb-1 pt-3"
        style={{
          background:
            "linear-gradient(to top, var(--color-ink-2) 78%, transparent)",
        }}
      >
        {turns.length < 3 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={busy}
                className="btn-quiet rounded-full px-3 py-1.5 text-left text-[12px] leading-snug"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-2xl border border-(--hairline-strong) bg-ink-3/90 py-1.5 pl-4 pr-1.5 backdrop-blur-md"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your cards, score, plan…"
            aria-label="Ask your Guardian"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-cream placeholder:text-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="btn-gold flex h-9 w-9 shrink-0 items-center justify-center !rounded-xl"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
