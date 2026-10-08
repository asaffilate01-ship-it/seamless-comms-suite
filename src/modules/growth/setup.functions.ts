import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  decideGrowthSetupSchema,
  growthSetupSchema,
  growthWorkspacePageSchema,
  requestGrowthSetupSchema,
  saveGrowthWriterSchema,
} from "./setup.contract";

export const getGrowthWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof growthWorkspacePageSchema>) => growthWorkspacePageSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { listGrowthSetupWorkspaces } = await import("./setup.server");
    return listGrowthSetupWorkspaces(context, data);
  });

export const getGrowthSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof growthSetupSchema>) => growthSetupSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { loadGrowthSetup } = await import("./setup.server");
    return loadGrowthSetup(context, data);
  });

export const requestGrowthSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof requestGrowthSetupSchema>) => requestGrowthSetupSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { submitGrowthSetup } = await import("./setup.server");
    return submitGrowthSetup(context, data);
  });

export const decideGrowthSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof decideGrowthSetupSchema>) => decideGrowthSetupSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { reviewGrowthSetup } = await import("./setup.server");
    return reviewGrowthSetup(context, data);
  });

export const saveGrowthWriter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof saveGrowthWriterSchema>) => saveGrowthWriterSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { configureGrowthWriter } = await import("./setup.server");
    return configureGrowthWriter(context, data);
  });
