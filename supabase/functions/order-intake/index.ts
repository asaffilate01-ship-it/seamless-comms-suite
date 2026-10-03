import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const ORDER_HANDOFF_URL = Deno.env.get("ORDER_HANDOFF_URL") || "";
const PAYMENT_LINK_URL = Deno.env.get("PAYMENT_LINK_URL") || "";
const INTERNAL_ORDER_INTAKE_SECRET = Deno.env.get("INTERNAL_ORDER_INTAKE_SECRET") || "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/xml; charset=utf-8" } });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function esc(v = "") {
  return v.replace(/[<>&'"]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", '"':"&quot;" }[c]!));
}
async function form(req: Request) {
  const fd = await req.formData(); const out: Record<string,string> = {};
  for (const [k,v] of fd.entries()) out[k] = String(v);
  return out;
}
async function channelFor(provider: string, channel: string, address: string) {
  const { data, error } = await db.from("order_intake_channels")
    .select("*").eq("provider", provider).eq("channel", channel).eq("address", address).eq("enabled", true).maybeSingle();
  if (error) throw error; return data;
}
async function newSession(ch: any, p: any, providerSessionId: string) {
  const { data, error } = await db.from("order_intake_sessions").insert({
    tenant_id: ch.tenant_id, product_key: ch.product_key, location_id: ch.location_id,
    channel: ch.channel, provider: ch.provider, provider_session_id: providerSessionId,
    customer_phone: (p.From || "").replace(/^whatsapp:/,""),
    metadata: { to: p.To, call_status: p.CallStatus, message_sid: p.MessageSid }
  }).select("*").single();
  if (error) throw error; return data;
}
async function sendPaymentLink(session: any, draft: any) {
  if (!PAYMENT_LINK_URL) throw new Error("PAYMENT_LINK_URL is not configured");
  const r = await fetch(PAYMENT_LINK_URL, {
    method: "POST", headers: { "content-type":"application/json" },
    body: JSON.stringify({
      tenant_id: session.tenant_id, session_id: session.id,
      amount_minor: draft.total_minor, currency: draft.currency || "GBP",
      customer_phone: session.customer_phone, description: draft.description || "Order"
    })
  });
  if (!r.ok) throw new Error("payment link provider failed");
  const p = await r.json();
  await db.from("order_payment_requests").insert({
    session_id: session.id, tenant_id: session.tenant_id, provider: p.provider || "external",
    provider_reference: p.reference, amount_minor: draft.total_minor, currency: draft.currency || "GBP",
    payment_url: p.url, status: "sent", expires_at: p.expires_at || null, metadata: p
  });
  await db.from("order_intake_sessions").update({
    order_draft: draft, total_minor: draft.total_minor, currency: draft.currency || "GBP",
    status: "awaiting_payment", updated_at: new Date().toISOString()
  }).eq("id", session.id);
  return p;
}

Deno.serve(async (req) => {
  try {
    const path = new URL(req.url).pathname.split("/order-intake")[1] || "/";
    if (req.method === "GET" && path === "/health") return json({ ok:true, service:"order-intake" });

    if (path === "/voice/inbound" && req.method === "POST") {
      const p = await form(req), ch = await channelFor("twilio","voice",p.To);
      if (!ch) return xml("<Response><Say>Sorry, this number is not configured for ordering.</Say></Response>",404);
      await newSession(ch,p,p.CallSid);
      const label = ch.routing?.greeting || "Thank you for calling. Please hold while we connect you to the order desk.";
      const target = ch.routing?.forward_to;
      if (target) return xml(`<Response><Say>${esc(label)}</Say><Dial callerId="${esc(p.To)}">${esc(target)}</Dial></Response>`);
      return xml(`<Response><Say>${esc(label)}</Say><Enqueue waitUrl="">order-${esc(String(ch.tenant_id))}</Enqueue></Response>`);
    }

    if (path === "/whatsapp/inbound" && req.method === "POST") {
      const p = await form(req), ch = await channelFor("twilio","whatsapp",p.To);
      if (!ch) return xml("<Response></Response>");
      const session = await newSession(ch,p,p.MessageSid);
      const reply = ch.routing?.whatsapp_reply || "Thanks — we can take your order here. A team member will reply shortly.";
      await db.from("order_intake_sessions").update({ metadata: { inbound_text:p.Body || "" } }).eq("id",session.id);
      return xml(`<Response><Message>${esc(reply)}</Message></Response>`);
    }

    if (path === "/manual/order" && req.method === "POST") {
      if (!INTERNAL_ORDER_INTAKE_SECRET || req.headers.get("x-order-intake-secret") !== INTERNAL_ORDER_INTAKE_SECRET)
        return json({ error:"unauthorized" },401);
      const b = await req.json();
      const { data: session, error } = await db.from("order_intake_sessions").insert({
        tenant_id:b.tenant_id, product_key:b.product_key, location_id:b.location_id || null,
        channel:b.channel || "manual", provider:b.provider || "omniqora",
        provider_session_id:b.provider_session_id || crypto.randomUUID(),
        customer_phone:b.customer_phone, customer_name:b.customer_name,
        order_draft:b.order, total_minor:b.order?.total_minor, currency:b.order?.currency || "GBP",
        status:"draft", metadata:b.metadata || {}
      }).select("*").single();
      if (error) throw error;
      if (b.send_payment_link) return json({ session, payment: await sendPaymentLink(session,b.order) },201);
      return json({ session },201);
    }

    if (path === "/payment/status" && req.method === "POST") {
      const b = await req.json();
      const { data: pr, error } = await db.from("order_payment_requests")
        .select("*").eq("provider_reference",b.reference).maybeSingle();
      if (error || !pr) return json({ error:"payment request not found" },404);
      const paid = b.status === "paid";
      await db.from("order_payment_requests").update({ status:b.status, metadata:b, updated_at:new Date().toISOString() }).eq("id",pr.id);
      if (paid) {
        const { data: s } = await db.from("order_intake_sessions").update({ status:"paid", updated_at:new Date().toISOString() }).eq("id",pr.session_id).select("*").single();
        if (ORDER_HANDOFF_URL && s) {
          const h = await fetch(ORDER_HANDOFF_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(s)});
          if (h.ok) {
            const out = await h.json().catch(()=>({}));
            await db.from("order_intake_sessions").update({status:"submitted",target_order_id:out.order_id || null,updated_at:new Date().toISOString()}).eq("id",s.id);
          }
        }
      }
      return json({ ok:true });
    }

    return json({ error:"not found" },404);
  } catch (e) {
    console.error(e); return json({ error:"order intake error" },500);
  }
});
