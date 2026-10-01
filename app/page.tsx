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

  const acted = state.demo.nudgedThisCycle;

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <header className="rise flex items-start justify-between" style={{ "--d": "0s" } as React.CSSProperties}>
        <div>
          <h1 className="serif text-[24px] leading-tight text-cream">
            Good evening, {state.user.name}
          </h1>
          <p className="mt-0.5 text-[13px] text-mute">
            {state.demo.monthLabel} {state.demo.today} — score{" "}
            <span className="figure text-cream-2">{state.score.current}</span>
          </p>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="mt-1 rounded-full border border-(--hairline) p-2 text-faint transition-colors hover:text-cream-2"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6.5h12M4 13.5h12" />
            <circle cx="12.5" cy="6.5" r="2" fill="var(--color-ink)" />
            <circle cx="7.5" cy="13.5" r="2" fill="var(--color-ink)" />
          </svg>
        </Link>
      </header>

      {/* the dial */}
      <section
        className="rise flex flex-col items-center"
        style={{ "--d": "0.08s" } as React.CSSProperties}
        aria-label="Card utilisation"
      >
        <UtilisationDial
          value={facts.utilisation}
          sublabel={`${facts.display.balance} of ${facts.display.limit} · ${facts.display.issuer}`}
          caption={`statement ${facts.statementDate}`}
        />
      </section>

      {/* the guardian moment */}
      {acted ? (
        <section className="card rise px-5 py-4" style={{ "--d": "0.16s" } as React.CSSProperties}>
          <p className="lbl" style={{ color: "var(--color-sage)" }}>
            Handled
          </p>
          <h2 className="serif mt-1 text-[18px] leading-snug text-cream">
            {autoActed ? "I acted — within your cap." : "This statement is protected."}
          </h2>
          <Link href="/activity" className="btn-quiet mt-3 inline-flex w-full items-center justify-center px-4 py-2.5 text-[13.5px]">
            See exactly what happened
          </Link>
        </section>
      ) : facts.triggered || state.settings.utilGuard === "off" ? (
        <section className="card rise px-5 py-4" style={{ "--d": "0.16s" } as React.CSSProperties}>
          <p className="lbl" style={{ color: "var(--color-alert-red)" }}>
            {facts.daysUntilStatement} days to act
          </p>
          <h2 className="serif mt-1 text-[18px] leading-snug text-cream">
            The bureau will see {facts.display.utilisation} on {facts.statementDate}.
          </h2>
          <p className="mt-1 text-[13px] text-mute">
            Even if you pay in full after. Roughly {facts.scoreImpactBand} at stake — an estimate.
          </p>
          <Link href="/guardian" className="btn-gold mt-3 inline-flex w-full items-center justify-center px-4 py-2.5 text-[14px]">
            Fix it before {facts.statementDate}
          </Link>
        </section>
      ) : null}

      {/* messy mode: the rest owed this cycle */}
      {state.scenario === "messy" && (
        <section className="rise" style={{ "--d": "0.22s" } as React.CSSProperties}>
          <p className="lbl mb-2">Also due</p>
          <div className="flex flex-col gap-2">
            {state.emis.map((emi) => (
              <Link
                key={emi.id}
                href="/chat"
                className="card flex items-center justify-between px-4 py-3 transition-opacity hover:opacity-90"
              >
                <div>
                  <p className="text-[13.5px] text-cream">{emi.name}</p>
                  <p className="text-[11.5px]" style={{ color: "var(--color-alert-red)" }}>
                    must pay · {emi.monthLabel} {emi.dueDay}
                  </p>
                </div>
                <p className="figure shrink-0 pl-3 text-[16px] text-cream">
                  ₹{new Intl.NumberFormat("en-IN").format(emi.amount)}
                </p>
              </Link>
            ))}
            {state.cards
              .filter((c) => c.id !== state.primaryCardId)
              .map((c) => {
                const u = Math.round((c.balance / c.limit) * 100);
                return (
                  <div key={c.id} className="flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3">
                    <div>
                      <p className="text-[13.5px] text-cream">{c.issuer} card</p>
                      <p className="text-[11.5px] text-faint">
                        ₹{new Intl.NumberFormat("en-IN").format(c.balance)} of ₹{new Intl.NumberFormat("en-IN").format(c.limit)}
                      </p>
                    </div>
                    <p className="figure shrink-0 pl-3 text-[16px]" style={{ color: u <= 30 ? "var(--color-sage)" : "var(--color-amber)" }}>
                      {u}%
                    </p>
                  </div>
                );
              })}
            <Link href="/chat" className="btn-quiet inline-flex w-full items-center justify-center px-4 py-2.5 text-[13px]">
              Plan across everything
            </Link>
          </div>
        </section>
      )}

      {/* the other guards */}
      <section className="rise" style={{ "--d": "0.28s" } as React.CSSProperties}>
        <p className="lbl mb-2">Your guards</p>
        <div className="flex flex-col gap-2">
          <Link href="/autopay" className="card flex items-center justify-between px-4 py-3 transition-opacity hover:opacity-90">
            <div>
              <p className="text-[13.5px] text-cream">Autopay guard</p>
              <p className="text-[11.5px] text-faint">pays the due date, never your cushion</p>
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
              <p className="text-[11.5px] text-faint">flags charges that don’t look like you</p>
            </div>
            <span className="shrink-0 rounded-full border border-(--hairline) px-2 py-0.5 text-[10.5px] text-faint">
              soon
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
