"use client";

// Cense Loan Desk — main view. Created with Claude Code.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  Snapshot,
} from "@/types";
import { SEED_LOANS } from "@/data/seed";
import { NO_LATE_FEES_NOTE, NOT_ADVICE, PRIVACY_NOTE } from "@/data/plans";
import {
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
import { cn, money } from "@/lib/utils";
import {
  Button,
  Card,
  Disclosure,
  FadeIn,
  Field,
  Notice,
  Stat,
  inputClass,
} from "@/components/shared/ui";
import LoanForm from "@/components/loans/LoanForm";
import LoanList from "@/components/loans/LoanList";
import PlansPanel from "@/components/plans/PlansPanel";
import RankingPanel from "@/components/ranking/RankingPanel";
import HistoryPanel from "@/components/history/HistoryPanel";

type Tab = "loans" | "plans" | "order" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "loans", label: "Your loans" },
  { id: "plans", label: "Repayment plans" },
  { id: "order", label: "Payoff order" },
  { id: "history", label: "History" },
];

/** Thousands separators while typing, without fighting the caret. */
function formatMoneyInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

export default function Page() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [tab, setTab] = useState<Tab>("loans");
  const [editing, setEditing] = useState<Loan | null>(null);
  const [adding, setAdding] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busyExport, setBusyExport] = useState(false);

  // First run is deliberately empty. Someone arriving from the newsletter
  // should see their own situation, not a demo they have to clear out first.
  useEffect(() => {
    setLoans(loanStore.load() ?? []);
    setProfile(profileStore.load());
    setSnapshots(snapshotStore.load());
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
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const balance = useMemo(() => totalBalance(loans), [loans]);
  const principal = useMemo(() => totalPrincipal(loans), [loans]);
  const postCutoff = useMemo(() => anyPostCutoff(loans), [loans]);
  const servicerCount = useMemo(
    () => new Set(loans.map((l) => l.servicer)).size,
    [loans]
  );
  // Derived from the same engine the Plans tab uses. Hardcoding "5 of 6" here
  // disagreed with the Plans tab whenever Extended was out on the $30k floor.
  const eligiblePlanCount = useMemo(
    () =>
      loans.length
        ? estimatePlans(buildContext(loans, profile)).filter((e) => e.eligible)
            .length
        : 0,
    [loans, profile]
  );

  const saveLoan = (loan: Loan) => {
    setLoans((prev) => {
      const i = prev.findIndex((l) => l.id === loan.id);
      if (i === -1) return [...prev, loan];
      const next = [...prev];
      next[i] = loan;
      return next;
    });
    setAdding(false);
    setEditing(null);
  };

  const deleteLoan = (id: string) => {
    setLoans((prev) => prev.filter((l) => l.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const saveSnapshot = () => {
    setSnapshots((prev) => [...prev, makeSnapshot(loans)]);
    setToast("Snapshot saved");
  };

  const doExport = async () => {
    setBusyExport(true);
    try {
      await exportLoans(loans);
    } finally {
      setBusyExport(false);
    }
  };

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-page">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
        </div>
      </main>
    );
  }

  const empty = loans.length === 0;

  return (
    <main className="min-h-screen bg-page pb-20">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-navy focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {/* accent-hover, not accent: #C1652E on white is 4.06:1 at this
                  size, just under the 4.5:1 AA minimum. #A8531F clears it. */}
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent-hover">
                Cense
              </p>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                Loan Desk
              </h1>
            </div>
            <p className="max-w-xs text-[11px] leading-relaxed text-slate-600">
              Every federal loan you have, on one screen. It stays on your
              device. No account, nothing to sell you.
            </p>
          </div>
        </div>
      </header>

      <div id="main" className="mx-auto max-w-5xl px-4 sm:px-6">
        {!empty && (
          <FadeIn>
            <Card className="mt-5 p-4 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <Stat
                  label="What you owe, all loans"
                  value={money(balance)}
                  hero
                  sub={
                    balance > principal
                      ? `${money(
                          balance - principal
                        )} of that is interest that has already accrued`
                      : undefined
                  }
                />
                <div className="grid grid-cols-3 gap-5 sm:gap-8">
                  <Stat label="Loans" value={loans.length} />
                  <Stat
                    label={servicerCount === 1 ? "Servicer" : "Servicers"}
                    value={servicerCount}
                  />
                  <Stat
                    label="Plans open"
                    value={`${eligiblePlanCount} of 6`}
                  />
                </div>
              </div>

              {/* Works at any count. The old copy said "four years usually
                  means eight", which invited "so why do I have seven?" from
                  anyone whose number was different. */}
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-slate-700">
                {loans.length === 1 ? (
                  <>
                    One loan on record. If you were in school more than a year,
                    there are probably more waiting at studentaid.gov, since
                    most people get a separate loan each year.
                  </>
                ) : (
                  <>
                    <strong>{loans.length} loans on record.</strong> They will
                    all move together on one repayment plan, but they do not all
                    cost the same, which is what the other tabs are for.
                  </>
                )}
              </p>
            </Card>
          </FadeIn>
        )}

        {!empty && (
          <nav
            aria-label="Sections"
            className="no-print mt-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "min-h-[40px] flex-shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-1",
                  tab === t.id
                    ? "bg-navy text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {t.label}
                {t.id === "history" && snapshots.length > 0 && (
                  <span className="tnum ml-1.5 opacity-70">
                    {snapshots.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}

        <div className="mt-5">
          <motion.div
            key={empty ? "empty" : tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* ---------- Empty state ---------- */}
            {empty && (
              <Card className="p-6 sm:p-10">
                <div className="mx-auto max-w-lg text-center">
                  <h2 className="text-lg font-bold text-slate-900">
                    No loans entered yet
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    Log in at{" "}
                    <a
                      href="https://studentaid.gov"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-navy underline underline-offset-2 hover:text-navy-hover"
                    >
                      studentaid.gov
                    </a>{" "}
                    and open <strong>My Aid</strong>. For each loan you will need
                    the servicer, balance, interest rate, whether it is
                    subsidized, and the disbursement date.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setAdding(true)}>
                      Add your first loan
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLoans(SEED_LOANS);
                        setToast("Example loans loaded");
                      }}
                    >
                      Start with example loans
                    </Button>
                  </div>
                  <p className="mt-4 text-[11px] text-slate-600">
                    The example is a typical four-year undergraduate portfolio.
                    You can clear it any time.
                  </p>
                </div>

                {adding && (
                  <div className="mt-6">
                    <LoanForm
                      initial={null}
                      onSave={saveLoan}
                      onCancel={() => setAdding(false)}
                    />
                  </div>
                )}
              </Card>
            )}

            {/* ---------- Loans ---------- */}
            {!empty && tab === "loans" && (
              <div className="space-y-4">
                {postCutoff && (
                  <Notice tone="warn" title="Check this before anything else">
                    At least one loan was disbursed on or after July 1, 2026.
                    That limits your entire portfolio to RAP and Tiered
                    Standard. Open Repayment plans to see what is left.
                  </Notice>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    All {loans.length} loans
                  </h2>
                  <div className="no-print flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setAdding(true)}>
                      Add loan
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={doExport}
                      disabled={busyExport}
                    >
                      {busyExport ? "Preparing…" : "Download .xlsx"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => window.print()}
                    >
                      Print one-pager
                    </Button>
                  </div>
                </div>

                {(adding || editing) && (
                  <LoanForm
                    initial={editing}
                    onSave={saveLoan}
                    onCancel={() => {
                      setAdding(false);
                      setEditing(null);
                    }}
                  />
                )}

                <LoanList
                  loans={loans}
                  onEdit={(l) => {
                    setEditing(l);
                    setAdding(false);
                  }}
                  onDelete={deleteLoan}
                />

                <Notice tone="info" title="Missing a payment does not cost a late fee">
                  {NO_LATE_FEES_NOTE}
                </Notice>

                <div className="no-print pt-1">
                  <Disclosure summary="Clear my data">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setLoans([]);
                          setToast("All loans cleared");
                        }}
                      >
                        Clear every loan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSnapshots([]);
                          setToast("History cleared");
                        }}
                      >
                        Clear snapshot history
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-600">
                      This removes the data from this browser. It was never
                      anywhere else.
                    </p>
                  </Disclosure>
                </div>
              </div>
            )}

            {/* ---------- Plans ---------- */}
            {!empty && tab === "plans" && (
              <div className="space-y-4">
                <Card className="p-4 sm:p-5">
                  <p className="text-sm font-bold text-slate-900">
                    A little about you
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    Income-driven plans are priced off what you earn, not what
                    you owe. Leave these blank and we will skip those estimates.
                  </p>

                  <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                    <Field
                      label="Annual income, before tax"
                      hint="Roughly is fine. Leave at 0 if you are not earning yet."
                      htmlFor="income"
                    >
                      <div className="relative">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500"
                        >
                          $
                        </span>
                        <input
                          id="income"
                          inputMode="numeric"
                          className={cn(inputClass, "tnum pl-7")}
                          value={
                            profile.income ? profile.income.toLocaleString("en-US") : ""
                          }
                          placeholder="0"
                          onChange={(e) =>
                            setProfile((p) => ({
                              ...p,
                              income: Number(
                                formatMoneyInput(e.target.value).replace(/,/g, "")
                              ),
                            }))
                          }
                        />
                      </div>
                    </Field>

                    <Field
                      label="People in your household"
                      hint="You, plus anyone you claim as a dependent."
                      htmlFor="household"
                    >
                      <select
                        id="household"
                        className={inputClass}
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

                    <Field
                      label="Who do you work for?"
                      hint={EMPLOYMENT_HINTS[profile.employment]}
                      htmlFor="employment"
                    >
                      <select
                        id="employment"
                        className={inputClass}
                        value={profile.employment}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            employment: e.target.value as Employment,
                          }))
                        }
                      >
                        {(
                          Object.keys(EMPLOYMENT_LABELS) as Employment[]
                        ).map((k) => (
                          <option key={k} value={k}>
                            {EMPLOYMENT_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="What matters most to you?"
                      hint={GOAL_HINTS[profile.goal]}
                      htmlFor="goal"
                    >
                      <select
                        id="goal"
                        className={inputClass}
                        value={profile.goal}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            goal: e.target.value as Goal,
                          }))
                        }
                      >
                        {(Object.keys(GOAL_LABELS) as Goal[]).map((k) => (
                          <option key={k} value={k}>
                            {GOAL_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </Card>

                <PlansPanel
                  loans={loans}
                  profile={profile}
                  onSelectPlan={(id: PlanId) => {
                    setProfile((p) => ({ ...p, selectedPlan: id }));
                    setToast("Plan selected");
                  }}
                />
              </div>
            )}

            {/* ---------- Payoff order ---------- */}
            {!empty && tab === "order" && (
              <RankingPanel
                loans={loans}
                profile={profile}
                onExtraChange={(n) =>
                  setProfile((p) => ({ ...p, extraPerMonth: n }))
                }
                onSelectPlan={(id) =>
                  setProfile((p) => ({ ...p, selectedPlan: id }))
                }
                onGoToPlans={() => setTab("plans")}
              />
            )}

            {/* ---------- History ---------- */}
            {!empty && tab === "history" && (
              <HistoryPanel
                loans={loans}
                snapshots={snapshots}
                onSaveSnapshot={saveSnapshot}
              />
            )}
          </motion.div>
        </div>

        <footer className="mt-10 border-t border-line pt-5">
          <p className="text-[11px] font-semibold leading-relaxed text-slate-700">
            {PRIVACY_NOTE}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
            {NOT_ADVICE}
          </p>
          <p className="mt-2 text-[11px] text-slate-600">
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

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-5 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
