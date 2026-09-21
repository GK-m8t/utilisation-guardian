"use client";

import { useState } from "react";
import { useGuardian } from "@/components/GuardianProvider";
import { UtilisationDial } from "@/components/UtilisationDial";
import { ActionLog, Spinner } from "@/components/ui";

export default function ActivityPage() {
  const { state, facts, loading, justActed, resetDemo } = useGuardian();
  const [resetting, setResetting] = useState(false);

  if (loading || !state || !facts) return null;

  const showConfirmation = justActed && justActed.before !== undefined;

  async function onReset() {
    setResetting(true);
    await resetDemo();
    setResetting(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {showConfirmation ? (
        <header className="rise flex flex-col items-center pt-2 text-center" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="lbl" style={{ color: "var(--color-sage)" }}>
            Done
          </p>
          <h1 className="serif mt-1 max-w-[18ch] text-[24px] leading-[1.18] text-cream">
            Here’s exactly what I did.
          </h1>
          <div className="mt-4">
            <UtilisationDial
              value={justActed.after ?? facts.utilisation}
              from={justActed.before}
              sublabel={`was ${Math.round((justActed.before ?? 0) * 100)}% before the move`}
              caption={`statement cuts ${facts.statementDate}`}
            />
          </div>
          <p className="mt-1 max-w-[34ch] text-[13.5px] leading-relaxed text-mute">
            {justActed.note}
          </p>
        </header>
      ) : (
        <header className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="lbl">Activity</p>
          <h1 className="serif mt-1.5 text-[26px] leading-[1.15] text-cream">
            Every move, on the record.
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-mute">
            Actions, scheduled payments, and the times a guardrail said no.
          </p>
        </header>
      )}

      {state.scheduled.length > 0 && (
        <section className="rise" style={{ "--d": "0.08s" } as React.CSSProperties}>
          <p className="lbl mb-2.5">Scheduled</p>
          <div className="flex flex-col gap-2">
            {state.scheduled.map((s, i) => (
              <div
                key={i}
                className="card flex items-center justify-between px-4 py-3.5"
                style={{ borderColor: "color-mix(in srgb, var(--color-gold) 22%, transparent)" }}
              >
                <div>
                  <p className="text-[13.5px] text-cream">{s.date} — with your due amount</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-faint">{s.note}</p>
                </div>
                <p className="figure shrink-0 pl-3 text-[19px] text-gold">
                  ₹{new Intl.NumberFormat("en-IN").format(s.amount)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rise" style={{ "--d": "0.16s" } as React.CSSProperties}>
        <p className="lbl mb-3">The log</p>
        <ActionLog entries={state.actionLog} />
      </section>

      <div className="rise flex justify-center pt-2" style={{ "--d": "0.24s" } as React.CSSProperties}>
        <button
          onClick={onReset}
          disabled={resetting}
          className="btn-quiet inline-flex items-center gap-2 px-4 py-2 text-[12.5px]"
        >
          {resetting && <Spinner />}
          Reset the demo scenario
        </button>
      </div>
    </div>
  );
}
