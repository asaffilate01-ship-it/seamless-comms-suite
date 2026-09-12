import {
  BridgeError,
  readBody,
  verifySvix,
  verify,
  signedHeaders,
  httpsUrl,
  same,
} from "./protocol.mjs";
import { db, env, check, json, fail } from "./runtime.ts";
import { syncUser } from "./gigs.ts";

export async function gigsWebhook(req: Request) {
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await readBody(req);
    const deliveryId = await verifySvix(req.headers, env("GIGS_WEBHOOK_SECRET"), raw);
    const event = JSON.parse(raw);
    if (
      typeof event.id !== "string" ||
      typeof event.type !== "string" ||
      !event.type.startsWith("com.gigs.")
    )
      throw new BridgeError("invalid_event");
    // Other event types do not establish subscription or payment state.
    if (!event.type.startsWith("com.gigs.subscription."))
      return json({ accepted: true, ignored: true });
    const user = typeof event.data?.user === "string" ? event.data.user : event.data?.user?.id;
    if (typeof user !== "string" || typeof event.data?.id !== "string")
      throw new BridgeError("invalid_subscription_event");
    const r = await db()
      .from("veyumo_inbox")
      .insert({
        source: "gigs",
        event_id: event.id,
        payload: {
          id: event.id,
          type: event.type,
          user,
          subscriptionId: event.data.id,
          deliveryId,
        },
      });
    if (r.error?.code !== "23505") check(r);
    return json({ accepted: true }, 202);
  } catch (e) {
    return fail(e);
  }
}

export async function worker(req: Request) {
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const secret = env("VEYUMO_WORKER_SECRET");
    if (secret.length < 32 || !same(req.headers.get("authorization") || "", `Bearer ${secret}`))
      throw new BridgeError("unauthorized", 401);
    const service = db();
    let done = 0,
      failed = 0;
    for (const queue of ["inbox", "outbox"]) {
      const jobs = check(await service.rpc("veyumo_claim_jobs", { p_queue: queue, p_limit: 5 }));
      for (const job of jobs) {
        const update = async (values: any) => {
          let q = service.from(`veyumo_${queue}`).update(values);
          q =
            queue === "inbox"
              ? q.eq("source", job.source).eq("event_id", job.event_id)
              : q.eq("id", job.id);
          check(await q);
        };
        try {
          if (queue === "inbox") {
            const user = check(
              await service
                .from("veyumo_gigs_users")
                .select("*")
                .eq("gigs_user_id", job.payload.user)
                .maybeSingle(),
            );
            // A just-created user mapping may race its webhook; retry instead of dropping it.
            if (!user) throw new BridgeError("unmapped_provider_user", 409);
            await syncUser(service, user.account_id, user.gigs_user_id);
            const subscription = check(
              await service
                .from("veyumo_subscriptions")
                .select("id,status,updated_at")
                .eq("id", job.payload.subscriptionId)
                .eq("account_id", user.account_id)
                .maybeSingle(),
            );
            if (!subscription) throw new BridgeError("subscription_not_visible_yet", 409);
            const links = check(
              await service
                .from("veyumo_account_links")
                .select("source,subject")
                .eq("account_id", user.account_id)
                .in("source", ["zoryn_pay", "zoryn_rewards"]),
            );
            for (const link of links) {
              const payload = {
                id: job.event_id,
                type: "veyumo.subscription.observed",
                accountId: user.account_id,
                recipientSubject: link.subject,
                subscriptionId: subscription.id,
                status: subscription.status,
                observedAt: subscription.updated_at,
              };
              const r = await service.from("veyumo_outbox").insert({
                destination: link.source,
                event_id: job.event_id + ":" + link.subject,
                payload,
              });
              if (r.error?.code !== "23505") check(r);
            }
          } else {
            if (!["zoryn_pay", "zoryn_rewards"].includes(job.destination))
              throw new BridgeError("invalid_destination");
            const prefix = job.destination.toUpperCase();
            const endpoint = httpsUrl(env(`VEYUMO_EVENTS_${prefix}_URL`));
            const raw = JSON.stringify(job.payload);
            const response = await fetch(endpoint, {
              method: "POST",
              headers: await signedHeaders("omniqora", env(`VEYUMO_EVENTS_${prefix}_SECRET`), raw),
              body: raw,
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new BridgeError("event_delivery_failed", 502);
          }
          await update({ state: "done", locked_at: null, last_error: null });
          done++;
        } catch (e) {
          await update({
            state: job.attempts >= 10 ? "dead" : "pending",
            locked_at: null,
            last_error: e instanceof BridgeError ? e.message : "processing_failed",
            next_attempt_at: new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts),
            ).toISOString(),
          });
          failed++;
        }
      }
    }
    check(
      await service
        .from("veyumo_request_nonces")
        .delete()
        .lt("created_at", new Date(Date.now() - 86400000).toISOString()),
    );
    return json({ done, failed });
  } catch (e) {
    return fail(e);
  }
}

// Settlement is deliberately not inferred from activation/renewal. These are service observations.
export async function receiveEvent(req: Request) {
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await readBody(req);
    const verified = await verify(req.headers, env("VEYUMO_EVENTS_SECRET"), raw);
    if (verified.source !== "omniqora") throw new BridgeError("invalid_source", 401);
    const p = JSON.parse(raw);
    if (
      p.type !== "veyumo.subscription.observed" ||
      typeof p.id !== "string" ||
      p.id.length > 200 ||
      typeof p.accountId !== "string" ||
      typeof p.recipientSubject !== "string" ||
      p.recipientSubject.length > 200 ||
      typeof p.subscriptionId !== "string" ||
      p.subscriptionId.length > 200 ||
      typeof p.status !== "string" ||
      p.status.length > 80 ||
      !Number.isFinite(Date.parse(p.observedAt))
    )
      throw new BridgeError("invalid_event");
    const result = await db().from("veyumo_service_events").insert({
      event_id: p.id,
      subject: p.recipientSubject,
      account_id: p.accountId,
      subscription_id: p.subscriptionId,
      status: p.status,
      observed_at: p.observedAt,
    });
    if (result.error?.code !== "23505") check(result);
    return json({ accepted: true }, 202);
  } catch (e) {
    return fail(e);
  }
}
