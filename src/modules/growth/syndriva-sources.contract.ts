import { z } from "zod";
import type { StudioEvidence } from "./studio.types";

export type SyndrivaGrowthSource = {
  listingId: string;
  title: string;
  vendorName: string;
  priceMinor: string | null;
  currency: string;
  inventoryTracked: boolean;
  availableQuantity: string | null;
  evidenceId: string | null;
  evidenceRevision: number | null;
  validUntil: string | null;
  current: boolean;
};
export type SyndrivaGrowthSourcePage = {
  available: boolean;
  message: string;
  items: SyndrivaGrowthSource[];
  hasMore: boolean;
  nextOffset: number | null;
};
export type SyndrivaGrowthImport = {
  listingId: string;
  created: boolean;
  changed: boolean;
  replayed: boolean;
  evidence: StudioEvidence;
};

const scope = z.object({ tenantId: z.string().uuid(), brandId: z.string().uuid() });
export const syndrivaGrowthSourcesSchema = scope.extend({
  offset: z.number().int().min(0).max(10000).default(0),
}).strict();
export const importSyndrivaGrowthSourceSchema = scope.extend({ listingId: z.string().uuid() }).strict();
