import { verifyTwilioSignature, twiml, xmlEscape } from "./twilio";

type ActiveMask = {
  id: string;
  tenant_id: string;
  product_key: string;
  channel_id: string;
  mask_number: string;
  participant_a: string;
  participant_b: string;
  provider_account_sid: string;
  expires_at: string;
  status: string;
};

const e164 = /^\+[1-9][0-9]{7,14}$/;
const accountSid = /^AC[a-fA-F0-9]{32}$/;
const callSid = /^CA[a-fA-F0-9]{32}$/;
const reject = () => twiml('<Reject reason="rejected"/>');

export type MaskDatabase = {
  from(table: string): any;
};

export function resolveMaskedVoiceDestination(
  session: ActiveMask | null,
  incoming: { from: string; to: string; accountSid: string; at: number },
): string | null {
  if (!session || session.status !== "active" ||
      !e164.test(incoming.from) || !e164.test(incoming.to) ||
      session.mask_number !== incoming.to ||
      session.provider_account_sid !== incoming.accountSid ||
      Date.parse(session.expires_at) <= incoming.at) return null;
  if (incoming.from === session.participant_a) return session.participant_b;
  if (incoming.from === session.participant_b) return session.participant_a;
  return null;
}

export function maskedVoiceTwiml(destination: string, maskNumber: string): Response {
  if (!e164.test(destination) || !e164.test(maskNumber)) return reject();
  // Do not record the call; Twilio sees only the dedicated relay number as CLI.
  return twiml(
    '<Dial callerId="' + xmlEscape(maskNumber) +
    '" answerOnBridge="true" record="do-not-record"><Number>' +
    xmlEscape(destination) + '</Number></Dial>',
  );
}

export async function serveMaskedVoice(
  request: Request,
  db: MaskDatabase,
  env: Record<string, string | undefined> = process.env,
  now = () => Date.now(),
): Promise<Response> {
  // Feature remains entirely dark unless every explicit pilot gate is present.
  const token = env.TWILIO_AUTH_TOKEN ?? "";
  const sid = env.TWILIO_MASKED_VOICE_ACCOUNT_SID ?? "";
  const origin = env.OMNIQORA_PUBLIC_URL ?? "";
  const numbers = new Set((env.TWILIO_MASKED_VOICE_NUMBERS ?? "").split(",").map(x => x.trim()).filter(Boolean));
  if (env.OMNIQORA_MASKED_VOICE_ENABLED !== "true" ||
      !token || !accountSid.test(sid) || !origin || !numbers.size) {
    return twiml('<Reject reason="rejected"/>', 503);
  }

  let publicUrl: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.pathname !== "/" ||
        url.search || url.hash || url.username || url.password) throw Error("Unsafe origin");
    publicUrl = url.origin + "/api/public/twilio/masked-voice";
  } catch {
    return twiml('<Reject reason="rejected"/>', 503);
  }

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported payload", { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 8192) {
    return new Response("Payload too large", { status: 413 });
  }

  const body = await request.text();
  if (body.length > 8192) return new Response("Payload too large", { status: 413 });
  const input = new URLSearchParams(body);
  const params = Object.fromEntries(input.entries());
  if (input.size !== Object.keys(params).length ||
      !verifyTwilioSignature(publicUrl, params, request.headers.get("x-twilio-signature"), token)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const from = params.From ?? "";
  const to = params.To ?? "";
  if (!e164.test(from) || !e164.test(to) || !numbers.has(to) ||
      params.AccountSid !== sid || !callSid.test(params.CallSid ?? "")) {
    return reject();
  }

  const result = await db.from("masked_voice_sessions")
    .select("id,tenant_id,product_key,channel_id,mask_number,participant_a,participant_b,provider_account_sid,expires_at,status")
    .eq("mask_number", to).eq("provider_account_sid", sid)
    .eq("status", "active").gt("expires_at", new Date(now()).toISOString()).maybeSingle();

  // A database failure must never result in an external call or disclose PII.
  if (result.error || !result.data) return reject();
  const record = result.data as ActiveMask;
  const destination = resolveMaskedVoiceDestination(record, { from, to, accountSid: sid, at: now() });
  if (!destination) return reject();

  // A tenant admin may disable or reassign the channel after session issuance.
  // Never forward a call unless the exact channel is still explicitly approved.
  const channel = await db.from("order_intake_channels")
    .select("id,tenant_id,product_key,provider,channel,address,enabled,routing,metadata")
    .eq("id", record.channel_id).eq("tenant_id", record.tenant_id)
    .eq("product_key", record.product_key).eq("provider", "twilio")
    .eq("channel", "voice").eq("enabled", true).maybeSingle();
  if (channel.error || !channel.data ||
      channel.data.address !== to ||
      channel.data.routing?.masking_mode !== "enabled" ||
      channel.data.metadata?.twilioAccountSid !== sid) return reject();

  // Capture only call SID and session binding, not raw participant numbers.
  const receipt = await db.from("masked_voice_call_receipts").upsert({
    tenant_id: record.tenant_id,
    session_id: record.id,
    provider_call_sid: params.CallSid,
    provider_account_sid: sid,
  }, { onConflict: "provider_account_sid,provider_call_sid", ignoreDuplicates: true });
  if (receipt.error) return reject();
  return maskedVoiceTwiml(destination, to);
}
