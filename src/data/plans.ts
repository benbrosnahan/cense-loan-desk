// Cense Loan Desk — federal repayment plan data. Created with Claude Code.
//
// Every number here is traced to a primary source. Do not "tidy" a value
// without re-checking the citation next to it.

import { PlanId } from "@/types";

/**
 * 2026 HHS poverty guidelines, 48 contiguous states + DC.
 * Source: ASPE poverty guidelines API, aspe.hhs.gov (2026 table).
 * Increment above household size 6 is a flat $5,680.
 */
export const POVERTY_2026: Record<number, number> = {
  1: 15960,
  2: 21640,
  3: 27320,
  4: 33000,
  5: 38680,
  6: 44360,
};
const POVERTY_INCREMENT = 5680;

export function getPovertyLine(householdSize: number): number {
  const n = Math.max(1, Math.floor(householdSize || 1));
  if (n <= 6) return POVERTY_2026[n];
  return POVERTY_2026[6] + (n - 6) * POVERTY_INCREMENT;
}

/**
 * Tiered Standard repayment term, set by total Direct Loan balance.
 * Source: 34 CFR 685.208(c)(1)(iii). Minimum payment $50/mo per (c)(1)(ii).
 */
export const TIERED_STANDARD_TERMS: { maxBalance: number; years: number }[] = [
  { maxBalance: 25000, years: 10 },
  { maxBalance: 50000, years: 15 },
  { maxBalance: 100000, years: 20 },
  { maxBalance: Infinity, years: 25 },
];

export const TIERED_STANDARD_MIN_PAYMENT = 50;

export function getTieredStandardYears(balance: number): number {
  return TIERED_STANDARD_TERMS.find((t) => balance < t.maxBalance)?.years ?? 25;
}

/**
 * RAP annual "base payment" brackets, keyed on adjusted gross income.
 * Source: 34 CFR 685.209(b)(2)(i)–(xi), verbatim.
 * Monthly payment is this base divided by 12, minus $50 per dependent, with a
 * $10/month floor. Source: 34 CFR 685.209(f)(5) and (g)(3)(ii).
 */
export const RAP_MIN_MONTHLY = 10;
export const RAP_DEPENDENT_CREDIT = 50;

export function rapAnnualBasePayment(agi: number): number {
  if (agi <= 10000) return 120; // flat $120/yr = $10/mo
  if (agi <= 20000) return agi * 0.01;
  if (agi <= 30000) return agi * 0.02;
  if (agi <= 40000) return agi * 0.03;
  if (agi <= 50000) return agi * 0.04;
  if (agi <= 60000) return agi * 0.05;
  if (agi <= 70000) return agi * 0.06;
  if (agi <= 80000) return agi * 0.07;
  if (agi <= 90000) return agi * 0.08;
  if (agi <= 100000) return agi * 0.09;
  return agi * 0.1;
}

/** Extended requires more than this in Direct Loans. Source: 34 CFR 685.208(e). */
export const EXTENDED_MIN_BALANCE = 30000;

export interface PlanMeta {
  name: string;
  tagline: string;
  /** One clean sentence a 20-year-old reads once and understands. */
  summary: string;
  /** True for IBR and RAP, which always earn PSLF credit under 685.219(b)(28)(i) and (v). */
  incomeDriven: boolean;
  forgivenessYears: number | null;
  /** Only available to loans disbursed on or after July 1, 2026. */
  postCutoff: boolean;
  pros: string[];
  cons: string[];
}

export const PLAN_META: Record<PlanId, PlanMeta> = {
  standard: {
    name: "Standard",
    tagline: "Fixed payment, done in 10 years",
    summary:
      "The same payment every month for 10 years, whatever you earn. The shortest term of any plan, so the least interest.",
    incomeDriven: false,
    forgivenessYears: null,
    postCutoff: false,
    pros: [
      "Least total interest of any plan",
      "Fixed payment, no annual income paperwork",
      "Always earns Public Service Loan Forgiveness credit",
    ],
    cons: [
      "Highest monthly payment of the plans open to you",
      "The payment does not drop if your income drops",
      "No forgiveness at the end unless you are going for PSLF",
    ],
  },
  graduated: {
    name: "Graduated",
    tagline: "Starts low, steps up every 2 years",
    summary:
      "Payments start at roughly half the Standard amount and rise every two years, still finishing in 10. More total interest than Standard.",
    incomeDriven: false,
    forgivenessYears: null,
    postCutoff: false,
    pros: [
      "Starts at roughly half the Standard payment",
      "Still finishes in 10 years on a predictable schedule",
    ],
    cons: [
      "Early payments are below the PSLF threshold, so those months earn no credit",
      "More total interest than Standard",
      "Payments step up every 2 years whether your income did or not",
      "The step schedule shown is a model. Regulation caps the largest payment at three times the smallest, but your servicer sets the exact steps",
    ],
  },
  extended: {
    name: "Extended",
    tagline: "Stretched up to 25 years",
    summary:
      "Fixed payments stretched over a much longer term. The monthly number drops a lot and the total interest climbs a lot. Requires more than $30,000 in Direct Loans.",
    incomeDriven: false,
    forgivenessYears: null,
    postCutoff: false,
    pros: [
      "Much lower monthly payment than Standard",
      "Predictable, with no annual paperwork",
    ],
    cons: [
      "The payment is below the PSLF threshold, so months on it earn no credit",
      "By far the most total interest of the fixed plans",
      "Only available above $30,000 in Direct Loans",
      "No forgiveness at the end",
    ],
  },
  ibr: {
    name: "IBR",
    tagline: "Payment tied to your income",
    summary:
      "Caps your payment at 10% of discretionary income, meaning what you earn above 150% of the poverty line. A low enough income means a $0 payment, and $0 still counts.",
    incomeDriven: true,
    forgivenessYears: 20,
    postCutoff: false,
    pros: [
      "Usually the lowest monthly payment",
      "A $0 payment is possible and still counts as a qualifying payment",
      "Always earns Public Service Loan Forgiveness credit",
      "Forgiveness at 20 years, 10 sooner than RAP",
    ],
    cons: [
      "Unpaid interest is added to your balance, so the balance can grow",
      "Forgiveness at 20 years counts as taxable income",
      "You have to recertify your income every year",
      "Closed to you if any loan was disbursed on or after July 1, 2026",
      "These figures assume you first borrowed after July 2014. If you had federal loans before then, IBR charges 15% of discretionary income and forgiveness takes 25 years",
    ],
  },
  tiered_standard: {
    name: "Tiered Standard",
    tagline: "Fixed payment, term set by your balance",
    summary:
      "A fixed-payment plan where your balance sets the term: 10 years under $25,000, 15 to $50,000, 20 to $100,000, 25 above that. This is what you get automatically if you never pick a plan.",
    incomeDriven: false,
    forgivenessYears: null,
    postCutoff: true,
    pros: [
      "Predictable fixed payment with no annual income paperwork",
      "One of only two plans open once any loan is disbursed on or after July 1, 2026",
    ],
    cons: [
      "Earns NO Public Service Loan Forgiveness credit, in any tier including the 10-year one",
      "No forgiveness at the end, ever",
      "A longer term means more total interest",
      "This is where you land automatically if you ignore your notice",
    ],
  },
  rap: {
    name: "RAP",
    tagline: "Income-driven, and the balance always shrinks",
    summary:
      "The Repayment Assistance Plan. Your payment is a slice of your total income, 1% to 10%, minus $50 per dependent, with a $10 monthly floor. Forgiveness after 30 years.",
    incomeDriven: true,
    forgivenessYears: 30,
    postCutoff: true,
    pros: [
      "Unpaid interest is waived instead of added to your balance",
      "At least $50 a month goes to principal, so the balance always shrinks",
      "Always earns Public Service Loan Forgiveness credit",
      "Available even if you borrowed on or after July 1, 2026",
    ],
    cons: [
      "Charges a percentage of your total income, not just income above the poverty floor",
      "Forgiveness takes 30 years, 10 longer than IBR",
      "Forgiveness at 30 years counts as taxable income",
      "You have to recertify your income every year",
    ],
  },
};

/** Plans open when every loan was disbursed before July 1, 2026. */
export const LEGACY_PLANS: PlanId[] = [
  "standard",
  "graduated",
  "extended",
  "ibr",
  "rap",
];

/** Plans open once any loan was disbursed on or after July 1, 2026. */
export const POST_CUTOFF_PLANS: PlanId[] = ["tiered_standard", "rap"];

export const PLAN_ORDER: PlanId[] = [
  "standard",
  "graduated",
  "extended",
  "ibr",
  "tiered_standard",
  "rap",
];

export const POST_CUTOFF_WARNING =
  "At least one of your loans was disbursed on or after July 1, 2026. That closes Standard, Graduated, Extended and IBR across your whole portfolio, including the loans you took out earlier. RAP and Tiered Standard are your only two options.";

export const SAME_PLAN_RULE =
  "All of your Direct Loans have to be repaid together on one plan. That is the rule in 34 CFR 685.210(a)(3), not a servicer policy. The narrow exceptions cover Parent PLUS and certain consolidation loans, not ordinary subsidized and unsubsidized loans.";

export const NO_LATE_FEES_NOTE =
  "The Department of Education does not charge late fees on Direct Loans. What missing a payment actually costs: you are delinquent the day after the due date, it is reported to the credit bureaus at 90 days, and the loan defaults at 270 days.";

export const ASSUMPTIONS =
  "Two things these estimates assume. Income-driven payments use the 2026 poverty guidelines for the 48 contiguous states and DC, so figures run low if you live in Alaska or Hawaii, where the guidelines are higher. And like the federal Loan Simulator, they hold your income flat for the whole term, which almost never happens.";

export const NOT_ADVICE =
  "These are estimates, not financial advice. The right plan depends on things this tool does not know, like whether your income is about to change or what else you owe. Your servicer sets your actual payment, and studentaid.gov is the authority on your account.";

export const PRIVACY_NOTE =
  "Everything you type stays in this browser. There is no account, no server, and no analytics. Nothing you enter is transmitted anywhere, and closing the tab does not send it either. The maths here is ordinary arithmetic run on your device, not an AI model.";
