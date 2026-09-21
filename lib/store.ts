import type { ActionLogEntry, AppState } from "./types";

/**
 * In-memory state store, seeded with the exact mock scenario from the spec.
 * No database — this is a prototype; a "Reset demo" action re-seeds it.
 * Kept on globalThis so it survives Next.js dev-server HMR reloads.
 */

function seed(): AppState {
  return {
    user: { name: "George", age: 24, incomeBand: "₹55k/month", city: "Bengaluru" },
    card: {
      issuer: "HDFC",
      limit: 60_000,
      balance: 49_200, // 82% utilisation
      statementDay: 30,
      dueDay: 22, // falls after the statement → next month (Oct 22)
    },
    bank: {
      balance: 38_000, // salary landed on the 1st
      salaryDay: 1,
      safetyBuffer: 15_000, // essentials until next salary
    },
    score: { current: 761, impactBandEstimate: "~20–40 pts" },
    settings: { utilGuard: "ask", autoCap: 20_000 },
    actionLog: [],
    scheduled: [],
    demo: { today: 20, monthLabel: "Sep", nudgedThisCycle: false },
  };
}

const globalStore = globalThis as unknown as { __guardianState?: AppState };

export function getState(): AppState {
  if (!globalStore.__guardianState) {
    globalStore.__guardianState = seed();
  }
  return globalStore.__guardianState;
}

export function resetState(): AppState {
  globalStore.__guardianState = seed();
  return globalStore.__guardianState;
}

let logCounter = 0;

export function appendLog(entry: Omit<ActionLogEntry, "id">): ActionLogEntry {
  const state = getState();
  const full: ActionLogEntry = { id: `log-${Date.now()}-${logCounter++}`, ...entry };
  state.actionLog.unshift(full); // newest first
  return full;
}
