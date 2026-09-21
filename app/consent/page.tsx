"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuardian } from "@/components/GuardianProvider";
import { BackLink, Spinner } from "@/components/ui";
import type { PolicyVerdict } from "@/lib/types";

export default function ConsentPage() {
  const { state, facts, loading, paydown, limitIncrease } = useGuardian();
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [limitStatus, setLimitStatus] = useState<"idle" | "submitted">("idle");
  const [denied, setDenied] = useState<PolicyVerdict | null>(null);
  const deniedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (denied) deniedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [denied]);

  if (loading || !state || !facts) return null;

  const bank = state.bank.balance ?? 0;
  const bufferShare = bank > 0 ? Math.min(state.bank.safetyBuffer, bank) / bank : 1;
  const moveShare = bank > 0 ? facts.affordableNow / bank : 0;
  const nothingSafe = facts.affordableNow <= 0;

  async function onConsent() {
    if (!facts) return;
    setDenied(null);
    setMoving(true);
    const result = await paydown(facts.affordableNow, true, "user");
    setMoving(false);
    if (result.ok) {
      router.push("/activity");
    } else {
      setDenied(result.verdict);
    }
  }

  async function onLimitIncrease() {
    setDenied(null);
    setRequesting(true);
    const result = await limitIncrease(true);
    setRequesting(false);
    if (result.ok) setLimitStatus("submitted");
    else setDenied(result.verdict);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rise" style={{ "--d": "0s" } as React.CSSProperties}>
        <BackLink href="/guardian" label="Why this matters" />
      </div>

      <header className="rise" style={{ "--d": "0.06s" } as React.CSSProperties}>
        <p className="lbl">The plan</p>
        <h1 className="serif mt-1.5 text-[26px] leading-[1.15] text-cream">
          {nothingSafe
            ? "Nothing moves until it’s safe."
            : "Get under 30% — without emptying your account."}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-mute">
          {nothingSafe
            ? `Getting under 30% means paying ${facts.display.paydownTo30}, but everything in your bank is spoken for by your ${facts.display.safetyBuffer} essentials cushion. I won’t suggest moving money you live on.`
            : facts.splitRequired
              ? `The full ${facts.display.paydownTo30} today would cut into money you need before salary. So the plan splits it.`
              : `You can clear the full ${facts.display.paydownTo30} today and still keep your ${facts.display.safetyBuffer} cushion intact.`}
        </p>
      </header>

      {/* the bank, with the cushion made visible */}
      <section className="card rise px-5 py-4" style={{ "--d": "0.12s" } as React.CSSProperties}>
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] text-mute">Your bank account</p>
          <p className="figure text-[17px] text-cream">{facts.display.bankBalance}</p>
        </div>
        <div
          className="mt-3 flex h-9 w-full overflow-hidden rounded-lg"
          role="img"
          aria-label={`Of ${facts.display.bankBalance}: ${facts.display.affordableNow} moves today, ${facts.display.safetyBuffer} stays protected as your cushion`}
        >
          <div
            className="h-full"
            style={{
              width: `${moveShare * 100}%`,
              background:
                "linear-gradient(160deg, var(--color-gold-bright), var(--color-gold) 70%)",
            }}
          />
          <div
            className="h-full flex-1"
            style={{
              background:
                "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-sage) 26%, transparent) 0 4px, color-mix(in srgb, var(--color-sage) 12%, transparent) 4px 8px)",
            }}
          />
        </div>
        <div className="mt-2.5 flex justify-between gap-3 text-[12px] leading-snug">
          <p style={{ width: `${moveShare * 100}%` }}>
            <span className="figure text-[13.5px] text-gold">{facts.display.affordableNow}</span>
            <br />
            <span className="text-mute">moves today</span>
          </p>
          <p className="text-right" style={{ width: `${bufferShare * 100}%` }}>
            <span className="figure text-[13.5px]" style={{ color: "var(--color-sage)" }}>
              {facts.display.safetyBuffer}
            </span>
            <br />
            <span className="text-mute">your cushion — untouched</span>
          </p>
        </div>
      </section>

      {/* the split */}
      {!nothingSafe && (
        <section className="rise flex flex-col gap-2" style={{ "--d": "0.18s" } as React.CSSProperties}>
          <div className="flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3.5">
            <div>
              <p className="text-[13.5px] text-cream">Today, before the statement</p>
              <p className="text-[12px] text-faint">drops you to {facts.display.utilisationAfterNow} at the snapshot</p>
            </div>
            <p className="figure text-[19px] text-cream">{facts.display.affordableNow}</p>
          </div>
          {facts.splitRequired && (
            <div className="flex items-center justify-between rounded-2xl border border-(--hairline) px-4 py-3.5">
              <div>
                <p className="text-[13.5px] text-cream">{facts.dueDate}, with your due amount</p>
                <p className="text-[12px] text-faint">after salary is safely in</p>
              </div>
              <p className="figure text-[19px] text-cream">{facts.display.shortfall}</p>
            </div>
          )}
        </section>
      )}

      {/* consent — the one tap that moves money */}
      {nothingSafe ? (
        <section
          className="rise card px-5 py-4"
          style={{ "--d": "0.24s", borderColor: "color-mix(in srgb, var(--color-sage) 28%, transparent)" } as React.CSSProperties}
        >
          <p className="lbl" style={{ color: "var(--color-sage)" }}>
            Propose-only mode
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">
            The guardrail that protects your cushion is the same one holding me
            back here — no paydown until there’s money that’s safely yours to
            move. I’ll flag the safe amount the moment that changes. You can
            adjust the cushion in settings if it’s set too high.
          </p>
          <Link href="/settings" className="btn-quiet mt-3 inline-flex w-full items-center justify-center px-4 py-2.5 text-[13.5px]">
            Review my numbers in settings
          </Link>
        </section>
      ) : (
        <section className="rise flex flex-col gap-2" style={{ "--d": "0.24s" } as React.CSSProperties}>
          <button
            onClick={onConsent}
            disabled={moving}
            className={`btn-gold inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-[14.5px] ${moving ? "pending" : ""}`}
          >
            {moving ? (
              <>
                <Spinner /> Moving {facts.display.affordableNow} from your bank…
              </>
            ) : (
              <>Yes — move {facts.display.affordableNow} now</>
            )}
          </button>
          <p className="text-center text-[12px] text-faint">
            One transfer, logged in plain words. Your {facts.display.safetyBuffer}{" "}
            cushion is never touched.
          </p>
        </section>
      )}

      {denied && (
        <section
          ref={deniedRef}
          className="card px-5 py-4"
          style={{ borderColor: "color-mix(in srgb, var(--color-alert-red) 32%, transparent)" }}
          role="alert"
        >
          <p className="lbl" style={{ color: "var(--color-alert-red)" }}>
            The guardrail said no
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-cream-2">{denied.reason}</p>
          {denied.code === "DENIED_GUARDIAN_OFF" && (
            <Link href="/settings" className="btn-quiet mt-3 inline-flex w-full items-center justify-center px-4 py-2.5 text-[13.5px]">
              Open autonomy settings
            </Link>
          )}
        </section>
      )}

      {/* the structural fix, framed honestly */}
      <section className="rise rounded-2xl border border-(--hairline) px-5 py-4" style={{ "--d": "0.3s" } as React.CSSProperties}>
        <p className="lbl">A longer-term fix</p>
        <h2 className="serif mt-1 text-[17px] text-cream">
          Ask {facts.display.issuer} to raise your limit to {facts.display.requestedLimit}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
          The same spending would report as {facts.display.utilisationAtNewLimit}{" "}
          instead of {facts.display.utilisation}. To be clear: this is not extra
          money to spend — it only lowers the ratio the bureau sees. Most issuer
          increases don’t need a hard enquiry.
        </p>
        {limitStatus === "submitted" ? (
          <p className="mt-3 inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--color-sage)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m2.5 7.5 3 3 6-7" />
            </svg>
            Request submitted to {facts.display.issuer} — you’ll hear back in a few days.
          </p>
        ) : (
          <button
            onClick={onLimitIncrease}
            disabled={requesting}
            className={`btn-quiet mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-[13.5px] ${requesting ? "pending" : ""}`}
          >
            {requesting ? (
              <>
                <Spinner /> Sending the request…
              </>
            ) : (
              "Request the increase"
            )}
          </button>
        )}
      </section>
    </div>
  );
}
