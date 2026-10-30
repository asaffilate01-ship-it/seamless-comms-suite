import { randomUUID } from "node:crypto";
import { validScope } from "./offer-store.mjs";
import { validateFlightSearch } from "./live-search.mjs";
const validRef = (value) => typeof value === "string" && /^offer_[a-f0-9]{32}$/.test(value);
const check = (context, signal) => {
  if (!validScope(context) || signal?.aborted) throw Error("invalid_scope_or_cancelled");
};

// The trusted host supplies a transactional DB adapter, deadlines and verified actor context.
// Production roles and encryption/backup/retention are provisioned outside this module.
export function createPostgresOfferStore({ db, now = () => Date.now() } = {}) {
  if (!db?.query || !db?.transaction) throw Error("transactional_database_required");
  return {
    async put(context, { query, offer }, { signal } = {}) {
      check(context, signal);
      const normalized = validateFlightSearch(query, now());
      if (
        !normalized ||
        offer?.source !== "duffel" ||
        offer.live !== true ||
        offer.bookable !== false ||
        !(Date.parse(offer.expiresAt) > now())
      )
        throw Error("live_offer_required");
      // Only normalized server offers belong here, never raw supplier passengers or credentials.
      const payload = JSON.stringify({ query: normalized, offer });
      if (Buffer.byteLength(payload) > 128000) throw Error("offer_record_too_large");
      const offerRef = "offer_" + randomUUID().replaceAll("-", "");
      await db.transaction(
        async (tx) => {
          check(context, signal);
          // Tenant lock before actor lock. Touching the row also forces stale repeatable-read
          // transactions to fail serialization rather than count an old snapshot.
          for (const subject of ["*", context.actorId]) {
            const quota = await tx.query(
              `UPDATE flightlounge_private.offer_quotas SET lock_version=lock_version+1
            WHERE tenant_id=$1 AND subject=$2 RETURNING max_records`,
              [context.tenantId, subject],
              { signal },
            );
            if (quota.rows?.length !== 1 || quota.rows[0].max_records < 1)
              throw Error("offer_quota_unavailable");
            const count = await tx.query(
              `SELECT count(*)::integer AS count FROM flightlounge_private.offers
            WHERE tenant_id=$1 AND ($2='*' OR actor_id=$2)`,
              [context.tenantId, subject],
              { signal },
            );
            // Count expired rows too: storage remains bounded even if maintenance is stopped.
            if (count.rows[0].count >= quota.rows[0].max_records)
              throw Error("offer_quota_exceeded");
            check(context, signal);
          }
          const inserted = await tx.query(
            `WITH stamp AS (SELECT clock_timestamp() AS at)
          INSERT INTO flightlounge_private.offers(tenant_id,actor_id,offer_ref,payload,stored_at,expires_at)
          SELECT $1,$2,$3,$4::jsonb,at,LEAST($5::timestamptz,at+interval '30 minutes') FROM stamp
          WHERE $5::timestamptz>at RETURNING offer_ref`,
            [context.tenantId, context.actorId, offerRef, payload, offer.expiresAt],
            { signal },
          );
          if (inserted.rows?.length !== 1) throw Error("offer_expired");
          check(context, signal);
        },
        { signal },
      );
      return offerRef;
    },
    async get(context, offerRef, { signal } = {}) {
      if (!validScope(context) || !validRef(offerRef)) return null;
      check(context, signal);
      const result = await db.query(
        `SELECT payload,stored_at,expires_at FROM flightlounge_private.offers
        WHERE tenant_id=$1 AND actor_id=$2 AND offer_ref=$3 AND expires_at>clock_timestamp()`,
        [context.tenantId, context.actorId, offerRef],
        { signal },
      );
      check(context, signal);
      const row = result.rows?.[0];
      if (
        !row ||
        !(Date.parse(row.expires_at) > now()) ||
        !(Date.parse(row.payload?.offer?.expiresAt) > now())
      )
        return null;
      return {
        tenantId: context.tenantId,
        actorId: context.actorId,
        offerRef,
        query: row.payload.query,
        offer: row.payload.offer,
        storedAt: new Date(row.stored_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    },
    async remove(context, offerRef, { signal } = {}) {
      if (!validScope(context) || !validRef(offerRef)) return false;
      check(context, signal);
      const result = await db.query(
        `DELETE FROM flightlounge_private.offers
        WHERE tenant_id=$1 AND actor_id=$2 AND offer_ref=$3 RETURNING offer_ref`,
        [context.tenantId, context.actorId, offerRef],
        { signal },
      );
      return result.rows?.length === 1;
    },
    // Trusted maintenance only; deliberately not exposed as a passenger HTTP action.
    async purgeExpired({ tenantId, limit = 500 }, { signal } = {}) {
      if (
        tenantId !== "travenexa-flightlounge" ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 1000 ||
        signal?.aborted
      )
        throw Error("invalid_retention_request");
      const result = await db.query(
        `WITH expired AS (
          SELECT tenant_id,actor_id,offer_ref FROM flightlounge_private.offers
          WHERE tenant_id=$1 AND expires_at<=clock_timestamp()
          ORDER BY expires_at,actor_id,offer_ref LIMIT $2 FOR UPDATE SKIP LOCKED
        ) DELETE FROM flightlounge_private.offers o USING expired e
        WHERE o.tenant_id=e.tenant_id AND o.actor_id=e.actor_id AND o.offer_ref=e.offer_ref
        RETURNING o.offer_ref`,
        [tenantId, limit],
        { signal },
      );
      return { deleted: result.rows.length };
    },
  };
}
