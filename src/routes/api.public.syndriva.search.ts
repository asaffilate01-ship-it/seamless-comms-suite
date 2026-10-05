import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const querySchema = z.object({
  marketplaceId: z.string().uuid(),
  q: z.string().max(200).nullish(),
  category: z.string().max(120).nullish(),
  vendorId: z.string().uuid().nullish(),
  minPriceMinor: z.coerce.number().int().nonnegative().nullish(),
  maxPriceMinor: z.coerce.number().int().nonnegative().nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
    },
  });
}

export const Route = createFileRoute("/api/public/syndriva/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          marketplaceId: url.searchParams.get("marketplaceId"),
          q: url.searchParams.get("q"),
          category: url.searchParams.get("category"),
          vendorId: url.searchParams.get("vendorId"),
          minPriceMinor: url.searchParams.get("minPriceMinor"),
          maxPriceMinor: url.searchParams.get("maxPriceMinor"),
          limit: url.searchParams.get("limit") ?? 50,
          offset: url.searchParams.get("offset") ?? 0,
        });

        if (!parsed.success) {
          return json(
            {
              error: "invalid_request",
              details: parsed.error.flatten().fieldErrors,
            },
            400,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const data = parsed.data;

        const marketplace = await db
          .from("syndriva_marketplaces")
          .select(
            "id,name,slug,marketplace_modes,seller_model,branch_model,default_currency,default_country,template_key",
          )
          .eq("id", data.marketplaceId)
          .eq("status", "active")
          .maybeSingle();

        if (marketplace.error) return json({ error: "marketplace_lookup_failed" }, 500);
        if (!marketplace.data) return json({ error: "marketplace_not_found" }, 404);

        const capabilities = await db
          .from("syndriva_marketplace_capabilities")
          .select("capability_key")
          .eq("marketplace_id", data.marketplaceId)
          .eq("enabled", true);

        if (capabilities.error) return json({ error: "capability_lookup_failed" }, 500);

        const result = await db.rpc("syndriva_search_listings", {
          _marketplace: data.marketplaceId,
          _query: data.q ?? null,
          _category: data.category ?? null,
          _vendor: data.vendorId ?? null,
          _min_price: data.minPriceMinor ?? null,
          _max_price: data.maxPriceMinor ?? null,
          _limit: data.limit,
          _offset: data.offset,
        });

        if (result.error) return json({ error: "search_failed" }, 500);

        return json({
          marketplace: marketplace.data,
          capabilities: (capabilities.data ?? []).map(
            (row: { capability_key: string }) => row.capability_key,
          ),
          results: result.data ?? [],
          page: {
            limit: data.limit,
            offset: data.offset,
            returned: result.data?.length ?? 0,
          },
        });
      },
    },
  },
});
