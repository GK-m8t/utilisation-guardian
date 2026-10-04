"use client";

import { useEffect, useState } from "react";
import { useGuardian } from "./GuardianProvider";
import { toast } from "./primitives";
import { Spinner } from "./ui";

/**
 * Every demo-only control lives here, deliberately OUTSIDE the product
 * surface: scenario, clock fast-forward, money overrides, reset, and the
 * LLM provider status. The app itself carries zero demo furniture.
 */
export function DemoDrawer({
  railVisible,
  setRailVisible,
}: {
  railVisible: boolean;
  setRailVisible: (v: boolean) => void;
}) {
  const { state, facts, updateSettings, autopay, resetDemo } = useGuardian();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [llm, setLlm] = useState<{
    provider: string | null;
    model: string | null;
    connectors?: { bank: string; payment: string };
  } | null>(null);
  const [bankDraft, setBankDraft] = useState<number | null>(null);
  const [bufferDraft, setBufferDraft] = useState<number | null>(null);

  useEffect(() => {
    if (!open || llm) return;
    fetch("/api/llm-status")
      .then((r) => r.json())
      .then(setLlm)
      .catch(() => setLlm({ provider: null, model: null }));
  }, [open, llm]);

  if (!state || !facts) return null;

  const bank = bankDraft ?? state.bank.balance ?? 0;
  const buffer = bufferDraft ?? state.bank.safetyBuffer;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* the pill — discreet, bottom corner of the viewport */}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-(--hairline-strong) px-3 py-1.5 text-[11.5px] text-faint transition-colors hover:text-cream-2"
        style={{ background: "rgba(13,15,21,0.92)", backdropFilter: "blur(8px)" }}
      >
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: open ? "var(--color-gold)" : "var(--color-faint)" }} />
        demo
      </button>

      {open && (
        <aside
          className="fade-in fixed bottom-14 right-4 z-50 flex w-[300px] flex-col gap-4 rounded-2xl border border-(--hairline-strong) p-4"
          style={{ background: "rgba(13,15,21,0.97)", backdropFilter: "blur(12px)", boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}
          aria-label="Demo controls"
        >
          <p className="lbl">Demo controls</p>

          {/* scenario */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] text-cream-2">Scenario</p>
            <div className="flex rounded-lg border border-(--hairline) p-0.5">
              {(["simple", "messy"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => state.scenario !== s && run("scenario", () => updateSettings({ scenario: s }))}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] transition-colors ${state.scenario === s ? "bg-ink-4 text-gold" : "text-faint hover:text-cream-2"}`}
                >
                  {s === "simple" ? "One card" : "Real life"}
                </button>
              ))}
            </div>
          </div>

          {/* money overrides */}
          <div>
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-mute">Bank balance</span>
              <span className="figure text-[13px] text-cream">₹{new Intl.NumberFormat("en-IN").format(bank)}</span>
            </div>
            <input
              type="range" min={0} max={100000} step={1000} value={bank}
              onChange={(e) => setBankDraft(Number(e.target.value))}
              onPointerUp={() => bankDraft !== null && updateSettings({ bankBalance: bankDraft })}
              aria-label="Override bank balance" className="w-full accent-(--color-gold)"
            />
            <div className="mt-1 flex items-baseline justify-between text-[12px]">
              <span className="text-mute">Essentials cushion</span>
              <span className="figure text-[13px]" style={{ color: "var(--color-sage)" }}>₹{new Intl.NumberFormat("en-IN").format(buffer)}</span>
            </div>
            <input
              type="range" min={0} max={40000} step={1000} value={buffer}
              onChange={(e) => setBufferDraft(Number(e.target.value))}
              onPointerUp={() => bufferDraft !== null && updateSettings({ safetyBuffer: bufferDraft })}
              aria-label="Override essentials cushion" className="w-full accent-(--color-sage)"
            />
          </div>

          {/* clock fast-forward */}
          <button
            onClick={() =>
              run("ff", async () => {
                const res = await autopay("simulate-due-date", true);
                toast(res.ok ? `Played ${facts.dueDate} — check Activity` : "Autopay held back — see Activity");
              })
            }
            disabled={!state.autopay.armed || busy !== null}
            className="btn-quiet flex items-center justify-center gap-2 px-3 py-2 text-[12.5px]"
            title={state.autopay.armed ? "" : "Arm autopay first (Home → Autopay guard)"}
          >
            {busy === "ff" ? <Spinner /> : "⏩"} Fast-forward to {facts.dueDate}
            {!state.autopay.armed && <span className="text-faint">(arm autopay first)</span>}
          </button>

          {/* reset */}
          <button
            onClick={() => run("reset", async () => { await resetDemo(); toast("Demo reset"); })}
            disabled={busy !== null}
            className="btn-quiet flex items-center justify-center gap-2 px-3 py-2 text-[12.5px]"
          >
            {busy === "reset" && <Spinner />} Reset the demo
          </button>

          {/* rail toggle (desktop) */}
          <label className="hidden items-center justify-between text-[12.5px] text-cream-2 xl:flex">
            Architecture rail
            <input type="checkbox" checked={railVisible} onChange={(e) => setRailVisible(e.target.checked)} className="accent-(--color-gold)" />
          </label>

          {/* connector + LLM status */}
          <p className="border-t border-(--hairline) pt-2.5 text-[11px] leading-relaxed text-faint">
            Words: {llm ? (llm.provider ? `${llm.provider} · ${llm.model}` : "templated (no provider configured)") : "checking…"}
            {llm?.connectors && (
              <>
                <br />
                Bank: {llm.connectors.bank === "aa-sim" ? "AA simulator (Setu contract)" : "mock"} · Pay:{" "}
                {llm.connectors.payment === "razorpay-test" ? "Razorpay test rails" : "simulated"}
              </>
            )}
          </p>
        </aside>
      )}
    </>
  );
}
