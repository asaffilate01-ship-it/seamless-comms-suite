import { verifyTwilioSignature } from "./twilio";

const e164 = /^\+[1-9][0-9]{7,14}$/;
const whatsapp = /^whatsapp:\+[1-9][0-9]{7,14}$/;
const accountSid = /^AC[a-fA-F0-9]{32}$/;
const voiceSid = /^CA[a-fA-F0-9]{32}$/;
const messageSid = /^(SM|MM)[a-fA-F0-9]{32}$/;

export class TwilioOrderWebhookError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "TwilioOrderWebhookError";
  }
}

export type TwilioInboundKind = "voice" | "sms" | "whatsapp";

export function classifyTwilioInbound(params: Record<string,string>): TwilioInboundKind {
  const from = params.From ?? "";
  const to = params.To ?? "";
  if (from.startsWith("whatsapp:") || to.startsWith("whatsapp:")) {
    if (!whatsapp.test(from) || !whatsapp.test(to) ||
        !messageSid.test(params.MessageSid ?? "")) {
      throw new TwilioOrderWebhookError(422,"Invalid WhatsApp intake");
    }
    return "whatsapp";
  }
  if (params.MessageSid) {
    if (!e164.test(from) || !e164.test(to) || !messageSid.test(params.MessageSid)) {
      throw new TwilioOrderWebhookError(422,"Invalid SMS intake");
    }
    return "sms";
  }
  if (!e164.test(from) || !e164.test(to) || !voiceSid.test(params.CallSid ?? "")) {
    throw new TwilioOrderWebhookError(422,"Invalid voice intake");
  }
  return "voice";
}

export async function validateTwilioOrderWebhook(
  request: Request,
  env: Record<string,string|undefined> = process.env,
): Promise<{params: Record<string,string>; kind: TwilioInboundKind}> {
  const token = env.TWILIO_AUTH_TOKEN ?? "";
  const sid = env.TWILIO_ACCOUNT_SID ?? "";
  const origin = env.OMNIQORA_PUBLIC_URL ?? "";
  if (!token || !accountSid.test(sid) || !origin) {
    throw new TwilioOrderWebhookError(503,"Twilio intake is not configured");
  }
  let callbackUrl: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.pathname !== "/" ||
        url.search || url.hash || url.username || url.password) throw Error("Origin");
    callbackUrl = url.origin + "/api/public/twilio/order-intake";
  } catch {
    throw new TwilioOrderWebhookError(503,"Twilio callback origin is not configured");
  }
  if (!(request.headers.get("content-type")??"").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw new TwilioOrderWebhookError(415,"Unsupported webhook content");
  }
  if (Number(request.headers.get("content-length")??0) > 32768) {
    throw new TwilioOrderWebhookError(413,"Webhook payload too large");
  }
  const body = await request.text();
  if (body.length > 32768) throw new TwilioOrderWebhookError(413,"Webhook payload too large");
  const items = new URLSearchParams(body);
  const params = Object.fromEntries(items.entries());
  if (items.size !== Object.keys(params).length) {
    throw new TwilioOrderWebhookError(400,"Duplicate Twilio parameters");
  }
  if (!verifyTwilioSignature(callbackUrl,params,request.headers.get("x-twilio-signature"),token)) {
    throw new TwilioOrderWebhookError(401,"Invalid Twilio signature");
  }
  if (params.AccountSid !== sid) {
    throw new TwilioOrderWebhookError(403,"Twilio account mismatch");
  }
  return { params, kind: classifyTwilioInbound(params) };
}

export function approvedCallForward(
  value: unknown, caller: string, relay: string,
  env: Record<string,string|undefined> = process.env,
): string | null {
  if (typeof value !== "string" || !e164.test(value) ||
      value === caller || value === relay) return null;
  const allowed = (env.TWILIO_APPROVED_FORWARD_NUMBERS??"").split(",").map(v=>v.trim());
  return allowed.includes(value) ? value : null;
}
