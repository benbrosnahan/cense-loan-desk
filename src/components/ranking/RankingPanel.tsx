"use client";

// Cense Loan Desk — payoff. Created with Claude Code.
//
// Kept off the main view on purpose. Ranking only matters once there is spare
// cash, and leading with it makes the overview look like homework.
//
// The timeline is derived from the borrower's selected repayment plan. Without
// a plan there is no honest debt-free date, because the required payment is
// what sets it, so the projection is withheld rather than guessed.
//
// The extra payment starts at $0 and is never pre-filled with a suggestion.
// A suggested amount acts as an anchor: people pay near whatever number they
// are shown first (Stewart 2009, Keys and Wang 2019).

import { useEffect, useMemo, useState } from "react";
import { Loan, PlanId, Profile, Strategy } from "@/types";
import { PLAN_META } from "@/data/plans";
import { buildContext, estimatePlans } from "@/lib/calc";
import { compareStrategies, projectPayoff, rankLoans } from "@/lib/ranking";
import {
  cn,
  formatWholeDollars,
  money,
  monthYearFromNow,
  monthsInWords,
  monthsLabel,
  parseNumber,
  pct,
  shortMonthYearFromNow,
} from "@/lib/utils";
import {
  AffixInput,
  Badge,
  Button,
  Card,
  ChoiceGroup,
  Disclosure,
  Eyebrow,
  FadeIn,
  Money,
  Notice,
  inputClass,
} from "@/components/shared/ui";
import PayoffRunway from "@/components/charts/PayoffRunway";

interface Props {
  loans: Loan[];
  profile: Profile;
  onExtraChange: (n: number) => void;
  onSelectPlan: (id: PlanId) => void;
  onGoToPlans: () => void;
}

const STRATEGY_COPY: Record<Strategy, { name: string; sub: string; blurb: string }> = {
  avalanche: {
    name: "Highest rate first",
    sub: "Often called avalanche",
    blurb:
      "Extra money goes to the loan with the highest interest rate. This is arithmetically the cheapest way to clear debt, every time.",
  },
  snowball: {
    name: "Smallest balance first",
    sub: "Often called snowball",
    blurb:
      "Extra money goes to the smallest loan. It costs a little more in interest, but clearing whole accounts is a real motivational effect, not a myth.",
  },
};

const PRESETS = [0, 25, 50, 100, 200];
const SLIDER_MAX = 500;
const EXTRA_MAX = 5000;

/** Projections are estimates. Round what we say in a sentence to the nearest $10. */
const roughly = (n: number) => Math.round(n / 10) * 10;

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

  const extra = Math.max(0, Math.min(EXTRA_MAX, profile.extraPerMonth || 0));

  const ranked = useMemo(() => rankLoans(loans, strategy), [loans, strategy]);
  const comparison = useMemo(
    () => (required !== null ? compareStrategies(loans, required, extra) : null),
    [loans, required, extra]
  );
  const main = useMemo(
    () =>
      required !== null ? projectPayoff(loans, strategy, required, extra) : null,
    [loans, strategy, required, extra]
  );
  const base = useMemo(
    () =>
      required !== null && extra > 0
        ? projectPayoff(loans, strategy, required, 0)
        : null,
    [loans, strategy, required, extra]
  );

  const monthsSaved = main && base && base.paidOff ? base.months - main.months : 0;
  const interestSaved =
    main && base && base.paidOff
      ? Math.max(0, base.totalInterest - main.totalInterest)
      : 0;

  // The sentence a screen reader hears. It waits for the slider to settle, so
  // dragging does not read out forty intermediate values.
  const summary = useMemo(() => {
    if (!main || !comparison) return "";
    if (!main.paidOff)
      return `At ${money(comparison.budget)} a month this balance does not reach zero.`;
    if (extra > 0 && monthsSaved > 0)
      return `Paying ${money(extra)} extra a month, you are debt free in ${monthYearFromNow(
        main.months
      )}, ${monthsInWords(monthsSaved)} sooner, with about ${money(
        roughly(interestSaved)
      )} less interest.`;
    return `Paying the required amount only, you are debt free in ${monthYearFromNow(
      main.months
    )}.`;
  }, [main, comparison, extra, monthsSaved, interestSaved]);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(summary), 700);
    return () => clearTimeout(t);
  }, [summary]);

  if (!loans.length) return null;

  const sliderValue = Math.min(extra, SLIDER_MAX);

  return (
    <div className="space-y-5">
      <FadeIn>
        <Card className="p-5 sm:p-7">
          {required === null || !main || !comparison ? (
            <>
              <h2 className="font-display text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                Pick a repayment plan to see your debt-free date
              </h2>
              <p className="mt-2 text-base leading-relaxed text-slate-700">
                How long this takes depends almost entirely on which repayment
                plan you are on, because that sets your required monthly
                payment. We are not going to guess at it.
              </p>
              <div className="mt-4">
                <Button onClick={onGoToPlans}>Choose a plan</Button>
              </div>
            </>
          ) : (
            <>
              <Eyebrow>
                On {PLAN_META[selected!.id].name} ·{" "}
                <Money value={comparison.requiredPayment} /> a month required
              </Eyebrow>

              {/* The headline is the takeaway, not a label. */}
              <h2 className="mt-2 text-balance font-display text-[1.75rem] font-bold leading-[1.1] text-slate-900 sm:text-4xl">
                {!main.paidOff ? (
                  <>This payment does not clear the balance</>
                ) : extra > 0 && monthsSaved > 0 ? (
                  <>
                    <Money value={extra} tabular={false} /> extra a month gets
                    you out {monthsInWords(monthsSaved)} sooner
                  </>
                ) : (
                  <>Debt free in {monthYearFromNow(main.months)}</>
                )}
              </h2>
              <p className="mt-2 text-base leading-relaxed text-slate-700">
                {!main.paidOff ? (
                  <>
                    At <Money value={comparison.budget} /> a month these
                    balances never reach zero. On an income-driven plan that is
                    expected, and the remaining balance is forgiven at the end
                    of the term instead.
                  </>
                ) : extra > 0 && monthsSaved > 0 ? (
                  <>
                    You would finish in{" "}
                    <strong className="font-semibold text-slate-900">
                      {monthYearFromNow(main.months)}
                    </strong>{" "}
                    and pay about{" "}
                    <strong className="font-semibold text-slate-900">
                      <Money value={roughly(interestSaved)} />
                    </strong>{" "}
                    less in interest.
                  </>
                ) : extra > 0 && base && !base.paidOff ? (
                  <>
                    On the required payment alone this balance would never
                    reach zero. With <Money value={extra} /> extra it is gone
                    in {monthYearFromNow(main.months)}.
                  </>
                ) : (
                  <>
                    That is {monthsLabel(main.months)} of paying only what is
                    required. Add an amount below to see what extra money
                    changes.
                  </>
                )}
              </p>
              <output className="sr-only" aria-live="polite">
                {announced}
              </output>

              {/* ---- The control: typed amount, presets, and a slider ---- */}
              <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                <div className="flex items-end gap-3">
                  <div className="w-36 flex-shrink-0">
                    <label
                      htmlFor="extra"
                      className="block text-sm font-bold text-slate-900"
                    >
                      Extra each month
                    </label>
                    <div className="mt-1.5">
                      <AffixInput
                        id="extra"
                        prefix="$"
                        inputMode="numeric"
                        autoComplete="off"
                        value={extra ? formatWholeDollars(String(extra)) : ""}
                        placeholder="0"
                        onChange={(e) =>
                          onExtraChange(
                            Math.min(EXTRA_MAX, parseNumber(e.target.value))
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pb-0.5">
                    <input
                      type="range"
                      aria-label="Extra each month, slider"
                      min={0}
                      max={SLIDER_MAX}
                      step={5}
                      value={sliderValue}
                      onChange={(e) => onExtraChange(Number(e.target.value))}
                      className="range"
                      style={
                        {
                          "--fill": `${(sliderValue / SLIDER_MAX) * 100}%`,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
                <div
                  className="mt-3 grid grid-cols-5 gap-1.5"
                  role="group"
                  aria-label="Common amounts"
                >
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={extra === p}
                      onClick={() => onExtraChange(p)}
                      className={cn(
                        "tnum min-h-[44px] rounded-full border px-1 text-sm font-semibold transition-colors",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
                        extra === p
                          ? "border-navy bg-navy text-white"
                          : "border-slate-300 bg-white text-slate-900 hover:border-navy"
                      )}
                    >
                      {p === 0 ? "None" : `$${p}`}
                    </button>
                  ))}
                </div>
              </div>

              {main.paidOff && (
                <PayoffRunway
                  className="mt-6"
                  withExtra={main.balanceByMonth}
                  requiredOnly={base && base.paidOff ? base.balanceByMonth : null}
                  extra={extra}
                />
              )}

              {main.paidOff && (
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-5">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                      Done
                    </dt>
                    <dd className="tnum mt-1 text-base font-bold text-slate-900 sm:text-xl">
                      {shortMonthYearFromNow(main.months)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                      Interest
                    </dt>
                    <dd className="mt-1 text-base font-bold text-slate-900 sm:text-xl">
                      <Money value={main.totalInterest} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                      Monthly
                    </dt>
                    <dd className="mt-1 text-base font-bold text-slate-900 sm:text-xl">
                      <Money value={comparison.budget} />
                    </dd>
                  </div>
                </dl>
              )}

              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                What this assumes: payments start this month, and your required
                payment stays at <Money value={comparison.requiredPayment} />{" "}
                the whole way.
                {selected!.id === "graduated" &&
                  " On Graduated it steps up every two years, so you would finish sooner than shown."}
                {PLAN_META[selected!.id].incomeDriven &&
                  " On an income-driven plan it moves with your income each year."}
              </p>

              {/* Progressive disclosure: the plan switcher is hidden until
                  someone actually wants to compare, per the W3C disclosure
                  pattern. Showing six radio buttons here by default would
                  duplicate the Repayment plans tab. */}
              {eligible.length > 1 && (
                <Disclosure
                  className="mt-2"
                  summary="See how a different plan changes this"
                  openSummary="Hide the other plans"
                >
                  <div className="rounded-2xl border border-line bg-slate-50 p-4">
                    <label
                      htmlFor="planswitch"
                      className="block text-sm font-bold text-slate-900"
                    >
                      Try a different repayment plan
                    </label>
                    <select
                      id="planswitch"
                      className={cn(inputClass, "mt-2")}
                      value={profile.selectedPlan ?? ""}
                      aria-describedby="planswitch-msg"
                      onChange={(e) => onSelectPlan(e.target.value as PlanId)}
                    >
                      {eligible.map((e) => (
                        <option key={e.id} value={e.id}>
                          {PLAN_META[e.id].name}, {money(e.monthlyPayment!)} a
                          month
                        </option>
                      ))}
                    </select>
                    <p id="planswitch-msg" className="mt-1.5 text-sm text-slate-600">
                      This changes your selected plan everywhere in Loan Desk.
                    </p>
                  </div>
                </Disclosure>
              )}
            </>
          )}
        </Card>
      </FadeIn>

      {/* ---- Where the extra goes ---- */}
      <FadeIn delay={0.05}>
        <Card className="p-5 sm:p-7">
          <h2 className="font-display text-2xl font-bold leading-tight text-slate-900">
            Where should extra money go?
          </h2>
          <p className="mt-1.5 text-base leading-relaxed text-slate-700">
            Make your required payment first, always. This only decides where
            anything left over lands.
          </p>

          <ChoiceGroup
            className="mt-4"
            label="Payoff order"
            value={strategy}
            onChange={setStrategy}
            options={(["avalanche", "snowball"] as Strategy[]).map((s) => ({
              value: s,
              label: STRATEGY_COPY[s].name,
              sub: STRATEGY_COPY[s].sub,
            }))}
          />
          <p className="mt-3 text-sm leading-relaxed text-slate-700" aria-live="polite">
            {STRATEGY_COPY[strategy].blurb}
          </p>

          {comparison && !comparison.budgetTooLow && extra > 0 && (
            <div className="mt-4">
              {comparison.snowballCost < 1 ? (
                <Notice tone="good" title="Same either way">
                  With these loans the two orders land within a dollar of each
                  other. Pick whichever you will actually stick to.
                </Notice>
              ) : (
                <Notice tone="info" title="What the choice actually costs">
                  Smallest balance first costs{" "}
                  <strong>
                    <Money value={comparison.snowballCost} />
                  </strong>{" "}
                  more in interest than highest rate first
                  {comparison.monthsDifference > 0 && (
                    <>
                      , and takes{" "}
                      <strong>{monthsLabel(comparison.monthsDifference)}</strong>{" "}
                      longer
                    </>
                  )}
                  . That is the honest number, and on a portfolio this size it
                  is usually smaller than people expect. If clearing accounts
                  is what keeps you paying, it can be worth it.
                </Notice>
              )}
            </div>
          )}

          <Eyebrow className="mt-6">Your order</Eyebrow>
          <ol className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {ranked.map(({ loan, rank, reason }) => {
              const gone = main?.paidOff
                ? main.payoffMonthById[loan.id]
                : undefined;
              return (
                <li
                  key={loan.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3.5",
                    rank === 1 && "bg-selected"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "tnum mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      rank === 1
                        ? "bg-navy text-white"
                        : "bg-slate-100 text-slate-800"
                    )}
                  >
                    {rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-base font-semibold text-slate-900">
                        {loan.nickname}
                      </p>
                      <p className="text-sm text-slate-800">
                        <span className="tnum font-semibold">{pct(loan.rate)}</span>
                        {" · "}
                        <Money value={loan.balance} className="font-semibold" />
                      </p>
                    </div>
                    <p className="mt-1 text-sm leading-snug text-slate-700">
                      {rank === 1 && (
                        <Badge tone="accent" className="mr-1.5">
                          Extra goes here
                        </Badge>
                      )}
                      {reason}
                    </p>
                    {gone !== undefined && (
                      <p className="tnum mt-1 text-sm text-slate-600">
                        Gone by {shortMonthYearFromNow(gone)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </FadeIn>

      <Notice tone="warn" title="One thing that undoes all of this">
        Sending extra money without instructions usually gets it spread across
        every loan, or treated as paying next month&apos;s bill early. Tell your
        servicer in writing to apply anything above the scheduled amount to the
        principal of{" "}
        <strong>{ranked[0]?.loan.nickname ?? "the loan you chose"}</strong>, and
        not to advance your due date.
      </Notice>
    </div>
  );
}
