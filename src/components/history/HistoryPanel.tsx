"use client";

// Cense Loan Desk — snapshot history. Created with Claude Code.
//
// In March 2026 the GAO reported that four of five federal servicers missed
// accuracy standards and that accuracy evaluations had been paused since
// February 2025. A borrower with dated snapshots can show that a balance moved.
// Without them they are arguing from memory.

import { useState } from "react";
import { Loan, Snapshot } from "@/types";
import { diffSnapshots } from "@/lib/storage";
import { exportHistory } from "@/lib/export";
import { money, niceDateTime, pct } from "@/lib/utils";
import { Badge, Button, Card, FadeIn, Notice } from "@/components/shared/ui";

interface Props {
  loans: Loan[];
  snapshots: Snapshot[];
  onSaveSnapshot: () => void;
}

export default function HistoryPanel({
  loans,
  snapshots,
  onSaveSnapshot,
}: Props) {
  const [busy, setBusy] = useState(false);

  // Newest first for reading; the export numbers them oldest first.
  const sorted = [...snapshots].sort((a, b) =>
    b.takenAt.localeCompare(a.takenAt)
  );

  const download = async () => {
    setBusy(true);
    try {
      await exportHistory(sorted);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <FadeIn>
        <Card className="p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-900">
            Your own record, dated
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
            In March 2026 the Government Accountability Office found that four of
            the five federal loan servicers missed accuracy standards, and that
            accuracy evaluations had been paused since February 2025. It is
            important that you keep an accurate record of your loans.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-900">
                Save a snapshot
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
                Stores a dated copy of every loan exactly as it stands right now,
                on this device. Do it whenever you check your balances. Two
                snapshots is what lets Loan Desk show you what moved.
              </p>
              <div className="mt-2.5">
                <Button size="sm" onClick={onSaveSnapshot} disabled={!loans.length}>
                  Save snapshot
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-900">
                Download history
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
                An Excel file with three tabs: what changed between each
                snapshot, a one-row-per-snapshot timeline, and the full detail.
                This is the copy you keep outside the browser.
              </p>
              <div className="mt-2.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={download}
                  disabled={!sorted.length || busy}
                >
                  {busy ? "Preparing…" : "Download .xlsx"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </FadeIn>

      {!sorted.length && (
        <Notice tone="info" title="No snapshots yet">
          Save one now to start the record. Check back after your servicer
          updates, save another, and this page will show you the difference.
        </Notice>
      )}

      {sorted.map((snap, i) => {
        const older = sorted[i + 1];
        const diff = older ? diffSnapshots(older, snap) : [];
        const number = sorted.length - i;
        return (
          <FadeIn key={snap.takenAt} delay={0.04 * i}>
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">#{number}</Badge>
                  <p className="text-sm font-bold text-slate-900">
                    {niceDateTime(snap.takenAt)}
                  </p>
                </div>
                <p className="tnum text-lg font-bold text-slate-900">
                  {money(snap.totalBalance)}
                </p>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {snap.loans.length} loan{snap.loans.length === 1 ? "" : "s"} on
                record
              </p>

              {older && (
                <div className="mt-3 border-t border-line pt-3">
                  {diff.length === 0 ? (
                    <p className="text-xs text-slate-600">
                      Nothing changed since {niceDateTime(older.takenAt)}.
                    </p>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        Changed since {niceDateTime(older.takenAt)}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {diff.map((d, j) => (
                          <li
                            key={`${d.nickname}-${d.field}-${j}`}
                            className="flex flex-wrap items-baseline gap-x-2 text-xs"
                          >
                            <span className="font-semibold text-slate-900">
                              {d.nickname}
                            </span>
                            {d.kind === "added" && (
                              <span className="font-semibold text-emerald-800">
                                added to your list
                              </span>
                            )}
                            {d.kind === "removed" && (
                              <span className="font-semibold text-red-800">
                                removed from your list
                              </span>
                            )}
                            {d.kind === "changed" && (
                              <>
                                <span className="text-slate-600">
                                  {d.field === "rate" ? "rate" : "balance"}
                                </span>
                                <span className="tnum font-semibold text-slate-900">
                                  {d.field === "rate"
                                    ? `${pct(d.before)} → ${pct(d.after)}`
                                    : `${money(d.before)} → ${money(d.after)}`}
                                </span>
                              </>
                            )}
                            {d.kind === "changed" && d.field === "rate" && (
                              <span className="font-semibold text-amber-800">
                                a fixed federal rate should not move, ask your
                                servicer
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </Card>
          </FadeIn>
        );
      })}
    </div>
  );
}
