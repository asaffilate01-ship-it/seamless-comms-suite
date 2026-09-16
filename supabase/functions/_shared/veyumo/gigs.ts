import { BridgeError, safeSessionUrl } from "./protocol.mjs";
import { env } from "./runtime.ts";
export function gigsConfigured() {
  return !!env("GIGS_TOKEN") && !!env("GIGS_PROJECT");
}
export async function gigs(path: string, body?: unknown) {
  if (!gigsConfigured()) throw new BridgeError("mobile_not_configured", 503);
  const response = await fetch(
    `https://api.gigs.com/projects/${encodeURIComponent(env("GIGS_PROJECT"))}/${path}`,
    {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${env("GIGS_TOKEN")}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new BridgeError("mobile_provider_unavailable", 502);
  return response.json();
}
export async function connect(userId: string, intent: unknown, callbackUrl: string) {
  const r = await gigs("connectSessions", { user: userId, intent, callbackUrl });
  return {
    url: safeSessionUrl(
      r.url,
      (env("GIGS_CONNECT_ORIGINS") || "https://connect.gigs.com").split(",").map((x) => x.trim()),
    ),
  };
}
export async function syncUser(service: any, accountId: string, gigsUserId: string) {
  let after = "";
  let count = 0;
  do {
    const observedAt = new Date().toISOString();
    const page = await gigs(
      `subscriptions?status=pending,initiated,active,restricted,ended&user=${encodeURIComponent(gigsUserId)}&limit=100${after ? "&after=" + encodeURIComponent(after) : ""}`,
    );
    if (!Array.isArray(page.items)) throw new BridgeError("invalid_provider_response", 502);
    for (const s of page.items) {
      const id = typeof s.user === "string" ? s.user : s.user?.id;
      if (id !== gigsUserId) continue;
      const r = await service.rpc("veyumo_store_subscription", {
        p_id: s.id,
        p_account: accountId,
        p_user: gigsUserId,
        p_status: s.status,
        p_plan: s.plan?.name || null,
        p_phone: s.phoneNumber || null,
        p_observed_at: observedAt,
      });
      if (r.error) throw new BridgeError("storage_unavailable", 503);
    }
    count += page.items.length;
    if (!page.moreItemsAfter) return count;
    after = page.moreItemsAfter;
    if (!after) throw new BridgeError("invalid_provider_pagination", 502);
  } while (count < 1000);
  throw new BridgeError("provider_pagination_limit", 503);
}

