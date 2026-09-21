"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActionLogEntry,
  AppState,
  AutonomyLevel,
  ExplainKind,
  Explanation,
  GuardianFacts,
  PolicyVerdict,
  Scenario,
  ToolTrace,
} from "@/lib/types";

interface ActionResult {
  ok: boolean;
  verdict: PolicyVerdict;
  entry?: ActionLogEntry;
}

interface GuardianContextValue {
  state: AppState | null;
  facts: GuardianFacts | null;
  loading: boolean;
  /** last policy verdict of any attempted action — feeds the case-study rail */
  lastVerdict: PolicyVerdict | null;
  /** entry of the most recent successful action in this session */
  justActed: ActionLogEntry | null;
  /** provenance of the last LLM explanation shown */
  lastSource: Explanation["source"] | null;
  autoActed: boolean;
  refresh: () => Promise<void>;
  explain: (kind: ExplainKind) => Promise<Explanation>;
  paydown: (
    amount: number,
    consent: boolean,
    initiator?: "user" | "agent"
  ) => Promise<ActionResult>;
  limitIncrease: (consent: boolean) => Promise<ActionResult>;
  updateSettings: (patch: {
    utilGuard?: AutonomyLevel;
    autoCap?: number;
    autopayGuard?: AutonomyLevel;
    scenario?: Scenario;
    bankBalance?: number;
    safetyBuffer?: number;
  }) => Promise<void>;
  autopay: (intent: "arm" | "simulate-due-date", consent: boolean) => Promise<ActionResult>;
  resetDemo: () => Promise<void>;
  /** last chat turn's tool trace — surfaced on the case-study rail */
  lastChatTrace: ToolTrace[] | null;
  reportChatTrace: (trace: ToolTrace[]) => void;
}

const GuardianContext = createContext<GuardianContextValue | null>(null);

export function useGuardian(): GuardianContextValue {
  const ctx = useContext(GuardianContext);
  if (!ctx) throw new Error("useGuardian must be used inside GuardianProvider");
  return ctx;
}

export function GuardianProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [facts, setFacts] = useState<GuardianFacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastVerdict, setLastVerdict] = useState<PolicyVerdict | null>(null);
  const [justActed, setJustActed] = useState<ActionLogEntry | null>(null);
  const [lastSource, setLastSource] = useState<Explanation["source"] | null>(null);
  const [autoActed, setAutoActed] = useState(false);
  const [lastChatTrace, setLastChatTrace] = useState<ToolTrace[] | null>(null);
  const explainCache = useRef(new Map<string, Explanation>());
  const autoAttempted = useRef(false);

  const refresh = useCallback(async () => {
    const [s, f] = await Promise.all([
      fetch("/api/state").then((r) => r.json()),
      fetch("/api/guardian/evaluate", { method: "POST" }).then((r) => r.json()),
    ]);
    setState(s);
    setFacts(f);
    setLoading(false);
  }, []);

  useEffect(() => {
    // fetch-on-mount: state updates happen after the network await, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const explain = useCallback(async (kind: ExplainKind): Promise<Explanation> => {
    const cached = explainCache.current.get(kind);
    if (cached) return cached;
    const res = await fetch("/api/guardian/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const explanation: Explanation = await res.json();
    explainCache.current.set(kind, explanation);
    setLastSource(explanation.source);
    return explanation;
  }, []);

  const paydown = useCallback(
    async (
      amount: number,
      consent: boolean,
      initiator: "user" | "agent" = "user"
    ): Promise<ActionResult> => {
      const res = await fetch("/api/actions/paydown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, consent, initiator }),
      });
      const data = await res.json();
      setLastVerdict(data.verdict ?? null);
      if (data.ok) {
        explainCache.current.clear();
        setJustActed(data.entry);
        if (initiator === "agent") setAutoActed(true);
        await refresh();
      }
      return data;
    },
    [refresh]
  );

  const limitIncrease = useCallback(
    async (consent: boolean): Promise<ActionResult> => {
      const res = await fetch("/api/actions/limit-increase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent }),
      });
      const data = await res.json();
      setLastVerdict(data.verdict ?? null);
      if (data.ok) {
        setJustActed(data.entry);
        await refresh();
      }
      return data;
    },
    [refresh]
  );

  const updateSettings = useCallback(
    async (patch: {
      utilGuard?: AutonomyLevel;
      autoCap?: number;
      autopayGuard?: AutonomyLevel;
      scenario?: Scenario;
      bankBalance?: number;
      safetyBuffer?: number;
    }) => {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      // settings change autonomy behaviour → allow the agent to re-evaluate
      autoAttempted.current = false;
      if (patch.bankBalance !== undefined || patch.safetyBuffer !== undefined) {
        // money inputs change every derived number → stale explanations out
        explainCache.current.clear();
      }
      if (patch.scenario) {
        // scenario switch re-seeds everything
        explainCache.current.clear();
        setJustActed(null);
        setLastVerdict(null);
        setAutoActed(false);
        setLastChatTrace(null);
        try {
          sessionStorage.removeItem("guardian-chat");
        } catch {}
      }
      await refresh();
    },
    [refresh]
  );

  const autopay = useCallback(
    async (intent: "arm" | "simulate-due-date", consent: boolean): Promise<ActionResult> => {
      const res = await fetch("/api/actions/autopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, consent }),
      });
      const data = await res.json();
      if (data.verdict) setLastVerdict(data.verdict);
      if (data.ok) {
        if (data.entry) setJustActed(data.entry);
        await refresh();
      }
      return data;
    },
    [refresh]
  );

  const reportChatTrace = useCallback((trace: ToolTrace[]) => {
    setLastChatTrace(trace.length > 0 ? trace : null);
  }, []);

  const resetDemo = useCallback(async () => {
    await fetch("/api/state", { method: "POST" });
    explainCache.current.clear();
    autoAttempted.current = false;
    setJustActed(null);
    setLastVerdict(null);
    setAutoActed(false);
    setLastChatTrace(null);
    try {
      sessionStorage.removeItem("guardian-chat");
    } catch {}
    await refresh();
  }, [refresh]);

  // Autonomous mode: when the Guardian triggers and autonomy is granted, the
  // agent acts on its own — but only through the same policy gate as everyone
  // else, capped by the user's auto-cap and the safety buffer.
  useEffect(() => {
    if (!state || !facts) return;
    if (autoAttempted.current) return;
    if (state.settings.utilGuard !== "auto") return;
    if (!facts.triggered || !facts.bankDataAvailable) return;
    const amount = Math.min(facts.affordableNow, state.settings.autoCap);
    if (amount <= 0) return;
    autoAttempted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    paydown(amount, false, "agent");
  }, [state, facts, paydown]);

  const value = useMemo(
    () => ({
      state,
      facts,
      loading,
      lastVerdict,
      justActed,
      lastSource,
      autoActed,
      refresh,
      explain,
      paydown,
      limitIncrease,
      updateSettings,
      autopay,
      resetDemo,
      lastChatTrace,
      reportChatTrace,
    }),
    [
      state,
      facts,
      loading,
      lastVerdict,
      justActed,
      lastSource,
      autoActed,
      refresh,
      explain,
      paydown,
      limitIncrease,
      updateSettings,
      autopay,
      resetDemo,
      lastChatTrace,
      reportChatTrace,
    ]
  );

  return (
    <GuardianContext.Provider value={value}>{children}</GuardianContext.Provider>
  );
}
