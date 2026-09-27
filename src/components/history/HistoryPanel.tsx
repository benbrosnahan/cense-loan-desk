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
import { niceDateTime, pct } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  FadeIn,
  Money,
} from "@/components/shared/ui";

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
    <div className="space-y-5">
      <FadeIn>
        <Card className="p-5 sm:p-7">
          <h2 className="font-display text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
            Your own record, dated
          </h2>
          <p className="mt-2 text-base leading-relaxed text-slate-700">
            In March 2026 the Government Accountability Office found that four of
            the five federal loan servicers missed accuracy standards, and that
            accuracy evaluations had been paused since February 2025. A dated
            record of your own is how you show a balance moved when it should
            not have.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button onClick={onSaveSnapshot} disabled={!loans.length}>
              Save today&apos;s snapshot
            </Button>
            <Button
              variant="secondary"
              onClick={download}
              disabled={!sorted.length || busy}
            >
              {busy ? "Preparing…" : "Download as a spreadsheet"}
            </Button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            A snapshot stores every loan exactly as it stands right now, on this
            device. The spreadsheet is the copy you keep outside the browser.
            {!sorted.length &&
              " It becomes available once you have saved a snapshot."}
          </p>
        </Card>
      </FadeIn>

      {!sorted.length && (
        <div className="rounded-3xl border border-dashed border-slate-300 px-5 py-8 text-center">
          <p className="font-display text-xl font-bold text-slate-900">
            No snapshots yet
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-700">
            Save one now to start the record. After your servicer next updates
            your balances, save another, and this page will show what changed.
          </p>
        </div>
      )}

      {sorted.map((snap, i) => {
        const older = sorted[i + 1];
        const diff = older ? diffSnapshots(older, snap) : [];
        const number = sorted.length - i;
        return (
          <FadeIn key={snap.takenAt} delay={0.03 * i}>
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">#{number}</Badge>
                  <p className="tnum text-base font-bold text-slate-900">
                    {niceDateTime(snap.takenAt)}
                  </p>
                </div>
                <Money
                  value={snap.totalBalance}
                  className="text-xl font-bold text-slate-900"
                />
              </div>
              <p className="mt-0.5 text-sm text-slate-600">
                {snap.loans.length} loan{snap.loans.length === 1 ? "" : "s"} on
                record
              </p>

              {older && (
                <div className="mt-4 border-t border-line pt-4">
                  {diff.length === 0 ? (
                    <p className="text-sm text-slate-700">
                      Nothing changed since {niceDateTime(older.takenAt)}.
                    </p>
                  ) : (
                    <>
                      <Eyebrow>Changed since {niceDateTime(older.takenAt)}</Eyebrow>
                      <ul className="mt-2 space-y-2">
                        {diff.map((d, j) => (
                          <li
                            key={`${d.nickname}-${d.field}-${j}`}
                            className="flex flex-wrap items-baseline gap-x-2 text-sm"
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
                                <span className="text-slate-700">
                                  {d.field === "rate" ? "rate" : "balance"}
                                </span>
                                <span className="tnum font-semibold text-slate-900">
                                  {d.field === "rate" ? (
                                    `${pct(d.before)} → ${pct(d.after)}`
                                  ) : (
                                    <>
                                      <Money value={d.before} /> →{" "}
                                      <Money value={d.after} />
                                    </>
                                  )}
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
