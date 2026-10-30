type Scope = { tenantId: string; productKey: string };
/** Component-owned, memory-only admission attempts. No credentials or browser storage. */
export function createQueueAttempts<T extends Scope>(newId: () => string) {
  const pending = new Map<string, { payload: T; fingerprint: string; idempotencyKey: string }>();
  let busy = false;
  const key = (scope: Scope) => JSON.stringify([scope.tenantId, scope.productKey]);
  const fingerprint = (payload: T) =>
    JSON.stringify(
      Object.keys(payload)
        .sort()
        .map((k) => [k, (payload as Record<string, unknown>)[k]]),
    );
  return {
    isBusy: () => busy,
    discard(scope: Scope) {
      if (busy) throw new Error("A queue request is already in progress.");
      pending.delete(key(scope));
    },
    pending(scope: Scope): T | undefined {
      const item = pending.get(key(scope));
      return item ? structuredClone(item.payload) : undefined;
    },
    async submit<R>(
      payload: T,
      send: (request: T & { idempotencyKey: string }) => Promise<R>,
    ): Promise<R> {
      if (busy) throw new Error("A queue request is already in progress.");
      const scopeKey = key(payload),
        signature = fingerprint(payload);
      let attempt = pending.get(scopeKey);
      if (attempt && attempt.fingerprint !== signature)
        throw new Error(
          "Resolve the previous queue request before submitting changed task settings.",
        );
      if (!attempt) {
        attempt = {
          payload: structuredClone(payload),
          fingerprint: signature,
          idempotencyKey: newId(),
        };
        pending.set(scopeKey, attempt);
      }
      busy = true;
      try {
        const result = await send({
          ...structuredClone(attempt.payload),
          idempotencyKey: attempt.idempotencyKey,
        });
        pending.delete(scopeKey);
        return result;
      } finally {
        busy = false;
      }
    },
  };
}
