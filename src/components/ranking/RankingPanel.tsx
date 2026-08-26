"use client";

// Cense Loan Desk — payoff order. Created with Claude Code.
//
// Kept off the main view on purpose. Ranking only matters once there is spare
// cash, and leading with it makes the overview look like homework.
//
// The timeline is derived from the borrower's selected repayment plan. Without
// a plan there is no honest debt-free date, because the required payment is
// what sets it, so the projection is withheld rather than guessed.

import { useMemo, useState } from "react";
import { Loan, PlanId, Profile, Strategy } from "@/types";
import { PLAN_META } from "@/data/plans";
import { buildContext, estimatePlans } from "@/lib/calc";
import { compareStrategies, rankLoans } from "@/lib/ranking";
import { cn, money, monthsLabel, pct } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  Disclosure,
  FadeIn,
  Notice,
  Stat,
  inputClass,
} from "@/components/shared/ui";

interface Props {
  loans: Loan[];
  profile: Profile;
  onExtraChange: (n: number) => void;
  onSelectPlan: (id: PlanId) => void;
  onGoToPlans: () => void;
}

const STRATEGY_COPY: Record<Strategy, { name: string; sub: string; blurb: string }> = {
  avalanche: {
    name: "Avalanche",
    sub: "Highest rate first",
    blurb:
      "Attack the highest interest rate first. This is arithmetically the cheapest way to clear debt, every time.",
  },
  snowball: {
    name: "Snowball",
    sub: "Smallest balance first",
    blurb:
      "Attack the smallest balance first. It costs a little more in interest, but clearing whole accounts is a real motivational effect, not a myth.",
  },
};

export default function RankingPanel({
  loans,
  profile,
  onExtraChange,
  onSelectPlan,
  onGoToPlans,
}: Props) {
  const [strategy, setStrategy] = useState<Strategy>("avalanche");

  const ctx = useMemo(() => buildContext(loans, profile), [loans, profile]);
  const estimates = useMemo(() => estimatePlans(ctx), [ctx]);
  const eligible = estimates.filter(
    (e) => e.eligible && e.monthlyPayment !== null
  );

  const selected = profile.selectedPlan
    ? estimates.find((e) => e.id === profile.selectedPlan) ?? null
    : null;
  const required =
    selected && selected.eligible ? selected.monthlyPayment : null;

  const ranked = useMemo(() => rankLoans(loans, strategy), [loans, strategy]);
  const comparison = useMemo(
    () =>
      required !== null
        ? compareStrategies(loans, required, profile.extraPerMonth)
        : null,
    [loans, required, profile.extraPerMonth]
  );

  if (!loans.length) return null;

  const outcome =
    comparison &&
    (strategy === "avalanche" ? comparison.avalanche : comparison.snowball);

  return (
    <div className="space-y-4">
      <FadeIn>
        <Card className="p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-900">
            Where should the extra money go?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-700">
            Make your required payment first, always. This only decides where
            anything left over should land.
          </p>

          {/* Strategy toggle */}
          <div
            role="radiogroup"
            aria-label="Payoff strategy"
            className="mt-4 grid gap-2 sm:grid-cols-2"
          >
            {(["avalanche", "snowball"] as Strategy[]).map((s) => {
              const active = strategy === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setStrategy(s)}
                  className={cn(
                    "rounded-xl border-2 px-4 py-3 text-left transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
                    active
                      ? "border-navy bg-selected"
                      : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {STRATEGY_COPY[s].name}
                    </span>
                    {active && (
                      <span
                        aria-hidden
                        className="flex h-4 w-4 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white"
                      >
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-600">
                    {STRATEGY_COPY[s].sub}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-700">
            {STRATEGY_COPY[strategy].blurb}
          </p>
        </Card>
      </FadeIn>

      {/* ---- Projection, only when a plan is known ---- */}
      <FadeIn delay={0.05}>
        <Card className="p-4 sm:p-5">
          {!required ? (
            <Notice tone="info" title="Pick a repayment plan to see a timeline">
              How long this takes and what it costs depends almost entirely on
              which repayment plan you are on, because that sets your required
              monthly payment. We are not going to guess at it.
              <div className="mt-2.5">
                <Button size="sm" onClick={onGoToPlans}>
                  Choose a plan
                </Button>
              </div>
            </Notice>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  Based on {PLAN_META[selected!.id].name}
                </p>
                <Badge tone="neutral">
                  {money(comparison!.requiredPayment)}/mo required
                  {comparison!.extra > 0
                    ? ` + ${money(comparison!.extra)} extra`
                    : ""}
                </Badge>
              </div>

              {comparison!.budgetTooLow ? (
                <Notice tone="warn" title="This does not clear in 50 years" className="mt-3">
                  At {money(comparison!.budget)} a month these balances never
                  retire. On an income-driven plan that is expected, and the
                  remaining balance is forgiven at the end of the term instead.
                </Notice>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Stat
                    label="Debt free in"
                    value={monthsLabel(outcome!.months)}
                    hero
                  />
                  <Stat
                    label="Interest you pay"
                    value={money(outcome!.totalInterest)}
                  />
                  <Stat
                    label="Paying monthly"
                    value={money(comparison!.budget)}
                  />
                </div>
              )}

              <div className="mt-4">
                <label
                  htmlFor="extra"
                  className="block text-xs font-bold text-slate-900"
                >
                  Extra per month, on top of the required payment
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    id="extra"
                    type="range"
                    min={0}
                    max={1000}
                    step={25}
                    value={profile.extraPerMonth}
                    onChange={(e) => onExtraChange(Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
                  />
                  <span className="tnum w-20 text-right text-lg font-bold text-slate-900">
                    {money(profile.extraPerMonth)}
                  </span>
                </div>
              </div>

              {!comparison!.budgetTooLow && (
                <div className="mt-4 border-t border-line pt-4">
                  {comparison!.snowballCost < 1 ? (
                    <Notice tone="good" title="Same either way">
                      With these loans the two methods land within a dollar of
                      each other. Pick whichever you will actually stick to.
                    </Notice>
                  ) : (
                    <Notice tone="info" title="What the choice actually costs">
                      Snowball costs{" "}
                      <strong className="tnum">
                        {money(comparison!.snowballCost)}
                      </strong>{" "}
                      more in interest than avalanche
                      {comparison!.monthsDifference > 0 && (
                        <>
                          , and takes{" "}
                          <strong>
                            {monthsLabel(comparison!.monthsDifference)}
                          </strong>{" "}
                          longer
                        </>
                      )}
                      . That is the honest number, and on a portfolio this size
                      it is usually smaller than people expect. If clearing
                      accounts is what keeps you paying, it can be worth it.
                    </Notice>
                  )}
                </div>
              )}

              {/* Progressive disclosure: the plan switcher is hidden until
                  someone actually wants to compare, per the W3C disclosure
                  pattern. Showing six radio buttons here by default would
                  duplicate the Repayment plans tab. */}
              {eligible.length > 1 && (
                <Disclosure
                  className="mt-4"
                  summary="See how a different plan changes this"
                  openSummary="Hide the other plans"
                >
                  <div className="rounded-xl border border-line bg-slate-50 p-3">
                    <label
                      htmlFor="planswitch"
                      className="block text-xs font-bold text-slate-900"
                    >
                      Model a different repayment plan
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      This changes your selected plan everywhere in Loan Desk.
                    </p>
                    <select
                      id="planswitch"
                      className={cn(inputClass, "mt-2")}
                      value={profile.selectedPlan ?? ""}
                      onChange={(e) => onSelectPlan(e.target.value as PlanId)}
                    >
                      {eligible.map((e) => (
                        <option key={e.id} value={e.id}>
                          {PLAN_META[e.id].name} — {money(e.monthlyPayment!)}/mo
                        </option>
                      ))}
                    </select>
                  </div>
                </Disclosure>
              )}
            </>
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Your order, {STRATEGY_COPY[strategy].name.toLowerCase()}
          </p>
          {ranked.map(({ loan, rank, reason }) => (
            <Card
              key={loan.id}
              className={cn(
                "p-3.5 transition-shadow hover:shadow-md",
                rank === 1 && "border-navy ring-1 ring-navy"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "tnum flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    rank === 1 ? "bg-navy text-white" : "bg-slate-100 text-slate-700"
                  )}
                >
                  {rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {loan.nickname}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="tnum text-xs font-semibold text-slate-700">
                        {pct(loan.rate)}
                      </span>
                      <span className="tnum text-sm font-bold text-slate-900">
                        {money(loan.balance)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                    {rank === 1 && (
                      <Badge tone="accent" className="mr-1.5">
                        Extra goes here
                      </Badge>
                    )}
                    {reason}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </FadeIn>

      <Notice tone="warn" title="One thing that undoes all of this">
        Sending extra money without instructions usually gets it spread across
        every loan, or treated as paying next month&apos;s bill early. Tell your
        servicer in writing to apply anything above the scheduled amount to the
        principal of your highest rate loan, and not to advance your due date.
      </Notice>
    </div>
  );
}
