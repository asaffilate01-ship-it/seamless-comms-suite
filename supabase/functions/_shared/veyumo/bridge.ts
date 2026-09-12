import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { BridgeError, parseAction, signedHeaders, httpsUrl } from "./protocol.mjs";
import { env, db, check, body, json, fail, originHeaders } from "./runtime.ts";

// source is a code constant in each app, never a field from the browser.
export function bridge(source: string) {
  return async (req: Request) => {
    let cors = {};
    try {
      cors = originHeaders(req);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
      const authorization = req.headers.get("authorization") || "";
      if (!authorization.startsWith("Bearer ")) throw new BridgeError("sign_in_required", 401);
      const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new BridgeError("sign_in_required", 401);
      const user = data.user;
      if (!user.email || !user.email_confirmed_at) throw new BridgeError("verify_email_first", 403);
      const command = parseAction(await body(req));
      let subject = user.id;
      let entitlement: any = { active: false };
      const service = db();
      if (source === "haccora") {
        const context = check(await client.rpc("get_my_context"));
        if (!context?.organization_id || context.role !== "owner")
          throw new BridgeError("business_owner_required", 403);
        subject = context.organization_id;
        const sub = check(
          await service
            .from("subscriptions")
            .select("provider_subscription_id,provider_customer_id")
            .eq("organization_id", subject)
            .maybeSingle(),
        );
        entitlement = await stripeEntitlement(
          sub?.provider_subscription_id,
          sub?.provider_customer_id,
          { organizationId: subject },
        );
      } else if (source === "craftvaro") {
        const sub = check(
          await service
            .from("subscribers")
            .select("stripe_subscription_id,stripe_customer_id")
            .eq("user_id", user.id)
            .maybeSingle(),
        );
        entitlement = await stripeEntitlement(
          sub?.stripe_subscription_id,
          sub?.stripe_customer_id,
          { email: user.email },
        );
      }
      const market = env("VEYUMO_MARKET") || "GB";
      if (!["GB", "DE"].includes(market))
        throw new BridgeError("invalid_market_configuration", 503);
      const raw = JSON.stringify({
        command,
        actor: {
          subject,
          email: user.email,
          verified: true,
          fullName:
            typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name.slice(0, 200)
              : undefined,
          market,
          entitlement,
        },
      });
      const endpoint = httpsUrl(env("VEYUMO_API_URL"));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: await signedHeaders(source, env("VEYUMO_BRIDGE_SECRET"), raw),
        body: raw,
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (
        response.ok &&
        ["zoryn_pay", "zoryn_rewards"].includes(source) &&
        command.action === "workspace"
      ) {
        const events = check(
          await service
            .from("veyumo_service_events")
            .select("event_id,status,observed_at")
            .eq("subject", subject)
            .order("received_at", { ascending: false })
            .limit(5),
        );
        result.serviceEvents = events;
      }
      return json(result, response.status, cors);
    } catch (error) {
      const response = fail(error);
      Object.entries(cors).forEach(([k, v]) => response.headers.set(k, String(v)));
      return response;
    }
  };
}

async function stripeEntitlement(
  subscriptionId: string | undefined,
  customerId: string | undefined,
  owner: { organizationId?: string; email?: string },
) {
  if (!subscriptionId?.startsWith("sub_") || !customerId || !env("STRIPE_SECRET_KEY"))
    return { active: false };
  try {
    const headers = { authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` };
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return { active: false };
    const sub = await response.json();
    if (sub.customer !== customerId || sub.status !== "active" || sub.livemode !== true)
      return { active: false };
    if (owner.organizationId && sub.metadata?.organization_id !== owner.organizationId)
      return { active: false };
    // Legacy Craftvaro subscription rows are mutable. Verify the Stripe customer identity as well.
    if (owner.email) {
      const customer = await fetch(
        `https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      if (!customer.ok) return { active: false };
      const c = await customer.json();
      if (c.deleted || c.email?.toLowerCase() !== owner.email.toLowerCase())
        return { active: false };
    }
    return { active: true, expiresAt: new Date(Date.now() + 300000).toISOString() };
  } catch {
    return { active: false };
  }
}
