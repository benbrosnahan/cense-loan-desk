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
import { buildContext, estimatePlans, planSchedule } from "@/lib/calc";
import { compareStrategies, projectPayoff, rankLoans } from "@/lib/ranking";
import {
  cn,
  money,
  monthYearFromNow,
  monthsInWords,
  monthsLabel,
  pct,
  shortMonthYearFromNow,
} from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  ChoiceGroup,
  Disclosure,
  Eyebrow,
  FadeIn,
  Money,
  Notice,
  WholeDollarInput,
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
  // The selected plan's own schedule, so Payoff runs the plan its card prices.
  const plan = useMemo(
    () => (selected ? planSchedule(selected, ctx) : null),
    [selected, ctx]
  );
  const graduated = selected?.id === "graduated";

  // Whole dollars, so an extra of 12.5 saved by the old field reads 12 everywhere.
  const extra = Math.max(
    0,
    Math.min(EXTRA_MAX, Math.trunc(profile.extraPerMonth || 0))
  );

  const ranked = useMemo(() => rankLoans(loans, strategy), [loans, strategy]);
  const comparison = useMemo(
    () =>
      required !== null
        ? compareStrategies(loans, required, extra, plan)
        : null,
    [loans, required, extra, plan]
  );
  const main = useMemo(
    () =>
      required !== null
        ? projectPayoff(loans, strategy, required, extra, plan)
        : null,
    [loans, strategy, required, extra, plan]
  );
  const base = useMemo(
    () =>
      required !== null && extra > 0
        ? projectPayoff(loans, strategy, required, 0, plan)
        : null,
    [loans, strategy, required, extra, plan]
  );

  const monthsSaved = main && base && base.paidOff ? base.months - main.months : 0;
  const interestSaved =
    main && base && base.paidOff
      ? Math.max(0, base.totalInterest - main.totalInterest)
      : 0;
  // On IBR and RAP the required payment alone may end in forgiveness. Then
  // extra money ends nothing sooner and saves no interest that matters: what
  // it changes is the total paid and what is left to forgive.
  const forgiven = !!main && !main.paidOff && main.forgiven > 0;
  const baseForgiven = !!base && !base.paidOff && base.forgiven > 0;
  const paidMore = main && base ? main.totalPaid - base.totalPaid : 0;
  const moreOrLess = paidMore >= 0 ? "more" : "less";
  const costsMore = paidMore > 0.5;
  const sameForgiven =
    !!main && !!base && Math.abs(main.forgiven - base.forgiven) < 0.5;
  // On RAP the extra can cost more in total: the engine counts it as part of
  // the month's payment, so it first pays interest RAP would otherwise waive
  // (34 CFR 685.209(h)(4)(i)) and then replaces ED's matching principal
  // ((o)(2)(i)). The rule does not settle that reading, so the page says so.
  const rapExtraNote =
    selected?.id === "rap" && extra > 0 && costsMore
      ? " On RAP, money you add goes first to any interest RAP would otherwise waive, then takes the place of the up to $50 ED puts toward your principal each month, and only after that brings your end date closer. That counts the extra as part of your payment for the month, one reading of 34 CFR 685.209(h)(4)(i) and (o)(2)(i); if your servicer applies it separately, it can do more."
      : "";
  // What forgiveness means for this borrower. Payoff does not model PSLF, so
  // a public-service worker is not told the balance waits 20 or 30 years.
  const forgivenNote = ctx.publicService
    ? " Payoff does not count Public Service Loan Forgiveness: after 120 qualifying payments while you work in public service, what is left is cancelled then, tax free."
    : " Outside Public Service Loan Forgiveness, a forgiven balance counts as taxable income the year it is cancelled.";
  // Everything the headline and the sentence under it show. Both are keyed on
  // it, so a change replaces them whole and a page translator's copies are
  // never left holding text React edits or removes (RES-12).
  const storyKey = [
    selected?.id,
    ctx.publicService,
    extra,
    comparison?.budget,
    main?.paidOff,
    main?.months,
    Math.round(main?.totalPaid ?? 0),
    Math.round(main?.forgiven ?? 0),
    base?.paidOff,
    base?.months,
    Math.round(base?.totalPaid ?? 0),
    Math.round(base?.forgiven ?? 0),
    monthsSaved,
    roughly(interestSaved),
  ].join("|");

  // The sentence a screen reader hears. It waits for the slider to settle, so
  // dragging does not read out forty intermediate values.
  const summary = useMemo(() => {
    if (!main || !comparison) return "";
    const ends = monthYearFromNow(main.months);
    if (forgiven && extra > 0 && base && baseForgiven)
      return `Paying ${money(extra)} extra a month does not end this any sooner. The rest is forgiven in ${ends}, and you pay ${money(
        main.totalPaid
      )} in total instead of ${money(base.totalPaid)}, with ${
        sameForgiven
          ? `the same ${money(main.forgiven)} forgiven`
          : `${money(main.forgiven)} forgiven instead of ${money(base.forgiven)}`
      }.${rapExtraNote}${forgivenNote}`;
    if (forgiven)
      return `The rest is forgiven in ${ends}. You pay ${money(
        main.totalPaid
      )} over ${monthsLabel(main.months)}, and the ${money(
        main.forgiven
      )} still owed after that is forgiven.${forgivenNote}`;
    if (!main.paidOff)
      return `At ${money(comparison.budget)} a month this balance does not reach zero.`;
    if (extra > 0 && base && baseForgiven)
      return `Paying ${money(extra)} extra a month, you are debt free in ${ends}. On the required payment alone ${money(
        base.forgiven
      )} would be forgiven in ${monthYearFromNow(base.months)}. You pay ${money(
        Math.abs(paidMore)
      )} ${moreOrLess} in total.${forgivenNote}`;
    if (extra > 0 && base && !base.paidOff)
      return `On the required payment alone this balance would never reach zero. With ${money(extra)} extra it is gone in ${ends}.`;
    const cost = costsMore
      ? `but you pay about ${money(roughly(paidMore))} more in total`
      : `with about ${money(roughly(interestSaved))} less interest`;
    if (extra > 0 && monthsSaved > 0)
      return `Paying ${money(extra)} extra a month, you are debt free in ${ends}, ${monthsInWords(
        monthsSaved
      )} sooner, ${cost}.${rapExtraNote}`;
    if (extra > 0)
      return `Paying ${money(extra)} extra a month, you are debt free in ${ends}, the same month, ${cost}.${rapExtraNote}`;
    return `Paying the required amount only, you are debt free in ${ends}.`;
  }, [
    main,
    base,
    comparison,
    extra,
    forgiven,
    baseForgiven,
    paidMore,
    moreOrLess,
    costsMore,
    sameForgiven,
    rapExtraNote,
    forgivenNote,
    monthsSaved,
    interestSaved,
  ]);
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
              {/* Sentences that show a figure are keyed by what they show. A
                  browser translator swaps the text React holds for its own
                  copy, so an edit in place would leave old figures on screen
                  or throw; a new key makes React replace the block whole. */}
              <Eyebrow key={`eb-${selected!.id}-${comparison.requiredPayment}`}>
                On {PLAN_META[selected!.id].name} ·{" "}
                <Money value={comparison.requiredPayment} /> a month{" "}
                {graduated ? "to start" : "required"}
              </Eyebrow>

              {/* The headline is the takeaway, not a label. */}
              <h2
                key={`head-${storyKey}`}
                className="mt-2 text-balance font-display text-[1.75rem] font-bold leading-[1.1] text-slate-900 sm:text-4xl"
              >
                {forgiven ? (
                  <>The rest is forgiven in {monthYearFromNow(main.months)}</>
                ) : !main.paidOff ? (
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
              <p
                key={`sub-${storyKey}`}
                className="mt-2 text-base leading-relaxed text-slate-700"
              >
                {forgiven && extra > 0 && base && baseForgiven ? (
                  <>
                    Paying <Money value={extra} /> extra does not end this any
                    sooner. You pay{" "}
                    <strong className="font-semibold text-slate-900">
                      <Money value={main.totalPaid} />
                    </strong>{" "}
                    in total instead of <Money value={base.totalPaid} />, and{" "}
                    {sameForgiven ? (
                      <>
                        the same <Money value={main.forgiven} /> is forgiven.
                      </>
                    ) : (
                      <>
                        <Money value={main.forgiven} /> is forgiven instead of{" "}
                        <Money value={base.forgiven} />.
                      </>
                    )}
                    {rapExtraNote}
                    {forgivenNote}
                  </>
                ) : forgiven ? (
                  <>
                    You pay <Money value={main.totalPaid} /> over{" "}
                    {monthsLabel(main.months)}, and the{" "}
                    <strong className="font-semibold text-slate-900">
                      <Money value={main.forgiven} />
                    </strong>{" "}
                    still owed after that is forgiven.{forgivenNote}
                  </>
                ) : !main.paidOff ? (
                  <>
                    At <Money value={comparison.budget} /> a month these
                    balances never reach zero.
                  </>
                ) : extra > 0 && base && baseForgiven ? (
                  <>
                    On the required payment alone,{" "}
                    <Money value={base.forgiven} /> would be forgiven in{" "}
                    {monthYearFromNow(base.months)}. With{" "}
                    <Money value={extra} /> extra it is gone in{" "}
                    {monthYearFromNow(main.months)}, and you pay{" "}
                    <strong className="font-semibold text-slate-900">
                      <Money value={Math.abs(paidMore)} /> {moreOrLess}
                    </strong>{" "}
                    in total.{forgivenNote}
                  </>
                ) : extra > 0 && monthsSaved > 0 ? (
                  <>
                    You would finish in{" "}
                    <strong className="font-semibold text-slate-900">
                      {monthYearFromNow(main.months)}
                    </strong>{" "}
                    {costsMore ? "but pay about" : "and pay about"}{" "}
                    <strong className="font-semibold text-slate-900">
                      <Money
                        value={roughly(costsMore ? paidMore : interestSaved)}
                      />
                    </strong>{" "}
                    {costsMore ? <>more in total.{rapExtraNote}</> : <>less in interest.</>}
                  </>
                ) : extra > 0 ? (
                  <>
                    With <Money value={extra} /> extra you still finish in{" "}
                    {monthYearFromNow(main.months)}, and pay about{" "}
                    <Money value={roughly(costsMore ? paidMore : interestSaved)} />{" "}
                    {costsMore ? "more in total" : "less in interest"}.
                    {rapExtraNote}
                  </>
                ) : (
                  <>
                    That is {monthsLabel(main.months)} of paying only what is
                    required. Add an amount below to see what extra money
                    changes.
                  </>
                )}
              </p>
              {/* RAP's matching principal payment only follows an on-time
                  payment of the amount due; paying ahead can advance the due
                  date and end it (34 CFR 685.209(o)(3)(i)). */}
              {selected?.id === "rap" && extra > 0 && (
                <p
                  key={`rap-due-${storyKey}`}
                  className="mt-2 text-sm leading-relaxed text-slate-600"
                >
                  To keep RAP&apos;s matching payment of up to $50 toward your
                  principal, ask your servicer not to move your due date forward
                  when you pay extra.
                </p>
              )}
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
                      <WholeDollarInput
                        id="extra"
                        prefix="$"
                        inputMode="numeric"
                        autoComplete="off"
                        value={extra}
                        max={EXTRA_MAX}
                        placeholder="0"
                        onValueChange={onExtraChange}
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

              {(main.paidOff || forgiven) && (
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-5">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                      {forgiven ? "Forgiven" : "Done"}
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
                      {graduated ? "Monthly, to start" : "Monthly"}
                    </dt>
                    <dd className="mt-1 text-base font-bold text-slate-900 sm:text-xl">
                      <Money value={comparison.budget} />
                    </dd>
                  </div>
                </dl>
              )}

              <p
                key={`assume-${selected!.id}-${comparison.requiredPayment}`}
                className="mt-4 text-sm leading-relaxed text-slate-600"
              >
                What this assumes: payments start this month, and your required
                payment{" "}
                {graduated ? (
                  <>
                    starts at <Money value={comparison.requiredPayment} /> and
                    steps up every two years, on the same schedule as the
                    Repayment plans tab.
                  </>
                ) : (
                  <>
                    stays at <Money value={comparison.requiredPayment} /> the
                    whole way.
                  </>
                )}
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
                          {`${PLAN_META[e.id].name}, ${money(e.monthlyPayment!)} a month${
                            e.id === "graduated" ? " to start" : ""
                          }`}
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
                <Notice
                  key={`cost-${comparison.snowballCost}-${comparison.monthsDifference}`}
                  tone="info"
                  title="What the choice actually costs"
                >
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
                    <p
                      key={`why-${rank}-${reason}`}
                      className="mt-1 text-sm leading-snug text-slate-700"
                    >
                      {rank === 1 && (
                        <Badge tone="accent" className="mr-1.5">
                          Extra goes here
                        </Badge>
                      )}
                      {reason}
                    </p>
                    {gone !== undefined && (
                      <p className="tnum mt-1 text-sm text-slate-600">
                        {`Gone by ${shortMonthYearFromNow(gone)}`}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </FadeIn>

      <Notice
        key={`warn-${ranked[0]?.loan.id}`}
        tone="warn"
        title="One thing that undoes all of this"
      >
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
