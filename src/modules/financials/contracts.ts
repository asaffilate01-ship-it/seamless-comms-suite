export type Money = {
  amountMinor: number;
  currency: string;
};

export type FinancialPeriod = {
  start: string;
  end: string;
  currency: string;
};

export type FinancialActual = {
  id: string;
  tenantId: string;
  productKey: string;
  locationId?: string | null;
  period: FinancialPeriod;
  category: string;
  kind: "revenue" | "cost" | "refund" | "discount" | "fee" | "payout" | "tax" | "other";
  amount: Money;
  sourceRef: string;
  sourceEventId?: string | null;
  observedAt: string;
};

export type BudgetLine = {
  id: string;
  tenantId: string;
  period: FinancialPeriod;
  category: string;
  budget: Money;
  ownerUserId?: string | null;
};

export type ForecastLine = {
  id: string;
  tenantId: string;
  period: FinancialPeriod;
  category: string;
  forecast: Money;
  basis: "manual" | "run_rate" | "model" | "scenario";
  assumptions: string[];
  modelRunId?: string | null;
};

export type UnitEconomics = {
  tenantId: string;
  productKey: string;
  period: FinancialPeriod;
  revenue: Money;
  directCosts: Money;
  contribution: Money;
  units: number;
  revenuePerUnitMinor: number | null;
  contributionPerUnitMinor: number | null;
};

export type BenefitRecord = {
  id: string;
  tenantId: string;
  name: string;
  category: "cash_saving" | "cost_avoidance" | "revenue" | "working_capital" | "productivity" | "risk";
  baselineRef: string;
  actualRef?: string | null;
  proposedValue?: Money | null;
  reviewedValue?: Money | null;
  status: "proposed" | "measuring" | "review_required" | "reviewed" | "rejected";
  ownerUserId?: string | null;
  financeReviewerId?: string | null;
};

export const FINANCIAL_EVENT_TYPES = {
  actualRecorded: "financial.actual.recorded",
  budgetChanged: "financial.budget.changed",
  forecastChanged: "financial.forecast.changed",
  varianceCalculated: "financial.variance.calculated",
  benefitReviewed: "financial.benefit.reviewed",
} as const;
