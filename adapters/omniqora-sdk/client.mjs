/**
 * Omniqora server adapter SDK.
 *
 * Keep this file server-only. Never expose service tokens to a browser/mobile bundle.
 */
export function createOmniqoraClient({
  baseUrl,
  serviceToken,
  tenantId,
  productKey,
  tenantProductId = null,
  environment = "production",
  fetchImpl = fetch,
}) {
  if (typeof window !== "undefined") throw new Error("Omniqora SDK is server-only");
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("Use an HTTPS Omniqora base URL");
  }
  if (typeof serviceToken !== "string" || serviceToken.length < 40) {
    throw new Error("Configure an Omniqora service token");
  }
  if (!tenantId || !productKey) throw new Error("tenantId and productKey are required");

  async function request(path, body, idempotencyKey) {
    const response = await fetchImpl(new URL(path, base), {
      method: body == null ? "GET" : "POST",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: {
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error("Omniqora response too large");
    const data = raw ? JSON.parse(raw) : null;
    if (!response.ok) {
      throw new Error(data?.error || `Omniqora request refused (${response.status})`);
    }
    return data;
  }

  return {
    async emit({
      id,
      type,
      version = 1,
      occurredAt = new Date().toISOString(),
      locationId,
      workspaceId,
      userId,
      subject,
      correlationId,
      causationId,
      dataClassification = "internal",
      payload = {},
      idempotencyKey,
    }) {
      if (!idempotencyKey) throw new Error("idempotencyKey is required");
      return request("/api/platform/events", {
        schema: "omniqora.event.v1",
        id,
        type,
        version,
        occurredAt,
        source: { productKey, environment },
        scope: {
          tenantId,
          ...(tenantProductId ? { tenantProductId } : {}),
          ...(locationId ? { locationId } : {}),
          ...(workspaceId ? { workspaceId } : {}),
          ...(userId ? { userId } : {}),
        },
        ...(subject ? { subject } : {}),
        ...(correlationId ? { correlationId } : {}),
        ...(causationId ? { causationId } : {}),
        idempotencyKey,
        dataClassification,
        payload,
      }, idempotencyKey);
    },

    async customerCreated({ eventId, idempotencyKey, customer, locationId }) {
      return this.emit({ id:eventId,type:"customer.created",idempotencyKey,locationId,subject:{type:"customer",id:customer.customerRef},payload:customer,dataClassification:"confidential" });
    },

    async companyCreated({ eventId, idempotencyKey, company, locationId }) {
      return this.emit({ id:eventId,type:"company.created",idempotencyKey,locationId,subject:{type:"company",id:company.companyRef},payload:company,dataClassification:"confidential" });
    },

    async leadCreated({ eventId, idempotencyKey, lead, locationId }) {
      return this.emit({ id:eventId,type:"lead.created",idempotencyKey,locationId,subject:{type:"lead",id:lead.leadRef},payload:lead,dataClassification:"confidential" });
    },

    async orderCompleted({ eventId, idempotencyKey, order, locationId }) {
      return this.emit({ id:eventId,type:"order.completed",idempotencyKey,locationId,subject:{type:"order",id:order.orderId},payload:order,dataClassification:"confidential" });
    },

    async bookingCompleted({ eventId, idempotencyKey, booking, locationId }) {
      return this.emit({ id:eventId,type:"booking.completed",idempotencyKey,locationId,subject:{type:"booking",id:booking.bookingId},payload:booking,dataClassification:"confidential" });
    },

    async refundCompleted({ eventId, idempotencyKey, refund, locationId }) {
      return this.emit({ id:eventId,type:"refund.completed",idempotencyKey,locationId,subject:{type:"refund",id:refund.refundId},payload:refund,dataClassification:"confidential" });
    },

    async connectEvent({ scopeId, eventType, recipient, message, metadata = {}, idempotencyKey }) {
      if (!idempotencyKey) throw new Error("idempotencyKey is required");
      return request("/api/integrations/connect/events", {
        tenantId,
        scopeId,
        eventType,
        ...(recipient ? { recipient } : {}),
        ...(message ? { message } : {}),
        metadata,
      }, idempotencyKey);
    },
  };
}
