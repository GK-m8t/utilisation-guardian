"use client";

import Link from "next/link";
import type { ActionLogEntry, LlmSource, Severity } from "@/lib/types";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[13px] text-mute transition-colors hover:text-cream-2"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8.5 3 4.5 7l4 4" />
      </svg>
      {label}
    </Link>
  );
}

const SEVERITY: Record<Severity, { color: string; word: string }> = {
  none: { color: "var(--color-sage)", word: "healthy" },
  amber: { color: "var(--color-amber)", word: "elevated" },
  orange: { color: "var(--color-alert-orange)", word: "high" },
  red: { color: "var(--color-alert-red)", word: "critical" },
};

export function SeverityChip({ severity, pct }: { severity: Severity; pct: number }) {
  const s = SEVERITY[severity];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px]"
      style={{
        borderColor: `color-mix(in srgb, ${s.color} 35%, transparent)`,
        color: s.color,
        background: `color-mix(in srgb, ${s.color} 9%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${severity === "red" ? "pulse-dot" : ""}`}
        style={{ background: s.color }}
      />
      {pct}% utilisation — {s.word}
    </span>
  );
}

const SOURCE_LABEL: Record<LlmSource, string> = {
  template: "templated copy — no model configured",
  ollama: "local open model",
  hf: "open model, Hugging Face",
  frontier: "frontier model",
};

/** Small provenance chip: where did these words come from? */
export function WordsBadge({ source }: { source: LlmSource }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] italic text-faint">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
        <path d="M2 9.5c1.8-.4 2.4-1.6 2.6-2.8A2.6 2.6 0 1 1 7 9c-1 .9-2.8 1-5 .5Z" />
      </svg>
      words from {SOURCE_LABEL[source]}
    </span>
  );
}

const LOG_DOT: Record<ActionLogEntry["type"], string> = {
  paydown: "var(--color-gold)",
  "auto-paydown": "var(--color-gold)",
  "scheduled-paydown": "var(--color-gold)",
  "limit-increase": "var(--color-sage)",
  "autopay-arm": "var(--color-sage)",
  "autopay-payment": "var(--color-gold)",
  "policy-deny": "var(--color-alert-red)",
  "settings-change": "var(--color-faint)",
};

const LOG_TITLE: Record<ActionLogEntry["type"], string> = {
  paydown: "Moved money to your card",
  "auto-paydown": "Guardian acted on its own",
  "scheduled-paydown": "Scheduled a payment",
  "limit-increase": "Limit increase requested",
  "autopay-arm": "Autopay armed",
  "autopay-payment": "Autopay paid your bill",
  "policy-deny": "Guardrail blocked an action",
  "settings-change": "Autonomy updated",
};

export function ActionLog({ entries }: { entries: ActionLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card px-5 py-6 text-center">
        <p className="serif text-[17px] text-cream-2">Nothing yet.</p>
        <p className="mx-auto mt-1.5 max-w-[26ch] text-[13px] leading-relaxed text-mute">
          When your Guardian acts — or a guardrail blocks it — every move lands
          here in plain words.
        </p>
      </div>
    );
  }
  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => (
        <li key={e.id} className="relative flex gap-3.5 pb-5 last:pb-0">
          {/* timeline spine */}
          {i < entries.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[4.5px] top-4 h-full w-px"
              style={{ background: "var(--hairline)" }}
            />
          )}
          <span
            aria-hidden
            className="relative mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: LOG_DOT[e.type] }}
          />
          <div>
            <p className="text-[13px] text-cream">
              {LOG_TITLE[e.type]}
              <span className="ml-2 text-[12px] text-faint">{e.date}</span>
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-mute">{e.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
