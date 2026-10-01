"use client";

import Link from "next/link";
import { useGuardian } from "@/components/GuardianProvider";
import { BackLink, SeverityChip } from "@/components/ui";

export default function GuardianPage() {
  const { state, facts, loading, openSheet } = useGuardian();

  if (loading || !facts || !state) return null;

  const nothingSafe = facts.affordableNow <= 0;

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <BackLink href="/" label="Home" />
      </div>

      <header className="rise" style={{ "--d": "0.06s" } as React.CSSProperties}>
        <h1 className="serif text-[26px] leading-[1.15] text-cream">
          Paying in full doesn’t protect your score.
        </h1>
        <div className="mt-2.5">
          <SeverityChip severity={facts.severity} pct={facts.utilisationPct} />
        </div>
      </header>

      {/* the snapshot timeline — the core insight, drawn */}
      <section
        className="card rise px-5 pb-4 pt-4"
        style={{ "--d": "0.12s" } as React.CSSProperties}
        aria-label="Statement timeline"
      >
        <div className="relative mx-1 mt-2 flex justify-between">
          <span
            aria-hidden
            className="absolute left-1 right-1 top-[5px] h-px"
            style={{
              background:
                "linear-gradient(to right, var(--color-gold), var(--color-alert-red) 55%, var(--hairline-strong))",
            }}
          />
          {[
            { day: `${state.demo.monthLabel} ${state.demo.today}`, tag: "today", note: "you can act", color: "var(--color-gold)" },
            { day: facts.statementDate, tag: "snapshot", note: `bureau records ${facts.display.utilisation}`, color: "var(--color-alert-red)" },
            { day: facts.dueDate, tag: "due date", note: "too late to help", color: "var(--color-faint)" },
          ].map((n) => (
            <div key={n.tag} className="relative flex w-1/3 flex-col items-center text-center first:items-start first:text-left last:items-end last:text-right">
              <span aria-hidden className="h-[11px] w-[11px] rounded-full border-2" style={{ borderColor: n.color, background: "var(--color-ink-3)" }} />
              <p className="figure mt-2 text-[15px] text-cream">{n.day}</p>
              <p className="text-[11.5px]" style={{ color: n.color }}>{n.tag}</p>
              <p className="mt-0.5 max-w-[12ch] text-[11px] leading-snug text-faint">{n.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* the numbers */}
      <section className="rise grid grid-cols-3 gap-2" style={{ "--d": "0.18s" } as React.CSSProperties}>
        {[
          { k: "On the card", v: facts.display.balance },
          { k: "Safe line", v: facts.display.targetBalance30 },
          { k: "At stake", v: facts.scoreImpactBand.replace(" pts", ""), note: "pts, est." },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-(--hairline) px-3 py-2.5">
            <p className="text-[11px] text-faint">{s.k}</p>
            <p className="figure mt-0.5 text-[16px] leading-tight text-cream">
              {s.v}
              {s.note && <span className="ml-1 text-[10px] italic text-faint">{s.note}</span>}
            </p>
          </div>
        ))}
      </section>

      {/* depth lives in Ask */}
      <Link
        href={`/chat?q=${encodeURIComponent("Why does this matter if I pay in full every month?")}`}
        className="rise flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3 transition-colors hover:border-(--hairline-strong)"
        style={{ "--d": "0.24s" } as React.CSSProperties}
      >
        <span className="text-[13px] text-cream-2">“Why does this matter if I pay in full?”</span>
        <span className="lbl">Ask me</span>
      </Link>

      {/* the longer-term fix */}
      <button
        onClick={() => openSheet({ type: "limit-increase" })}
        className="rise flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3 text-left transition-colors hover:border-(--hairline-strong)"
        style={{ "--d": "0.28s" } as React.CSSProperties}
      >
        <span>
          <span className="block text-[13px] text-cream-2">
            Raise the limit to {facts.display.requestedLimit}
          </span>
          <span className="block text-[11.5px] text-faint">
            same spend reports {facts.display.utilisationAtNewLimit} — not extra money
          </span>
        </span>
        <span className="lbl">Review</span>
      </button>

      {/* docked action */}
      <div className="mt-auto pb-2 pt-2">
        {nothingSafe ? (
          <div className="card px-4 py-3.5 text-center">
            <p className="text-[13px] text-mute">
              Everything in your bank is reserved for your{" "}
              <span style={{ color: "var(--color-sage)" }}>{facts.display.safetyBuffer} cushion</span> — I won’t touch it.
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={() => openSheet({ type: "paydown" })}
              className="btn-gold w-full px-4 py-3.5 text-[15px]"
            >
              Pay {facts.display.affordableNow} now
            </button>
            {facts.splitRequired && (
              <p className="mt-2 text-center text-[11.5px] text-faint">
                {facts.display.shortfall} follows on {facts.dueDate} — your cushion stays whole.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
