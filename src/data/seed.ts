// Cense Loan Desk — demo portfolio. Created with Claude Code.
//
// This is not invented data. It is what a real four-year dependent undergrad
// actually ends up holding:
//
//   * One subsidized and one unsubsidized loan per year, which is why "four
//     years of school" turns into eight loans.
//   * Amounts sit at the statutory annual limits for a dependent undergrad:
//     $5,500 yr1 (max $3,500 sub), $6,500 yr2 (max $4,500), $7,500 yr3 and yr4
//     (max $5,500). Source: FSA Handbook vol 8 ch 4.
//   * Rates are the real published undergraduate rates for each award year:
//     4.99% (22-23), 5.50% (23-24), 6.53% (24-25), 6.39% (25-26).
//     Source: fsapartners.ed.gov interest rate announcements.
//   * Subsidized balances equal principal because the government pays the
//     interest while you are enrolled at least half-time. Unsubsidized balances
//     have grown, which is the whole difference between the two.
//
// Total principal $27,000, which lands right on the national average.

import { Loan } from "@/types";

export const SEED_LOANS: Loan[] = [
  {
    id: "seed-1s",
    nickname: "Freshman subsidized",
    servicer: "Nelnet",
    kind: "direct_sub",
    subsidy: "subsidized",
    principal: 3500,
    balance: 3500,
    rate: 4.99,
    disbursementDate: "2022-09-01",
    minPayment: 0,
  },
  {
    id: "seed-1u",
    nickname: "Freshman unsubsidized",
    servicer: "Nelnet",
    kind: "direct_unsub",
    subsidy: "unsubsidized",
    principal: 2000,
    balance: 2396,
    rate: 4.99,
    disbursementDate: "2022-09-01",
    minPayment: 0,
  },
  {
    id: "seed-2s",
    nickname: "Sophomore subsidized",
    servicer: "Nelnet",
    kind: "direct_sub",
    subsidy: "subsidized",
    principal: 4500,
    balance: 4500,
    rate: 5.5,
    disbursementDate: "2023-09-01",
    minPayment: 0,
  },
  {
    id: "seed-2u",
    nickname: "Sophomore unsubsidized",
    servicer: "Nelnet",
    kind: "direct_unsub",
    subsidy: "unsubsidized",
    principal: 2000,
    balance: 2326,
    rate: 5.5,
    disbursementDate: "2023-09-01",
    minPayment: 0,
  },
  {
    id: "seed-3s",
    nickname: "Junior subsidized",
    servicer: "MOHELA",
    kind: "direct_sub",
    subsidy: "subsidized",
    principal: 5500,
    balance: 5500,
    rate: 6.53,
    disbursementDate: "2024-09-01",
    minPayment: 0,
  },
  {
    id: "seed-3u",
    nickname: "Junior unsubsidized",
    servicer: "MOHELA",
    kind: "direct_unsub",
    subsidy: "unsubsidized",
    principal: 2000,
    balance: 2256,
    rate: 6.53,
    disbursementDate: "2024-09-01",
    minPayment: 0,
  },
  {
    id: "seed-4s",
    nickname: "Senior subsidized",
    servicer: "MOHELA",
    kind: "direct_sub",
    subsidy: "subsidized",
    principal: 5500,
    balance: 5500,
    rate: 6.39,
    disbursementDate: "2025-09-01",
    minPayment: 0,
  },
  {
    id: "seed-4u",
    nickname: "Senior unsubsidized",
    servicer: "MOHELA",
    kind: "direct_unsub",
    subsidy: "unsubsidized",
    principal: 2000,
    balance: 2123,
    rate: 6.39,
    disbursementDate: "2025-09-01",
    minPayment: 0,
  },
];

/** Award-year rates, offered as a hint when someone is entering a loan by hand. */
export const RATE_BY_AWARD_YEAR: { label: string; rate: number; from: string }[] =
  [
    { label: "2022–23", rate: 4.99, from: "2022-07-01" },
    { label: "2023–24", rate: 5.5, from: "2023-07-01" },
    { label: "2024–25", rate: 6.53, from: "2024-07-01" },
    { label: "2025–26", rate: 6.39, from: "2025-07-01" },
    { label: "2026–27", rate: 6.52, from: "2026-07-01" },
  ];

/** Best-guess undergraduate rate for a disbursement date, used to prefill. */
export function suggestRate(disbursementDate: string): number | null {
  if (!disbursementDate) return null;
  const match = [...RATE_BY_AWARD_YEAR]
    .reverse()
    .find((r) => disbursementDate >= r.from);
  return match ? match.rate : null;
}

/**
 * School-year shortcuts for the loan form. Picking one fills the payout date
 * with September 1 of that year, which the borrower can then correct. The
 * exact date matters for one reason only: a loan paid out on or after
 * July 1, 2026 changes which repayment plans are open.
 */
export const SCHOOL_YEARS: { label: string; date: string }[] =
  RATE_BY_AWARD_YEAR.map((r) => ({
    label: r.label,
    date: `${r.from.slice(0, 4)}-09-01`,
  }));
