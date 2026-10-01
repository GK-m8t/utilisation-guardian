"use client";

import { useState } from "react";
import Link from "next/link";
import { useGuardian } from "@/components/GuardianProvider";
import { BackLink } from "@/components/ui";
import { toast } from "@/components/primitives";
import type { AutonomyLevel } from "@/lib/types";

const LEVELS: { value: AutonomyLevel; name: string }[] = [
  { value: "off", name: "Warn only" },
  { value: "ask", name: "Ask first" },
  { value: "auto", name: "Act for me" },
];

export default function SettingsPage() {
  const { state, facts, loading, updateSettings } = useGuardian();
  const [cap, setCap] = useState<number | null>(null);
  const [cushion, setCushion] = useState<number | null>(null);

  if (loading || !state || !facts) return null;

  const level = state.settings.utilGuard;
  const capValue = cap ?? state.settings.autoCap;
  const cushionValue = cushion ?? state.bank.safetyBuffer;
  const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <BackLink href="/" label="Home" />
      </div>

      <header className="rise" style={{ "--d": "0.05s" } as React.CSSProperties}>
        <h1 className="serif text-[24px] leading-tight text-cream">Settings</h1>
      </header>

      {/* utilisation guard autonomy */}
      <section className="rise card px-5 py-4" style={{ "--d": "0.1s" } as React.CSSProperties}>
        <p className="text-[13.5px] text-cream">Utilisation guard</p>
        <p className="mt-0.5 text-[12px] text-faint">pre-statement paydowns</p>
        <div className="mt-3 flex rounded-xl border border-(--hairline) p-0.5" role="radiogroup" aria-label="Utilisation guard autonomy">
          {LEVELS.map((l) => {
            const active = level === l.value;
            return (
              <button
                key={l.value}
                role="radio"
                aria-checked={active}
                onClick={async () => {
                  if (active) return;
                  await updateSettings({ utilGuard: l.value });
                  toast(`Utilisation guard: ${l.name.toLowerCase()}`);
                }}
                className={`flex-1 rounded-[10px] px-2 py-2 text-[12.5px] transition-colors ${active ? "bg-ink-4 text-gold" : "text-faint hover:text-cream-2"}`}
              >
                {l.name}
              </button>
            );
          })}
        </div>

        {level === "auto" && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[12.5px] text-mute">Without asking, up to</p>
              <p className="figure text-[17px] text-gold">{inr(capValue)}</p>
            </div>
            <input
              type="range"
              min={5000}
              max={30000}
              step={1000}
              value={capValue}
              onChange={(e) => setCap(Number(e.target.value))}
              onPointerUp={async () => {
                if (cap !== null && cap !== state.settings.autoCap) {
                  await updateSettings({ autoCap: cap });
                  toast(`Cap set to ${inr(cap)}`);
                }
              }}
              aria-label="Auto-move cap"
              className="mt-1.5 w-full accent-(--color-gold)"
            />
          </div>
        )}
      </section>

      {/* autopay — controlled on its own surface */}
      <Link
        href="/autopay"
        className="rise card flex items-center justify-between px-5 py-4 transition-opacity hover:opacity-90"
        style={{ "--d": "0.14s" } as React.CSSProperties}
      >
        <div>
          <p className="text-[13.5px] text-cream">Autopay guard</p>
          <p className="mt-0.5 text-[12px] text-faint">
            {state.autopay.armed ? "armed" : state.settings.autopayGuard === "off" ? "off" : "ask first"} · manage
          </p>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m5.5 3 4 4-4 4" />
        </svg>
      </Link>

      {/* the cushion — a product input, not a demo knob */}
      <section className="rise card px-5 py-4" style={{ "--d": "0.18s" } as React.CSSProperties}>
        <div className="flex items-baseline justify-between">
          <p className="text-[13.5px] text-cream">Money I never touch</p>
          <p className="figure text-[17px]" style={{ color: "var(--color-sage)" }}>
            {inr(cushionValue)}
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={40000}
          step={1000}
          value={cushionValue}
          onChange={(e) => setCushion(Number(e.target.value))}
          onPointerUp={async () => {
            if (cushion !== null && cushion !== state.bank.safetyBuffer) {
              await updateSettings({ safetyBuffer: cushion });
              toast(`Cushion set to ${inr(cushion)}`);
            }
          }}
          aria-label="Essentials cushion"
          className="mt-2 w-full accent-(--color-sage)"
        />
        <p className="mt-1 text-[12px] text-faint">Your essentials until salary lands.</p>
      </section>

      {/* immovable guardrails, compact */}
      <section className="rise px-1" style={{ "--d": "0.22s" } as React.CSSProperties}>
        <p className="lbl mb-2.5">Whatever you choose, I never…</p>
        <ul className="flex flex-col gap-2">
          {[
            "touch your cushion",
            "act past your cap",
            "move money without a verdict on the record",
            "promise score outcomes — estimates only",
          ].map((rule) => (
            <li key={rule} className="flex items-center gap-2.5 text-[13px] text-mute">
              <svg className="shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-sage)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 1.5 10 3v3c0 2.5-1.7 4-4 4.5C3.7 10 2 8.5 2 6V3l4-1.5Z" />
              </svg>
              {rule}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
