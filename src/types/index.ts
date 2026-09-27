// Cense Loan Desk — domain model. Created with Claude Code.

export type LoanSubsidy = "subsidized" | "unsubsidized";

/** Federal loan kinds a Loan Desk user actually holds. Private loans are out of scope. */
export type LoanKind = "direct_sub" | "direct_unsub" | "grad_plus" | "parent_plus";

export type PlanId =
  | "standard"
  | "graduated"
  | "extended"
  | "ibr"
  | "tiered_standard"
  | "rap";

/**
 * The single most consequential field in the tool.
 *
 * Under 34 CFR 685.210(a)(1)(ii), a borrower with any Direct Loan made on or
 * after July 1, 2026 may select only the Tiered Standard plan or RAP. And
 * because 685.210(a)(3) requires all of a borrower's Direct Loans to be repaid
 * together under one plan, a single post-cutoff loan reclassifies the entire
 * portfolio.
 */
export const CUTOFF = "2026-07-01";

export interface Loan {
  id: string;
  nickname: string;
  servicer: string;
  kind: LoanKind;
  subsidy: LoanSubsidy;
  principal: number;
  balance: number;
  /** Annual rate as a percentage, e.g. 6.53 means 6.53%. */
  rate: number;
  /** ISO yyyy-mm-dd. Compared against CUTOFF. */
  disbursementDate: string;
  /** Minimum monthly payment, if known. 0 = unknown. */
  minPayment: number;
}

export type Strategy = "avalanche" | "snowball";

export interface RankedLoan {
  loan: Loan;
  rank: number;
  reason: string;
}

/**
 * Whether payments on a plan earn Public Service Loan Forgiveness credit.
 *
 * Deliberately three states, not a boolean. Under 34 CFR 685.219(b)(28) a
 * non-income-driven plan qualifies when the monthly payment is "not less than"
 * the 10-year Standard payment, so for fixed plans this depends on the
 * borrower's own numbers rather than on the plan's name.
 */
export type PslfStatus = "counts" | "partial" | "does_not_count";

export type Goal = "lowest_payment" | "least_total" | "forgiveness" | "unsure";

export type Employment = "government" | "nonprofit" | "private" | "unsure";

export interface PlanEstimate {
  id: PlanId;
  name: string;
  eligible: boolean;
  /** Null when the plan needs income the borrower has not supplied. */
  monthlyPayment: number | null;
  totalPaid: number | null;
  totalInterest: number | null;
  years: number;
  pslf: PslfStatus;
  /** Plain-language explanation of the PSLF status, computed per borrower. */
  pslfNote: string;
  forgivenessYears: number | null;
  /** Balance written off at the end of an income-driven term. 0 for fixed plans. */
  forgivenAmount: number;
  /** Set when ineligible, explaining exactly why. */
  ineligibleReason?: string;
}

/** A ranked plan plus the reason it was or was not the pick. */
export interface RankedPlan {
  estimate: PlanEstimate;
  isTopPick: boolean;
  isLowestPayment: boolean;
  isLowestInterest: boolean;
  /** Why this plan was not chosen. Empty on the top pick. */
  whyNot: string;
}

export interface Snapshot {
  /** ISO timestamp. */
  takenAt: string;
  loans: Loan[];
  totalBalance: number;
}

export interface LoanDiffRow {
  nickname: string;
  servicer: string;
  field: "balance" | "rate";
  before: number | null;
  after: number | null;
  kind: "changed" | "added" | "removed";
}

export interface Profile {
  /** Annual gross income. 0 = not supplied, which hides income-driven estimates. */
  income: number;
  householdSize: number;
  employment: Employment;
  goal: Goal;
  /** Extra dollars per month above the required payment. */
  extraPerMonth: number;
  /** The plan the borrower has chosen or is modelling. Null until they pick. */
  selectedPlan: PlanId | null;
}

export const DEFAULT_PROFILE: Profile = {
  income: 0,
  householdSize: 1,
  employment: "unsure",
  goal: "unsure",
  // Starts at zero on purpose. A pre-filled amount anchors what people pay.
  extraPerMonth: 0,
  selectedPlan: null,
};

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  direct_sub: "Direct Subsidized",
  direct_unsub: "Direct Unsubsidized",
  grad_plus: "Grad PLUS",
  parent_plus: "Parent PLUS",
};

/**
 * Employer categories, kept to four on purpose.
 *
 * Grounded in 34 CFR 685.219(b)(27), which defines a qualifying employer as a
 * US federal, state, local or Tribal government entity; a public child or
 * family service agency; a 501(c)(3); a Tribal college or university; or a
 * nonprofit providing a qualifying public service that is not a business
 * organized for profit, a labor union, or a partisan political organization.
 */
export const EMPLOYMENT_LABELS: Record<Employment, string> = {
  government: "Government",
  nonprofit: "Nonprofit",
  private: "Private sector",
  unsure: "Not sure",
};

export const EMPLOYMENT_HINTS: Record<Employment, string> = {
  government: "Federal, state, local, or Tribal, including the military.",
  nonprofit: "A 501(c)(3), or a nonprofit doing qualifying public service.",
  private: "A company organized to make a profit.",
  unsure: "We will leave forgiveness out of the recommendation.",
};

export const GOAL_LABELS: Record<Goal, string> = {
  lowest_payment: "Lowest monthly payment",
  least_total: "Pay the least overall",
  forgiveness: "Going for forgiveness",
  unsure: "I do not know yet",
};

export const GOAL_HINTS: Record<Goal, string> = {
  lowest_payment: "Cash flow is tight and the monthly number matters most.",
  least_total: "You can afford more now to hand over less in the end.",
  forgiveness: "You want the balance cancelled after qualifying payments.",
  unsure: "We will recommend on total cost, which is the safe default.",
};

/** Shown when the borrower has not looked up who services a loan yet. */
export const SERVICER_UNKNOWN = "Not sure yet";

export const SERVICERS = [
  "Nelnet",
  "MOHELA",
  "Aidvantage",
  "EdFinancial",
  "ECSI",
  "Default Resolution Group",
  "Other",
  SERVICER_UNKNOWN,
] as const;

/** What each loan type means, in one sentence a first-time borrower can use. */
export const LOAN_KIND_HINTS: Record<LoanKind, string> = {
  direct_sub:
    "The government covers the interest while you are in school at least half-time and during your grace period.",
  direct_unsub:
    "Interest starts building the day the money is paid out, including while you are in school.",
  grad_plus: "Borrowed by a graduate or professional student.",
  parent_plus: "Borrowed by a parent to pay for their child's education.",
};

export const LOAN_KIND_SHORT: Record<LoanKind, string> = {
  direct_sub: "Subsidized",
  direct_unsub: "Unsubsidized",
  grad_plus: "Grad PLUS",
  parent_plus: "Parent PLUS",
};
