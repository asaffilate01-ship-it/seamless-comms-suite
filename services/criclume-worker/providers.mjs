import {validateClaim,validateReceipt} from './worker.mjs';
const instructions='Review only supplied cricket aggregates. Give coaching discussion and limitations. Do not invent measurements, identify people, infer injuries, change scores, claim ball speed or calibrated biomechanics. Human review is required.';
export const providerCapabilities=Object.freeze([{key:'openai',name:'OpenAI',inputs:['aggregate','image','sampled_frames']},{key:'anthropic',name:'Claude',inputs:['aggregate','image','sampled_frames']},{key:'google',name:'Gemini',inputs:['aggregate','image','sampled_frames','video']}]);
export function buildProviderRequest(c){
 validateClaim(c,c.tenantId);const text=JSON.stringify({task:c.task,evidence:c.snapshot});
 if(Buffer.byteLength(instructions+text,'utf8')>c.maxInputTokens)throw new Error('Conservative prompt bound exceeds reservation');
 if(c.providerKey==='openai')return {url:'https://api.openai.com/v1/responses',headers:{},body:{model:c.modelKey,store:false,stream:false,background:false,max_output_tokens:c.maxOutputTokens,tool_choice:'none',tools:[],instructions,input:[{role:'user',content:[{type:'input_text',text}]}]}};
 if(c.providerKey==='anthropic')return {url:'https://api.anthropic.com/v1/messages',headers:{'anthropic-version':'2023-06-01'},body:{model:c.modelKey,max_tokens:c.maxOutputTokens,system:instructions,messages:[{role:'user',content:[{type:'text',text}]}]}};
 if(c.providerKey==='google')return {url:`https://generativelanguage.googleapis.com/v1beta/models/${c.modelKey}:generateContent`,headers:{},body:{systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text}]}],generationConfig:{maxOutputTokens:c.maxOutputTokens,candidateCount:1},tools:[]}};
 throw new Error('Unreviewed provider');
}
export function parseProviderReceipt(c,d){
 let summary,id,input,output,cached=0;
 if(c.providerKey==='openai'){
  if(d.status!=='completed'||!Array.isArray(d.output)||d.output.some(x=>!['message','reasoning'].includes(x.type)))throw new Error('Incomplete or tool-bearing response');
  const p=d.output.filter(x=>x.type==='message').flatMap(x=>x.content??[]);if(p.some(x=>x.type!=='output_text'))throw new Error('Non-text response');summary=p.map(x=>x.text).join('\n');id=d.id;input=d.usage?.input_tokens;output=d.usage?.output_tokens;cached=d.usage?.input_tokens_details?.cached_tokens??0;
 }else if(c.providerKey==='anthropic'){
  if(d.stop_reason!=='end_turn'||!Array.isArray(d.content)||d.content.some(x=>x.type!=='text')||(d.usage?.cache_creation_input_tokens??0)!==0||(d.usage?.cache_read_input_tokens??0)!==0)throw new Error('Incomplete, cached or tool-bearing response');
  summary=d.content.map(x=>x.text).join('\n');id=d.id;input=d.usage?.input_tokens;output=d.usage?.output_tokens;
 }else if(c.providerKey==='google'){
  const a=d.candidates?.[0];if(d.candidates?.length!==1||a.finishReason!=='STOP'||!Array.isArray(a.content?.parts)||a.content.parts.some(x=>typeof x.text!=='string'||x.functionCall))throw new Error('Incomplete or tool-bearing response');summary=a.content.parts.filter(x=>!x.thought).map(x=>x.text).join('\n');id=d.responseId;input=d.usageMetadata?.promptTokenCount;output=(d.usageMetadata?.candidatesTokenCount??NaN)+(d.usageMetadata?.thoughtsTokenCount??0);cached=d.usageMetadata?.cachedContentTokenCount??0;
 }else throw new Error('Unreviewed provider');
 return validateReceipt({providerKey:c.providerKey,modelKey:c.modelKey,sourceHash:c.sourceHash,summary,providerReceiptId:id,inputTokens:input,outputTokens:output,cachedInputTokens:cached,modelCalls:1,toolCalls:0,humanReviewRequired:true},c);
}
async function readJson(r){const reader=r.body?.getReader();if(!reader)throw new Error('Empty response');const chunks=[];let bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536){await reader.cancel();throw new Error('Oversized response');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
export function createProviderAdapter({providerKey,modelKey,token,reviewed=false,fetcher=fetch}){
 if(!reviewed||!providerCapabilities.some(p=>p.key===providerKey)||typeof token!=='string'||token.length<20)throw new Error('Reviewed central binding required');
 return {reviewed:true,noTools:true,providerKey,modelKey,execute:async c=>{if(c.providerKey!==providerKey||c.modelKey!==modelKey)throw new Error('Reserved binding mismatch');const request=buildProviderRequest(c);
 const auth=providerKey==='openai'?{authorization:`Bearer ${token}`}:providerKey==='anthropic'?{'x-api-key':token}:{'x-goog-api-key':token};
 const r=await fetcher(request.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',...request.headers,...auth},body:JSON.stringify(request.body)});if(!r.ok)throw new Error('Provider request failed; reconcile before retrying');return parseProviderReceipt(c,await readJson(r));}};
}
