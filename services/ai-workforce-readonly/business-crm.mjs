/**
 * Phase 4D: first-party, strictly aggregated CRM lead summary.
 * This adapter makes ONE OpenAI Responses call from a trusted server only.
 * It never accepts arbitrary URLs, SQL, text from CRM records or external tools.
 */
export const OPENAI_RESPONSE_ORIGIN = "https://api.openai.com/v1/responses";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^[a-f0-9]{32}$/;
const MODEL=/^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/;
const SOURCE="omniqora.crm.leads-summary.v1";
const SNAPSHOT_KEYS=new Set(["sourceKey","origin","dataClass","totalLeads",
  "qualifiedLeads","convertedLeads","workingLeads","smallGroupsSuppressed","asOfUtc"]);
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;

export function validateCrmReadOnlyClaim(claim,expected){
 if(!claim||typeof claim!=="object"||
    claim.productKey!=="omniqora"||
    !UUID.test(claim.tenantId??"")||!UUID.test(claim.admissionId??"")||
    !UUID.test(claim.runId??"")||!UUID.test(claim.jobId??"")||
    !UUID.test(claim.employeeId??"")||!UUID.test(claim.taskId??"")||
    claim.tenantId!==expected.tenantId||claim.productKey!==expected.productKey||
    claim.sourceKey!==SOURCE||claim.sourceReadOnly!==true||
    claim.humanReviewRequired!==true||!Array.isArray(claim.allowedTools)||
    claim.allowedTools.length!==0||!DIGEST.test(claim.sourceHash??"")||
    claim.providerKey!=="openai"||!MODEL.test(claim.modelKey??"")||
    claim.modelKey!==expected.modelId||
    !Number.isInteger(claim.maxInputTokens)||claim.maxInputTokens<256||
    claim.maxInputTokens>1200||
    !Number.isInteger(claim.maxOutputTokens)||claim.maxOutputTokens<64||
    claim.maxOutputTokens>256){
  throw new Error("Untrusted or out-of-scope read-only model claim");
 }
 const snap=claim.aggregate;
 if(!snap||typeof snap!=="object"||Array.isArray(snap)||
    Object.keys(snap).some(k=>!SNAPSHOT_KEYS.has(k))||
    snap.sourceKey!==SOURCE||snap.origin!=="first_party_crm_aggregate"||
    snap.dataClass!=="aggregate_internal"||
    snap.smallGroupsSuppressed!==true||
    !safeInt(snap.totalLeads)||snap.totalLeads<10||
    typeof snap.asOfUtc!=="string"||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(snap.asOfUtc)){
  throw new Error("Unverified aggregate CRM snapshot");
 }
 for(const field of ["qualifiedLeads","convertedLeads","workingLeads"]){
  const value=snap[field];
  if(value!==null&&(!safeInt(value)||value<5||value>snap.totalLeads))
    throw new Error("Unsafe small-group CRM value");
 }
 const age=Date.now()-Date.parse(snap.asOfUtc);
 if(!Number.isFinite(age)||age<0||age>30*60*1000)
  throw new Error("CRM aggregate snapshot expired");
 return snap;
}

export function buildCrmReadOnlyPayload(claim,expected){
 const s=validateCrmReadOnlyClaim(claim,expected);
 const data=JSON.stringify({
  source:"First-party, tenant-scoped aggregate CRM counts (no individual records)",
  citation:SOURCE,privacy:"Small groups suppressed; null means not publishable",
  metrics:{
   totalLeads:s.totalLeads,
   qualifiedLeads:s.qualifiedLeads,
   convertedLeads:s.convertedLeads,
   workingLeads:s.workingLeads,
  },
 });
 if(data.length>1200)throw new Error("CRM aggregate prompt size exceeded");
 return Object.freeze({
  model:claim.modelKey,
  store:false,background:false,stream:false,tool_choice:"none",tools:[],
  parallel_tool_calls:false,
  max_output_tokens:claim.maxOutputTokens,
  instructions:"Only analyse the provided aggregated CRM metrics. Do not claim individual records, external connections or verified revenue. A null metric is suppressed, not zero. Explain limitations; no marketing outreach, payments, user decisions or business actions. Respond in plain language for independent human approval.",
  input:[{role:"user",content:data}],
 });
}

async function boundedResponse(res,max=16000){
 const size=Number(res.headers?.get?.("content-length"));
 if(Number.isFinite(size)&&size>max)throw new Error("Model response body too large");
 if(res.body&&typeof res.body.getReader==="function"){
  const reader=res.body.getReader();let bytes=0;const chunks=[];
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>max){await reader.cancel().catch(()=>{});throw new Error("Model response body too large");}
   chunks.push(value);
  }
  const buffer=new Uint8Array(bytes);let i=0;
  for(const chunk of chunks){buffer.set(chunk,i);i+=chunk.byteLength;}
  return new TextDecoder().decode(buffer);
 }
 const body=await res.text();
 if(body.length>max)throw new Error("Model response body too large");
 return body;
}

/** Exactly one outbound POST, no retries, no URL indirection. */
export async function performReadOnlyCrmModelCall({
 claim,expected,providerToken,fetcher=fetch,timeoutMs=8000,
}){
 const request=buildCrmReadOnlyPayload(claim,expected);
 if(typeof providerToken!=="string"||providerToken.length<32)
   throw new Error("Missing trusted server-only model credential");
 if(typeof fetcher!=="function"||!Number.isInteger(timeoutMs)||
   timeoutMs<1000||timeoutMs>10000)throw new Error("Unsafe model connection limit");
 const response=await fetcher(OPENAI_RESPONSE_ORIGIN,{
  method:"POST",headers:{
    Authorization:"Bearer "+providerToken,"Content-Type":"application/json",
  },
  body:JSON.stringify(request),redirect:"error",signal:AbortSignal.timeout(timeoutMs),
 });
 if(!response||response.ok!==true)throw new Error("Model provider rejected read-only CRM analysis");
 let data;
 try{data=JSON.parse(await boundedResponse(response));}
 catch{throw new Error("Model provider returned incomplete/invalid JSON");}
 if(!data||data.status!=="completed"||!Array.isArray(data.output)||
    data.output.length===0||
    data.output.some(item=>item.type!=="message"||
      !Array.isArray(item.content)||
      item.content.some(part=>part.type!=="output_text"||typeof part.text!=="string"))){
  throw new Error("Model tool output, refusal or incomplete response rejected");
 }
 const summary=data.output.flatMap(x=>x.content.map(y=>y.text)).join("\n").trim();
 if(summary.length<20||summary.length>3500)throw new Error("Unbounded or empty review summary");
 if(typeof data.id!=="string"||!/^resp_[A-Za-z0-9_-]{8,110}$/.test(data.id))
  throw new Error("Missing valid provider usage receipt identifier");
 const input=data.usage?.input_tokens,output=data.usage?.output_tokens;
 if(!Number.isInteger(input)||!Number.isInteger(output)||
  input<1||input>claim.maxInputTokens||
  output<1||output>claim.maxOutputTokens){
  throw new Error("Model usage exceeded admission limits");
 }
 return Object.freeze({
  summary,sourceKey:SOURCE,sourceHash:claim.sourceHash,
  dataOrigin:"first_party_crm_aggregate",modelId:claim.modelKey,
  providerReceiptId:data.id,inputTokens:input,outputTokens:output,
  modelCalls:1,toolCalls:0,customerActions:0,
  reviewRequired:true,
 });
}
