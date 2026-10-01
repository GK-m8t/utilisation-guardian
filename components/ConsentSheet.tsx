"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGuardian } from "./GuardianProvider";
import { Sheet, SlideToConfirm } from "./primitives";
import { Spinner } from "./ui";
import type { PolicyVerdict } from "@/lib/types";

/**
 * The one surface that moves money. Opens over any screen; the policy
 * verdict renders in place of the confirm control, so the guardrail is
 * visible exactly where the user acted.
 */
export function ConsentSheet() {
  const { state, facts, sheet, closeSheet, paydown, limitIncrease } = useGuardian();
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [denied, setDenied] = useState<PolicyVerdict | null>(null);
  const [result, setResult] = useState<{ before: number; after: number } | null>(null);

  if (!state || !facts || !sheet) return null;

  const close = () => {
    if (phase === "working") return;
    setPhase("idle");
    setDenied(null);
    setResult(null);
    closeSheet();
  };

  async function runPaydown(amount: number) {
    setDenied(null);
    setPhase("working");
    const res = await paydown(amount, true, "user");
    if (res.ok && res.entry) {
      setResult({ before: res.entry.before ?? 0, after: res.entry.after ?? 0 });
      setPhase("done");
    } else {
      setDenied(res.verdict);
      setPhase("idle");
    }
  }

  async function runLimitIncrease() {
    setDenied(null);
    setPhase("working");
    const res = await limitIncrease(true);
    if (res.ok) setPhase("done");
    else {
      setDenied(res.verdict);
      setPhase("idle");
    }
  }

  const finish = () => {
    const wasPaydown = sheet.type === "paydown";
    setPhase("idle");
    setDenied(null);
    setResult(null);
    closeSheet();
    if (wasPaydown) router.push("/activity");
  };

  /* ——— success state (shared shell) ——— */
  if (phase === "done") {
    return (
      <Sheet open onClose={finish} label="Done">
        <div className="flex flex-col items-center pb-1 pt-2 text-center">
          <span
            className="check-pop flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--color-sage) 18%, transparent)", color: "var(--color-sage)" }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          {sheet.type === "paydown" && result ? (
            <>
              <p className="figure mt-4 text-[30px] leading-none text-cream">
                {Math.round(result.before * 100)}%{" "}
                <span aria-hidden className="text-faint">→</span>{" "}
                <span style={{ color: "var(--color-sage)" }}>{Math.round(result.after * 100)}%</span>
              </p>
              <p className="mt-2 text-[13px] text-mute">
                Done before the {facts.statementDate} snapshot.
                {facts.splitRequired && ` ${facts.display.shortfall} rides with your due payment.`}
              </p>
            </>
          ) : (
            <>
              <p className="serif mt-4 text-[20px] text-cream">Request sent to {facts.display.issuer}</p>
              <p className="mt-1.5 text-[13px] text-mute">You’ll hear back in a few days.</p>
            </>
          )}
          <button onClick={finish} className="btn-gold mt-5 w-full px-4 py-3 text-[14.5px]">
            {sheet.type === "paydown" ? "See it in your activity" : "Done"}
          </button>
        </div>
      </Sheet>
    );
  }

  /* ——— limit increase (lighter decision, plain confirm) ——— */
  if (sheet.type === "limit-increase") {
    return (
      <Sheet open onClose={close} label="Request a limit increase">
        <h2 className="serif text-[20px] leading-snug text-cream">
          Ask {facts.display.issuer} for a {facts.display.requestedLimit} limit
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-mute">
          Same spending reports as {facts.display.utilisationAtNewLimit} instead of{" "}
          {facts.display.utilisation}. Not extra money to spend — only the ratio changes.
        </p>
        {denied && <DenialBlock verdict={denied} />}
        <button
          onClick={runLimitIncrease}
          disabled={phase === "working"}
          className={`btn-gold mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 text-[14.5px] ${phase === "working" ? "pending" : ""}`}
        >
          {phase === "working" ? <><Spinner /> Sending…</> : "Send the request"}
        </button>
        <p className="mt-2 text-center text-[11.5px] text-faint">Usually no hard enquiry.</p>
      </Sheet>
    );
  }

  /* ——— paydown ——— */
  const amount = sheet.amount ?? facts.affordableNow;
  const bank = state.bank.balance ?? 0;
  const moveShare = bank > 0 ? Math.min(1, amount / bank) : 0;

  return (
    <Sheet open onClose={close} label="Confirm the paydown">
      <div className="flex items-baseline justify-between">
        <h2 className="serif text-[20px] text-cream">Move to your card</h2>
        <p className="figure text-[26px] text-gold">{facts.display.affordableNow}</p>
      </div>

      {/* the split, compact */}
      <div className="mt-3.5 flex flex-col gap-1.5">
        <Row left="Today — before the statement" right={facts.display.affordableNow} sub={`snapshot drops to ${facts.display.utilisationAfterNow}`} />
        {facts.splitRequired && (
          <Row left={`${facts.dueDate} — with your due payment`} right={facts.display.shortfall} sub="after salary lands" />
        )}
      </div>

      {/* cushion bar, compact */}
      <div className="mt-3.5">
        <div className="flex h-2 w-full overflow-hidden rounded-full" aria-hidden>
          <div style={{ width: `${moveShare * 100}%`, background: "var(--color-gold)" }} />
          <div
            className="flex-1"
            style={{ background: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-sage) 30%, transparent) 0 3px, color-mix(in srgb, var(--color-sage) 12%, transparent) 3px 6px)" }}
          />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-faint">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--color-sage)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 1.5 10 3v3c0 2.5-1.7 4-4 4.5C3.7 10 2 8.5 2 6V3l4-1.5Z" />
          </svg>
          {facts.display.safetyBuffer} cushion stays untouched · every move is logged
        </p>
      </div>

      {denied ? (
        <>
          <DenialBlock verdict={denied} />
          {denied.adaptedAmount ? (
            <button
              onClick={() => runPaydown(denied.adaptedAmount!)}
              className="btn-gold mt-3 w-full px-4 py-3 text-[14.5px]"
            >
              Move the safe {`₹${new Intl.NumberFormat("en-IN").format(denied.adaptedAmount)}`} instead
            </button>
          ) : (
            <button onClick={close} className="btn-quiet mt-3 w-full px-4 py-2.5 text-[13.5px]">
              Got it
            </button>
          )}
        </>
      ) : (
        <div className="mt-4">
          {phase === "working" ? (
            <div className="pending flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl border border-(--hairline-strong) text-[14px] text-cream-2">
              <Spinner /> Moving {facts.display.affordableNow}…
            </div>
          ) : (
            <SlideToConfirm label={`Slide to move ${facts.display.affordableNow}`} onConfirm={() => runPaydown(amount)} disabled={amount <= 0} />
          )}
        </div>
      )}
    </Sheet>
  );
}

function Row({ left, right, sub }: { left: string; right: string; sub: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-(--hairline) px-3.5 py-2.5">
      <div>
        <p className="text-[13px] text-cream-2">{left}</p>
        <p className="text-[11.5px] text-faint">{sub}</p>
      </div>
      <p className="figure text-[16px] text-cream">{right}</p>
    </div>
  );
}

function DenialBlock({ verdict }: { verdict: PolicyVerdict }) {
  return (
    <div
      className="mt-4 rounded-xl border px-3.5 py-3"
      style={{ borderColor: "color-mix(in srgb, var(--color-alert-red) 32%, transparent)" }}
      role="alert"
    >
      <p className="lbl" style={{ color: "var(--color-alert-red)" }}>
        The guardrail said no
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-cream-2">{verdict.reason}</p>
    </div>
  );
}
