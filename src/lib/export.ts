// Cense Loan Desk — spreadsheet export. Created with Claude Code.
//
// .xlsx rather than CSV, because the person downloading this is a student who
// wants a file that opens cleanly in Excel or Google Sheets with real columns,
// not a comma-delimited blob. SheetJS is dynamically imported so it costs
// nothing on first paint.

import { LOAN_KIND_LABELS, Loan, Snapshot } from "@/types";
import { isPostCutoff, totalBalance } from "./calc";
import { diffSnapshots } from "./storage";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

type Row = (string | number | null)[];

function loanRows(loans: Loan[]): Row[] {
  const rows: Row[] = [
    [
      "Loan",
      "Servicer",
      "Type",
      "Subsidized?",
      "Original principal",
      "Current balance",
      "Interest rate (%)",
      "Disbursement date",
      "Minimum monthly payment",
      "Disbursed on/after Jul 1 2026?",
    ],
  ];
  for (const l of loans) {
    rows.push([
      l.nickname,
      l.servicer,
      LOAN_KIND_LABELS[l.kind],
      l.subsidy === "subsidized" ? "Subsidized" : "Unsubsidized",
      l.principal,
      l.balance,
      l.rate,
      l.disbursementDate,
      l.minPayment || "",
      isPostCutoff(l) ? "YES" : "No",
    ]);
  }
  rows.push([]);
  rows.push([
    "TOTAL",
    "",
    "",
    "",
    loans.reduce((s, l) => s + l.principal, 0),
    totalBalance(loans),
    "",
    "",
    "",
    "",
  ]);
  return rows;
}

const COL_WIDTHS = [26, 14, 20, 13, 17, 16, 15, 18, 20, 26];

async function sheetjs() {
  const XLSX = await import("xlsx");
  return XLSX;
}

function download(filename: string, data: ArrayBuffer) {
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** The current portfolio, one sheet. */
export async function exportLoans(loans: Loan[]): Promise<void> {
  const XLSX = await sheetjs();
  const wb = XLSX.utils.book_new();

  const rows: Row[] = [
    ["Cense Loan Desk — your loans"],
    ["Saved", stamp(new Date().toISOString())],
    [
      "Keep this file. If a balance or rate changes and nobody can explain why, this is your evidence.",
    ],
    [],
    ...loanRows(loans),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = COL_WIDTHS.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "My loans");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(`cense-loan-desk-${today()}.xlsx`, buf);
}

/**
 * Snapshot history.
 *
 * Three sheets rather than one flat dump, because a single sheet of repeated
 * loan rows is unreadable: same-day snapshots look identical, deletions are
 * invisible, and a per-snapshot total repeated on every row separates nothing.
 *
 *   1. "What changed" — the actual answer, one row per change.
 *   2. "Snapshots"    — one row per snapshot, so the timeline is legible.
 *   3. "All loan rows"— the full detail, keyed by a snapshot number.
 */
export async function exportHistory(snapshots: Snapshot[]): Promise<void> {
  const XLSX = await sheetjs();
  const wb = XLSX.utils.book_new();

  // Oldest first, so snapshot numbers read chronologically.
  const ordered = [...snapshots].sort((a, b) =>
    a.takenAt.localeCompare(b.takenAt)
  );
  const numberOf = new Map(ordered.map((s, i) => [s.takenAt, i + 1]));

  // ---- Sheet 1: what changed -----------------------------------------
  const changeRows: Row[] = [
    ["Cense Loan Desk — what changed between snapshots"],
    [
      "Each row is one difference. A fixed federal interest rate should never move; if one does, take this to your servicer.",
    ],
    [],
    [
      "Snapshot #",
      "Taken",
      "Compared with",
      "Loan",
      "Servicer",
      "What changed",
      "Before",
      "After",
      "Difference",
    ],
  ];

  for (let i = 1; i < ordered.length; i++) {
    const older = ordered[i - 1];
    const newer = ordered[i];
    const diff = diffSnapshots(older, newer);
    if (!diff.length) {
      changeRows.push([
        numberOf.get(newer.takenAt) ?? i + 1,
        stamp(newer.takenAt),
        stamp(older.takenAt),
        "",
        "",
        "No change",
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const d of diff) {
      const label =
        d.kind === "added"
          ? "Loan added"
          : d.kind === "removed"
          ? "Loan removed"
          : d.field === "rate"
          ? "Interest rate changed"
          : "Balance changed";
      const delta =
        d.kind === "changed" && d.before !== null && d.after !== null
          ? Number((d.after - d.before).toFixed(2))
          : "";
      changeRows.push([
        numberOf.get(newer.takenAt) ?? i + 1,
        stamp(newer.takenAt),
        stamp(older.takenAt),
        d.nickname,
        d.servicer,
        label,
        d.before ?? "",
        d.after ?? "",
        delta,
      ]);
    }
  }

  if (ordered.length < 2) {
    changeRows.push([
      "",
      "",
      "",
      "",
      "",
      "Save a second snapshot and the differences will appear here.",
      "",
      "",
      "",
    ]);
  }

  const wsChanges = XLSX.utils.aoa_to_sheet(changeRows);
  wsChanges["!cols"] = [
    { wch: 11 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsChanges, "What changed");

  // ---- Sheet 2: one row per snapshot ---------------------------------
  const snapRows: Row[] = [
    ["Cense Loan Desk — snapshot timeline"],
    [],
    ["Snapshot #", "Taken", "Loans on record", "Total balance", "Change vs previous"],
  ];
  ordered.forEach((s, i) => {
    const prev = i > 0 ? ordered[i - 1] : null;
    snapRows.push([
      i + 1,
      stamp(s.takenAt),
      s.loans.length,
      Number(s.totalBalance.toFixed(2)),
      prev ? Number((s.totalBalance - prev.totalBalance).toFixed(2)) : "",
    ]);
  });
  const wsSnaps = XLSX.utils.aoa_to_sheet(snapRows);
  wsSnaps["!cols"] = [
    { wch: 11 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSnaps, "Snapshots");

  // ---- Sheet 3: full detail ------------------------------------------
  const allRows: Row[] = [
    ["Cense Loan Desk — every loan row, every snapshot"],
    ["Sort by Loan, then Snapshot #, to follow one loan over time."],
    [],
    [
      "Snapshot #",
      "Taken",
      "Loan",
      "Servicer",
      "Type",
      "Balance",
      "Interest rate (%)",
      "Disbursement date",
    ],
  ];
  ordered.forEach((s, i) => {
    for (const l of s.loans) {
      allRows.push([
        i + 1,
        stamp(s.takenAt),
        l.nickname,
        l.servicer,
        LOAN_KIND_LABELS[l.kind],
        l.balance,
        l.rate,
        l.disbursementDate,
      ]);
    }
  });
  const wsAll = XLSX.utils.aoa_to_sheet(allRows);
  wsAll["!cols"] = [
    { wch: 11 },
    { wch: 22 },
    { wch: 26 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 15 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, "All loan rows");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(`cense-loan-history-${today()}.xlsx`, buf);
}
