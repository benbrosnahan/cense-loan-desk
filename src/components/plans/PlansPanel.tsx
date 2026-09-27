"use client";

// Cense Loan Desk — eligibility, recommendation and plan comparison.
// Created with Claude Code.
//
// Order on the page: the recommendation, then every plan side by side on the
// two numbers that trade off against each other (what you pay a month, what
// you pay in total), then the detail for anyone who wants to check our work.

import { useState } from "react";
import { Loan, PlanId, Profile, RankedPlan } from "@/types";
import {
  ASSUMPTIONS,
  PARENT_PLUS_NOTE,
  PLAN_META,
  POST_CUTOFF_WARNING,
  POST_CUTOFF_WARNING_PARENT_PLUS,
  SAME_PLAN_RULE,
} from "@/data/plans";
import { buildContext, estimatePlans, isPostCutoff, rankPlans } from "@/lib/calc";
import { cn, years } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  Chevron,
  Disclosure,
  Eyebrow,
  FadeIn,
  Money,
  Notice,
} from "@/components/shared/ui";

interface Props {
  loans: Loan[];
  profile: Profile;
  onSelectPlan: (id: PlanId) => void;
}

function PslfBadge({ plan }: { plan: RankedPlan }) {
  const s = plan.estimate.pslf;
  if (s === "counts") return <Badge tone="good">✓ Counts toward PSLF</Badge>;
  if (s === "partial") return <Badge tone="warn">~ Some months count</Badge>;
  return <Badge tone="neutral">✕ No PSLF credit</Badge>;
}

/**
 * One measure, drawn as a bar against the largest value among the plans. The
 * number sits beside the bar in text, so the bar is never the only way to
 * read it.
 */
function Measure({
  label,
  value,
  max,
  emphasis,
  note,
}: {
  label: string;
  value: number | null;
  max: number;
  emphasis: boolean;
  note?: string;
}) {
  const ratio = value !== null && max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-slate-700">{label}</span>
        <span className="text-base font-bold text-slate-900">
          {value === null ? "—" : <Money value={value} />}
          {note && (
            <span className="ml-1 text-xs font-normal text-slate-600">
              {note}
            </span>
          )}
        </span>
      </div>
      <div className="amt-chart mt-1.5 h-2.5 rounded-r-full bg-chart-track">
        <div
          className={cn(
            "h-full rounded-r-full transition-[width] duration-300 ease-out",
            emphasis ? "bg-chart-green" : "bg-slate-500"
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function PlanRow({
  plan,
  maxMonthly,
  maxTotal,
  publicService,
  selected,
  onSelect,
}: {
  plan: RankedPlan;
  maxMonthly: number;
  maxTotal: number;
  publicService: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { estimate: e, isTopPick, isLowestPayment, isLowestInterest } = plan;
  const meta = PLAN_META[e.id];
  const [open, setOpen] = useState(false);
  const panelId = `plan-${e.id}`;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        selected && "border-navy ring-1 ring-navy"
      )}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl font-bold text-slate-900">
            {meta.name}
          </h3>
          {selected && <Badge tone="brand">✓ Your plan</Badge>}
          {isTopPick && !selected && <Badge tone="accent">Our pick</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-slate-700">{meta.tagline}</p>

        {e.monthlyPayment === null && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm leading-relaxed text-slate-800">
              This plan is priced off what you earn, not what you owe. Add your
              yearly income and we will work out the payment.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                const el = document.getElementById("income");
                el?.scrollIntoView({ block: "center" });
                el?.focus({ preventScroll: true });
              }}
            >
              Add my income
            </Button>
          </div>
        )}

        {e.monthlyPayment !== null && (
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 sm:gap-6">
          <Measure
            label={e.id === "graduated" ? "Per month, to start" : "Per month"}
            value={e.monthlyPayment}
            max={maxMonthly}
            emphasis={selected || (isTopPick && !selected)}
          />
          <Measure
            label={`In total, over ${years(e.years)}`}
            value={e.totalPaid}
            max={maxTotal}
            emphasis={selected || (isTopPick && !selected)}
          />
        </div>
        )}

        {(isLowestPayment || isLowestInterest) && e.monthlyPayment !== null && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {/* Graduated's figure is a STARTING payment that steps up every two
                years. Badging it "lowest monthly payment" against level plans
                would compare unlike things on the one number a cash-strapped
                borrower is most likely to act on. */}
            {isLowestPayment && (
              <Badge tone="neutral">
                {e.id === "graduated"
                  ? "Lowest starting payment"
                  : "Lowest monthly payment"}
              </Badge>
            )}
            {isLowestInterest && (
              <Badge tone="neutral">Least interest overall</Badge>
            )}
          </div>
        )}

        {/* Why this was not the pick. The point is to let someone disagree
            with us on the merits instead of trusting the badge. */}
        {plan.whyNot && e.monthlyPayment !== null && (
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            {plan.whyNot}
          </p>
        )}

        {publicService && e.pslf !== "counts" && (
          <Notice tone="warn" className="mt-3.5" title="Watch this one">
            {e.pslfNote}
          </Notice>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {e.monthlyPayment !== null && (
            <Button
              size="sm"
              variant={selected ? "primary" : "secondary"}
              onClick={onSelect}
              aria-pressed={selected}
            >
              {selected ? "✓ This is my plan" : `Use ${meta.name} as my plan`}
            </Button>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-navy",
              "transition-colors hover:bg-brand-light",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
            )}
          >
            <Chevron open={open} />
            {open ? "Hide the detail" : "How this plan works"}
          </button>
        </div>

        {open && (
          <div id={panelId} className="mt-4 space-y-4">
            <p className="text-base leading-relaxed text-slate-800">
              {meta.summary}
            </p>

            <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-slate-600">Interest you would pay</dt>
                <dd className="text-base font-bold text-slate-900">
                  {e.totalInterest === null ? "—" : <Money value={e.totalInterest} />}
                </dd>
              </div>
              <div>
                <dt className="text-slate-600">How long</dt>
                <dd className="tnum text-base font-bold text-slate-900">
                  {years(e.years)}
                </dd>
              </div>
            </dl>

            {e.forgivenAmount > 1 && (
              <p className="rounded-2xl bg-brand-light px-4 py-3 text-sm leading-relaxed text-slate-800">
                <strong>
                  <Money value={e.forgivenAmount} />
                </strong>{" "}
                would still be left after {e.forgivenessYears} years and gets
                forgiven. Outside of PSLF, a forgiven balance counts as taxable
                income the year it is cancelled.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <PslfBadge plan={plan} />
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{e.pslfNote}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Eyebrow className="text-emerald-800">Good</Eyebrow>
                <ul className="mt-1.5 space-y-1.5">
                  {meta.pros.map((p) => (
                    <li
                      key={p}
                      className="flex gap-2 text-sm leading-snug text-slate-800"
                    >
                      <span aria-hidden className="text-emerald-700">+</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Eyebrow className="text-amber-800">Bad</Eyebrow>
                <ul className="mt-1.5 space-y-1.5">
                  {meta.cons.map((c) => (
                    <li
                      key={c}
                      className="flex gap-2 text-sm leading-snug text-slate-800"
                    >
                      <span aria-hidden className="text-amber-800">−</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function PlansPanel({ loans, profile, onSelectPlan }: Props) {
  if (!loans.length) return null;

  const ctx = buildContext(loans, profile);
  const estimates = estimatePlans(ctx);
  const { ranked, topPickReason } = rankPlans(estimates, ctx);
  const postLoans = loans.filter(isPostCutoff);
  const open = ranked.filter((r) => r.estimate.eligible);
  const closed = ranked.filter((r) => !r.estimate.eligible);
  const top = ranked.find((r) => r.isTopPick);
  const rapOpen = open.some((r) => r.estimate.id === "rap");

  const maxMonthly = Math.max(
    1,
    ...open.map((r) => r.estimate.monthlyPayment ?? 0)
  );
  const maxTotal = Math.max(1, ...open.map((r) => r.estimate.totalPaid ?? 0));

  return (
    <div className="space-y-5">
      {(ctx.postCutoff || ctx.parentPlus) && (
        <div className="space-y-3">
          {ctx.postCutoff && (
            <Notice tone="warn" title="One date decided this">
              {ctx.parentPlus
                ? POST_CUTOFF_WARNING_PARENT_PLUS
                : POST_CUTOFF_WARNING}
              <div className="mt-1.5 font-semibold">
                The loan{postLoans.length > 1 ? "s" : ""} that did it:{" "}
                {postLoans.map((l) => l.nickname).join(", ")}.
              </div>
            </Notice>
          )}
          {ctx.parentPlus && (
            <Notice tone="warn" title="Parent PLUS loans have fewer options">
              {PARENT_PLUS_NOTE}
            </Notice>
          )}
        </div>
      )}

      {top && top.estimate.monthlyPayment !== null && (
        <FadeIn>
          <div className="rounded-3xl bg-navy p-5 text-white shadow-lift sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">
              Where we would start
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-4xl font-bold leading-none sm:text-5xl">
                {PLAN_META[top.estimate.id].name}
              </h2>
              <p className="text-base text-white/90">
                <span className="amt figure text-3xl font-bold text-white">
                  <Money value={top.estimate.monthlyPayment} tabular={false} />
                </span>{" "}
                a month{top.estimate.id === "graduated" && ", to start"}
              </p>
            </div>
            <p className="mt-4 text-base leading-relaxed text-white/95">
              {topPickReason}
            </p>
            <div className="mt-5">
              {profile.selectedPlan === top.estimate.id ? (
                <p className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-white/15 px-5 text-base font-semibold">
                  ✓ This is your plan
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectPlan(top.estimate.id)}
                  className="inline-flex min-h-[48px] items-center rounded-full bg-white px-5 text-base font-semibold text-navy transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                >
                  Use {PLAN_META[top.estimate.id].name} as my plan
                </button>
              )}
            </div>
            <p className="mt-5 border-t border-white/25 pt-4 text-sm leading-relaxed text-white/85">
              An estimate, not financial advice. Your servicer sets your
              actual payment.
            </p>
          </div>
        </FadeIn>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="font-display text-2xl font-bold text-slate-900">
            {open.length === 1
              ? "The one plan open to you"
              : `All ${open.length} plans open to you`}
          </h2>
          <p className="text-sm text-slate-600">
            {open.length} of 6 federal plans
          </p>
        </div>
        {open.length > 1 && (
          <p className="mt-1 px-1 text-sm leading-relaxed text-slate-700">
            A smaller payment each month usually means paying more in total.
            The bars show both, so you can see the trade.
          </p>
        )}
        <div className="mt-3 space-y-3">
          {open.map((p, i) => (
            <FadeIn key={p.estimate.id} delay={0.03 * i}>
              <PlanRow
                plan={p}
                maxMonthly={maxMonthly}
                maxTotal={maxTotal}
                publicService={ctx.publicService}
                selected={profile.selectedPlan === p.estimate.id}
                onSelect={() => onSelectPlan(p.estimate.id)}
              />
            </FadeIn>
          ))}
        </div>
      </div>

      {/* Closed plans stay fully legible. Muting them to the point of
          unreadability hides information the borrower may need to argue with. */}
      {closed.length > 0 && (
        <Card className="border-dashed bg-slate-50/60 p-5 shadow-none sm:p-6">
          <h2 className="font-display text-xl font-bold text-slate-900">
            {closed.length} plan{closed.length === 1 ? "" : "s"} not open to you
          </h2>
          <ul className="mt-3 space-y-3">
            {closed.map((p) => (
              <li key={p.estimate.id}>
                <p className="text-base font-semibold text-slate-900">
                  {PLAN_META[p.estimate.id].name}
                </p>
                <p className="text-sm leading-relaxed text-slate-700">
                  {p.estimate.ineligibleReason}
                  {p.estimate.id === "tiered_standard" &&
                    rapOpen &&
                    " RAP, the other plan created in 2026, is open to you and is in the list above."}
                </p>
              </li>
            ))}
          </ul>
          {closed.some((p) => p.estimate.id === "tiered_standard") && (
            <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-slate-700">
              <strong className="font-semibold text-slate-900">
                The cutoff only runs one way.
              </strong>{" "}
              Taking out a new federal loan, or consolidating the ones you
              have, counts as a loan made after July 1, 2026. That would open
              Tiered Standard but close Standard, Graduated, Extended and IBR
              for every loan you hold.
            </p>
          )}
        </Card>
      )}

      {/* Secondary rules, moved below the recommendation and folded away.
          They matter, but they are not what someone opened this tab to read. */}
      <Card className="p-5 sm:p-6">
        <Disclosure summary="Two rules worth knowing about multiple loans">
          <div className="space-y-3">
            <Notice tone="info" title="One plan covers all of them">
              {SAME_PLAN_RULE}
            </Notice>
            {!ctx.postCutoff && (
              <Notice tone="good" title="All your loans predate the cutoff">
                Every loan you entered was disbursed before July 1, 2026, so the
                older {ctx.parentPlus ? "fixed plans are" : "plan menu is"} still
                open to you. Borrowing again on or after
                that date, or consolidating, would change this for your whole
                portfolio.
              </Notice>
            )}
          </div>
        </Disclosure>
      </Card>

      {/* The full "not financial advice" text lives in the page footer, which
          sits directly under this. It is not repeated here. */}
      <p className="px-1 text-sm leading-relaxed text-slate-600">
        {ASSUMPTIONS} If your situation is unusual, the people who can see your
        actual account are your loan servicer and Federal Student Aid. The
        federal{" "}
        <a
          className="font-semibold text-navy underline underline-offset-2 hover:text-navy-hover"
          href="https://studentaid.gov/loan-simulator/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Loan Simulator
        </a>{" "}
        is the authoritative model.
      </p>
    </div>
  );
}
