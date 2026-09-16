import { connector, product, apiError, fail } from "@/lib/server";
import {
  placements,
  recommendations,
  networkVersion,
  type Audience,
  type Placement,
} from "@/lib/portfolio-network";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { integration: i } = await connector(req);
    const p = await product(i.workspace_id, i.product_id);
    const query = new URL(req.url).searchParams;
    const country = query.get("country") || "",
      audience = query.get("audience") || "business",
      placement = query.get("placement") || "dashboard";
    if (
      !/^[A-Z]{2}$/.test(country) ||
      !["business", "consumer"].includes(audience) ||
      !placements.includes(placement as Placement)
    )
      fail("Supply a two-letter country, valid audience and placement.");
    const owned = query
      .getAll("owned")
      .slice(0, 50)
      .filter((v) => /^[a-z0-9-]{1,60}$/.test(v));
    const offers = recommendations({
      source: p.slug,
      country,
      audience: audience as Audience,
      placement: placement as Placement,
      owned,
    });
    return Response.json(
      { version: networkVersion, source: p.slug, offers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
