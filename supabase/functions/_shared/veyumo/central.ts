import {
  BridgeError,
  parseAction,
  verify,
  readBody,
  digest,
  eligible,
  canOffer,
  publicOffer,
  httpsUrl,
} from "./protocol.mjs";
import { db, env, check, json, fail } from "./runtime.ts";
import { gigs, connect, gigsConfigured, syncUser } from "./gigs.ts";

// This endpoint accepts server-signed assertions only, never browser-supplied account IDs.
export async function central(req: Request) {
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await readBody(req);
    const source = req.headers.get("x-veyumo-source") || "";
    if (
      !["craftvaro", "haccora", "omniqora", "zoryn_pay", "zoryn_rewards", "veyumo"].includes(source)
    )
      throw new BridgeError("invalid_source", 401);
    const { id } = await verify(req.headers, env(`VEYUMO_SECRET_${source.toUpperCase()}`), raw);
    const service = db();
    const nonce = await service.from("veyumo_request_nonces").insert({ source, nonce: id });
    if (nonce.error?.code === "23505") throw new BridgeError("replayed_request", 409);
    check(nonce);
    const input = JSON.parse(raw);
    const action = parseAction(input.command);
    const actor = input.actor;
    if (
      !actor ||
      typeof actor.subject !== "string" ||
      actor.subject.length > 200 ||
      !actor.subject ||
      typeof actor.email !== "string" ||
      !actor.email.includes("@") ||
      actor.verified !== true ||
      !["GB", "DE"].includes(actor.market)
    )
      throw new BridgeError("invalid_actor", 401);
    // Assertions cannot keep discounts alive indefinitely or grant one from an unrelated app.
    const entitlement =
      ["craftvaro", "haccora"].includes(source) && eligible(actor.entitlement)
        ? {
            active: true,
            expiresAt: new Date(
              Math.min(Date.parse(actor.entitlement.expiresAt), Date.now() + 300000),
            ).toISOString(),
          }
        : { active: false };
    let link = check(
      await service
        .from("veyumo_account_links")
        .select("*")
        .eq("source", source)
        .eq("subject", actor.subject)
        .maybeSingle(),
    );
    if (action.action === "createAccount") {
      check(
        await service.rpc("veyumo_create_account", {
          p_source: source,
          p_subject: actor.subject,
          p_email: actor.email,
          p_market: actor.market,
        }),
      );
      link = check(
        await service
          .from("veyumo_account_links")
          .select("*")
          .eq("source", source)
          .eq("subject", actor.subject)
          .single(),
      );
    }
    if (action.action === "claimLink") {
      if (link) throw new BridgeError("account_already_linked", 409);
      if (!/^[a-f0-9]{64}$/.test(action.token || "")) throw new BridgeError("invalid_link_code");
      const claimed = await service.rpc("veyumo_claim_token", {
        p_hash: await digest(action.token),
        p_kind: "link",
        p_source: source,
        p_subject: actor.subject,
        p_email: actor.email,
        p_market: actor.market,
      });
      if (claimed.error) throw new BridgeError("invalid_or_expired_link", 409);
      link = check(
        await service
          .from("veyumo_account_links")
          .select("*")
          .eq("source", source)
          .eq("subject", actor.subject)
          .single(),
      );
    }
    if (!link) {
      if (action.action !== "workspace") throw new BridgeError("account_required", 409);
      return json({
        linked: false,
        market: actor.market,
        offers: [],
        subscriptions: [],
        billing: "gigs",
        purchasesEnabled: false,
      });
    }
    if (link.role !== "owner") throw new BridgeError("account_owner_required", 403);
    const account = check(
      await service.from("veyumo_accounts").select("*").eq("id", link.account_id).single(),
    );
    if (account.market !== actor.market) throw new BridgeError("market_mismatch", 409);
    check(
      await service
        .from("veyumo_account_links")
        .update({ entitlement, updated_at: new Date().toISOString() })
        .eq("source", source)
        .eq("subject", actor.subject),
    );
    const audit = () =>
      service
        .from("veyumo_audit")
        .insert({ account_id: account.id, source, subject: actor.subject, action: action.action });
    if (action.action === "createLink") {
      const token =
        crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const expiresAt = new Date(Date.now() + 600000).toISOString();
      // Creating a new code invalidates older unused link codes for this account.
      check(
        await service
          .from("veyumo_link_tokens")
          .update({ used_at: new Date().toISOString() })
          .eq("account_id", account.id)
          .eq("kind", "link")
          .is("used_at", null),
      );
      check(
        await service.from("veyumo_link_tokens").insert({
          token_hash: await digest(token),
          account_id: account.id,
          kind: "link",
          created_by: `${source}:${actor.subject}`,
          expires_at: expiresAt,
        }),
      );
      check(await audit());
      return json({ token, expiresAt });
    }
    const entitlements = check(
      await service.from("veyumo_account_links").select("entitlement").eq("account_id", account.id),
    );
    const qualifying = entitlements?.find((x) => eligible(x.entitlement))?.entitlement;
    const purchasesEnabled = gigsConfigured() && env("VEYUMO_SALES_ENABLED") === "true";
    const bundlesEnabled = env("VEYUMO_BUNDLES_APPROVED") === "true";
    const offers =
      check(
        await service
          .from("veyumo_offers")
          .select("*")
          .eq("market", account.market)
          .eq("enabled", true),
      )?.filter(
        (o) =>
          canOffer(o, qualifying, account.market) && (!o.requires_subscription || bundlesEnabled),
      ) ?? [];
    let providerUser = check(
      await service
        .from("veyumo_gigs_users")
        .select("*")
        .eq("account_id", account.id)
        .eq("subject_key", "owner")
        .maybeSingle(),
    );
    if (action.action === "checkout" || action.action === "manage") {
      if (!purchasesEnabled) throw new BridgeError("mobile_sales_not_open", 409);
      const callback = httpsUrl(env(`VEYUMO_RETURN_${source.toUpperCase()}`)).href;
      let intent: any = { type: "viewSubscriptions" };
      if (action.action === "checkout") {
        const offer = offers.find((o: any) => o.id === action.offerId);
        if (!offer) throw new BridgeError("offer_unavailable", 409);
        // Gigs hosts the final price, disclosures, identity checks and payment confirmation.
        intent = {
          type: "checkoutNewSubscription",
          checkoutNewSubscription: { plan: offer.gigs_plan_id },
        };
        if (!providerUser) {
          const reserved = await service
            .from("veyumo_provider_provisioning")
            .insert({ account_id: account.id });
          if (reserved.error?.code === "23505")
            throw new BridgeError("mobile_account_setup_pending", 409);
          check(reserved);
          const created = await gigs("users", {
            email: actor.email,
            fullName: actor.fullName || undefined,
            metadata: { veyumoAccountId: account.id },
          });
          if (typeof created.id !== "string" || !created.id.startsWith("usr_"))
            throw new BridgeError("invalid_provider_response", 502);
          check(
            await service
              .from("veyumo_gigs_users")
              .insert({ account_id: account.id, subject_key: "owner", gigs_user_id: created.id }),
          );
          providerUser = { gigs_user_id: created.id };
        }
      } else if (!providerUser) throw new BridgeError("no_mobile_account", 409);
      check(await audit());
      return json(await connect(providerUser.gigs_user_id, intent, callback));
    }
    if (action.action === "refresh" && providerUser)
      await syncUser(service, account.id, providerUser.gigs_user_id);
    const subscriptions = check(
      await service
        .from("veyumo_subscriptions")
        .select("id,status,plan_name,phone_number,updated_at")
        .eq("account_id", account.id),
    );
    if (action.action !== "workspace") check(await audit());
    return json({
      linked: true,
      accountId: account.id,
      market: account.market,
      role: link.role,
      eligible: !!qualifying,
      purchasesEnabled,
      billing: "gigs",
      offers: offers.map(publicOffer),
      subscriptions,
      canManage: !!providerUser,
    });
  } catch (error) {
    return fail(error);
  }
}
