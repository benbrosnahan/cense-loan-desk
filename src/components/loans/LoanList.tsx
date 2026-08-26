"use client";

// Cense Loan Desk — the loan list. Created with Claude Code.
//
// A six-column financial table needs real width. It renders as a table at
// `lg` and up and as cards below, so phones AND iPad portrait (768px) get the
// card layout. At 768px the table technically fits but dates wrap onto two
// lines and type labels break, which reads as broken rather than dense.

import { LOAN_KIND_LABELS, Loan } from "@/types";
import { isPostCutoff } from "@/lib/calc";
import { money, niceDate, pct } from "@/lib/utils";
import { Badge, Button } from "@/components/shared/ui";

interface Props {
  loans: Loan[];
  onEdit: (loan: Loan) => void;
  onDelete: (id: string) => void;
}

function SubsidyBadge({ loan }: { loan: Loan }) {
  const sub = loan.subsidy === "subsidized";
  return (
    <Badge tone={sub ? "brand" : "neutral"}>
      {sub ? "Subsidized" : "Unsubsidized"}
    </Badge>
  );
}

export default function LoanList({ loans, onEdit, onDelete }: Props) {
  if (!loans.length) return null;

  const sorted = [...loans].sort((a, b) =>
    a.disbursementDate.localeCompare(b.disbursementDate)
  );

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-sm lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50">
            {/* slate-700 not slate-500: #5C7F5F on the slate-50 header band is
                only 4.04:1, under the 4.5:1 AA floor at this size. */}
            <tr className="text-[10px] uppercase tracking-wide text-slate-700">
              <th scope="col" className="px-4 py-2.5 font-semibold">Loan</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Servicer</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Rate</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Balance</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Disbursed</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{l.nickname}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <SubsidyBadge loan={l} />
                    <span className="text-[11px] text-slate-500">
                      {LOAN_KIND_LABELS[l.kind]}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{l.servicer}</td>
                <td className="tnum px-4 py-3 text-right font-semibold text-slate-900">
                  {pct(l.rate)}
                </td>
                <td className="tnum px-4 py-3 text-right font-semibold text-slate-900">
                  {money(l.balance)}
                  {l.principal > 0 && l.balance > l.principal && (
                    <div className="tnum text-[11px] font-normal text-accent">
                      +{money(l.balance - l.principal)} interest
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="tnum text-slate-600">
                    {niceDate(l.disbursementDate)}
                  </div>
                  {isPostCutoff(l) && (
                    <div className="mt-1">
                      <Badge tone="warn">After Jul 1, 2026</Badge>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(l)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700 hover:bg-red-50"
                      onClick={() => onDelete(l.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2.5 lg:hidden">
        {sorted.map((l) => (
          <li
            key={l.id}
            className="rounded-2xl border border-line bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {l.nickname}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{l.servicer}</p>
              </div>
              <div className="text-right">
                <p className="tnum text-lg font-bold text-slate-900">
                  {money(l.balance)}
                </p>
                <p className="tnum text-[11px] font-semibold text-slate-600">
                  {pct(l.rate)}
                </p>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <SubsidyBadge loan={l} />
              {isPostCutoff(l) && <Badge tone="warn">After Jul 1, 2026</Badge>}
              <span className="tnum text-[11px] text-slate-500">
                {niceDate(l.disbursementDate)}
              </span>
            </div>

            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <Button size="sm" variant="secondary" onClick={() => onEdit(l)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700 hover:bg-red-50"
                onClick={() => onDelete(l.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
