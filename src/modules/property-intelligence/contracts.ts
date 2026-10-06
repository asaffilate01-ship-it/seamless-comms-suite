import { z } from "zod";

export const evidenceRefSchema = z.object({
  source: z.string().min(1).max(120),
  sourceUrl: z.string().url().max(1200).optional(),
  observedAt: z.string().datetime({ offset: true }),
  confidence: z.number().min(0).max(1),
  licence: z.string().max(160).optional(),
  reference: z.string().max(240).optional(),
});

export const propertySnapshotSchema = z.object({
  propertyRef: z.string().min(1).max(200),
  postcode: z.string().trim().min(3).max(12),
  askingPrice: z.number().nonnegative().optional(),
  sellerPrice: z.number().nonnegative().optional(),
  currentValueLow: z.number().nonnegative().optional(),
  currentValueHigh: z.number().nonnegative().optional(),
  conservativeExitValue: z.number().nonnegative().optional(),
  worksCost: z.number().nonnegative().default(0),
  otherCosts: z.number().nonnegative().default(0),
  vacancyMonths: z.number().nonnegative().optional(),
  evidence: z.array(evidenceRefSchema).max(200).default([]),
});

export const dealUnderwritingSchema = z.object({
  purchasePrice: z.number().nonnegative(),
  conservativeExitValue: z.number().nonnegative(),
  worksCost: z.number().nonnegative().default(0),
  otherCosts: z.number().nonnegative().default(0),
  investorProfitTarget: z.number().nonnegative().default(0),
  proposedFee: z.number().nonnegative().default(0),
});

export type DealUnderwritingInput = z.infer<typeof dealUnderwritingSchema>;

export function underwriteDeal(input: DealUnderwritingInput) {
  const value = dealUnderwritingSchema.parse(input);
  const feeHeadroom = Math.max(
    0,
    value.conservativeExitValue -
      value.purchasePrice -
      value.worksCost -
      value.otherCosts -
      value.investorProfitTarget,
  );
  const investorBufferAfterFee = feeHeadroom - value.proposedFee;
  return {
    acquisitionSubtotal: round(value.purchasePrice + value.proposedFee),
    feeHeadroom: round(feeHeadroom),
    investorBufferAfterFee: round(investorBufferAfterFee),
    viableAtProposedFee: investorBufferAfterFee >= 0,
  };
}

export type VacancySignal = {
  key: string;
  weight: number;
  confidence: number;
  present: boolean;
  evidenceRef?: string;
};

export function scoreVacancy(signals: VacancySignal[]) {
  const valid = signals.filter(
    (signal) =>
      Number.isFinite(signal.weight) &&
      signal.weight > 0 &&
      signal.confidence >= 0 &&
      signal.confidence <= 1,
  );
  const totalWeight = valid.reduce((sum, signal) => sum + signal.weight, 0);
  if (!totalWeight) return { probability: 0, classification: "unknown" as const };
  const score =
    valid.reduce(
      (sum, signal) =>
        sum + (signal.present ? signal.weight * signal.confidence : 0),
      0,
    ) / totalWeight;
  const probability = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return {
    probability,
    classification:
      probability >= 80
        ? ("highly_likely" as const)
        : probability >= 55
          ? ("possible" as const)
          : ("unknown" as const),
  };
}

export type BuyerMatchInput = {
  buyerRef: string;
  maxBudget: number;
  areas: string[];
  strategies: string[];
  fundingReady: boolean;
  completionDays?: number;
};

export function rankBuyerMatches(
  property: { postcode: string; acquisitionSubtotal: number; strategy?: string; completionDays?: number },
  buyers: BuyerMatchInput[],
) {
  const outcode = property.postcode.trim().toUpperCase().split(/\s+/)[0];
  return buyers
    .map((buyer) => {
      const reasons: string[] = [];
      let score = 0;
      if (buyer.maxBudget >= property.acquisitionSubtotal) {
        score += 40;
        reasons.push("budget");
      }
      if (buyer.areas.some((area) => outcode.startsWith(area.trim().toUpperCase()))) {
        score += 25;
        reasons.push("area");
      }
      if (!property.strategy || buyer.strategies.includes(property.strategy)) {
        score += 20;
        reasons.push("strategy");
      }
      if (buyer.fundingReady) {
        score += 10;
        reasons.push("funding");
      }
      if (
        property.completionDays &&
        buyer.completionDays &&
        buyer.completionDays <= property.completionDays
      ) {
        score += 5;
        reasons.push("timescale");
      }
      return { buyerRef: buyer.buyerRef, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.buyerRef.localeCompare(b.buyerRef));
}

const round = (value: number) => Math.round(value * 100) / 100;
