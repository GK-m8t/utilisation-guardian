"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGuardian } from "@/components/GuardianProvider";
import { BackLink, Spinner } from "@/components/ui";
import type { AutonomyLevel, PolicyVerdict } from "@/lib/types";

const LEVELS: { value: AutonomyLevel; name: string; desc: string }[] = [
  { value: "off", name: "Off", desc: "No autopay. I’ll only remind you near the due date." },
  {
    value: "ask",
    name: "Ask first",
    desc: "I line up the payment on the due date; you approve it with a tap.",
  },
  {
    value: "auto",
    name: "Autonomous",
    desc: "I pay the bill on the due date myself — only while your cushion holds.",
  },
];

export default function AutopayPage() {
  const { state, facts, loading, updateSettings, autopay } = useGuardian();
  const [saving, setSaving] = useState<AutonomyLevel | null>(null);
  const [working, setWorking] = useState<"arm" | "simulate-due-date" | null>(null);
  const [denied, setDenied] = useState<PolicyVerdict | null>(null);
  const router = useRouter();

  if (loading || !state || !facts) return null;

  const mode = state.settings.autopayGuard;
  const armed = state.autopay.armed;

  async function run(intent: "arm" | "simulate-due-date") {
    setDenied(null);
    setWorking(intent);
    // In ask-first, tapping the button IS the consent; in auto, none is needed.
    const consent = state!.settings.autopayGuard !== "auto";
    const result = await autopay(intent, consent);
    setWorking(null);
    if (!result.ok && result.verdict) setDenied(result.verdict);
    if (result.ok && intent === "simulate-due-date") router.push("/activity");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <BackLink href="/" label="Home" />
      </div>

      <header className="rise" style={{ "--d": "0.06s" } as React.CSSProperties}>
        <p className="lbl">Autopay guard</p>
        <h1 className="serif mt-1.5 text-[26px] leading-[1.15] text-cream">
          The due date, handled — never at your cushion’s expense.
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-mute">
          Pays your {facts.display.issuer} bill on {facts.dueDate}. If paying in
          full would dip into your {facts.display.safetyBuffer} essentials
          cushion, it pays what’s safe and alerts you about the rest — it never
          overdraws you quietly.
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
                setSaving(l.value);
                setDenied(null);
                await updateSettings({ autopayGuard: l.value });
                setSaving(null);
              }}
              disabled={saving !== null}
              className={`card flex items-start gap-3.5 px-4 py-3.5 text-left transition-all ${active ? "" : "opacity-70 hover:opacity-100"}`}
              style={active ? { borderColor: "color-mix(in srgb, var(--color-gold) 45%, transparent)" } : undefined}
            >
              <span
                aria-hidden
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: active ? "var(--color-gold)" : "var(--hairline-strong)" }}
              >
                {active && <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-gold)" }} />}
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

      {mode !== "off" && (
        <section className="rise flex flex-col gap-2" style={{ "--d": "0.05s" } as React.CSSProperties}>
          {armed ? (
            <div
              className="card px-5 py-4"
              style={{ borderColor: "color-mix(in srgb, var(--color-sage) 30%, transparent)" }}
            >
              <p className="lbl" style={{ color: "var(--color-sage)" }}>
                Armed
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-cream-2">{state.autopay.note}</p>
            </div>
          ) : (
            <button
              onClick={() => run("arm")}
              disabled={working !== null}
              className={`btn-gold inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-[14.5px] ${working === "arm" ? "pending" : ""}`}
            >
              {working === "arm" ? (
                <>
                  <Spinner /> Setting up with {facts.display.issuer}…
                </>
              ) : (
                "Arm autopay for this card"
              )}
            </button>
          )}

          {armed && (
            <>
              <button
                onClick={() => run("simulate-due-date")}
                disabled={working !== null}
                className={`btn-quiet inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-[14px] ${working === "simulate-due-date" ? "pending" : ""}`}
              >
                {working === "simulate-due-date" ? (
                  <>
                    <Spinner /> Running the {facts.dueDate} payment…
                  </>
                ) : mode === "ask" ? (
                  `Approve & run the ${facts.dueDate} payment now (demo)`
                ) : (
                  `Fast-forward to ${facts.dueDate} (demo)`
                )}
              </button>
              <p className="text-center text-[11.5px] italic text-faint">
                The demo clock is frozen, so this button plays the due date out —
                same policy gate, same log.
              </p>
            </>
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
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-cream-2">{denied.reason}</p>
        </section>
      )}
    </div>
  );
}
