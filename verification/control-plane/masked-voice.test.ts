import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { twilioSignature } from "../../src/modules/connect/twilio";
import {
  serveMaskedVoice,
  resolveMaskedVoiceDestination,
} from "../../src/modules/connect/masked-voice.server";

const now = Date.parse("2026-10-11T12:00:00Z");
const url = "https://omniqora.itechlounge.co.uk/api/public/twilio/masked-voice";
const sid = "AC" + "a".repeat(32);
const callSid = "CA" + "b".repeat(32);
const token = "twilio-auth-token-mock";
const number = "+447000000001";
const a = "+447000000002";
const b = "+447000000003";
const env = {
  OMNIQORA_MASKED_VOICE_ENABLED: "true",
  OMNIQORA_PUBLIC_URL: "https://omniqora.itechlounge.co.uk",
  TWILIO_MASKED_VOICE_ACCOUNT_SID: sid,
  TWILIO_MASKED_VOICE_NUMBERS: number,
  TWILIO_AUTH_TOKEN: token,
};

function makeDb(mask: any = {}) {
  const actions: Array<{table:string, action:string, value?:unknown}> = [];
  const row = {
    id: "f5d2a1b4-a386-430c-8726-559b70b21a56",
    tenant_id: "f140eb9c-1836-49a2-aac3-0b81bb20b101",
    product_key: "dishbee",
    mask_number: number,
    participant_a: a,
    participant_b: b,
    provider_account_sid: sid,
    expires_at: new Date(now+10*60_000).toISOString(),
    status: "active",
    ...mask,
  };
  const db = {
    from(table:string) {
      actions.push({table, action:"from"});
      return {
        select() {return this;},
        eq() {return this;},
        gt() {return this;},
        async maybeSingle() {return {data:row,error:null};},
        async upsert(value:unknown, options:unknown) {
          actions.push({table,action:"upsert",value:{value,options}});
          return {error:null};
        },
      };
    },
  };
  return {db,actions,row};
}

function request(params: Record<string,string>, signature = true) {
  const data = new URLSearchParams(params).toString();
  const headers = new Headers({"content-type":"application/x-www-form-urlencoded"});
  if(signature) headers.set("x-twilio-signature", twilioSignature(url,params,token));
  return new Request(url,{method:"POST",headers,body:data});
}
const params = {From:a,To:number,AccountSid:sid,CallSid:callSid};

test("valid, signed participant A is bridged to B with only mask caller ID and no recording",async()=>{
 const {db,actions,row}=makeDb();
 const response=await serveMaskedVoice(request(params),db,env,()=>now);
 const xml=await response.text();
 assert.equal(response.status,200);
 assert.match(xml,/<Dial callerId="\+447000000001"/);
 assert.match(xml,/record="do-not-record"/);
 assert.ok(xml.includes("<Number>"+b+"</Number>"));
 assert.equal(xml.includes('callerId="'+a+'"'),false);
 assert.equal(actions.filter(x=>x.table==="masked_voice_call_receipts"&&x.action==="upsert").length,1);
 assert.equal(resolveMaskedVoiceDestination(row,{from:b,to:number,accountSid:sid,at:now}),a);
});

test("the transport stays disabled even for a valid Twilio signature without every gate",async()=>{
 const {db,actions}=makeDb();
 const response=await serveMaskedVoice(request(params),db,{...env,OMNIQORA_MASKED_VOICE_ENABLED:"false"},()=>now);
 assert.equal(response.status,503);
 assert.match(await response.text(),/<Reject/);
 assert.equal(actions.length,0);
});

test("spoofed signatures, bad SID and number pool mismatches fail without retrieving parties",async()=>{
 const {db,actions}=makeDb();
 const badSig=await serveMaskedVoice(request(params,false),db,env,()=>now);
 assert.equal(badSig.status,401);
 const badSid=await serveMaskedVoice(request({...params,AccountSid:"AC"+"c".repeat(32)}),db,env,()=>now);
 assert.match(await badSid.text(),/<Reject/);
 const badNumber=await serveMaskedVoice(request({...params,To:"+447000000009"}),db,env,()=>now);
 assert.match(await badNumber.text(),/<Reject/);
 assert.equal(actions.length,0);
});

test("third party, expired, revoked and mismatched account sessions never forward",async()=>{
 for(const changed of [
  {from:"+447000000009"},
  {mask:{expires_at:new Date(now-1000).toISOString()}},
  {mask:{status:"revoked"}},
  {mask:{provider_account_sid:"AC"+"c".repeat(32)}},
 ]) {
  const {db,actions}=makeDb(changed.mask??{});
  const incoming={...params,From:changed.from??params.From};
  const response=await serveMaskedVoice(request(incoming),db,env,()=>now);
  assert.match(await response.text(),/<Reject/);
  assert.equal(actions.some(x=>x.action==="upsert"),false);
 }
});

test("invalid duplicate parameters and incorrect content types are denied",async()=>{
 const {db,actions}=makeDb();
 const dupBody=new URLSearchParams(params).toString()+"&From="+encodeURIComponent(a);
 const bad=new Request(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","x-twilio-signature":twilioSignature(url,params,token)},body:dupBody});
 assert.equal((await serveMaskedVoice(bad,db,env,()=>now)).status,401);
 const badType=new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 assert.equal((await serveMaskedVoice(badType,db,env,()=>now)).status,415);
 assert.equal(actions.length,0);
});

test("SQL and HTTP route restrict masked sessions and receipts to service role",async()=>{
 const migration=await readFile(new URL("../../supabase/migrations/20261011181000_twilio_masked_voice_pilot.sql",import.meta.url),"utf8");
 const route=await readFile(new URL("../../src/routes/api.public.twilio.masked-voice.ts",import.meta.url),"utf8");
 const functions=await readFile(new URL("../../src/modules/connect/masked-voice.functions.ts",import.meta.url),"utf8");
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public.masked_voice_sessions/);
 assert.match(migration,/GRANT ALL ON public.masked_voice_sessions TO service_role/);
 assert.match(migration,/REVOKE ALL ON public.masked_voice_sessions FROM PUBLIC, anon, authenticated/);
 assert.match(migration,/GRANT ALL ON public.masked_voice_call_receipts TO service_role/);
 assert.match(migration,/pg_advisory_xact_lock/);
 assert.match(migration,/public.is_platform_admin\(auth.uid\(\)\)/);
 assert.match(migration,/routing->>'masking_mode'='enabled'/);
 assert.match(functions,/bothParticipantsConsented: z.literal\(true\)/);
 assert.match(route,/POST: async \(\{ request \}\)/);
 assert.doesNotMatch(route,/GET:.*serveMaskedVoice/);
});
