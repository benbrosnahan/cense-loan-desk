"use client";

// Cense Loan Desk — the loan list. Created with Claude Code.
//
// Each loan is one row that opens in place, at every screen width. Eight loans
// as eight full cards was about 1,500px of scrolling on a phone before you
// reached anything else, and a six-column table does not fit the reading
// column the rest of the page uses.

import { useState } from "react";
import { LOAN_KIND_SHORT, Loan } from "@/types";
import { isPostCutoff } from "@/lib/calc";
import { cn, niceDate, pct } from "@/lib/utils";
import { Button, Chevron, Money } from "@/components/shared/ui";

interface Props {
  loans: Loan[];
  onEdit: (loan: Loan) => void;
  onDelete: (id: string) => void;
}

const interestSoFar = (l: Loan) =>
  l.principal > 0 && l.balance > l.principal ? l.balance - l.principal : 0;

export default function LoanList({ loans, onEdit, onDelete }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!loans.length) return null;

  const sorted = [...loans].sort((a, b) =>
    a.disbursementDate.localeCompare(b.disbursementDate)
  );

  return (
    <>
      <ul className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
        {sorted.map((l, i) => {
          const open = openId === l.id;
          const panelId = `loan-${l.id}`;
          return (
            <li key={l.id} className={cn(i > 0 && "border-t border-line")}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : l.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                  "focus:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy",
                  open ? "bg-slate-50/70" : "hover:bg-slate-50/70"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-slate-900">
                    {l.nickname}
                  </span>
                  <span className="tnum mt-0.5 block truncate text-sm text-slate-600">
                    {LOAN_KIND_SHORT[l.kind]} · {pct(l.rate)}
                    <span className="hidden sm:inline print:inline">
                      {" · "}
                      {l.servicer} · paid out {niceDate(l.disbursementDate)}
                    </span>
                    {isPostCutoff(l) && " · after Jul 1, 2026"}
                  </span>
                </span>
                <span className="text-right">
                  <Money
                    value={l.balance}
                    className="block text-base font-bold text-slate-900"
                  />
                </span>
                <Chevron open={open} className="no-print text-slate-500" />
              </button>

              {open && (
                <div id={panelId} className="bg-slate-50/70 px-4 pb-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3.5 text-sm">
                    <div>
                      <dt className="text-slate-600">You pay</dt>
                      <dd className="font-semibold text-slate-900">
                        {l.servicer}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Paid out</dt>
                      <dd className="tnum font-semibold text-slate-900">
                        {niceDate(l.disbursementDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">First borrowed</dt>
                      <dd className="font-semibold text-slate-900">
                        <Money value={l.principal} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Interest added so far</dt>
                      <dd className="font-semibold text-slate-900">
                        <Money value={interestSoFar(l)} />
                      </dd>
                    </div>
                  </dl>
                  {isPostCutoff(l) && (
                    <p className="mt-3 text-sm leading-snug text-amber-900">
                      Paid out on or after July 1, 2026, which limits the
                      repayment plans open to every loan you have.
                    </p>
                  )}
                  <div className="no-print mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onEdit(l)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-800 hover:bg-red-50 hover:text-red-900"
                      onClick={() => onDelete(l.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
