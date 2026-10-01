import type { MaskedCallRequest, MaskedCallSession } from "./communications-contracts";

export async function reserveMaskedCall(
  request: MaskedCallRequest & { tenantProductId: string; locationId?: string | null; provider: string },
): Promise<MaskedCallSession> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc("create_masked_call_session", {
    _tenant: request.scope.tenantId,
    _tenant_product: request.tenantProductId,
    _location: request.locationId ?? null,
    _provider: request.provider,
    _caller: request.caller,
    _recipient: request.recipient,
    _context_type: request.contextType ?? null,
    _context_id: request.contextId ?? null,
    _expires_at: request.expiresAt,
    _recording_policy: request.recordingPolicy,
    _metadata: request.metadata ?? {},
  });
  if (error || !data) throw new Error(error?.message ?? "No masked number is available");
  return {
    id: data.id,
    provider: data.provider,
    proxyNumber: data.proxyNumber,
    status: data.status,
  };
}

export async function resolveMaskedCall(provider: string, proxyNumber: string, from: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc("resolve_masked_call_target", {
    _provider: provider, _proxy_number: proxyNumber, _from: from,
  });
  if (error || !data) throw new Error(error?.message ?? "Masked call could not be resolved");
  return data as {
    sessionId: string; tenantId: string; tenantProductId: string | null; locationId: string | null;
    target: string; proxyNumber: string; recordingPolicy: string; contextType: string | null; contextId: string | null;
  };
}

export async function closeMaskedCall(sessionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { error } = await db.rpc("close_masked_call_session", { _session: sessionId });
  if (error) throw new Error(error.message);
}