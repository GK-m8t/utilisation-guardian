"use client";

import Link from "next/link";
import { useGuardian } from "@/components/GuardianProvider";
import { UtilisationDial } from "@/components/UtilisationDial";

export default function HomePage() {
  const { state, facts, loading, autoActed } = useGuardian();

  if (loading || !state || !facts) {
    return (
      <div className="flex h-full items-center justify-center pt-40">
        <div className="lbl">Utilisation Guardian</div>
      </div>
    );
  }

  const guardOff = state.settings.utilGuard === "off";
  const acted = state.demo.nudgedThisCycle;

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <header className="rise flex items-baseline justify-between" style={{ "--d": "0s" } as React.CSSProperties}>
        <div>
          <h1 className="serif text-[24px] leading-tight text-cream">
            Good evening, {state.user.name}
          </h1>
          <p className="mt-0.5 text-[13px] text-mute">
            {state.demo.monthLabel} {state.demo.today} — score{" "}
            <span className="figure text-cream-2">{state.score.current}</span>
          </p>
        </div>
        <span className="rounded-full border border-(--hairline) px-2.5 py-1 text-[11.5px] text-mute">
          {state.card.issuer} card
        </span>
      </header>

      {/* the dial */}
      <section
        className="rise flex flex-col items-center pt-1"
        style={{ "--d": "0.08s" } as React.CSSProperties}
        aria-label="Card utilisation"
      >
        <UtilisationDial
          value={facts.utilisation}
          sublabel={`${facts.display.balance} of your ${facts.display.limit} limit`}
          caption={`statement cuts ${facts.statementDate}`}
        />
      </section>

      {/* the guardian moment */}
      {acted ? (
        <section
          className="card rise px-5 py-4"
          style={{ "--d": "0.16s", borderColor: "color-mix(in srgb, var(--color-sage) 30%, transparent)" } as React.CSSProperties}
        >
          <p className="lbl" style={{ color: "var(--color-sage)" }}>
            Handled
          </p>
          <h2 className="serif mt-1 text-[19px] leading-snug text-cream">
            {autoActed
              ? "Your Guardian already acted — within your cap."
              : "Your statement is protected for this cycle."}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">
            The move is on record, in plain words, in your activity.
          </p>
          <Link
            href="/activity"
            className="btn-quiet mt-3.5 inline-flex w-full items-center justify-center px-4 py-2.5 text-[14px]"
          >
            See exactly what happened
          </Link>
        </section>
      ) : facts.triggered || guardOff ? (
        <section
          className="card rise px-5 py-4"
          style={{ "--d": "0.16s", borderColor: "color-mix(in srgb, var(--color-alert-red) 32%, transparent)" } as React.CSSProperties}
        >
          <p className="lbl" style={{ color: "var(--color-alert-red)" }}>
            Action needed before {facts.statementDate}
          </p>
          <h2 className="serif mt-1 text-[19px] leading-snug text-cream">
            Your statement cuts in {facts.daysUntilStatement} days — at{" "}
            {facts.display.utilisation} of your limit.
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">
            The bureau records that snapshot even if you pay in full afterwards.
            Roughly {facts.scoreImpactBand} could be at stake — an estimate, not a
            promise.
          </p>
          {guardOff && (
            <p className="mt-2 text-[12.5px] italic text-faint">
              Your Guardian is off, so it will only warn — it won’t move anything.
            </p>
          )}
          <Link
            href="/guardian"
            className="btn-gold mt-3.5 inline-flex w-full items-center justify-center px-4 py-2.5 text-[14px]"
          >
            See what’s happening
          </Link>
        </section>
      ) : null}

      {/* the rest of the guardian, honest about being stubs */}
      <section className="rise" style={{ "--d": "0.24s" } as React.CSSProperties}>
        <p className="lbl mb-2.5">Also watching over you</p>
        <div className="flex flex-col gap-2">
          {[
            {
              name: "Autopay guard",
              desc: "Never miss a due date, even when salary is late.",
            },
            {
              name: "Dispute watch",
              desc: "Spots charges that don’t look like you.",
            },
          ].map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3 opacity-55"
            >
              <div>
                <p className="text-[13.5px] text-cream-2">{f.name}</p>
                <p className="text-[12px] text-faint">{f.desc}</p>
              </div>
              <span className="shrink-0 rounded-full border border-(--hairline) px-2 py-0.5 text-[10.5px] text-faint">
                coming soon
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
