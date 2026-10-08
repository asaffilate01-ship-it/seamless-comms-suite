import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  importSyndrivaGrowthSourceSchema,
  syndrivaGrowthSourcesSchema,
  type SyndrivaGrowthImport,
  type SyndrivaGrowthSourcePage,
} from "./syndriva-sources.contract";

const sourceError = (error: { code?: string; message: string }) => {
  if (["42501", "22023", "55000", "P0002", "40001"].includes(error.code ?? "")) return new Error(error.message);
  return new Error("Syndriva sources could not be checked. Refresh and try again.");
};

export const getSyndrivaGrowthSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof syndrivaGrowthSourcesSchema>) => syndrivaGrowthSourcesSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("growth_syndriva_list_sources" as never, {
      _tenant: data.tenantId, _brand: data.brandId, _offset: data.offset,
    } as never);
    if (response.error) throw sourceError(response.error);
    return response.data as unknown as SyndrivaGrowthSourcePage;
  });

export const importSyndrivaGrowthSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof importSyndrivaGrowthSourceSchema>) => importSyndrivaGrowthSourceSchema.parse(input))
  .handler(async ({ context, data }) => {
    const response = await context.supabase.rpc("growth_syndriva_import_source" as never, {
      _tenant: data.tenantId, _brand: data.brandId, _listing: data.listingId,
    } as never);
    if (response.error) throw sourceError(response.error);
    return response.data as unknown as SyndrivaGrowthImport;
  });
