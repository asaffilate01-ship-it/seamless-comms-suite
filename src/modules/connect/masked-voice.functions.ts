import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Platform-admin pilot only. Tenant-owned self-service number allocation is
// forbidden until provider-verified number ownership and consent are available.
const uuid = z.string().uuid();
const e164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const createInput = z.object({
  tenantId: uuid, productKey: z.string().min(2).max(80), channelId: uuid,
  participantA: e164, participantB: e164,
  bothParticipantsConsented: z.literal(true),
  ttlMinutes: z.number().int().min(1).max(60).default(30),
}).strict();

const revokeInput = z.object({ tenantId: uuid, sessionId: uuid }).strict();

export const createMaskedVoiceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof createInput>) => createInput.parse(input))
  .handler(async ({ context, data }) => {
    const account = process.env.TWILIO_MASKED_VOICE_ACCOUNT_SID ?? "";
    const approvedNumbers = (process.env.TWILIO_MASKED_VOICE_NUMBERS ?? "").trim();
    if (process.env.OMNIQORA_MASKED_VOICE_ENABLED !== "true" ||
        !/^AC[a-fA-F0-9]{32}$/.test(account) ||
        !process.env.TWILIO_AUTH_TOKEN ||
        !approvedNumbers) {
      throw new Error("Masked calls are not enabled for this environment");
    }
    if (data.participantA === data.participantB) throw new Error("Two different participants are required");

    const { data: sessionId, error } = await (context.supabase as any).rpc(
      "platform_create_masked_voice_session",
      {
        _tenant: data.tenantId, _product: data.productKey, _channel: data.channelId,
        _participant_a: data.participantA, _participant_b: data.participantB,
        _provider_account_sid: account, _ttl_minutes: data.ttlMinutes,
      },
    );
    if (error || typeof sessionId !== "string") {
      throw new Error("Masked call session could not be created; check platform approval, number ownership and entitlement");
    }
    return { sessionId, expiresInMinutes: data.ttlMinutes };
  });

export const revokeMaskedVoiceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof revokeInput>) => revokeInput.parse(input))
  .handler(async ({ context, data }) => {
    // Revocation works even when the outbound feature is disabled.
    const { data: revoked, error } = await (context.supabase as any).rpc(
      "platform_revoke_masked_voice_session",
      { _tenant: data.tenantId, _session: data.sessionId },
    );
    if (error) throw new Error("Masked call session could not be revoked");
    return { revoked: revoked === true };
  });
