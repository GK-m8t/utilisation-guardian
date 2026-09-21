"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * The vault dial — utilisation drawn like a fine watch gauge.
 * A 240° sweep with radial tick marks, a physical notch at the 30% safe
 * line (the product's core threshold, made visible), and a gradient arc
 * that runs champagne → red as utilisation rises.
 */

const SWEEP = 240; // degrees
const START = 240; // 0% at 8 o'clock, sweeping clockwise over the top to 4 o'clock

// angle measured clockwise from 12 o'clock
function point(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const s = point(cx, cy, r, from);
  const e = point(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

/** Animates a number from `from` to `to` with ease-out once on mount. */
function useSweep(to: number, from: number, duration = 1100) {
  const [v, setV] = useState(from);
  const reduced = usePrefersReducedMotion();
  const raf = useRef(0);
  useEffect(() => {
    if (reduced) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, from, duration, reduced]);
  return reduced ? to : v;
}

export function UtilisationDial({
  value,
  from = 0,
  size = 264,
  sublabel,
  caption,
}: {
  /** utilisation as a fraction, e.g. 0.82 */
  value: number;
  /** animate the arc from this fraction on mount */
  from?: number;
  size?: number;
  sublabel?: string;
  caption?: string;
}) {
  const v = useSweep(value, from);
  const cx = size / 2;
  const cy = size / 2;
  const rArc = size * 0.395;
  const rTickOuter = size * 0.46;
  const rTickInner = size * 0.435;

  const angle = (f: number) => START + SWEEP * Math.min(1, Math.max(0, f));

  // colour of the needle dot by where we are on the dial
  const dotColor =
    v >= 0.75 ? "var(--color-alert-red)" : v >= 0.5 ? "var(--color-alert-orange)" : v >= 0.3 ? "var(--color-amber)" : "var(--color-sage)";

  const ticks = [];
  const TICKS = 48;
  for (let i = 0; i <= TICKS; i++) {
    const f = i / TICKS;
    const a = angle(f);
    const long = i % 12 === 0;
    const p1 = point(cx, cy, long ? rTickInner - size * 0.015 : rTickInner, a);
    const p2 = point(cx, cy, rTickOuter, a);
    ticks.push(
      <line
        key={i}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="rgba(237,233,223,0.22)"
        strokeWidth={1}
        strokeLinecap="round"
      />
    );
  }
  // the 30% safe line gets its own longer gold tick, exactly on threshold
  {
    const a = angle(0.3);
    const p1 = point(cx, cy, rTickInner - size * 0.02, a);
    const p2 = point(cx, cy, rTickOuter + size * 0.008, a);
    ticks.push(
      <line
        key="safe"
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="var(--color-gold)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  }

  const needle = point(cx, cy, rArc, angle(v));
  const safeLabelPos = point(cx, cy, rTickOuter + size * 0.055, angle(0.3));
  const pctNow = Math.round(v * 100);

  return (
    // layout box is cropped: the 240° sweep leaves the bottom quadrant empty
    <div className="relative" style={{ width: size, height: size * 0.87 }} role="img" aria-label={`Utilisation ${Math.round(value * 100)} percent${sublabel ? `, ${sublabel}` : ""}`}>
      <svg className="absolute left-0 top-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="dial-grad" x1="0" y1="1" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-gold)" />
            <stop offset="45%" stopColor="var(--color-amber)" />
            <stop offset="72%" stopColor="var(--color-alert-orange)" />
            <stop offset="100%" stopColor="var(--color-alert-red)" />
          </linearGradient>
          <filter id="dial-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {ticks}

        {/* track */}
        <path
          d={arcPath(cx, cy, rArc, START, START + SWEEP)}
          fill="none"
          stroke="rgba(237,233,223,0.09)"
          strokeWidth={size * 0.028}
          strokeLinecap="round"
        />

        {/* progress */}
        {v > 0.005 && (
          <path
            d={arcPath(cx, cy, rArc, START, angle(v))}
            fill="none"
            stroke="url(#dial-grad)"
            strokeWidth={size * 0.028}
            strokeLinecap="round"
            filter="url(#dial-glow)"
          />
        )}

        {/* needle dot */}
        <circle cx={needle.x} cy={needle.y} r={size * 0.02} fill={dotColor} filter="url(#dial-glow)" />
        <circle cx={needle.x} cy={needle.y} r={size * 0.008} fill="#0a0c10" />

        {/* the 30% safe line, named */}
        <text
          x={safeLabelPos.x}
          y={safeLabelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-gold)"
          fontSize={size * 0.042}
          fontStyle="italic"
          fontFamily="var(--font-fraunces)"
        >
          30
        </text>
      </svg>

      <div
        className="absolute left-0 top-0 flex flex-col items-center justify-center text-center"
        style={{ width: size, height: size }}
      >
        <div
          className="figure leading-none"
          style={{ fontSize: size * 0.24, color: "var(--color-cream)" }}
        >
          {pctNow}
          <span style={{ fontSize: size * 0.11, color: "var(--color-mute)" }}>%</span>
        </div>
        {sublabel && (
          <div className="mt-1.5 text-[13px] text-mute">{sublabel}</div>
        )}
        {caption && <div className="lbl mt-1">{caption}</div>}
      </div>
    </div>
  );
}
