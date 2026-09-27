// Cense Loan Desk — payoff ordering. Created with Claude Code.
//
// Adapted from the Debt Dashboard engine (loan-paydown/src/lib/paydown.ts),
// generalised from generic high-cost debt to federal student loans.

import { Loan, RankedLoan, Strategy } from "@/types";

/**
 * Order loans by strategy.
 *   avalanche = highest rate first, ties broken by smaller balance
 *   snowball  = smallest balance first, ties broken by higher rate
 *
 * The avalanche tie-break matters: at equal rates two loans are financially
 * identical, so clearing the smaller one first removes an account for free.
 */
export function orderLoans(loans: Loan[], strategy: Strategy): Loan[] {
  const copy = [...loans];
  if (strategy === "avalanche") {
    copy.sort((a, b) => b.rate - a.rate || a.balance - b.balance);
  } else {
    copy.sort((a, b) => a.balance - b.balance || b.rate - a.rate);
  }
  return copy;
}

export function rankLoans(loans: Loan[], strategy: Strategy): RankedLoan[] {
  const ordered = orderLoans(loans, strategy);

  return ordered.map((loan, i) => {
    const prev = ordered[i - 1];
    let reason: string;

    if (strategy === "avalanche") {
      if (i === 0) {
        const tied = ordered.filter((l) => l.rate === loan.rate).length > 1;
        reason = tied
          ? `Highest rate you carry at ${loan.rate}%, and the smaller of the loans at that rate, so it clears first.`
          : `Highest rate you carry at ${loan.rate}%. Every extra dollar does the most work here.`;
      } else if (prev && prev.rate === loan.rate) {
        reason = `Also ${loan.rate}%, but a larger balance than the one above, so it waits its turn.`;
      } else {
        reason = `${loan.rate}%. Next in line once the loans above it are gone.`;
      }
    } else {
      if (i === 0) {
        reason =
          "Smallest balance you have, so this is the fastest account to clear off the list entirely.";
      } else if (i === ordered.length - 1) {
        reason = "Largest balance, so it goes last under this method.";
      } else {
        reason = `Next smallest. Each account you close frees up its minimum for the next one.`;
      }
    }

    return { loan, rank: i + 1, reason };
  });
}

interface SimOutcome {
  months: number;
  totalInterest: number;
  paidOff: boolean;
  /**
   * Total balance at the end of each month. Index 0 is today's balance, so
   * the array is `months + 1` long. Drives the payoff chart.
   */
  balanceByMonth: number[];
  /** The month each loan reaches zero, keyed by loan id. Absent if it never does. */
  payoffMonthById: Record<string, number>;
}

/**
 * Month-by-month simulation: accrue interest, then pour the whole budget into
 * the target loan in strategy order. The budget is the required payment on the
 * borrower's chosen plan plus whatever extra they told us about.
 */
function simulate(
  loans: Loan[],
  strategy: Strategy,
  requiredPayment: number,
  extra: number,
  maxMonths = 600
): SimOutcome {
  const monthlyBudget = requiredPayment + extra;
  const order = orderLoans(loans, strategy).map((l) => l.id);
  const byId = new Map(loans.map((l) => [l.id, l]));
  const balances = new Map(loans.map((l) => [l.id, l.balance]));

  let totalInterest = 0;
  let months = 0;
  const balanceByMonth: number[] = [
    loans.reduce((sum, l) => sum + l.balance, 0),
  ];
  const payoffMonthById: Record<string, number> = {};

  for (let m = 0; m < maxMonths; m++) {
    const remaining = Array.from(balances.values()).reduce((a, b) => a + b, 0);
    if (remaining <= 0.005) break;

    for (const id of order) {
      const bal = balances.get(id)!;
      if (bal <= 0) continue;
      const interest = bal * (byId.get(id)!.rate / 100 / 12);
      balances.set(id, bal + interest);
      totalInterest += interest;
    }

    let left = monthlyBudget;

    // The borrower is on ONE plan, so the servicer bills a single required
    // amount for the whole portfolio and spreads it across the loans. Absent
    // instructions that allocation is pro rata by balance, so model it that
    // way. As loans clear, the freed share redistributes automatically because
    // the split is recomputed from live balances each month.
    const active = order.filter((id) => balances.get(id)! > 0);
    const activeTotal = active.reduce((s, id) => s + balances.get(id)!, 0);
    if (activeTotal > 0) {
      const required = Math.min(requiredPayment, left);
      for (const id of active) {
        const share = (balances.get(id)! / activeTotal) * required;
        const pay = Math.min(share, balances.get(id)!, left);
        balances.set(id, balances.get(id)! - pay);
        left -= pay;
      }
    }

    // Everything still in hand — the extra, plus anything the pro rata split
    // could not place because a loan cleared — goes to the target loan. This
    // is the whole point of telling your servicer where extra money should go.
    for (const id of order) {
      if (left <= 0) break;
      const bal = balances.get(id)!;
      if (bal <= 0) continue;
      const pay = Math.min(bal, left);
      balances.set(id, bal - pay);
      left -= pay;
    }

    months++;

    // Recorded after the fact, so the loop above is untouched.
    let total = 0;
    for (const id of order) {
      const bal = balances.get(id)!;
      total += Math.max(0, bal);
      if (bal <= 0.005 && payoffMonthById[id] === undefined) {
        payoffMonthById[id] = months;
      }
    }
    balanceByMonth.push(total);
  }

  const paidOff = Array.from(balances.values()).every((b) => b <= 0.005);
  return { months, totalInterest, paidOff, balanceByMonth, payoffMonthById };
}

export type PayoffProjection = SimOutcome;

/**
 * One strategy at one budget, with the month-by-month detail the chart needs.
 * Same engine as compareStrategies, so the chart and the headline figures can
 * never disagree.
 */
export function projectPayoff(
  loans: Loan[],
  strategy: Strategy,
  requiredPayment: number,
  extraPerMonth: number
): PayoffProjection | null {
  if (!loans.length || requiredPayment <= 0) return null;
  return simulate(loans, strategy, requiredPayment, Math.max(0, extraPerMonth));
}

export interface StrategyComparison {
  avalanche: SimOutcome;
  snowball: SimOutcome;
  /** Extra interest the snowball costs versus the avalanche. */
  snowballCost: number;
  /** Positive means snowball takes longer. */
  monthsDifference: number;
  budget: number;
  requiredPayment: number;
  extra: number;
  budgetTooLow: boolean;
}

/**
 * Compare the two orders at a known monthly budget.
 *
 * `requiredPayment` must come from the borrower's selected repayment plan.
 * Without it there is no defensible timeline, so callers pass null and the UI
 * shows the ranking without a projection rather than inventing one.
 */
export function compareStrategies(
  loans: Loan[],
  requiredPayment: number,
  extraPerMonth: number
): StrategyComparison | null {
  if (!loans.length || requiredPayment <= 0) return null;

  const extra = Math.max(0, extraPerMonth);
  const budget = requiredPayment + extra;

  const avalanche = simulate(loans, "avalanche", requiredPayment, extra);
  const snowball = simulate(loans, "snowball", requiredPayment, extra);

  return {
    avalanche,
    snowball,
    snowballCost: Math.max(0, snowball.totalInterest - avalanche.totalInterest),
    monthsDifference: snowball.months - avalanche.months,
    budget,
    requiredPayment,
    extra,
    budgetTooLow: !avalanche.paidOff,
  };
}
