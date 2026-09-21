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
          {facts.display.issuer} card
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
          {state.scenario === "messy" && (
            <Link
              href="/chat"
              className="btn-quiet mt-2 inline-flex w-full items-center justify-center px-4 py-2.5 text-[13.5px]"
            >
              Plan across everything you owe
            </Link>
          )}
        </section>
      ) : null}

      {/* messy mode: the rest of what's owed this cycle */}
      {state.scenario === "messy" && (
        <section className="rise" style={{ "--d": "0.2s" } as React.CSSProperties}>
          <p className="lbl mb-2.5">Also due this cycle</p>
          <div className="flex flex-col gap-2">
            {state.emis.map((emi) => (
              <div
                key={emi.id}
                className="flex items-center justify-between rounded-2xl border px-4 py-3"
                style={{ borderColor: "color-mix(in srgb, var(--color-alert-red) 30%, transparent)" }}
              >
                <div>
                  <p className="text-[13.5px] text-cream">
                    {emi.name}
                    <span className="ml-2 text-[11px]" style={{ color: "var(--color-alert-red)" }}>
                      hard due · {emi.monthLabel} {emi.dueDay}
                    </span>
                  </p>
                  <p className="text-[12px] leading-snug text-faint">
                    Missing this is worse than any utilisation hit.
                  </p>
                </div>
                <p className="figure shrink-0 pl-3 text-[17px] text-cream">
                  ₹{new Intl.NumberFormat("en-IN").format(emi.amount)}
                </p>
              </div>
            ))}
            {state.cards
              .filter((c) => c.id !== state.primaryCardId)
              .map((c) => {
                const u = Math.round((c.balance / c.limit) * 100);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3"
                  >
                    <div>
                      <p className="text-[13.5px] text-cream">{c.issuer} card</p>
                      <p className="text-[12px] text-faint">
                        ₹{new Intl.NumberFormat("en-IN").format(c.balance)} of ₹
                        {new Intl.NumberFormat("en-IN").format(c.limit)}
                      </p>
                    </div>
                    <p className="figure shrink-0 pl-3 text-[17px]" style={{ color: u <= 30 ? "var(--color-sage)" : "var(--color-amber)" }}>
                      {u}%
                    </p>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* the rest of the guardian */}
      <section className="rise" style={{ "--d": "0.24s" } as React.CSSProperties}>
        <p className="lbl mb-2.5">Also watching over you</p>
        <div className="flex flex-col gap-2">
          <Link
            href="/autopay"
            className="card flex items-center justify-between px-4 py-3 transition-opacity hover:opacity-90"
          >
            <div>
              <p className="text-[13.5px] text-cream">Autopay guard</p>
              <p className="text-[12px] text-faint">
                Never miss a due date — pays only while your cushion holds.
              </p>
            </div>
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[10.5px]"
              style={
                state.autopay.armed
                  ? { borderColor: "color-mix(in srgb, var(--color-sage) 40%, transparent)", color: "var(--color-sage)" }
                  : { borderColor: "var(--hairline)", color: "var(--color-faint)" }
              }
            >
              {state.autopay.armed ? "armed" : state.settings.autopayGuard === "off" ? "off" : "set up"}
            </span>
          </Link>
          <div className="flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3 opacity-55">
            <div>
              <p className="text-[13.5px] text-cream-2">Dispute watch</p>
              <p className="text-[12px] text-faint">Spots charges that don’t look like you.</p>
            </div>
            <span className="shrink-0 rounded-full border border-(--hairline) px-2 py-0.5 text-[10.5px] text-faint">
              coming soon
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
