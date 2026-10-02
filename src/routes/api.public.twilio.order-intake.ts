import { createFileRoute } from "@tanstack/react-router";
import { parseUrlEncoded,twiml,verifyTwilioSignature,xmlEscape } from "@/modules/connect/twilio";

async function channel(db:any,kind:string,address:string){
  const{data,error}=await db.from("order_intake_channels").select("*").eq("provider","twilio").eq("channel",kind).eq("address",address).eq("enabled",true).maybeSingle();
  if(error)throw new Error(error.message);return data;
}
async function session(db:any,ch:any,p:Record<string,string>){
  const providerSessionId=p.CallSid||p.MessageSid;
  const existing=await db.from("reception_sessions").select("*").eq("provider","twilio").eq("provider_session_id",providerSessionId).maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data)return existing.data;
  const mode=ch.ai_reception_enabled?(ch.human_handoff_enabled?"hybrid":"ai"):"human";
  const created=await db.from("reception_sessions").insert({
    tenant_id:ch.tenant_id,product_key:ch.product_key,brand_id:ch.brand_id,location_id:ch.location_id,channel_id:ch.id,
    channel:ch.channel,provider:"twilio",provider_session_id:providerSessionId,customer_phone:(p.From||"").replace(/^whatsapp:/,""),
    mode,status:mode==="ai"?"ai_active":"human_active",metadata:{to:p.To,from:p.From}
  }).select("*").single();
  if(created.error)throw new Error(created.error.message);return created.data;
}
export const Route=createFileRoute("/api/public/twilio/order-intake")({
  server:{handlers:{POST:async({request})=>{
    const{params}=await parseUrlEncoded(request);
    const token=process.env.TWILIO_AUTH_TOKEN||"";
    if(!verifyTwilioSignature(request.url,params,request.headers.get("x-twilio-signature"),token))return new Response("Invalid signature",{status:401});
    const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
    const isWhatsApp=(params.From||"").startsWith("whatsapp:")||(params.To||"").startsWith("whatsapp:");
    const kind=isWhatsApp?"whatsapp":"voice";const ch=await channel(db,kind,params.To||"");
    if(!ch)return twiml(isWhatsApp?"":"<Say>This ordering line is not configured.</Say>",404);
    const s=await session(db,ch,params);
    if(isWhatsApp){
      await db.from("reception_sessions").update({transcript:[{direction:"inbound",body:params.Body||"",at:new Date().toISOString()}],intent:"order"}).eq("id",s.id);
      return twiml(`<Message>${xmlEscape(ch.routing?.whatsapp_reply||"Thanks. A team member can take your order here.")}</Message>`);
    }
    const greeting=xmlEscape(ch.greeting||"Thank you for calling. Please hold while we connect you to the order desk.");
    const forward=ch.routing?.forward_to;
    if(forward&&ch.human_handoff_enabled)return twiml(`<Say>${greeting}</Say><Dial callerId="${xmlEscape(params.To||"")}">${xmlEscape(String(forward))}</Dial>`);
    return twiml(`<Say>${greeting}</Say><Pause length="1"/><Say>Please stay on the line.</Say>`);
  }}}
});
