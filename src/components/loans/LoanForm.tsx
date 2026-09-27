"use client";

// Cense Loan Desk — add / edit a loan. Created with Claude Code.
//
// Built around one finding from the interviews: tools lose students by asking
// for numbers they do not have in front of them. So the form asks for as
// little as it can, fills in what it is able to work out (the published rate
// for that school year, a name), and says where each remaining number lives
// on studentaid.gov using the same words that site uses.

import { useEffect, useRef, useState } from "react";
import {
  CUTOFF,
  LOAN_KIND_HINTS,
  LOAN_KIND_SHORT,
  Loan,
  LoanKind,
  SERVICERS,
  SERVICER_UNKNOWN,
} from "@/types";
import { SCHOOL_YEARS, suggestRate } from "@/data/seed";
import {
  cn,
  formatDollarsInput,
  parseNumber,
  scrollBehavior,
  uid,
} from "@/lib/utils";
import {
  AffixInput,
  Button,
  ChoiceGroup,
  Disclosure,
  Field,
  Notice,
  inputClass,
} from "@/components/shared/ui";

export interface LoanDefaults {
  servicer?: string;
  kind?: LoanKind;
  disbursementDate?: string;
}

interface Props {
  initial?: Loan | null;
  /** Carried over from the loan just saved, when adding several in a row. */
  defaults?: LoanDefaults;
  onSave: (loan: Loan, opts: { addAnother: boolean }) => void;
  onCancel: () => void;
}

type FieldKey = "disbursementDate" | "balance" | "rate";

const KIND_OPTIONS = (Object.keys(LOAN_KIND_SHORT) as LoanKind[]).map((k) => ({
  value: k,
  label: LOAN_KIND_SHORT[k],
}));

const isUndergrad = (k: LoanKind) => k === "direct_sub" || k === "direct_unsub";

/** "2024–25" for any date, using the July 1 award-year boundary. */
function schoolYearLabel(iso: string): string {
  if (!iso) return "";
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  if (!y || !m) return "";
  const start = m >= 7 ? y : y - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, "0")}`;
}

function autoName(iso: string, kind: LoanKind): string {
  const year = schoolYearLabel(iso);
  const type = isUndergrad(kind)
    ? LOAN_KIND_SHORT[kind].toLowerCase()
    : LOAN_KIND_SHORT[kind];
  return [year, type].filter(Boolean).join(" ");
}

export default function LoanForm({ initial, defaults, onSave, onCancel }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const [f, setF] = useState(() => {
    if (initial) {
      return {
        nickname: initial.nickname,
        servicer: initial.servicer,
        kind: initial.kind,
        principal: initial.principal
          ? formatDollarsInput(String(initial.principal))
          : "",
        balance: initial.balance
          ? formatDollarsInput(String(initial.balance))
          : "",
        rate: String(initial.rate || ""),
        disbursementDate: initial.disbursementDate,
        minPayment: initial.minPayment
          ? formatDollarsInput(String(initial.minPayment))
          : "",
      };
    }
    const kind = defaults?.kind ?? ("direct_sub" as LoanKind);
    const date = defaults?.disbursementDate ?? "";
    const suggested = isUndergrad(kind) ? suggestRate(date) : null;
    return {
      nickname: "",
      servicer: defaults?.servicer ?? SERVICER_UNKNOWN,
      kind,
      principal: "",
      balance: "",
      rate: suggested !== null ? String(suggested) : "",
      disbursementDate: date,
      minPayment: "",
    };
  });

  // True while the rate on screen is one we filled in, not one they typed.
  // Only an auto-filled rate is ever replaced when the year or type changes.
  const [rateIsAuto, setRateIsAuto] = useState(
    () => !initial && f.rate !== ""
  );
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    disbursementDate: false,
    balance: false,
    rate: false,
  });
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: scrollBehavior(),
      block: "start",
    });
    // Land keyboard and screen reader users on the form, not at the page top.
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus({
      preventScroll: true,
    });
    // Runs once per mount: the form is remounted for each new loan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  /** Re-suggest the rate whenever the things it depends on change. */
  const syncRate = (date: string, kind: LoanKind) => {
    if (f.rate !== "" && !rateIsAuto) return;
    const suggested = isUndergrad(kind) ? suggestRate(date) : null;
    if (suggested !== null) {
      set("rate", String(suggested));
      setRateIsAuto(true);
    } else if (rateIsAuto) {
      set("rate", "");
      setRateIsAuto(false);
    }
  };

  const setDate = (date: string) => {
    set("disbursementDate", date);
    syncRate(date, f.kind);
  };
  const setKind = (kind: LoanKind) => {
    set("kind", kind);
    syncRate(f.disbursementDate, kind);
  };

  const balance = parseNumber(f.balance);
  const rate = parseNumber(f.rate);

  const errors: Record<FieldKey, string | null> = {
    disbursementDate: f.disbursementDate
      ? null
      : "Pick the school year, or enter the date below.",
    balance: balance > 0 ? null : "Enter what you owe on this loan today.",
    rate:
      rate > 0 && rate <= 25
        ? null
        : "Enter the interest rate, a number between 0 and 25.",
  };
  const show = (k: FieldKey) => (tried || touched[k] ? errors[k] : null);
  const valid = !errors.disbursementDate && !errors.balance && !errors.rate;

  const isPost = f.disbursementDate && f.disbursementDate >= CUTOFF;
  const suggested = isUndergrad(f.kind) ? suggestRate(f.disbursementDate) : null;
  const yearLabel = schoolYearLabel(f.disbursementDate);
  const pickedYear = SCHOOL_YEARS.find((y) => y.date === f.disbursementDate);

  const submit = (addAnother: boolean) => {
    setTried(true);
    if (!valid) {
      // Send focus to the first problem rather than leaving them to hunt.
      const first = (
        ["disbursementDate", "balance", "rate"] as FieldKey[]
      ).find((k) => errors[k]);
      const id =
        first === "disbursementDate" ? "disb" : first === "balance" ? "balance" : "rate";
      formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
      return;
    }
    const principal = parseNumber(f.principal) || balance;
    onSave(
      {
        id: initial?.id ?? uid(),
        nickname: f.nickname.trim() || autoName(f.disbursementDate, f.kind),
        servicer: f.servicer,
        kind: f.kind,
        subsidy: f.kind === "direct_sub" ? "subsidized" : "unsubsidized",
        principal,
        balance,
        rate,
        disbursementDate: f.disbursementDate,
        minPayment: parseNumber(f.minPayment),
      },
      { addAnother }
    );
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      noValidate
      aria-labelledby="loanform-title"
      className="unfold scroll-mt-24 rounded-3xl border-2 border-navy bg-white p-5 shadow-lift sm:p-7"
    >
      <h3
        id="loanform-title"
        tabIndex={-1}
        data-autofocus
        className="font-display text-2xl font-bold leading-tight text-slate-900 focus:outline-none"
      >
        {initial ? "Edit this loan" : "Add a loan"}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">
        Find these on{" "}
        <a
          href="https://studentaid.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-navy underline underline-offset-2 hover:text-navy-hover"
        >
          studentaid.gov
        </a>{" "}
        under <strong>My Aid</strong>. Each loan has its own row.
      </p>

      <div className="mt-6 space-y-6">
        {/* ---- When ---- */}
        <fieldset>
          <legend className="text-sm font-bold text-slate-900">
            Which school year was it for?
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SCHOOL_YEARS.map((y) => {
              const active = y.date === f.disbursementDate;
              return (
                <button
                  key={y.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDate(y.date);
                    setTouched((t) => ({ ...t, disbursementDate: true }));
                  }}
                  className={cn(
                    "tnum min-h-[44px] rounded-full border px-4 text-sm font-semibold transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-slate-300 bg-white text-slate-900 hover:border-navy hover:bg-slate-100"
                  )}
                >
                  {y.label}
                </button>
              );
            })}
          </div>

          <Field
            className="mt-3"
            label="Date it was paid out"
            htmlFor="disb"
            error={show("disbursementDate")}
            hint={
              pickedYear
                ? "We used September 1. If studentaid.gov shows a different disbursement date, change it here."
                : "Called the disbursement date on studentaid.gov."
            }
          >
            <input
              id="disb"
              type="date"
              className={inputClass}
              value={f.disbursementDate}
              aria-invalid={!!show("disbursementDate")}
              aria-describedby="disb-msg"
              onChange={(e) => setDate(e.target.value)}
              onBlur={() =>
                setTouched((t) => ({ ...t, disbursementDate: true }))
              }
            />
          </Field>
        </fieldset>

        {/* ---- Type ---- */}
        <div>
          <p className="text-sm font-bold text-slate-900">What type is it?</p>
          <ChoiceGroup
            className="mt-2"
            label="Loan type"
            value={f.kind}
            options={KIND_OPTIONS}
            onChange={setKind}
            columns={2}
          />
          <p className="mt-2 text-sm leading-snug text-slate-700" aria-live="polite">
            {LOAN_KIND_HINTS[f.kind]}
          </p>
        </div>

        {/* ---- The two numbers ---- */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="What you owe on it today"
            htmlFor="balance"
            error={show("balance")}
            hint="Called the current balance or outstanding balance."
          >
            <AffixInput
              id="balance"
              prefix="$"
              inputMode="decimal"
              autoComplete="off"
              value={f.balance}
              placeholder="0"
              aria-invalid={!!show("balance")}
              aria-describedby="balance-msg"
              onChange={(e) =>
                set("balance", formatDollarsInput(e.target.value))
              }
              onBlur={() => setTouched((t) => ({ ...t, balance: true }))}
            />
          </Field>

          <Field
            label="Interest rate"
            htmlFor="rate"
            error={show("rate")}
            hint={
              rateIsAuto && suggested !== null ? (
                <>
                  We filled in the published undergraduate rate for {yearLabel}.
                  Change it if yours is different.
                </>
              ) : suggested !== null && rate !== suggested ? (
                <>
                  The published undergraduate rate for {yearLabel} was{" "}
                  {suggested}%.{" "}
                  <button
                    type="button"
                    className="font-semibold text-navy underline underline-offset-2 hover:text-navy-hover"
                    onClick={() => {
                      set("rate", String(suggested));
                      setRateIsAuto(true);
                    }}
                  >
                    Use {suggested}%
                  </button>
                </>
              ) : (
                "Federal rates are fixed, so this never changes."
              )
            }
          >
            <AffixInput
              id="rate"
              suffix="%"
              inputMode="decimal"
              autoComplete="off"
              value={f.rate}
              placeholder="0.00"
              aria-invalid={!!show("rate")}
              aria-describedby="rate-msg"
              onChange={(e) => {
                set("rate", e.target.value.replace(/[^\d.]/g, "").slice(0, 6));
                setRateIsAuto(false);
              }}
              onBlur={() => setTouched((t) => ({ ...t, rate: true }))}
            />
          </Field>
        </div>

        <Field
          label="Who do you pay?"
          htmlFor="servicer"
          hint="Your loan servicer, the company that sends the bill. Fine to leave this for later."
        >
          <select
            id="servicer"
            className={inputClass}
            value={f.servicer}
            aria-describedby="servicer-msg"
            onChange={(e) => set("servicer", e.target.value)}
          >
            {/* Keep a value that is no longer in the list, so editing an old
                loan never silently rewrites who services it. */}
            {!(SERVICERS as readonly string[]).includes(f.servicer) && (
              <option value={f.servicer}>{f.servicer}</option>
            )}
            {SERVICERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Disclosure
          summary="Add more detail"
          openSummary="Hide the extra detail"
          defaultOpen={
            !!initial &&
            (!!initial.minPayment || initial.principal !== initial.balance)
          }
        >
          <div className="grid gap-5 pb-1 pt-2 sm:grid-cols-2">
            <Field
              label="Name"
              htmlFor="nickname"
              optional
              hint={
                f.disbursementDate
                  ? `Leave blank and we will call it "${autoName(
                      f.disbursementDate,
                      f.kind
                    )}".`
                  : "Anything that helps you recognize it."
              }
              className="sm:col-span-2"
            >
              <input
                id="nickname"
                className={inputClass}
                value={f.nickname}
                autoComplete="off"
                aria-describedby="nickname-msg"
                onChange={(e) => set("nickname", e.target.value)}
              />
            </Field>

            <Field
              label="Amount you first borrowed"
              htmlFor="principal"
              optional
              hint="Lets us show how much of the balance is interest."
            >
              <AffixInput
                id="principal"
                prefix="$"
                inputMode="decimal"
                autoComplete="off"
                value={f.principal}
                placeholder="0"
                aria-describedby="principal-msg"
                onChange={(e) =>
                  set("principal", formatDollarsInput(e.target.value))
                }
              />
            </Field>

            <Field
              label="Minimum monthly payment"
              htmlFor="minp"
              optional
              hint="Skip this if you are not in repayment yet."
            >
              <AffixInput
                id="minp"
                prefix="$"
                inputMode="decimal"
                autoComplete="off"
                value={f.minPayment}
                placeholder="0"
                aria-describedby="minp-msg"
                onChange={(e) =>
                  set("minPayment", formatDollarsInput(e.target.value))
                }
              />
            </Field>
          </div>
        </Disclosure>
      </div>

      {isPost && (
        <Notice tone="warn" title="This loan changes your options" className="mt-5">
          Disbursed on or after July 1, 2026. Under 34 CFR 685.210, a single loan
          on this side of the date limits your whole portfolio to RAP and Tiered
          Standard, including loans you took out earlier.
        </Notice>
      )}

      {f.kind === "parent_plus" && (
        <Notice tone="warn" title="Parent PLUS loans have fewer options" className="mt-5">
          Parent PLUS loans cannot be repaid under IBR or RAP (34 CFR
          685.209(d)). If you consolidated them, this tool shows only the
          plans it can confirm. A consolidation loan may also qualify for ICR
          or IBR, depending on when you consolidated and which plan you have
          paid under, so confirm with your servicer or studentaid.gov.
        </Notice>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="submit">{initial ? "Save changes" : "Save loan"}</Button>
        {!initial && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => submit(true)}
          >
            Save and add another
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
