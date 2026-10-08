import { z } from "zod";

export const GROWTH_PRODUCTS = [
  { key: "omniqora", name: "Omniqora", purpose: "Campaigns, conversations and creative work" },
  { key: "syndriva", name: "Syndriva", purpose: "Commerce operations and product evidence" },
  { key: "merqora", name: "Merqora", purpose: "Marketplace campaigns and listing content" },
  { key: "affivon", name: "Affivon", purpose: "Affiliate offers and disclosed recommendations" },
] as const;

export const growthProductSchema = z.enum(["omniqora", "syndriva", "merqora", "affivon"]);
export const growthLocaleSchema = z.enum(["en", "ur", "es"]);
export const growthChannelSchema = z.enum(["social", "email", "whatsapp", "web"]);
export const growthScopeSchema = z.object({
  tenantId: z.string().uuid(),
  productKey: growthProductSchema,
});
const revision = z.number().int().positive();
const editable = { id: z.string().uuid().optional(), expectedRevision: revision.optional() };
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const saveBrandSchema = growthScopeSchema
  .extend({
    ...editable,
    name: text(1, 160),
    voice: text(3, 6000),
    offer: text(3, 6000),
    rules: z.array(text(1, 1000)).max(40).default([]),
    audience: text(3, 3000),
    locale: growthLocaleSchema,
    disclosure: z.string().trim().max(1000).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.id && !value.expectedRevision)
      ctx.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message: "Reload the brand before saving changes.",
      });
    if (value.productKey === "affivon" && !value.disclosure)
      ctx.addIssue({
        code: "custom",
        path: ["disclosure"],
        message: "Add the affiliate disclosure to include in every draft.",
      });
  });

export const saveEvidenceSchema = growthScopeSchema
  .extend({
    ...editable,
    brandId: z.string().uuid(),
    title: text(1, 200),
    content: text(3, 12000),
    sourceUrl: z
      .string()
      .url()
      .max(2000)
      .refine((value) => {
        try {
          const url = new URL(value);
          return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Use an HTTP or HTTPS source link without embedded credentials.")
      .nullish(),
    kind: z.enum([
      "brand_fact",
      "competitor_ad",
      "customer_feedback",
      "product_data",
      "affiliate_offer",
    ]),
    validUntil: z.string().datetime({ offset: true }).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.id && !value.expectedRevision)
      ctx.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message: "Reload the evidence before saving changes.",
      });
    if ((value.kind === "product_data" || value.kind === "affiliate_offer") && !value.validUntil)
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Product and offer evidence needs a validity date.",
      });
    if (value.validUntil && Date.parse(value.validUntil) <= Date.now())
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Choose a future validity date.",
      });
  });

export const saveCampaignSchema = growthScopeSchema
  .extend({
    ...editable,
    brandId: z.string().uuid(),
    title: text(1, 200),
    objective: text(5, 6000),
    channel: growthChannelSchema,
    locale: growthLocaleSchema,
    evidenceIds: z
      .array(z.string().uuid())
      .min(1)
      .max(20)
      .transform((ids) => [...new Set(ids)]),
  })
  .superRefine((value, ctx) => {
    if (value.id && !value.expectedRevision)
      ctx.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message: "Reload the campaign before saving changes.",
      });
  });

export const startRunSchema = growthScopeSchema.extend({
  campaignId: z.string().uuid(),
  requestKey: z.string().uuid(),
  writerBindingId: z.string().uuid().nullable(),
  classifierBindingId: z.string().uuid().nullish(),
});
export const reviewRunSchema = growthScopeSchema.extend({
  runId: z.string().uuid(),
  expectedRevision: revision,
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(3000).optional(),
});
export const handoffRunSchema = growthScopeSchema.extend({
  runId: z.string().uuid(),
  expectedRevision: revision.optional(),
});

export const growthOutputSchema = z
  .object({
    angle: text(3, 1000),
    rationale: text(3, 3000),
    variants: z
      .array(
        z
          .object({
            key: text(1, 30),
            headline: text(1, 300),
            body: text(5, 6000),
            callToAction: text(1, 500),
            hashtags: z.array(text(1, 100)).max(20),
            evidenceIds: z.array(z.string().uuid()).min(1).max(20),
            disclosure: z.string().trim().max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    creativeBrief: z
      .object({
        direction: text(3, 3000),
        assetTypes: z
          .array(z.enum(["copy", "image", "video", "audio", "document", "web_asset"]))
          .min(1)
          .max(6),
      })
      .strict(),
    warnings: z.array(text(1, 1000)).max(20),
  })
  .strict();

export type GrowthScope = z.infer<typeof growthScopeSchema>;
export type GrowthOutput = z.infer<typeof growthOutputSchema>;
export type GrowthCheck = {
  key: string;
  label: string;
  status: "pass" | "review" | "fail";
  detail: string;
};
export type GrowthProviderView = {
  id: string;
  providerKey: string;
  label: string;
  purpose: "writer" | "classifier";
  model: string;
  status: "ready" | "blocked";
  reason: string;
};
export type GrowthProviderResult = {
  providerKey: string;
  model: string;
  resolvedModel?: string;
  requestId?: string;
  usage: { inputTokens?: number; outputTokens?: number };
};
export type GrowthResult = {
  output: GrowthOutput;
  checks: GrowthCheck[];
  provider: GrowthProviderResult;
  classification?: {
    provider: GrowthProviderResult;
    answers: Record<string, { choice: string; confidence: number }>;
  };
};
