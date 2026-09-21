import type { ActionLogEntry, AppState, Card, Scenario } from "./types";

/**
 * In-memory state store, seeded with the mock scenario from the spec.
 * Two seeds: "simple" (the original one-card story) and "messy" (the
 * addendum's multi-obligation profile that forces prioritisation).
 * No database — this is a prototype; a "Reset demo" action re-seeds it.
 * Kept on globalThis so it survives Next.js dev-server HMR reloads.
 */

const CARD_A: Card = {
  id: "hdfc",
  issuer: "HDFC",
  limit: 60_000,
  balance: 49_200, // 82% utilisation
  statementDay: 30,
  dueDay: 22, // falls after the statement → next month (Oct 22)
};

function base(): Omit<AppState, "scenario" | "cards" | "emis"> {
  return {
    user: { name: "George", age: 24, incomeBand: "₹55k/month", city: "Bengaluru" },
    primaryCardId: "hdfc",
    bank: {
      balance: 38_000, // salary landed on the 1st
      salaryDay: 1,
      safetyBuffer: 15_000, // essentials until salary
    },
    score: { current: 761, impactBandEstimate: "~20–40 pts" },
    settings: { utilGuard: "ask", autoCap: 20_000, autopayGuard: "off" },
    autopay: { armed: false, note: null },
    actionLog: [],
    scheduled: [],
    demo: { today: 20, monthLabel: "Sep", nudgedThisCycle: false },
  };
}

function seed(scenario: Scenario): AppState {
  if (scenario === "messy") {
    return {
      ...base(),
      scenario,
      cards: [
        { ...CARD_A },
        {
          id: "icici",
          issuer: "ICICI",
          limit: 40_000,
          balance: 12_000, // exactly 30% — already at the safe line
          statementDay: 8, // next month (Oct 8)
          dueDay: 26,
        },
      ],
      emis: [
        {
          id: "personal-loan",
          name: "Personal-loan EMI",
          amount: 6_500,
          dueDay: 25,
          monthLabel: "Sep",
          consequence:
            "a missed EMI is reported as a default — roughly a 50–100 point hit (directional) and a flag lenders see for years",
        },
      ],
    };
  }
  return { ...base(), scenario: "simple", cards: [{ ...CARD_A }], emis: [] };
}

const globalStore = globalThis as unknown as { __guardianState?: AppState };

export function getState(): AppState {
  if (!globalStore.__guardianState) {
    globalStore.__guardianState = seed("simple");
  }
  return globalStore.__guardianState;
}

/** Re-seed, keeping the current scenario unless one is given. */
export function resetState(scenario?: Scenario): AppState {
  globalStore.__guardianState = seed(scenario ?? getState().scenario);
  return globalStore.__guardianState;
}

export function primaryCard(state: AppState): Card {
  return state.cards.find((c) => c.id === state.primaryCardId) ?? state.cards[0];
}

export function getCard(state: AppState, cardId: string): Card | undefined {
  return state.cards.find((c) => c.id === cardId);
}

let logCounter = 0;

export function appendLog(entry: Omit<ActionLogEntry, "id">): ActionLogEntry {
  const state = getState();
  const full: ActionLogEntry = { id: `log-${Date.now()}-${logCounter++}`, ...entry };
  state.actionLog.unshift(full); // newest first
  return full;
}
