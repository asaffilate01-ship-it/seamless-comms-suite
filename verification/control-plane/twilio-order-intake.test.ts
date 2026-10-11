import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { twilioSignature } from "../../src/modules/connect/twilio";
import {
 validateTwilioOrderWebhook, classifyTwilioInbound, approvedCallForward,
 TwilioOrderWebhookError,
} from "../../src/modules/connect/twilio-order-intake.security";

const url="https://omniqora.itechlounge.co.uk/api/public/twilio/order-intake";
const token="twilio-mock-auth-secret";
const sid="AC"+"a".repeat(32);
const env={
 TWILIO_AUTH_TOKEN:token,TWILIO_ACCOUNT_SID:sid,
 OMNIQORA_PUBLIC_URL:"https://omniqora.itechlounge.co.uk",
 TWILIO_APPROVED_FORWARD_NUMBERS:"+447000000020,+447000000021",
};
const phoneA="+447000000001",phoneB="+447000000002";
const voice={From:phoneA,To:phoneB,AccountSid:sid,CallSid:"CA"+"c".repeat(32)};
const sms={From:phoneA,To:phoneB,AccountSid:sid,MessageSid:"SM"+"d".repeat(32)};
const wa={From:"whatsapp:"+phoneA,To:"whatsapp:"+phoneB,AccountSid:sid,MessageSid:"SM"+"e".repeat(32)};

function callback(params:Record<string,string>,signed=true) {
 const body=new URLSearchParams(params).toString();
 const headers=new Headers({"content-type":"application/x-www-form-urlencoded"});
 if(signed) headers.set("x-twilio-signature",twilioSignature(url,params,token));
 return new Request(url,{method:"POST",headers,body});
}

test("signed, correct-account callbacks are classified as voice, SMS and WhatsApp",async()=>{
 assert.equal((await validateTwilioOrderWebhook(callback(voice),env)).kind,"voice");
 assert.equal((await validateTwilioOrderWebhook(callback(sms),env)).kind,"sms");
 assert.equal((await validateTwilioOrderWebhook(callback(wa),env)).kind,"whatsapp");
});

test("missing credentials, spoofed signatures and wrong Twilio accounts are refused",async()=>{
 await assert.rejects(()=>validateTwilioOrderWebhook(callback(voice),{...env,TWILIO_ACCOUNT_SID:""}),{status:503});
 await assert.rejects(()=>validateTwilioOrderWebhook(callback(voice,false),env),{status:401});
 const wrong={...voice,AccountSid:"AC"+"b".repeat(32)};
 await assert.rejects(()=>validateTwilioOrderWebhook(callback(wrong),env),{status:403});
});

test("voice, text and WhatsApp session SIDs and destination formats cannot be confused",()=>{
 assert.throws(()=>classifyTwilioInbound({...voice,CallSid:"SM"+"c".repeat(32)}),TwilioOrderWebhookError);
 assert.throws(()=>classifyTwilioInbound({...sms,MessageSid:"CA"+"c".repeat(32)}),TwilioOrderWebhookError);
 assert.throws(()=>classifyTwilioInbound({...wa,From:phoneA}),TwilioOrderWebhookError);
});

test("duplicate form parameters and wrong media type are rejected",async()=>{
 const duplicate=new URLSearchParams(voice).toString()+"&From="+encodeURIComponent(phoneA);
 const bad=new Request(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","x-twilio-signature":twilioSignature(url,voice,token)},body:duplicate});
 await assert.rejects(()=>validateTwilioOrderWebhook(bad,env),{status:400});
 const json=new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 await assert.rejects(()=>validateTwilioOrderWebhook(json,env),{status:415});
});

test("a voice number only forwards to an explicitly allowlisted different destination",()=>{
 assert.equal(approvedCallForward("+447000000020",phoneA,phoneB,env),"+447000000020");
 assert.equal(approvedCallForward("+447000000099",phoneA,phoneB,env),null);
 assert.equal(approvedCallForward(phoneA,phoneA,phoneB,env),null);
 assert.equal(approvedCallForward("not-a-phone",phoneA,phoneB,env),null);
 assert.equal(approvedCallForward("+447000000020",phoneA,phoneB,{...env,TWILIO_APPROVED_FORWARD_NUMBERS:""}),null);
});

test("the route uses atomic transcript receipts and never asserts an unwired AI agent",async()=>{
 const source=await readFile(new URL("../../src/routes/api.public.twilio.order-intake.ts",import.meta.url),"utf8");
 const sql=await readFile(new URL("../../supabase/migrations/20261011190000_twilio_reception_message_receipts.sql",import.meta.url),"utf8");
 assert.match(source,/validateTwilioOrderWebhook\(request\)/);
 assert.match(source,/mode:"human",status:"human_active"/);
 assert.match(source,/server_append_twilio_reception_message/);
 assert.match(source,/MessageSid identifies a delivery event, not a customer conversation/);
 assert.match(source,/\.eq\("customer_phone",\(p.From\|\|""\)\.replace/);
 assert.match(source,/append\.data===false/);
 assert.doesNotMatch(source,/status:mode==="ai"\?"ai_active"/);
 assert.match(sql,/UNIQUE\(provider_account_sid,provider_message_sid\)/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.server_append_twilio_reception_message/);
 assert.match(sql,/TO service_role/);
});
