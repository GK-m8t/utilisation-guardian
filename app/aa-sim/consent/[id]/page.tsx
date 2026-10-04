"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

/**
 * The AA simulator's hosted consent screen — deliberately styled as a
 * DIFFERENT surface (the aggregator's, not the Guardian's), the way Setu's
 * hosted consent page is its own branded screen. Mirrors the real consent
 * anatomy: who is asking, for what data, for which period, how often.
 */
export default function AaConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <div className="flex min-h-full flex-col" style={{ fontFamily: "var(--font-sans)" }}>
      {/* aggregator chrome — intentionally not Midnight Vault */}
      <div
        className="-mx-5 -mt-6 px-5 py-4 sm:-mx-6 sm:-mt-7 sm:px-6"
        style={{ background: "#101d2e", borderBottom: "1px solid rgba(147,197,253,0.18)" }}
      >
        <p className="text-[11px] uppercase tracking-wider" style={{ color: "#7fa8d9" }}>
          Account Aggregator · simulator
        </p>
        <p className="mt-0.5 text-[15px] font-medium" style={{ color: "#dbe7f5" }}>
          Consent request
        </p>
        <p className="text-[11.5px]" style={{ color: "#6b86a5" }}>
          mirrors the Setu Bridge consent contract · george@aa-sim
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 pt-5">
        <div className="rounded-xl p-4" style={{ background: "rgba(147,197,253,0.06)", border: "1px solid rgba(147,197,253,0.14)" }}>
          <p className="text-[13px]" style={{ color: "#dbe7f5" }}>
            <strong>Utilisation Guardian</strong> is asking to view:
          </p>
          <div className="mt-3 flex items-center gap-3 rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="flex h-9 w-9 items-center justify-center rounded-md text-[11px] font-semibold" style={{ background: "#1a3a5c", color: "#9ec5ec" }}>
              HDFC
            </span>
            <div>
              <p className="text-[13px]" style={{ color: "#dbe7f5" }}>Savings ··4821</p>
              <p className="text-[11px]" style={{ color: "#6b86a5" }}>HDFC Bank (simulated FIP)</p>
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-[12px]" style={{ color: "#9db4cd" }}>
            <li>· Balance and transactions, Apr 1 – Sep 20, 2026</li>
            <li>· One-time fetch, read-only — nothing can be moved</li>
            <li>· Purpose: working out what you can safely spare</li>
          </ul>
        </div>

        <p className="text-[11.5px] leading-relaxed" style={{ color: "#6b86a5" }}>
          Under the AA framework you choose exactly what is shared, and you can
          revoke it later. Declining shares nothing.
        </p>

        <div className="mt-auto flex flex-col gap-2 pb-2">
          <button
            onClick={() => router.push(`/onboarding?aa=granted&session=${id}`)}
            className="w-full rounded-xl py-3 text-[14px] font-semibold"
            style={{ background: "#2f6fb4", color: "#eef5fc" }}
          >
            Approve — share once
          </button>
          <button
            onClick={() => router.push("/onboarding?aa=denied")}
            className="w-full rounded-xl py-2.5 text-[13px]"
            style={{ border: "1px solid rgba(147,197,253,0.25)", color: "#9db4cd" }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
