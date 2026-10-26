const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const tasks=new Set(['match_insights','batting_coach','bowling_coach','fielding_review','training_plan','analyst_agent']);
export function validateClaim(c,tenant){
 if(!c||c.tenantId!==tenant||!uuid.test(c.tenantId)||c.productKey!=='criclume'||!uuid.test(c.admissionId)||!uuid.test(c.runId)||!tasks.has(c.task)||c.humanReviewRequired!==true||!Array.isArray(c.tools)||c.tools.length||!Number.isInteger(c.maxInputTokens)||c.maxInputTokens<1||c.maxInputTokens>1800||!Number.isInteger(c.maxOutputTokens)||c.maxOutputTokens<1||c.maxOutputTokens>800||!/^[a-f0-9]{32}$/.test(c.sourceHash)||!/^[-a-z0-9_.]{1,100}$/i.test(c.providerKey)||!/^[-a-z0-9_.]{1,100}$/i.test(c.modelKey))throw new Error('Invalid cricket claim');
 const s=c.snapshot;
 if(!s||Array.isArray(s)||Object.keys(s).sort().join()!==['runs','wickets','overs','target','recent','matchStatus','evidencePolicy'].sort().join()||s.evidencePolicy!=='aggregates_only;no_children_or_biometrics;human_review_required'||!['live','completed','innings_break','draft','scheduled','unknown'].includes(s.matchStatus)||!Array.isArray(s.recent)||s.recent.length>6||s.recent.some(x=>!['0','1','2','3','4','5','6','W','Wd','Nb','·','?'].includes(x))||(s.overs!==null&&!/^[0-9]{1,3}\.[0-5]$/.test(s.overs)))throw new Error('Unsafe aggregate');
 for(const [k,max] of [['runs',2000],['wickets',10],['target',3000]])if(s[k]!==null&&(!Number.isInteger(s[k])||s[k]<0||s[k]>max))throw new Error('Invalid count');return c;
}
export function validateReceipt(r,c){
 if(!r||r.providerKey!==c.providerKey||r.modelKey!==c.modelKey||r.sourceHash!==c.sourceHash||r.modelCalls!==1||r.toolCalls!==0||r.humanReviewRequired!==true||typeof r.summary!=='string'||r.summary.trim().length<20||r.summary.length>5000||!/^[A-Za-z0-9_-]{8,180}$/.test(r.providerReceiptId)||!Number.isInteger(r.inputTokens)||r.inputTokens<1||r.inputTokens>c.maxInputTokens||!Number.isInteger(r.outputTokens)||r.outputTokens<1||r.outputTokens>c.maxOutputTokens||!Number.isInteger(r.cachedInputTokens??0)||(r.cachedInputTokens??0)<0||(r.cachedInputTokens??0)>r.inputTokens)throw new Error('Invalid metering receipt');
 return Object.fromEntries(['providerKey','modelKey','sourceHash','modelCalls','toolCalls','humanReviewRequired','summary','providerReceiptId','inputTokens','outputTokens','cachedInputTokens'].map(k=>[k,k==='cachedInputTokens'?(r[k]??0):r[k]]));
}
async function rpc(db,name,args){const r=await db.rpc(name,args);if(r.error)throw new Error('Worker operation refused');return r.data;}
export async function runCricketWorkerPass({db,tenantId,workerRef,enabled=false,adapter}){
 if(enabled!==true||!uuid.test(tenantId)||!uuid.test(workerRef)||adapter?.reviewed!==true||adapter.noTools!==true||typeof adapter.execute!=='function')throw new Error('Explicit reviewed worker scope required');
 const c=await rpc(db,'claim_criclume_worker_job',{_tenant:tenantId,_worker:workerRef});if(!c)return {claimed:0,providerAttempts:0};
 const args={_tenant:tenantId,_admission:c.admissionId,_worker:workerRef};let attempted=false;
 try{validateClaim(c,tenantId);if(c.providerKey!==adapter.providerKey||c.modelKey!==adapter.modelKey)throw new Error('Binding mismatch');attempted=true;
 const receipt=validateReceipt(await adapter.execute(Object.freeze(structuredClone(c))),c);
 const settled=await rpc(db,'finish_criclume_worker_job',{...args,_receipt:receipt});if(settled?.status!=='waiting_review')throw new Error('Settlement failed');return {claimed:1,providerAttempts:1,status:'waiting_review'};
 }catch{await rpc(db,'flag_criclume_worker_reconciliation',args);return {claimed:1,providerAttempts:attempted?1:0,status:'reconciliation_required',reservationHeld:true};}
}
