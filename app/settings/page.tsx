"use client";

import { useState } from "react";
import { useGuardian } from "@/components/GuardianProvider";
import type { AutonomyLevel } from "@/lib/types";

const LEVELS: {
  value: AutonomyLevel;
  name: string;
  desc: string;
}[] = [
  {
    value: "off",
    name: "Off",
    desc: "I only warn you. Nothing moves, ever.",
  },
  {
    value: "ask",
    name: "Ask first",
    desc: "I propose the exact move; you approve every one.",
  },
  {
    value: "auto",
    name: "Autonomous",
    desc: "I act to keep you under 30% — never past your cap, never into your cushion.",
  },
];

export default function SettingsPage() {
  const { state, facts, loading, updateSettings } = useGuardian();
  // null = untouched → show the stored cap
  const [cap, setCap] = useState<number | null>(null);
  const [saving, setSaving] = useState<AutonomyLevel | null>(null);

  if (loading || !state || !facts) return null;

  const level = state.settings.utilGuard;
  const capValue = cap ?? state.settings.autoCap;

  async function selectLevel(v: AutonomyLevel) {
    setSaving(v);
    await updateSettings({ utilGuard: v });
    setSaving(null);
  }

  async function commitCap() {
    if (capValue !== state?.settings.autoCap) {
      await updateSettings({ autoCap: capValue });
    }
  }

  const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <p className="lbl">The trust dial</p>
        <h1 className="serif mt-1.5 text-[26px] leading-[1.15] text-cream">
          How much may I do on my own?
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-mute">
          One dial per action — pre-statement paydowns here, autopay below. You
          can change them any time, and every move stays on the record.
        </p>
      </header>

      {/* demo scenario */}
      <section className="rise card px-5 py-4" style={{ "--d": "0.04s" } as React.CSSProperties}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] text-cream">Demo scenario</p>
            <p className="mt-0.5 text-[12px] leading-snug text-faint">
              {state.scenario === "messy"
                ? "Real life: two cards + an EMI competing for ₹23,000."
                : "One card, one clear moment."}
            </p>
          </div>
          <div className="flex shrink-0 rounded-xl border border-(--hairline) p-0.5" role="radiogroup" aria-label="Demo scenario">
            {(["simple", "messy"] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={state.scenario === s}
                onClick={() => state.scenario !== s && updateSettings({ scenario: s })}
                className={`rounded-[10px] px-3 py-1.5 text-[12px] transition-colors ${
                  state.scenario === s ? "bg-ink-4 text-gold" : "text-faint hover:text-cream-2"
                }`}
              >
                {s === "simple" ? "One card" : "Real life"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        className="rise flex flex-col gap-2"
        style={{ "--d": "0.08s" } as React.CSSProperties}
        role="radiogroup"
        aria-label="Guardian autonomy"
      >
        {LEVELS.map((l) => {
          const active = level === l.value;
          return (
            <button
              key={l.value}
              role="radio"
              aria-checked={active}
              onClick={() => selectLevel(l.value)}
              disabled={saving !== null}
              className={`card flex items-start gap-3.5 px-4 py-3.5 text-left transition-all ${
                active ? "" : "opacity-70 hover:opacity-100"
              }`}
              style={
                active
                  ? { borderColor: "color-mix(in srgb, var(--color-gold) 45%, transparent)" }
                  : undefined
              }
            >
              <span
                aria-hidden
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border"
                style={{
                  borderColor: active ? "var(--color-gold)" : "var(--hairline-strong)",
                }}
              >
                {active && (
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-gold)" }} />
                )}
              </span>
              <span>
                <span className={`block text-[14.5px] ${active ? "text-cream" : "text-cream-2"}`}>
                  {l.name}
                  {saving === l.value && <span className="ml-2 text-[12px] italic text-faint">saving…</span>}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mute">{l.desc}</span>
              </span>
            </button>
          );
        })}
      </section>

      {level === "auto" && (
        <section className="card rise px-5 py-4" style={{ "--d": "0.05s" } as React.CSSProperties}>
          <div className="flex items-baseline justify-between">
            <p className="text-[13.5px] text-cream">Auto-move cap</p>
            <p className="figure text-[21px] text-gold">{inr(capValue)}</p>
          </div>
          <input
            type="range"
            min={5000}
            max={30000}
            step={1000}
            value={capValue}
            onChange={(e) => setCap(Number(e.target.value))}
            onPointerUp={commitCap}
            onKeyUp={commitCap}
            aria-label="Auto-move cap"
            className="mt-3 w-full accent-(--color-gold)"
          />
          <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
            The most I may move in one go without asking. Anything larger, I
            propose and wait for your yes.
          </p>
        </section>
      )}

      {/* the second per-action dial */}
      <section className="rise card px-5 py-4" style={{ "--d": "0.12s" } as React.CSSProperties}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] text-cream">Autopay guard</p>
            <p className="mt-0.5 text-[12px] leading-snug text-faint">
              {state.autopay.armed ? "Armed — " : ""}pays the due date, never past your cushion.
            </p>
          </div>
          <div className="flex shrink-0 rounded-xl border border-(--hairline) p-0.5" role="radiogroup" aria-label="Autopay autonomy">
            {(["off", "ask", "auto"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={state.settings.autopayGuard === m}
                onClick={() =>
                  state.settings.autopayGuard !== m && updateSettings({ autopayGuard: m })
                }
                className={`rounded-[10px] px-2.5 py-1.5 text-[12px] capitalize transition-colors ${
                  state.settings.autopayGuard === m ? "bg-ink-4 text-gold" : "text-faint hover:text-cream-2"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rise rounded-2xl border border-(--hairline) px-5 py-4" style={{ "--d": "0.16s" } as React.CSSProperties}>
        <p className="lbl">Whatever the dial says</p>
        <ul className="mt-2.5 flex flex-col gap-2">
          {[
            `I never touch the ${facts.display.safetyBuffer} you need for essentials before salary.`,
            "I never act past your cap — over it, I ask.",
            "If I can’t see your bank balance, I only propose. I don’t guess with your money.",
            "Score-impact figures are directional estimates, never promises.",
            "Every action — and every action a guardrail blocked — lands in your activity log.",
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-mute">
              <svg className="mt-1 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-sage)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 1.5 7.4 4.4l3.1.4-2.3 2.2.6 3.1L6 8.6 3.2 10.1l.6-3.1L1.5 4.8l3.1-.4L6 1.5Z" />
              </svg>
              {rule}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
