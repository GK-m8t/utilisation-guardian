"use client";

import { useState } from "react";
import { useGuardian } from "@/components/GuardianProvider";
import { BackLink, Spinner } from "@/components/ui";
import { toast } from "@/components/primitives";
import type { AutonomyLevel, PolicyVerdict } from "@/lib/types";

const LEVELS: { value: AutonomyLevel; name: string; desc: string }[] = [
  { value: "off", name: "Off", desc: "I’ll only remind you near the due date." },
  { value: "ask", name: "Ask first", desc: "I line it up; you approve with a tap." },
  { value: "auto", name: "Act for me", desc: "I pay on the due date — while your cushion holds." },
];

export default function AutopayPage() {
  const { state, facts, loading, updateSettings, autopay } = useGuardian();
  const [saving, setSaving] = useState<AutonomyLevel | null>(null);
  const [arming, setArming] = useState(false);
  const [denied, setDenied] = useState<PolicyVerdict | null>(null);

  if (loading || !state || !facts) return null;

  const mode = state.settings.autopayGuard;
  const armed = state.autopay.armed;

  async function arm() {
    setDenied(null);
    setArming(true);
    const result = await autopay("arm", true);
    setArming(false);
    if (result.ok) toast("Autopay armed");
    else if (result.verdict) setDenied(result.verdict);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <BackLink href="/" label="Home" />
      </div>

      <header className="rise" style={{ "--d": "0.06s" } as React.CSSProperties}>
        <p className="lbl">Autopay guard</p>
        <h1 className="serif mt-1.5 text-[25px] leading-[1.15] text-cream">
          The due date, handled.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-mute">
          Pays your {facts.display.issuer} bill on {facts.dueDate}. If the full amount
          would break your {facts.display.safetyBuffer} cushion, it pays what’s safe
          and tells you — never silently.
        </p>
      </header>

      <section
        className="rise flex flex-col gap-2"
        style={{ "--d": "0.12s" } as React.CSSProperties}
        role="radiogroup"
        aria-label="Autopay autonomy"
      >
        {LEVELS.map((l) => {
          const active = mode === l.value;
          return (
            <button
              key={l.value}
              role="radio"
              aria-checked={active}
              onClick={async () => {
                if (active) return;
                setSaving(l.value);
                setDenied(null);
                await updateSettings({ autopayGuard: l.value });
                setSaving(null);
              }}
              disabled={saving !== null}
              className={`card flex items-center gap-3.5 px-4 py-3 text-left transition-all ${active ? "" : "opacity-65 hover:opacity-100"}`}
              style={active ? { borderColor: "color-mix(in srgb, var(--color-gold) 45%, transparent)" } : undefined}
            >
              <span
                aria-hidden
                className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: active ? "var(--color-gold)" : "var(--hairline-strong)" }}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-gold)" }} />}
              </span>
              <span>
                <span className={`block text-[14px] ${active ? "text-cream" : "text-cream-2"}`}>
                  {l.name}
                  {saving === l.value && <span className="ml-2 text-[11.5px] italic text-faint">saving…</span>}
                </span>
                <span className="block text-[12px] text-mute">{l.desc}</span>
              </span>
            </button>
          );
        })}
      </section>

      {mode !== "off" && (
        <section className="rise" style={{ "--d": "0.05s" } as React.CSSProperties}>
          {armed ? (
            <div
              className="card px-5 py-4"
              style={{ borderColor: "color-mix(in srgb, var(--color-sage) 30%, transparent)" }}
            >
              <p className="lbl" style={{ color: "var(--color-sage)" }}>
                Armed
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-cream-2">{state.autopay.note}</p>
            </div>
          ) : (
            <button
              onClick={arm}
              disabled={arming}
              className={`btn-gold flex w-full items-center justify-center gap-2 px-4 py-3 text-[14.5px] ${arming ? "pending" : ""}`}
            >
              {arming ? <><Spinner /> Setting up with {facts.display.issuer}…</> : "Arm autopay"}
            </button>
          )}
        </section>
      )}

      {denied && (
        <section
          className="card px-5 py-4"
          style={{ borderColor: "color-mix(in srgb, var(--color-alert-red) 32%, transparent)" }}
          role="alert"
        >
          <p className="lbl" style={{ color: "var(--color-alert-red)" }}>
            The guardrail said no
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-cream-2">{denied.reason}</p>
        </section>
      )}
    </div>
  );
}
