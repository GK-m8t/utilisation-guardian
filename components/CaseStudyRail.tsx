"use client";

import { useGuardian } from "./GuardianProvider";

/**
 * Desktop-only side rail: the demo narrating its own architecture, live.
 * Layer 1 shows the numbers the rules engine computed; layer 2 shows where
 * the words came from; layer 3 shows the checks the last action ran through.
 */
export function CaseStudyRail() {
  const { facts, lastVerdict, lastSource } = useGuardian();

  if (!facts) return null;

  const sourceLabel =
    lastSource === null
      ? "waiting for the first explanation"
      : lastSource === "template"
        ? "deterministic template (no key configured)"
        : `live model via ${lastSource}`;

  return (
    <aside className="sticky top-0 hidden max-h-dvh w-[320px] shrink-0 flex-col justify-center gap-5 py-10 xl:flex">
      <p className="lbl">How this prototype is built</p>
      <h2 className="serif text-[22px] leading-snug text-cream">
        Three layers, one boundary: the model explains, the rules decide.
      </h2>

      <div className="flex flex-col gap-3">
        <section className="card p-4">
          <h3 className="text-[13px] font-medium text-cream">
            1 — Rules engine <span className="text-faint">deterministic</span>
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
            Owns every number on screen: utilisation{" "}
            <span className="text-cream-2">{facts.display.utilisation}</span>, paydown
            to 30% <span className="text-cream-2">{facts.display.paydownTo30}</span>,
            safe amount <span className="text-cream-2">{facts.display.affordableNow}</span>
            {facts.splitRequired && (
              <>
                {" "}
                + <span className="text-cream-2">{facts.display.shortfall}</span>{" "}
                scheduled
              </>
            )}
            . The model never does arithmetic.
          </p>
        </section>

        <section className="card p-4">
          <h3 className="text-[13px] font-medium text-cream">
            2 — Language layer <span className="text-faint">LLM, swappable</span>
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
            Turns those facts into plain words. Current source:{" "}
            <span className="text-gold">{sourceLabel}</span>. Open-model-first by
            design — cost at scale and RBI data locality.
          </p>
        </section>

        <section className="card p-4">
          <h3 className="text-[13px] font-medium text-cream">
            3 — Policy gate <span className="text-faint">before any action</span>
          </h3>
          {lastVerdict ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {lastVerdict.checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2 text-[12.5px]">
                  <span
                    aria-hidden
                    className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: c.pass
                        ? "var(--color-sage)"
                        : "var(--color-alert-red)",
                    }}
                  />
                  <span className="text-mute">
                    <span className="text-cream-2">{c.name}.</span> {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
              No action attempted yet. When one is, every consent, buffer and cap
              check it passed (or failed) appears here.
            </p>
          )}
        </section>
      </div>

      <p className="text-[12px] italic leading-relaxed text-faint">
        “Use the model for what it’s good at — language, empathy, explanation — and
        rules for what it must never get wrong: financial math, thresholds,
        actions. That boundary is the product design.”
      </p>
    </aside>
  );
}
