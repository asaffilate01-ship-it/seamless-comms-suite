import { validScope } from "./offer-store.mjs";
// db.transaction(callback) must use one connection and rollback when callback throws.
// The host adapter must enforce statement/lock deadlines and honour AbortSignal.
export function createPostgresFlightControls({ db } = {}) {
  if (!db?.query || !db?.transaction) throw Error("transactional_database_required");
  const check = (context, signal) => {
    if (!validScope(context) || signal?.aborted) throw Error("invalid_scope_or_cancelled");
  };
  async function insert(query, event, signal) {
    check(event, signal);
    if (typeof event.event !== "string" || !/^[a-z_]{1,64}$/.test(event.event))
      throw Error("invalid_audit_event");
    // Never persist request bodies, supplier responses, tokens, routes or passenger details.
    const details = {};
    for (const key of ["calls", "httpStatus", "offerCount", "candidateCount", "completed"])
      if (Number.isSafeInteger(event[key]) && event[key] >= 0) details[key] = event[key];
    await query(
      "INSERT INTO flightlounge_private.audit (tenant_id,actor_id,event,details) VALUES ($1,$2,$3,$4)",
      [event.tenantId, event.actorId, event.event, JSON.stringify(details)],
      { signal },
    );
    check(event, signal);
  }
  return {
    audit: async (event, { signal } = {}) => insert(db.query.bind(db), event, signal),
    async reserveBudget(context, { signal } = {}) {
      check(context, signal);
      if (!Number.isInteger(context.calls) || context.calls < 1 || context.calls > 9)
        throw Error("invalid_budget");
      try {
        await db.transaction(
          async (tx) => {
            // Consistent lock order: tenant before actor. Both allowances debit or neither does.
            for (const subject of ["*", context.actorId]) {
              check(context, signal);
              const r = await tx.query(
                `UPDATE flightlounge_private.budgets SET remaining=remaining-$3
              WHERE tenant_id=$1 AND subject=$2 AND valid_until>clock_timestamp() AND remaining >= $3
              RETURNING remaining`,
                [context.tenantId, subject, context.calls],
                { signal },
              );
              if (r.rows?.length !== 1) throw Error("budget_denied");
            }
            await insert(tx.query.bind(tx), { ...context, event: "budget_reserved" }, signal);
          },
          { signal },
        );
        check(context, signal);
        return { allowed: true, tenantId: context.tenantId, actorId: context.actorId };
      } catch {
        return { allowed: false };
      }
    },
  };
}
