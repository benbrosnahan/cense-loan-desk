// Cense Loan Desk — local persistence. Created with Claude Code.
//
// Everything stays on the device. There are no accounts and no server, which
// is the point: the trust position of this tool comes from having nothing to
// sell and nothing to collect.

import { DEFAULT_PROFILE, Loan, LoanDiffRow, Profile, Snapshot } from "@/types";

const LOANS_KEY = "cense.loandesk.loans.v1";
// v2: the profile shape changed (householdSize, employment, goal,
// selectedPlan). Bumping the key avoids merging a stale v1 object.
const PROFILE_KEY = "cense.loandesk.profile.v2";
const SNAPSHOTS_KEY = "cense.loandesk.snapshots.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Safari private mode, quota, or corrupted JSON. Fail soft.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing useful to do — the UI keeps working from in-memory state.
  }
}

export const loanStore = {
  load: (): Loan[] | null => {
    const v = read<Loan[] | null>(LOANS_KEY, null);
    return Array.isArray(v) ? v : null;
  },
  save: (loans: Loan[]) => write(LOANS_KEY, loans),
};

export const profileStore = {
  load: (): Profile => {
    const v = read<Profile>(PROFILE_KEY, DEFAULT_PROFILE);
    return { ...DEFAULT_PROFILE, ...v };
  },
  save: (p: Profile) => write(PROFILE_KEY, p),
};

export const snapshotStore = {
  load: (): Snapshot[] => read<Snapshot[]>(SNAPSHOTS_KEY, []),
  save: (s: Snapshot[]) => write(SNAPSHOTS_KEY, s),
};

export function makeSnapshot(loans: Loan[]): Snapshot {
  return {
    takenAt: new Date().toISOString(),
    loans: loans.map((l) => ({ ...l })),
    totalBalance: loans.reduce((s, l) => s + l.balance, 0),
  };
}

/**
 * Diff two snapshots. This is the feature the GAO finding justifies: a borrower
 * with dated snapshots can show that a balance or rate moved when it should not
 * have. Without them they are arguing from memory.
 */
export function diffSnapshots(
  older: Snapshot,
  newer: Snapshot
): LoanDiffRow[] {
  const rows: LoanDiffRow[] = [];
  const oldById = new Map(older.loans.map((l) => [l.id, l]));
  const newById = new Map(newer.loans.map((l) => [l.id, l]));

  for (const [id, nl] of Array.from(newById.entries())) {
    const ol = oldById.get(id);
    if (!ol) {
      rows.push({
        nickname: nl.nickname,
        servicer: nl.servicer,
        field: "balance",
        before: null,
        after: nl.balance,
        kind: "added",
      });
      continue;
    }
    if (Math.abs(ol.balance - nl.balance) > 0.005) {
      rows.push({
        nickname: nl.nickname,
        servicer: nl.servicer,
        field: "balance",
        before: ol.balance,
        after: nl.balance,
        kind: "changed",
      });
    }
    if (Math.abs(ol.rate - nl.rate) > 0.0001) {
      rows.push({
        nickname: nl.nickname,
        servicer: nl.servicer,
        field: "rate",
        before: ol.rate,
        after: nl.rate,
        kind: "changed",
      });
    }
  }

  for (const [id, ol] of Array.from(oldById.entries())) {
    if (!newById.has(id)) {
      rows.push({
        nickname: ol.nickname,
        servicer: ol.servicer,
        field: "balance",
        before: ol.balance,
        after: null,
        kind: "removed",
      });
    }
  }

  return rows;
}
