"use client";

import { useGuardian } from "@/components/GuardianProvider";
import { ActionLog } from "@/components/ui";

export default function ActivityPage() {
  const { state, facts, loading } = useGuardian();

  if (loading || !state || !facts) return null;

  return (
    <div className="flex flex-col gap-5">
      <header className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <h1 className="serif text-[24px] leading-tight text-cream">Activity</h1>
        <p className="mt-0.5 text-[13px] text-mute">
          Every move — and every one a guardrail blocked.
        </p>
      </header>

      {state.scheduled.length > 0 && (
        <section className="rise" style={{ "--d": "0.08s" } as React.CSSProperties}>
          <p className="lbl mb-2">Scheduled</p>
          <div className="flex flex-col gap-2">
            {state.scheduled.map((s, i) => (
              <div
                key={i}
                className="card flex items-center justify-between px-4 py-3"
                style={{ borderColor: "color-mix(in srgb, var(--color-gold) 22%, transparent)" }}
              >
                <div>
                  <p className="text-[13.5px] text-cream">{s.date} — with your due payment</p>
                  <p className="text-[11.5px] text-faint">second leg of the split</p>
                </div>
                <p className="figure shrink-0 pl-3 text-[17px] text-gold">
                  ₹{new Intl.NumberFormat("en-IN").format(s.amount)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rise" style={{ "--d": "0.14s" } as React.CSSProperties}>
        <ActionLog entries={state.actionLog} />
      </section>
    </div>
  );
}
