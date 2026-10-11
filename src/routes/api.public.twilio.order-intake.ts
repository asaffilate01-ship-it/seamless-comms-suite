import { createFileRoute } from "@tanstack/react-router";
import { twiml, xmlEscape } from "@/modules/connect/twilio";
import {
  approvedCallForward, validateTwilioOrderWebhook, TwilioOrderWebhookError,
  type TwilioInboundKind,
} from "@/modules/connect/twilio-order-intake.security";

async function channel(db:any, kind:TwilioInboundKind, address:string) {
  const {data,error}=await db.from("order_intake_channels").select("*")
    .eq("provider","twilio").eq("channel",kind)
    .eq("address",address).eq("enabled",true).maybeSingle();
  if(error)throw new Error("Reception channel lookup failed");
  return data;
}

async function session(db:any,ch:any,p:Record<string,string>,kind:TwilioInboundKind) {
  const providerSessionId=kind==="voice"?p.CallSid:p.MessageSid;
  const lookup=()=>db.from("reception_sessions").select("*").eq("provider","twilio")
    .eq("provider_session_id",providerSessionId).maybeSingle();
  const existing=await lookup();
  if(existing.error)throw new Error("Reception session lookup failed");
  if(existing.data){
    if(existing.data.tenant_id!==ch.tenant_id || existing.data.channel_id!==ch.id) {
      throw new Error("Reception channel identity mismatch");
    }
    return existing.data;
  }

  // No AI agent is assumed to exist merely because a channel checkbox is set.
  // Use human reception until an approved AI provider session is actually wired.
  const created=await db.from("reception_sessions").insert({
    tenant_id:ch.tenant_id,product_key:ch.product_key,
    brand_id:ch.brand_id,location_id:ch.location_id,channel_id:ch.id,
    channel:kind,provider:"twilio",provider_session_id:providerSessionId,
    customer_phone:(p.From||"").replace(/^whatsapp:/,""),
    mode:"human",status:"human_active",
    metadata:{to:p.To,from:p.From},
  }).select("*").single();
  if(!created.error&&created.data)return created.data;
  // A parallel Twilio retry may have created the same session meanwhile.
  if(created.error?.code==="23505"){
    const retry=await lookup();
    if(!retry.error && retry.data && retry.data.tenant_id===ch.tenant_id &&
       retry.data.channel_id===ch.id) return retry.data;
  }
  throw new Error("Reception session could not be created");
}

export const Route=createFileRoute("/api/public/twilio/order-intake")({
  server:{handlers:{POST:async({request})=>{
    try {
      const {params,kind}=await validateTwilioOrderWebhook(request);
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      const db=supabaseAdmin as any;
      const ch=await channel(db,kind,params.To||"");
      if(!ch)return twiml('<Reject reason="rejected"/>',404);
      const s=await session(db,ch,params,kind);

      if(kind==="sms" || kind==="whatsapp"){
        const append=await db.rpc("server_append_twilio_reception_message",{
          _session:s.id,
          _account_sid:params.AccountSid,
          _message_sid:params.MessageSid,
          _body:(params.Body||"").slice(0,4096),
        });
        if(append.error)throw new Error("Message could not be recorded");
        // Repeat callbacks must not duplicate transcripts or auto-replies.
        if(append.data===false)return twiml("");
        const reply=kind==="sms"
          ? ch.routing?.sms_reply
          : ch.routing?.whatsapp_reply;
        return twiml(`<Message>${xmlEscape(
          typeof reply==="string" && reply.length<=1000
            ? reply : "Thanks. A team member can help with your order here."
        )}</Message>`);
      }

      const greeting=xmlEscape(typeof ch.greeting==="string" && ch.greeting.length<=1000
        ? ch.greeting
        : "Thank you for calling. Please hold while we check the order desk.");
      const forward=approvedCallForward(ch.routing?.forward_to,params.From||"",params.To||"");
      if(ch.human_handoff_enabled && forward){
        return twiml(`<Say>${greeting}</Say><Dial callerId="${xmlEscape(params.To||"")}" record="do-not-record"><Number>${xmlEscape(forward)}</Number></Dial>`);
      }
      // Never pretend there is an AI operator or leave the caller in a blind hold.
      return twiml("<Say>Our ordering team is unavailable. Please try again later.</Say><Hangup/>");
    } catch(error) {
      if(error instanceof TwilioOrderWebhookError){
        return new Response(error.message,{status:error.status,headers:{"cache-control":"no-store"}});
      }
      return new Response("Twilio reception is unavailable",{status:503,headers:{"cache-control":"no-store"}});
    }
  }}}
});
