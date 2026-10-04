"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuardian } from "@/components/GuardianProvider";
import { UtilisationDial } from "@/components/UtilisationDial";
import { Spinner } from "@/components/ui";
import type { AutonomyLevel } from "@/lib/types";

/**
 * First run: the Guardian earns its permissions before it acts.
 * Three screens — meet, connect + cushion, autonomy. Skippable.
 */
export default function OnboardingPage() {
  const { state, facts, loading, updateSettings } = useGuardian();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [linkedBalance, setLinkedBalance] = useState<number | null>(null);
  const [viaAa, setViaAa] = useState(false);
  const [aaDenied, setAaDenied] = useState(false);
  const [cushion, setCushion] = useState<number | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyLevel>("ask");
  const [finishing, setFinishing] = useState(false);
  const aaHandled = useRef(false);

  // Returning leg of the AA consent redirect (?aa=granted&session=…)
  useEffect(() => {
    if (aaHandled.current) return;
    const q = new URLSearchParams(window.location.search);
    const aa = q.get("aa");
    if (!aa) return;
    aaHandled.current = true;
    window.history.replaceState(null, "", "/onboarding");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(1);
    if (aa === "denied") {
      setAaDenied(true);
      return;
    }
    const session = q.get("session");
    if (!session) return;
    setConnecting(true);
    (async () => {
      try {
        const res = await fetch(`/api/aa-sim/consents/${session}/fi-data?granted=1`);
        const data = await res.json();
        const balance = data?.accounts?.[0]?.summary?.currentBalance;
        if (typeof balance === "number") {
          await updateSettings({ bankBalance: balance });
          setLinkedBalance(balance);
          setViaAa(true);
          setConnected(true);
        }
      } finally {
        setConnecting(false);
      }
    })();
  }, [updateSettings]);

  if (loading || !state || !facts) return null;

  const cushionValue = cushion ?? state.bank.safetyBuffer;

  async function finish(skipped = false) {
    setFinishing(true);
    await updateSettings(
      skipped
        ? { onboarded: true }
        : { onboarded: true, safetyBuffer: cushionValue, utilGuard: autonomy }
    );
    router.replace("/");
  }

  // Bank link: the AA-simulator consent flow (Setu contract), mock fallback.
  async function connectBank() {
    setAaDenied(false);
    setConnecting(true);
    try {
      const res = await fetch("/api/bank/link", { method: "POST" });
      const data = await res.json();
      if (data.mode === "aa-sim" && data.url) {
        router.push(data.url); // → the aggregator's hosted consent screen
        return;
      }
    } catch {}
    // mock path: pretend-link with a short delay
    setTimeout(() => {
      setConnecting(false);
      setConnected(true);
    }, 1400);
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="h-1 w-6 rounded-full transition-colors"
              style={{ background: i <= step ? "var(--color-gold)" : "var(--hairline-strong)" }}
            />
          ))}
        </div>
        <button onClick={() => finish(true)} disabled={finishing} className="text-[12.5px] text-faint transition-colors hover:text-cream-2">
          Skip
        </button>
      </div>

      {step === 0 && (
        <div className="rise flex flex-1 flex-col items-center justify-center text-center">
          <UtilisationDial value={0.3} sublabel="the line that matters" size={220} />
          <h1 className="serif mt-2 max-w-[16ch] text-[27px] leading-[1.15] text-cream">
            Your score is decided on statement day.
          </h1>
          <p className="mt-2.5 max-w-[30ch] text-[14px] leading-relaxed text-mute">
            Even if you pay in full. I keep you under 30% before the snapshot — with your permission.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="rise flex flex-1 flex-col justify-center">
          <h1 className="serif text-[26px] leading-[1.15] text-cream">
            Connect your bank
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-mute">
            I plan with what you can actually spare — never more.
          </p>

          {connected ? (
            <div className="card mt-5 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[13.5px] text-cream">HDFC savings ··4821</p>
                <p className="figure text-[17px]" style={{ color: "var(--color-sage)" }}>
                  {linkedBalance !== null
                    ? `₹${new Intl.NumberFormat("en-IN").format(linkedBalance)}`
                    : facts.display.bankBalance}
                </p>
              </div>
              <p className="mt-0.5 text-[11.5px] text-faint">
                {viaAa
                  ? "linked via Account Aggregator (simulator) · consent on record · read-only"
                  : "connected · read-only"}
              </p>
            </div>
          ) : (
            <>
              {aaDenied && (
                <p className="mt-4 rounded-xl border border-(--hairline) px-3.5 py-2.5 text-[12.5px] text-mute">
                  You declined — nothing was shared. Without a linked bank I can
                  only warn and propose, never move money.
                </p>
              )}
              <button
                onClick={connectBank}
                disabled={connecting}
                className={`btn-gold mt-5 flex w-full items-center justify-center gap-2 px-4 py-3 text-[14.5px] ${connecting ? "pending" : ""}`}
              >
                {connecting ? <><Spinner /> Fetching via consent…</> : "Link HDFC savings"}
              </button>
            </>
          )}

          {connected && (
            <div className="rise mt-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[13.5px] text-cream">Money I must never touch</p>
                <p className="figure text-[19px]" style={{ color: "var(--color-sage)" }}>
                  ₹{new Intl.NumberFormat("en-IN").format(cushionValue)}
                </p>
              </div>
              <input
                type="range"
                min={0}
                max={40000}
                step={1000}
                value={cushionValue}
                onChange={(e) => setCushion(Number(e.target.value))}
                aria-label="Essentials cushion"
                className="mt-2 w-full accent-(--color-sage)"
              />
              <p className="mt-1.5 text-[12px] text-faint">
                Your essentials until salary. Suggested from your income — adjust it freely.
              </p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="rise flex flex-1 flex-col justify-center">
          <h1 className="serif text-[26px] leading-[1.15] text-cream">
            How much may I do on my own?
          </h1>
          <div className="mt-5 flex flex-col gap-2" role="radiogroup" aria-label="Autonomy">
            {(
              [
                { v: "off", name: "Just warn me", d: "Nothing moves, ever." },
                { v: "ask", name: "Ask first", d: "I propose; you approve each move." },
                { v: "auto", name: "Act for me", d: "Within a cap you set. Never past your cushion." },
              ] as const
            ).map((o) => {
              const active = autonomy === o.v;
              return (
                <button
                  key={o.v}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAutonomy(o.v)}
                  className={`card flex items-center gap-3 px-4 py-3 text-left transition-all ${active ? "" : "opacity-65 hover:opacity-100"}`}
                  style={active ? { borderColor: "color-mix(in srgb, var(--color-gold) 45%, transparent)" } : undefined}
                >
                  <span
                    aria-hidden
                    className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border"
                    style={{ borderColor: active ? "var(--color-gold)" : "var(--hairline-strong)" }}
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-gold)" }} />}
                  </span>
                  <span>
                    <span className="block text-[14px] text-cream">{o.name}</span>
                    <span className="block text-[12px] text-mute">{o.d}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[12px] text-faint">Change it any time. Every move stays on the record.</p>
        </div>
      )}

      <div className="pb-2 pt-4">
        {step < 2 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !connected}
            className="btn-gold w-full px-4 py-3 text-[14.5px]"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={() => finish(false)}
            disabled={finishing}
            className="btn-gold flex w-full items-center justify-center gap-2 px-4 py-3 text-[14.5px]"
          >
            {finishing && <Spinner />} Start guarding
          </button>
        )}
      </div>
    </div>
  );
}
