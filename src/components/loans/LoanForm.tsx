"use client";

// Cense Loan Desk — add / edit a loan. Created with Claude Code.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loan, LoanKind, SERVICERS, LOAN_KIND_LABELS, CUTOFF } from "@/types";
import { suggestRate } from "@/data/seed";
import { uid } from "@/lib/utils";
import { Button, Field, Notice, inputClass } from "@/components/shared/ui";

interface Props {
  initial?: Loan | null;
  onSave: (loan: Loan) => void;
  onCancel: () => void;
}

const BLANK = {
  nickname: "",
  servicer: "Nelnet",
  kind: "direct_sub" as LoanKind,
  principal: "",
  balance: "",
  rate: "",
  disbursementDate: "",
  minPayment: "",
};

export default function LoanForm({ initial, onSave, onCancel }: Props) {
  const [f, setF] = useState(() =>
    initial
      ? {
          nickname: initial.nickname,
          servicer: initial.servicer,
          kind: initial.kind,
          principal: String(initial.principal || ""),
          balance: String(initial.balance || ""),
          rate: String(initial.rate || ""),
          disbursementDate: initial.disbursementDate,
          minPayment: initial.minPayment ? String(initial.minPayment) : "",
        }
      : BLANK
  );
  const [touched, setTouched] = useState(false);

  // Offer the published rate for the award year the date falls in. It is a
  // suggestion, never an overwrite of something the borrower typed.
  const [rateHint, setRateHint] = useState<number | null>(null);
  useEffect(() => {
    setRateHint(suggestRate(f.disbursementDate));
  }, [f.disbursementDate]);

  const set = (k: keyof typeof BLANK, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const num = (s: string) => {
    const n = Number(String(s).replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : 0;
  };

  const balance = num(f.balance);
  const rate = num(f.rate);
  const errors: string[] = [];
  if (!f.nickname.trim()) errors.push("Give the loan a name you will recognize.");
  if (balance <= 0) errors.push("Enter the current balance.");
  if (rate <= 0 || rate > 25) errors.push("Enter an interest rate between 0 and 25.");
  if (!f.disbursementDate) errors.push("Enter the disbursement date.");

  const isPost = f.disbursementDate && f.disbursementDate >= CUTOFF;
  const valid = errors.length === 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const principal = num(f.principal) || balance;
    onSave({
      id: initial?.id ?? uid(),
      nickname: f.nickname.trim(),
      servicer: f.servicer,
      kind: f.kind,
      subsidy: f.kind === "direct_sub" ? "subsidized" : "unsubsidized",
      principal,
      balance,
      rate,
      disbursementDate: f.disbursementDate,
      minPayment: num(f.minPayment),
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="rounded-2xl border border-navy bg-white p-4 shadow-sm sm:p-5"
    >
      <h3 className="text-sm font-bold text-slate-900">
        {initial ? "Edit loan" : "Add a loan"}
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Everything here is on your loan&apos;s page at studentaid.gov under My Aid.
      </p>

      <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
        <Field label="Name it" hint="e.g. Junior unsubsidized" htmlFor="nickname">
          <input
            id="nickname"
            className={inputClass}
            value={f.nickname}
            onChange={(e) => set("nickname", e.target.value)}
            placeholder="Junior unsubsidized"
          />
        </Field>

        <Field label="Servicer" htmlFor="servicer">
          <select
            id="servicer"
            className={inputClass}
            value={f.servicer}
            onChange={(e) => set("servicer", e.target.value)}
          >
            {SERVICERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Loan type" htmlFor="kind">
          <select
            id="kind"
            className={inputClass}
            value={f.kind}
            onChange={(e) => set("kind", e.target.value)}
          >
            {(
              Object.keys(LOAN_KIND_LABELS) as LoanKind[]
            ).map((k) => (
              <option key={k} value={k}>
                {LOAN_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Disbursement date"
          hint="The day the money reached your school"
          htmlFor="disb"
        >
          <input
            id="disb"
            type="date"
            className={inputClass}
            value={f.disbursementDate}
            onChange={(e) => set("disbursementDate", e.target.value)}
          />
        </Field>

        <Field
          label="Current balance"
          hint="What you owe today"
          htmlFor="balance"
        >
          <input
            id="balance"
            inputMode="decimal"
            className={`${inputClass} tnum`}
            value={f.balance}
            onChange={(e) => set("balance", e.target.value)}
            placeholder="2256"
          />
        </Field>

        <Field
          label="Original principal"
          hint="Optional. Defaults to the balance."
          htmlFor="principal"
        >
          <input
            id="principal"
            inputMode="decimal"
            className={`${inputClass} tnum`}
            value={f.principal}
            onChange={(e) => set("principal", e.target.value)}
            placeholder="2000"
          />
        </Field>

        <Field
          label="Interest rate"
          hint={
            rateHint !== null
              ? `Undergrad rate for that award year was ${rateHint}%`
              : "As a percentage, e.g. 6.53"
          }
          htmlFor="rate"
        >
          <div className="flex gap-2">
            <input
              id="rate"
              inputMode="decimal"
              className={`${inputClass} tnum`}
              value={f.rate}
              onChange={(e) => set("rate", e.target.value)}
              placeholder="6.53"
            />
            {rateHint !== null && num(f.rate) !== rateHint && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-shrink-0"
                onClick={() => set("rate", String(rateHint))}
              >
                Use {rateHint}%
              </Button>
            )}
          </div>
        </Field>

        <Field
          label="Minimum monthly payment"
          hint="Optional. Leave blank if you are not in repayment yet."
          htmlFor="minp"
        >
          <input
            id="minp"
            inputMode="decimal"
            className={`${inputClass} tnum`}
            value={f.minPayment}
            onChange={(e) => set("minPayment", e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      {isPost && (
        <Notice tone="warn" title="This loan changes your options" className="mt-4">
          Disbursed on or after July 1, 2026. Under 34 CFR 685.210, a single loan
          on this side of the date limits your whole portfolio to RAP and Tiered
          Standard, including loans you took out earlier.
        </Notice>
      )}

      {f.kind === "parent_plus" && (
        <Notice tone="warn" title="Parent PLUS loans have fewer options" className="mt-4">
          Parent PLUS loans cannot be repaid under IBR or RAP (34 CFR
          685.209(d)). If you consolidated them, this tool shows only the
          plans it can confirm. A consolidation loan may also qualify for ICR
          or IBR, depending on when you consolidated and which plan you have
          paid under, so confirm with your servicer or studentaid.gov.
        </Notice>
      )}

      {touched && errors.length > 0 && (
        <Notice tone="danger" title="Still needed" className="mt-4">
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="mt-4 flex gap-2">
        <Button type="submit">{initial ? "Save changes" : "Add loan"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </motion.form>
  );
}
