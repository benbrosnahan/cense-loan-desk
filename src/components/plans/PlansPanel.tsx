"use client";

// Cense Loan Desk — eligibility, recommendation and plan comparison.
// Created with Claude Code.

import { Loan, PlanId, Profile, RankedPlan } from "@/types";
import {
  ASSUMPTIONS,
  NOT_ADVICE,
  PARENT_PLUS_NOTE,
  PLAN_META,
  POST_CUTOFF_WARNING,
  POST_CUTOFF_WARNING_PARENT_PLUS,
  SAME_PLAN_RULE,
} from "@/data/plans";
import { buildContext, estimatePlans, isPostCutoff, rankPlans } from "@/lib/calc";
import { cn, money, years } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  Disclosure,
  FadeIn,
  Notice,
  Stat,
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

function PlanCard({
  plan,
  publicService,
  selected,
  onSelect,
}: {
  plan: RankedPlan;
  publicService: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { estimate: e, isTopPick, isLowestPayment, isLowestInterest } = plan;
  const meta = PLAN_META[e.id];

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow",
        isTopPick && "border-navy ring-1 ring-navy",
        selected && !isTopPick && "border-accent ring-1 ring-accent",
        // Unavailable plans stay fully legible. Muting them to the point of
        // unreadability hides information the borrower may need to argue with.
        !e.eligible && "border-dashed bg-slate-50",
        e.eligible && "hover:shadow-md"
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">{meta.name}</h3>
            {isTopPick && <Badge tone="brand">Top pick</Badge>}
            {selected && !isTopPick && <Badge tone="accent">Your plan</Badge>}
            {!e.eligible && <Badge tone="neutral">Not available to you</Badge>}
          </div>
          <PslfBadge plan={plan} />
        </div>

        <p className="mt-1 text-xs text-slate-600">{meta.tagline}</p>

        {e.eligible && (isLowestPayment || isLowestInterest) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {/* Graduated's figure is a STARTING payment that steps up every two
                years. Badging it "lowest monthly payment" against level plans
                would compare unlike things on the one number a cash-strapped
                borrower is most likely to act on. */}
            {isLowestPayment && (
              <Badge tone="accent">
                {e.id === "graduated"
                  ? "Lowest starting payment"
                  : "Lowest monthly payment"}
              </Badge>
            )}
            {isLowestInterest && <Badge tone="accent">Least interest overall</Badge>}
          </div>
        )}

        {e.eligible ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Monthly"
                value={e.monthlyPayment === null ? "—" : money(e.monthlyPayment)}
                sub={e.id === "graduated" ? "starting payment" : undefined}
              />
              <Stat label="Term" value={years(e.years)} />
              <Stat
                label="Total paid"
                value={e.totalPaid === null ? "—" : money(e.totalPaid)}
              />
              <Stat
                label="Interest"
                value={e.totalInterest === null ? "—" : money(e.totalInterest)}
              />
            </div>

            {e.forgivenAmount > 1 && (
              <p className="mt-3 rounded-lg bg-brand-light px-3 py-2 text-[11px] leading-relaxed text-slate-800">
                <strong className="tnum">{money(e.forgivenAmount)}</strong> would
                still be left after {e.forgivenessYears} years and gets forgiven.
                Outside of PSLF, a forgiven balance counts as taxable income the
                year it is cancelled.
              </p>
            )}

            {e.monthlyPayment === null && (
              <p className="mt-3 text-[11px] text-slate-600">
                Add your income above to estimate this one. It is priced off what
                you earn, not what you owe.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-xs font-semibold text-slate-700">
            {e.ineligibleReason}
          </p>
        )}

        {/* Why this was not the pick. The point is to let someone disagree
            with us on the merits instead of trusting the badge. */}
        {plan.whyNot && (
          <p className="mt-3 text-xs leading-relaxed text-slate-700">
            {plan.whyNot}
          </p>
        )}

        {publicService && e.eligible && e.pslf !== "counts" && (
          <Notice tone="warn" className="mt-3" title="Watch this one">
            {e.pslfNote}
          </Notice>
        )}

        <Disclosure summary="What this plan is" className="mt-3">
          <p className="text-xs leading-relaxed text-slate-700">{meta.summary}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-700">
            {e.pslfNote}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                Good
              </p>
              <ul className="mt-1 space-y-1">
                {meta.pros.map((p) => (
                  <li key={p} className="text-[11px] leading-relaxed text-slate-700">
                    • {p}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Bad
              </p>
              <ul className="mt-1 space-y-1">
                {meta.cons.map((c) => (
                  <li key={c} className="text-[11px] leading-relaxed text-slate-700">
                    • {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Disclosure>

        {e.eligible && (
          <div className="mt-3.5 border-t border-line pt-3.5">
            <Button
              size="sm"
              variant={selected ? "primary" : "secondary"}
              onClick={onSelect}
              aria-pressed={selected}
            >
              {selected ? "✓ This is my plan" : "Use this as my plan"}
            </Button>
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
  const eligibleCount = estimates.filter((e) => e.eligible).length;
  const top = ranked.find((r) => r.isTopPick);

  return (
    <div className="space-y-4">
      <FadeIn>
        <Card className="p-4 sm:p-5">
          <Stat
            label="Repayment plans you qualify for"
            value={
              <>
                {eligibleCount}
                <span className="ml-1 text-base font-medium text-slate-600">
                  of 6
                </span>
              </>
            }
            hero
          />

          {ctx.postCutoff && (
            <Notice tone="warn" title="One date decided this" className="mt-4">
              {ctx.parentPlus ? POST_CUTOFF_WARNING_PARENT_PLUS : POST_CUTOFF_WARNING}
              <div className="mt-1.5 font-semibold">
                The loan{postLoans.length > 1 ? "s" : ""} that did it:{" "}
                {postLoans.map((l) => l.nickname).join(", ")}.
              </div>
            </Notice>
          )}

          {ctx.parentPlus && (
            <Notice tone="warn" title="Parent PLUS loans have fewer options" className="mt-4">
              {PARENT_PLUS_NOTE}
            </Notice>
          )}
        </Card>
      </FadeIn>

      {top && top.estimate.monthlyPayment !== null && (
        <FadeIn delay={0.05}>
          <Card className="border-navy bg-brand-light p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-navy">
              Where we would start
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {PLAN_META[top.estimate.id].name}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-800">
              {topPickReason}
            </p>
            <p className="mt-3 border-t border-brand-border pt-3 text-[11px] leading-relaxed text-slate-700">
              {NOT_ADVICE} If your situation is unusual, the people who can see
              your actual account are your loan servicer and Federal Student Aid.
            </p>
          </Card>
        </FadeIn>
      )}

      <div className="space-y-3">
        {ranked.map((p, i) => (
          <FadeIn key={p.estimate.id} delay={0.04 * i}>
            <PlanCard
              plan={p}
              publicService={ctx.publicService}
              selected={profile.selectedPlan === p.estimate.id}
              onSelect={() => onSelectPlan(p.estimate.id)}
            />
          </FadeIn>
        ))}
      </div>

      {/* Secondary rules, moved below the recommendation and folded away.
          They matter, but they are not what someone opened this tab to read. */}
      <Card className="p-4 sm:p-5">
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

      <p className="text-[11px] leading-relaxed text-slate-600">
        {ASSUMPTIONS} Your servicer sets your actual payment, and the federal{" "}
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
