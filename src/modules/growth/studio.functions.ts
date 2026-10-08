import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  growthScopeSchema,
  saveBrandSchema,
  saveEvidenceSchema,
  saveCampaignSchema,
  startRunSchema,
  reviewRunSchema,
  handoffRunSchema,
} from "./studio.contract";

export const getGrowthStudioWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof growthScopeSchema>) => growthScopeSchema.parse(input))
  .handler(async ({ context, data }) => {
    const [{ getGrowthAccess }, { getStudioWorkspace }, { loadGrowthProviders }] =
      await Promise.all([
        import("./studio.runtime.server"),
        import("./studio.repository.server"),
        import("./studio.providers.server"),
      ]);
    const access = await getGrowthAccess(context, data);
    const [workspace, providers] = await Promise.all([
      access.allowed
        ? getStudioWorkspace(context.supabase as SupabaseClient, data)
        : Promise.resolve({ brands: [], evidence: [], campaigns: [], runs: [] }),
      loadGrowthProviders(context.supabase as SupabaseClient, data),
    ]);
    return { ...workspace, access, providers };
  });

export const saveGrowthBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof saveBrandSchema>) => saveBrandSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { assertGrowthAccess } = await import("./studio.runtime.server");
    await assertGrowthAccess(context, data, "write");
    const { saveStudioBrand } = await import("./studio.repository.server");
    return saveStudioBrand(context.supabase as SupabaseClient, data);
  });
export const saveGrowthEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof saveEvidenceSchema>) => saveEvidenceSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { assertGrowthAccess } = await import("./studio.runtime.server");
    await assertGrowthAccess(context, data, "write");
    const { saveStudioEvidence } = await import("./studio.repository.server");
    return saveStudioEvidence(context.supabase as SupabaseClient, data);
  });
export const saveGrowthCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof saveCampaignSchema>) => saveCampaignSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { assertGrowthAccess } = await import("./studio.runtime.server");
    await assertGrowthAccess(context, data, "write");
    const { saveStudioCampaign } = await import("./studio.repository.server");
    return saveStudioCampaign(context.supabase as SupabaseClient, data);
  });
export const generateGrowthCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof startRunSchema>) => startRunSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { runGrowthCampaign } = await import("./studio.runtime.server");
    return runGrowthCampaign(context, data);
  });
export const reviewGrowthRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof reviewRunSchema>) => reviewRunSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { assertGrowthAccess } = await import("./studio.runtime.server");
    await assertGrowthAccess(context, data, "review");
    const { reviewStudioRun } = await import("./studio.repository.server");
    return reviewStudioRun(context.supabase as SupabaseClient, data);
  });
export const handoffGrowthRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof handoffRunSchema>) => handoffRunSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { assertGrowthAccess } = await import("./studio.runtime.server");
    await assertGrowthAccess(context, data, "handoff");
    const { handoffStudioRun } = await import("./studio.repository.server");
    return handoffStudioRun(context.supabase as SupabaseClient, data);
  });
