// Shared read-only transport boundary. Production transports return native Fetch Responses.
// A text() fallback is retained for trusted in-process fixtures/custom adapters.
export async function supplierJson(
  fetchImpl,
  url,
  init,
  { timeoutMs = 15000, maxBytes = 4000000 } = {},
) {
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 15000 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 4000000
  )
    throw Error("invalid_supplier_limits");
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  let reader, onAbort;
  const discard = (body) => {
    try {
      Promise.resolve(body?.cancel()).catch(() => {});
    } catch {}
  };
  const cancelled = new Promise((_, reject) => {
    onAbort = () => {
      if (reader) discard(reader);
      reject(Error("supplier_cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const check = () => {
    if (performance.now() >= deadline) controller.abort();
    if (signal.aborted) throw Error("supplier_cancelled");
  };
  const read = async () => {
    check();
    const response = await fetchImpl(url, { ...init, signal });
    if (signal.aborted) {
      discard(response?.body);
      check();
    }
    if (response?.ok !== true) {
      discard(response?.body);
      return { ok: false, status: response?.status };
    }
    const length = response.headers?.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
      discard(response.body);
      throw Error("supplier_response_too_large");
    }
    let text;
    if (response.body?.getReader) {
      reader = response.body.getReader();
      const bytes = new Uint8Array(maxBytes);
      let size = 0;
      try {
        while (true) {
          check();
          const { value, done } = await reader.read();
          check();
          if (done) break;
          if (!(value instanceof Uint8Array)) throw Error("invalid_supplier_chunk");
          size += value.byteLength;
          if (size > maxBytes) throw Error("supplier_response_too_large");
          bytes.set(value, size - value.byteLength);
        }
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
      } finally {
        discard(reader);
        try {
          reader.releaseLock();
        } catch {}
        reader = null;
      }
    } else {
      text = await response.text();
      check();
      if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxBytes)
        throw Error("supplier_response_too_large");
    }
    check();
    const data = JSON.parse(text);
    check();
    return { ok: true, status: response.status, data };
  };
  try {
    return await Promise.race([read(), cancelled]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
