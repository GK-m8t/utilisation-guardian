"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGuardian } from "@/components/GuardianProvider";
import { BackLink, SeverityChip, WordsBadge } from "@/components/ui";
import type { Explanation } from "@/lib/types";

export default function GuardianPage() {
  const { state, facts, explain, loading } = useGuardian();
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  useEffect(() => {
    if (!facts) return;
    let cancelled = false;
    explain("recommendation").then((e) => {
      if (!cancelled) setExplanation(e);
    });
    return () => {
      cancelled = true;
    };
  }, [facts, explain]);

  if (loading || !facts || !state) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <BackLink href="/" label="Home" />
      </div>

      <header className="rise" style={{ "--d": "0.06s" } as React.CSSProperties}>
        <p className="lbl">Why you’re seeing this</p>
        <h1 className="serif mt-1.5 text-[26px] leading-[1.15] text-cream">
          Paying in full doesn’t protect your score.
        </h1>
        <div className="mt-3">
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
            { day: `${state.demo.monthLabel} ${state.demo.today}`, tag: "today", note: "you can still act", color: "var(--color-gold)" },
            { day: facts.statementDate, tag: "statement cuts", note: `bureau records ${facts.display.utilisation}`, color: "var(--color-alert-red)" },
            { day: facts.dueDate, tag: "payment due", note: "paying here is too late for the snapshot", color: "var(--color-faint)" },
          ].map((n) => (
            <div key={n.tag} className="relative flex w-1/3 flex-col items-center text-center first:items-start first:text-left last:items-end last:text-right">
              <span aria-hidden className="h-[11px] w-[11px] rounded-full border-2" style={{ borderColor: n.color, background: "var(--color-ink-3)" }} />
              <p className="figure mt-2 text-[15px] text-cream">{n.day}</p>
              <p className="text-[11.5px]" style={{ color: n.color }}>{n.tag}</p>
              <p className="mt-0.5 max-w-[11ch] text-[11px] leading-snug text-faint">{n.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* the guardian speaks — LLM layer, provenance visible */}
      <section className="rise" style={{ "--d": "0.18s" } as React.CSSProperties}>
        <div className="card relative px-5 py-4">
          <span
            aria-hidden
            className="absolute inset-y-4 left-0 w-[2.5px] rounded-full"
            style={{ background: "linear-gradient(var(--color-gold-bright), var(--color-gold-deep))" }}
          />
          {explanation ? (
            <>
              <p className="text-[14.5px] leading-[1.65] text-cream-2">
                {explanation.text}
              </p>
              <div className="mt-3">
                <WordsBadge source={explanation.source} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2.5 py-1" aria-label="Writing the explanation">
              {[100, 92, 60].map((w) => (
                <div
                  key={w}
                  className="pending h-3.5 rounded"
                  style={{ width: `${w}%`, background: "var(--glass-2)" }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* the numbers, owned by the rules engine */}
      <section className="rise grid grid-cols-2 gap-2" style={{ "--d": "0.24s" } as React.CSSProperties}>
        {[
          { k: "On the card now", v: facts.display.balance },
          { k: "The 30% safe line", v: facts.display.targetBalance30 },
          { k: "To get under it", v: facts.display.paydownTo30 },
          { k: "Score at stake", v: facts.scoreImpactBand, note: "estimate" },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-(--hairline) px-4 py-3">
            <p className="text-[11.5px] text-faint">{s.k}</p>
            <p className="figure mt-0.5 text-[19px] text-cream">
              {s.v}
              {s.note && <span className="ml-1.5 text-[11px] italic text-faint">{s.note}</span>}
            </p>
          </div>
        ))}
      </section>

      <div className="rise flex flex-col gap-2" style={{ "--d": "0.3s" } as React.CSSProperties}>
        <Link
          href="/consent"
          className="btn-gold inline-flex w-full items-center justify-center px-4 py-3 text-[14.5px]"
        >
          Plan the paydown
        </Link>
        <p className="text-center text-[12px] text-faint">
          You approve every move before it happens.
        </p>
      </div>
    </div>
  );
}
