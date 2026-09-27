"use client";

// Cense Loan Desk — main view. Created with Claude Code.
//
// The page is a sequence, not a menu: your loans, then a plan, then what extra
// money does, then a record. Every section ends by pointing at the next one.
// That order came out of the student interviews, where the consistent ask was
// one next step rather than a dashboard.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROFILE,
  EMPLOYMENT_HINTS,
  EMPLOYMENT_LABELS,
  Employment,
  GOAL_HINTS,
  GOAL_LABELS,
  Goal,
  Loan,
  PlanId,
  Profile,
  SERVICER_UNKNOWN,
  Snapshot,
} from "@/types";
import { SEED_LOANS } from "@/data/seed";
import {
  NO_LATE_FEES_NOTE,
  NOT_ADVICE,
  PLAN_META,
  PRIVACY_NOTE,
} from "@/data/plans";
import {
  anyParentPlus,
  anyPostCutoff,
  buildContext,
  estimatePlans,
  totalBalance,
  totalPrincipal,
} from "@/lib/calc";
import {
  loanStore,
  makeSnapshot,
  profileStore,
  snapshotStore,
} from "@/lib/storage";
import { exportLoans } from "@/lib/export";
import { cn, formatWholeDollars, parseNumber, scrollBehavior } from "@/lib/utils";
import {
  AffixInput,
  Button,
  Card,
  ChoiceGroup,
  Disclosure,
  Eyebrow,
  FadeIn,
  Field,
  Money,
  NextStep,
  Notice,
  Toast,
  ToastState,
  inputClass,
} from "@/components/shared/ui";
import LoanForm, { LoanDefaults } from "@/components/loans/LoanForm";
import LoanList from "@/components/loans/LoanList";
import PlansPanel from "@/components/plans/PlansPanel";
import RankingPanel from "@/components/ranking/RankingPanel";
import HistoryPanel from "@/components/history/HistoryPanel";

type Tab = "loans" | "plans" | "order" | "history";

const TABS: { id: Tab; label: string; long: string }[] = [
  { id: "loans", label: "Loans", long: "Your loans" },
  { id: "plans", label: "Plans", long: "Repayment plans" },
  { id: "order", label: "Payoff", long: "Payoff" },
  { id: "history", label: "Records", long: "Records" },
];

const HIDE_KEY = "cense.loandesk.hideAmounts.v1";

const isExample = (loans: Loan[]) =>
  loans.length > 0 && loans.every((l) => l.id.startsWith("seed-"));

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.8" />
      <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" />
    </svg>
  );
}

export default function Page() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [tab, setTab] = useState<Tab>("loans");
  const [editing, setEditing] = useState<Loan | null>(null);
  const [adding, setAdding] = useState(false);
  // Bumped after "Save and add another", so the form remounts clean.
  const [formKey, setFormKey] = useState(0);
  const [formDefaults, setFormDefaults] = useState<LoanDefaults>({});
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busyExport, setBusyExport] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  // First run is deliberately empty. Someone arriving from the newsletter
  // should see their own situation, not a demo they have to clear out first.
  useEffect(() => {
    setLoans(loanStore.load() ?? []);
    setProfile(profileStore.load());
    setSnapshots(snapshotStore.load());
    try {
      setHideAmounts(window.localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      // Private mode. The toggle still works for this visit.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) loanStore.save(loans);
  }, [loans, hydrated]);
  useEffect(() => {
    if (hydrated) profileStore.save(profile);
  }, [profile, hydrated]);
  useEffect(() => {
    if (hydrated) snapshotStore.save(snapshots);
  }, [snapshots, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(HIDE_KEY, hideAmounts ? "1" : "0");
    } catch {
      // Nothing to do.
    }
  }, [hideAmounts, hydrated]);

  // A toast that offers Undo stays long enough to read and reach.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 7000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const say = useCallback(
    (message: string, action?: ToastState["action"]) =>
      setToast({ message, action }),
    []
  );

  const balance = useMemo(() => totalBalance(loans), [loans]);
  const principal = useMemo(() => totalPrincipal(loans), [loans]);
  const postCutoff = useMemo(() => anyPostCutoff(loans), [loans]);
  const parentPlus = useMemo(() => anyParentPlus(loans), [loans]);
  const servicerCount = useMemo(
    () =>
      new Set(
        loans.map((l) => l.servicer).filter((s) => s !== SERVICER_UNKNOWN)
      ).size,
    [loans]
  );
  // Derived from the same engine the Plans tab uses. Hardcoding "5 of 6" here
  // disagreed with the Plans tab whenever Extended was out on the $30k floor.
  const estimates = useMemo(
    () => (loans.length ? estimatePlans(buildContext(loans, profile)) : []),
    [loans, profile]
  );
  const eligiblePlanCount = estimates.filter((e) => e.eligible).length;
  const selectedEstimate =
    estimates.find(
      (e) => e.id === profile.selectedPlan && e.eligible && e.monthlyPayment !== null
    ) ?? null;

  const goTo = (next: Tab) => {
    setTab(next);
    setAdding(false);
    setEditing(null);
    // Start the new section at its top, below the sticky bar.
    requestAnimationFrame(() =>
      sectionRef.current?.scrollIntoView({
        behavior: scrollBehavior(),
        block: "start",
      })
    );
  };

  const saveLoan = (loan: Loan, opts: { addAnother: boolean }) => {
    const isNew = !loans.some((l) => l.id === loan.id);
    setLoans((prev) => {
      // The first real loan replaces the example set rather than joining it.
      const current = isNew && isExample(prev) ? [] : prev;
      const i = current.findIndex((l) => l.id === loan.id);
      if (i === -1) return [...current, loan];
      const next = [...current];
      next[i] = loan;
      return next;
    });
    setEditing(null);

    if (opts.addAnother) {
      // Most students get a subsidized and an unsubsidized loan each year, so
      // the likeliest next entry is the other half of the same year.
      setFormDefaults({
        servicer: loan.servicer,
        kind: loan.kind === "direct_sub" ? "direct_unsub" : loan.kind,
        disbursementDate:
          loan.kind === "direct_sub" ? loan.disbursementDate : "",
      });
      setFormKey((k) => k + 1);
      setAdding(true);
      say(`Saved ${loan.nickname}`);
    } else {
      setFormDefaults({ servicer: loan.servicer });
      setAdding(false);
      say(isNew ? `Saved ${loan.nickname}` : "Changes saved");
    }
  };

  const deleteLoan = (id: string) => {
    const before = loans;
    const gone = loans.find((l) => l.id === id);
    setLoans((prev) => prev.filter((l) => l.id !== id));
    if (editing?.id === id) setEditing(null);
    say(`Removed ${gone?.nickname ?? "loan"}`, {
      label: "Undo",
      run: () => setLoans(before),
    });
  };

  const clearLoans = () => {
    const before = loans;
    setLoans([]);
    setTab("loans");
    say("All loans cleared", { label: "Undo", run: () => setLoans(before) });
  };

  const clearSnapshots = () => {
    const before = snapshots;
    setSnapshots([]);
    say("Records cleared", { label: "Undo", run: () => setSnapshots(before) });
  };

  const saveSnapshot = () => {
    setSnapshots((prev) => [...prev, makeSnapshot(loans)]);
    say("Snapshot saved");
  };

  const doExport = async () => {
    setBusyExport(true);
    try {
      await exportLoans(loans);
    } finally {
      setBusyExport(false);
    }
  };

  const startAdding = () => {
    setEditing(null);
    setFormKey((k) => k + 1);
    setAdding(true);
  };

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-page">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <div className="h-7 w-32 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-8 h-44 animate-pulse rounded-3xl bg-slate-200/70" />
        </div>
      </main>
    );
  }

  const empty = loans.length === 0;
  const example = isExample(loans);
  const interest = Math.max(0, balance - principal);

  return (
    <main
      className={cn(
        "min-h-screen bg-page pb-28",
        hideAmounts && "amounts-hidden"
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-navy focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-5 sm:px-6 sm:pt-7">
        <div className="flex flex-shrink-0 items-baseline gap-1.5 whitespace-nowrap">
          {/* accent-hover, not accent: #C1652E on the page is under the 4.5:1
              AA minimum at this size. #A8531F clears it. */}
          <span className="font-display text-lg font-bold text-accent-hover sm:text-xl">
            Cense
          </span>
          <h1 className="font-display text-lg font-bold text-slate-900 sm:text-xl">
            Loan Desk
          </h1>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-light px-3 py-1.5 text-xs font-semibold text-slate-800">
            <LockIcon />
            <span className="sm:hidden">On your device</span>
            <span className="hidden sm:inline">Stays on this device</span>
          </span>
          {!empty && (
            <button
              type="button"
              aria-pressed={hideAmounts}
              onClick={() => setHideAmounts((v) => !v)}
              className="no-print flex h-11 w-11 items-center justify-center rounded-full text-slate-800 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
            >
              <EyeIcon off={hideAmounts} />
              <span className="sr-only">Hide dollar amounts</span>
            </button>
          )}
        </div>
      </header>

      <div id="main" className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* ---------- First run ---------- */}
        {empty && (
          <div className="rise pt-10 sm:pt-16">
            <h2 className="text-balance font-display text-[2.3rem] font-bold leading-[1.04] tracking-tight text-slate-900 sm:text-6xl">
              Every loan you have, on one screen.
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-lg leading-relaxed text-slate-700">
              Four years of school usually means eight separate federal loans,
              and nowhere that shows them together. Add yours once to see what
              you owe, which repayment plans you can actually use, and what
              extra money would change.
            </p>

            {!adding && (
              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                <Button onClick={startAdding}>Add my first loan</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoans(SEED_LOANS);
                    window.scrollTo({ top: 0 });
                    say("Example loans loaded");
                  }}
                >
                  Look around with example loans
                </Button>
              </div>
            )}

            {adding ? (
              <div className="mt-8">
                <LoanForm
                  key={formKey}
                  initial={null}
                  defaults={formDefaults}
                  onSave={saveLoan}
                  onCancel={() => setAdding(false)}
                />
              </div>
            ) : (
              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <Card className="p-5">
                  <Eyebrow>What you will need</Eyebrow>
                  <p className="mt-2 text-base leading-relaxed text-slate-800">
                    For each loan: what you owe, the interest rate, and the date
                    it was paid out. All three are at{" "}
                    <a
                      href="https://studentaid.gov"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-navy underline underline-offset-2 hover:text-navy-hover"
                    >
                      studentaid.gov
                    </a>{" "}
                    under <strong>My Aid</strong>.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Not near your login? Start with the example loans and swap
                    in your own numbers later.
                  </p>
                </Card>
                <Card className="p-5">
                  <Eyebrow>What stays private</Eyebrow>
                  <p className="mt-2 text-base leading-relaxed text-slate-800">
                    All of it. There is no account and no server. What you type
                    is saved in this browser and goes nowhere else.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Nothing here is for sale, and nothing is trying to
                    refinance you.
                  </p>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ---------- Summary ---------- */}
        {!empty && (
          <FadeIn>
            {example && (
              <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  These are example loans, not yours.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    goTo("loans");
                    startAdding();
                  }}
                  className="min-h-[40px] rounded-full text-sm font-bold text-amber-900 underline underline-offset-4 hover:text-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-800 focus-visible:ring-offset-2"
                >
                  Add my own
                </button>
              </div>
            )}

            <section aria-label="Summary" className="pt-7 sm:pt-10">
              <Eyebrow>You owe</Eyebrow>
              <p className="figure mt-1 text-[3.5rem] font-bold leading-none text-slate-900 sm:text-7xl">
                <Money value={balance} tabular={false} />
              </p>
              <p className="mt-2 text-base text-slate-700">
                across {loans.length} loan{loans.length === 1 ? "" : "s"}
                {servicerCount > 0 &&
                  ` with ${servicerCount} servicer${
                    servicerCount === 1 ? "" : "s"
                  }`}
                {selectedEstimate && (
                  <>
                    {" · "}
                    <strong className="font-semibold text-slate-900">
                      <Money value={selectedEstimate.monthlyPayment} /> a month
                    </strong>{" "}
                    on {PLAN_META[selectedEstimate.id].name}
                  </>
                )}
              </p>

              {interest > 0 && (
                <div className="mt-5 max-w-md">
                  {/* 2px gaps in the page colour separate the two parts; no
                      borders drawn around either. */}
                  <div className="amt-chart flex h-3 gap-0.5 overflow-hidden rounded-full">
                    <div
                      className="bg-chart-green"
                      style={{ width: `${(principal / balance) * 100}%` }}
                    />
                    <div className="flex-1 bg-chart-orange" />
                  </div>
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-chart-green" />
                      <dt>Borrowed</dt>
                      <dd className="font-semibold text-slate-900">
                        <Money value={principal} />
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-chart-orange" />
                      <dt>Interest added so far</dt>
                      <dd className="font-semibold text-slate-900">
                        <Money value={interest} />
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </section>
          </FadeIn>
        )}

        {/* ---------- Section bar ---------- */}
        {!empty && (
          <div
            ref={sectionRef}
            className="no-print sticky top-0 z-30 -mx-4 mt-7 scroll-mt-0 bg-page/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6"
          >
            <nav
              aria-label="Sections"
              className="grid grid-cols-4 gap-1 rounded-full border border-line bg-white p-1 shadow-card"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => goTo(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={cn(
                    "min-h-[44px] rounded-full px-1 text-sm font-semibold transition-colors sm:text-base",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-1",
                    tab === t.id
                      ? "bg-navy text-white"
                      : "text-slate-800 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <span className="sm:hidden">{t.label}</span>
                  <span className="hidden sm:inline">{t.long}</span>
                  {t.id === "history" && snapshots.length > 0 && (
                    <span className="tnum ml-1 opacity-75">
                      {snapshots.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        )}

        {!empty && (
          <div className="mt-4">
            <div key={tab} className="rise">
              {/* ---------- Loans ---------- */}
              {tab === "loans" && (
                <div className="space-y-5">
                  {postCutoff && (
                    <Notice tone="warn" title="Check this before anything else">
                      At least one loan was disbursed on or after July 1, 2026.
                      {parentPlus
                        ? " That limits your entire portfolio to RAP and Tiered Standard, and Parent PLUS loans cannot use RAP, so they are limited to Tiered Standard."
                        : " That limits your entire portfolio to RAP and Tiered Standard."}{" "}
                      Open Plans to see what is left.
                    </Notice>
                  )}
                  {parentPlus && (
                    <Notice tone="warn" title="Parent PLUS loans have fewer options">
                      Parent PLUS loans cannot be repaid under IBR or RAP. If you
                      consolidated them, your options depend on when and which
                      plan you have paid under. Open Plans for details, and
                      confirm with your servicer or studentaid.gov.
                    </Notice>
                  )}

                  {(adding || editing) && (
                    <LoanForm
                      key={editing ? editing.id : `new-${formKey}`}
                      initial={editing}
                      defaults={formDefaults}
                      onSave={saveLoan}
                      onCancel={() => {
                        setAdding(false);
                        setEditing(null);
                      }}
                    />
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2 px-1">
                      <h2 className="font-display text-2xl font-bold text-slate-900">
                        {loans.length === 1
                          ? "Your loan"
                          : `Your ${loans.length} loans`}
                      </h2>
                      {!adding && !editing && (
                        <Button size="sm" className="no-print" onClick={startAdding}>
                          Add a loan
                        </Button>
                      )}
                    </div>
                    {/* Works at any count. The old copy said "four years
                        usually means eight", which invited "so why do I have
                        seven?" from anyone whose number was different. */}
                    <p className="mt-1 px-1 text-sm leading-relaxed text-slate-700">
                      {loans.length === 1
                        ? "If you were in school more than a year, there are probably more at studentaid.gov. Most people get a separate loan each year."
                        : "They all move together on one repayment plan, but they do not all cost the same."}
                    </p>
                    <div className="mt-3">
                      <LoanList
                        loans={loans}
                        onEdit={(l) => {
                          setAdding(false);
                          setEditing(l);
                        }}
                        onDelete={deleteLoan}
                      />
                    </div>
                  </div>

                  <NextStep
                    title="See which repayment plans you can use"
                    body={`${eligiblePlanCount} of the 6 federal plans are open to you.`}
                    action="Go to repayment plans"
                    onClick={() => goTo("plans")}
                  />

                  <Notice tone="info" title="Missing a payment does not cost a late fee">
                    {NO_LATE_FEES_NOTE}
                  </Notice>

                  <Card className="no-print p-5">
                    <Eyebrow>Keep a copy</Eyebrow>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={doExport}
                        disabled={busyExport}
                      >
                        {busyExport ? "Preparing…" : "Download as a spreadsheet"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => window.print()}
                      >
                        Print one page
                      </Button>
                    </div>
                    <Disclosure summary="Clear my data" className="mt-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button size="sm" variant="danger" onClick={clearLoans}>
                          Clear every loan
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={clearSnapshots}
                          disabled={!snapshots.length}
                        >
                          Clear saved records
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        This removes the data from this browser. It was never
                        anywhere else.
                      </p>
                    </Disclosure>
                  </Card>
                </div>
              )}

              {/* ---------- Plans ---------- */}
              {tab === "plans" && (
                <div className="space-y-5">
                  <Card className="p-5 sm:p-7">
                    <h2 className="font-display text-2xl font-bold leading-tight text-slate-900">
                      Four questions, so the plans fit you
                    </h2>
                    <p className="mt-1.5 text-base leading-relaxed text-slate-700">
                      Rough answers are fine. Skip any you are not sure about.
                    </p>

                    <div className="mt-6 space-y-6">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          What matters most to you?
                        </p>
                        <ChoiceGroup
                          className="mt-2"
                          label="What matters most to you?"
                          value={profile.goal}
                          onChange={(goal: Goal) =>
                            setProfile((p) => ({ ...p, goal }))
                          }
                          options={(Object.keys(GOAL_LABELS) as Goal[]).map(
                            (k) => ({ value: k, label: GOAL_LABELS[k] })
                          )}
                        />
                        <p className="mt-2 text-sm text-slate-600" aria-live="polite">
                          {GOAL_HINTS[profile.goal]}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Who do you work for, or expect to?
                        </p>
                        <ChoiceGroup
                          className="mt-2"
                          label="Who do you work for?"
                          value={profile.employment}
                          onChange={(employment: Employment) =>
                            setProfile((p) => ({ ...p, employment }))
                          }
                          options={(
                            Object.keys(EMPLOYMENT_LABELS) as Employment[]
                          ).map((k) => ({
                            value: k,
                            label: EMPLOYMENT_LABELS[k],
                          }))}
                        />
                        <p className="mt-2 text-sm text-slate-600" aria-live="polite">
                          {EMPLOYMENT_HINTS[profile.employment]}
                        </p>
                      </div>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field
                          label="Yearly income, before tax"
                          hint="Leave blank if you are not earning yet. We will skip the plans priced off income."
                          htmlFor="income"
                        >
                          <AffixInput
                            id="income"
                            prefix="$"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-describedby="income-msg"
                            value={
                              profile.income
                                ? profile.income.toLocaleString("en-US")
                                : ""
                            }
                            placeholder="0"
                            onChange={(e) =>
                              setProfile((p) => ({
                                ...p,
                                income: parseNumber(
                                  formatWholeDollars(e.target.value)
                                ),
                              }))
                            }
                          />
                        </Field>

                        <Field
                          label="People in your household"
                          hint="You, plus anyone you claim as a dependent."
                          htmlFor="household"
                        >
                          <select
                            id="household"
                            className={inputClass}
                            aria-describedby="household-msg"
                            value={profile.householdSize}
                            onChange={(e) =>
                              setProfile((p) => ({
                                ...p,
                                householdSize: Number(e.target.value),
                              }))
                            }
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                              <option key={n} value={n}>
                                {n === 1 ? "Just me" : `${n} people`}
                                {n === 8 ? " or more" : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </div>
                  </Card>

                  <PlansPanel
                    loans={loans}
                    profile={profile}
                    onSelectPlan={(id: PlanId) => {
                      setProfile((p) => ({ ...p, selectedPlan: id }));
                      say(`${PLAN_META[id].name} is now your plan`);
                    }}
                  />

                  {selectedEstimate ? (
                    <NextStep
                      title="See your debt-free date"
                      body="And what paying a little extra each month would change."
                      action="Go to payoff"
                      onClick={() => goTo("order")}
                    />
                  ) : (
                    <p className="rounded-3xl border border-dashed border-slate-300 px-5 py-4 text-center text-sm text-slate-700">
                      Choose a plan above and your debt-free date comes next.
                    </p>
                  )}
                </div>
              )}

              {/* ---------- Payoff ---------- */}
              {tab === "order" && (
                <div className="space-y-5">
                  <RankingPanel
                    loans={loans}
                    profile={profile}
                    onExtraChange={(n) =>
                      setProfile((p) => ({ ...p, extraPerMonth: n }))
                    }
                    onSelectPlan={(id) =>
                      setProfile((p) => ({ ...p, selectedPlan: id }))
                    }
                    onGoToPlans={() => goTo("plans")}
                  />
                  <NextStep
                    title="Save a dated record"
                    body="Proof of what your balances were, in case one moves when it should not."
                    action="Go to records"
                    onClick={() => goTo("history")}
                  />
                </div>
              )}

              {/* ---------- Records ---------- */}
              {tab === "history" && (
                <HistoryPanel
                  loans={loans}
                  snapshots={snapshots}
                  onSaveSnapshot={saveSnapshot}
                />
              )}
            </div>
          </div>
        )}

        <footer className="mt-14 border-t border-line pt-6">
          <p className="text-sm font-semibold leading-relaxed text-slate-800">
            {PRIVACY_NOTE}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {NOT_ADVICE}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Built by{" "}
            <a
              href="https://cense.beehiiv.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-navy underline underline-offset-2 hover:text-navy-hover"
            >
              Cense
            </a>
            , a free weekly personal finance newsletter for people who did not
            get taught this.
          </p>
        </footer>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
