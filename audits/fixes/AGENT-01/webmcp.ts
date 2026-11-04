// Tools for a browser agent, only where the browser offers the API. Pure arithmetic:
// the agent supplies the numbers, nothing reads this person's saved loans or writes
// to storage, and nothing leaves the page. If the API goes away this file does nothing.
import { buildContext, estimatePlans, rankPlans, requiredPaymentForPlan } from "@/lib/calc";
import { projectPayoff } from "@/lib/ranking";
import { monthYearFromNow } from "@/lib/utils";
import { NOT_ADVICE } from "@/data/plans";
import { CUTOFF, type Goal, type Employment, type Loan, type LoanKind, type PlanId, type Profile } from "@/types";

const KINDS: LoanKind[] = ["direct_sub", "direct_unsub", "grad_plus", "parent_plus"];
const LOAN_SCHEMA = {
  type: "array",
  minItems: 1,
  maxItems: 50,
  items: {
    type: "object",
    required: ["balance", "ratePercent", "disbursementDate"],
    properties: {
      balance: { type: "number", description: "What is owed today, in US dollars." },
      ratePercent: { type: "number", description: "Annual rate in percent. 6.53 means 6.53%, not 0.0653." },
      disbursementDate: { type: "string", format: "date", description: "yyyy-mm-dd. A date on or after " + CUTOFF + " changes which plans are open." },
      kind: { type: "string", enum: KINDS },
    },
  },
};
const PROFILE_PROPS = {
  income: { type: "number", description: "Yearly income before tax in US dollars. Omit if unknown: income-driven plans then have no estimate." },
  householdSize: { type: "integer", minimum: 1, maximum: 12 },
  employment: { type: "string", enum: ["government", "nonprofit", "private", "unsure"] },
};

function toLoans(raw: unknown): Loan[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error("loans must be a non-empty array");
  return raw.map((r, i) => {
    const { balance, ratePercent, disbursementDate, kind = "direct_unsub" } = r ?? {};
    if (!(Number.isFinite(balance) && balance > 0)) throw new Error(`loans[${i}].balance must be above 0`);
    if (!(Number.isFinite(ratePercent) && ratePercent >= 1 && ratePercent <= 25)) throw new Error(`loans[${i}].ratePercent must be in percent, between 1 and 25`);
    if (!/^(19|20)\d\d-\d\d-\d\d$/.test(disbursementDate)) throw new Error(`loans[${i}].disbursementDate must be yyyy-mm-dd`);
    if (!KINDS.includes(kind)) throw new Error(`loans[${i}].kind is not recognised`);
    return { id: String(i), nickname: `Loan ${i + 1}`, servicer: "", kind, subsidy: kind === "direct_sub" ? "subsidized" : "unsubsidized", principal: balance, balance, rate: ratePercent, disbursementDate, minPayment: 0 } as Loan;
  });
}
const toProfile = (i: Record<string, unknown>): Profile => ({
  income: Number(i.income) || 0,
  householdSize: Number(i.householdSize) || 1,
  employment: (i.employment as Employment) ?? "unsure",
  goal: (i.goal as Goal) ?? "unsure",
  extraPerMonth: 0,
  selectedPlan: null,
});
const reply = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify({ ...(data as object), note: NOT_ADVICE }) }],
});

export function registerLoanDeskTools(signal: AbortSignal): number {
  type Reg = { registerTool?: (tool: object, opts?: object) => unknown };
  const mc: Reg | undefined =
    (document as unknown as { modelContext?: Reg }).modelContext ??
    (navigator as unknown as { modelContext?: Reg }).modelContext;
  if (!mc?.registerTool) return 0;

  const tools = [
    {
      name: "estimate_repayment_plans",
      title: "Estimate federal repayment plans",
      description:
        "For the loans you pass in, which federal plans are open, the estimated monthly payment and total for each, PSLF credit, and the plan this tool would start with. Runs in this page. Does not read or change anything the person has saved.",
      inputSchema: {
        type: "object",
        required: ["loans"],
        properties: {
          loans: LOAN_SCHEMA,
          ...PROFILE_PROPS,
          goal: { type: "string", enum: ["lowest_payment", "least_total", "forgiveness", "unsure"] },
        },
      },
      annotations: { readOnlyHint: true },
      execute: async (input: Record<string, unknown>) => {
        const ctx = buildContext(toLoans(input.loans), toProfile(input));
        const estimates = estimatePlans(ctx);
        const { ranked, topPickReason } = rankPlans(estimates, ctx);
        return reply({
          plans: estimates.map((e) => ({
            id: e.id, name: e.name, open: e.eligible, whyClosed: e.ineligibleReason, monthlyPayment: e.monthlyPayment,
            totalPaid: e.totalPaid, years: e.years, forgiven: e.forgivenAmount, pslf: e.pslf,
          })),
          startWith: ranked.find((r) => r.isTopPick)?.estimate.id ?? null,
          why: topPickReason,
        });
      },
    },
    {
      name: "estimate_payoff",
      title: "Estimate the debt-free date",
      description:
        "For the loans you pass in, on one plan, the debt-free date and what an extra monthly amount saves. Runs in this page. Does not read or change anything the person has saved.",
      inputSchema: {
        type: "object",
        required: ["loans", "plan"],
        properties: {
          loans: LOAN_SCHEMA,
          plan: { type: "string", enum: ["standard", "graduated", "extended", "ibr", "tiered_standard", "rap"] },
          extraPerMonth: { type: "number", minimum: 0 },
          ...PROFILE_PROPS,
        },
      },
      annotations: { readOnlyHint: true },
      execute: async (input: Record<string, unknown>) => {
        const loans = toLoans(input.loans);
        const estimates = estimatePlans(buildContext(loans, toProfile(input)));
        const required = requiredPaymentForPlan(estimates, input.plan as PlanId);
        if (required === null) throw new Error(`${input.plan} is not open for these loans, or needs income`);
        const extra = Math.max(0, Number(input.extraPerMonth) || 0);
        const base = projectPayoff(loans, "avalanche", required, 0)!;
        const main = projectPayoff(loans, "avalanche", required, extra)!;
        return reply({
          requiredPayment: required, extraPerMonth: extra, reachesZero: main.paidOff,
          debtFree: main.paidOff ? monthYearFromNow(main.months) : null,
          monthsSaved: base.paidOff ? base.months - main.months : 0,
          interestSaved: base.paidOff ? base.totalInterest - main.totalInterest : 0,
        });
      },
    },
  ];
  tools.forEach((t) => mc.registerTool!(t, { signal }));
  return tools.length;
}
