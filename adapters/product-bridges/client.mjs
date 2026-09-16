/** Server-only. resolveAccess must load current source permissions and authorised records, never browser claims. */
export function createProductBridge({url,key,resolveAccess,fetchImpl=fetch}) {
 if(typeof window!=='undefined')throw new Error('Product bridge is server-only');
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('Use the Omniqora HTTPS origin');
 if(typeof key!=='string'||key.length<32||/[\r\n]/.test(key)||typeof resolveAccess!=='function')throw new Error('Configure a private key and current source access resolver');
 async function send(path,body,eventId){
  const response=await fetchImpl(new URL(path,base),{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(60000),
   headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','x-event-timestamp':String(Date.now()),...(eventId?{'idempotency-key':eventId}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const raw=await response.text();if(raw.length>100000)throw new Error('Bridge response too large');
  if(!response.ok)throw new Error(`Omniqora request refused (${response.status}); keep the source fallback and inspect configuration`);
  return JSON.parse(raw);
 }
 function verify(a){
  if(!a||typeof a.tenantId!=='string'||!a.tenantId||typeof a.scopeId!=='string'||!a.scopeId||!Number.isInteger(a.revision)||a.revision<0)throw new Error('Current source access is required');
  return JSON.stringify([a.tenantId,a.scopeId,a.revision]);
 }
 return {
  async draft({actor,resourceId,question,eventId}){
   const a=await resolveAccess(actor,resourceId);const before=verify(a);
   const result=await send('/api/integrations/gateway',{tenantId:a.tenantId,scopeId:a.scopeId,contract:a.contract,question,context:a.context,policy:{readOnly:true,noExternalActions:true,requireReview:true}},eventId);
   if(verify(await resolveAccess(actor,resourceId))!==before)throw new Error('Source permissions or context changed; discard this draft');
   if(result.reviewRequired!==true)throw new Error('Invalid draft result');
   return result;
  },
  async lawquoDraft({actor,resourceId,scope,eventId,validateDraft}){
   if(typeof validateDraft!=='function')throw new Error('Use Lawquo validateOmniqoraDraft on every result');
   const a=await resolveAccess(actor,resourceId);const before=verify(a);
   if(scope.firm_id!==a.tenantId||scope.case_id!==a.scopeId||scope.context_revision!==a.revision)throw new Error('Case scope changed');
   const receipt=await send('/api/integrations/events',{title:'Lawquo draft preparation requested',input:JSON.stringify(scope)},eventId);
   if(typeof receipt.runId!=='string')throw new Error('Invalid receipt');
   // Recheck before sending any legal evidence; metadata-only submission does not grant access to documents.
   const current=await resolveAccess(actor,resourceId);
   if(verify(current)!==before)throw new Error('Case access changed');
   const draft=await send(`/api/integrations/runs/${encodeURIComponent(receipt.runId)}/context`,{scope,context:current.context,sources:current.sources});
   if(verify(await resolveAccess(actor,resourceId))!==before)throw new Error('Case access changed; discard draft');
   if(draft.status!=='draft'||draft.reviewRequired!==true)throw new Error('Draft is not ready');
   return validateDraft(draft.result,scope,new Set(current.sources.map(s=>s.id)));
  },
 };
}
