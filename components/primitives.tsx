"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ————— Bottom sheet (renders inside the phone frame) ————— */

export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button
        aria-label="Close"
        onClick={onClose}
        className="fade-in absolute inset-0 cursor-default"
        style={{ background: "rgba(4,5,8,0.6)", backdropFilter: "blur(3px)" }}
      />
      <div
        className="sheet-up relative rounded-t-3xl border-t border-x border-(--hairline-strong) px-5 pb-7 pt-3"
        style={{
          background: "linear-gradient(180deg, #141822, #0d0f15 40%)",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(237,233,223,0.07)",
        }}
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full" style={{ background: "var(--hairline-strong)" }} />
        {children}
      </div>
    </div>
  );
}

/* ————— Slide to confirm — the deliberate gesture for money movement ————— */

export function SlideToConfirm({
  label,
  onConfirm,
  disabled,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackW, setTrackW] = useState(0);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fired = useRef(false);
  const THUMB = 52;

  const setTrack = useCallback((el: HTMLDivElement | null) => {
    trackRef.current = el;
    if (el) setTrackW(el.clientWidth);
  }, []);

  const maxX = Math.max(0, trackW - THUMB - 8);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (trackRef.current) setTrackW(trackRef.current.clientWidth);
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || disabled || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const next = Math.min(maxX, Math.max(0, e.clientX - rect.left - THUMB / 2));
    setX(next);
  }
  function finish() {
    if (!dragging) return;
    setDragging(false);
    if (x >= maxX * 0.9 && !fired.current) {
      fired.current = true;
      setX(maxX);
      onConfirm();
    } else {
      setX(0);
    }
  }

  const progress = maxX > 0 ? x / maxX : 0;

  return (
    <div
      ref={setTrack}
      className="relative h-[60px] w-full select-none overflow-hidden rounded-2xl border border-(--hairline-strong)"
      style={{
        background: `linear-gradient(90deg, color-mix(in srgb, var(--color-gold) ${20 + progress * 25}%, transparent) ${progress * 100}%, var(--glass) ${progress * 100}%)`,
        opacity: disabled ? 0.45 : 1,
        touchAction: "none",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center text-[14px] transition-opacity"
        style={{ color: "var(--color-cream-2)", opacity: 1 - progress * 1.4 }}
      >
        {label}
      </span>
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (disabled || fired.current) return;
          if (e.key === "Enter" || e.key === " ") {
            fired.current = true;
            setX(maxX);
            onConfirm();
          }
        }}
        disabled={disabled}
        aria-label={`${label} — slide right, or press Enter`}
        className="absolute left-1 top-1 flex h-[52px] w-[52px] items-center justify-center rounded-xl"
        style={{
          transform: `translateX(${x}px)`,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.22,0.9,0.3,1)",
          background: "linear-gradient(160deg, var(--color-gold-bright), var(--color-gold) 60%, #c39a4e)",
          color: "#241b0c",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 16px rgba(217,179,106,0.3)",
          cursor: disabled ? "not-allowed" : "grab",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9h10m0 0-4-4m4 4-4 4" />
        </svg>
      </button>
    </div>
  );
}

/* ————— Toasts (module-level emitter, zero providers) ————— */

type ToastListener = (msg: string) => void;
let listener: ToastListener | null = null;

export function toast(msg: string) {
  listener?.(msg);
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    listener = (m: string) => {
      setMsg(m);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), 2400);
    };
    return () => {
      listener = null;
      clearTimeout(timer.current);
    };
  }, []);

  if (!msg) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-6">
      <p
        className="toast-in rounded-full border border-(--hairline-strong) px-4 py-2 text-[13px] text-cream"
        style={{ background: "rgba(20,24,34,0.95)", backdropFilter: "blur(8px)" }}
        role="status"
      >
        {msg}
      </p>
    </div>
  );
}
