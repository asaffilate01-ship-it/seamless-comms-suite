import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
export function sign(secret,timestamp,raw){return createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex')}
export function verify(secret,timestamp,raw,signature,now=Date.now()){
 if(!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!/^[a-f0-9]{64}$/.test(signature))return false;
 return timingSafeEqual(Buffer.from(sign(secret,timestamp,raw),'hex'),Buffer.from(signature,'hex'));
}
/** Call only after verifying your processor webhook or reading authoritative billing data.
 * Persist event id + body before sending and retry the exact body with a fresh timestamp.
 * version must increase monotonically per organisation (not per payment event).
 */
export function subscriptionEvent({id=randomUUID(),org,version,status,validUntil,promo=false}){
 return {id,org,version,status,valid_until:validUntil,promo};
}
export async function sendSubscription({url,secret,event}){
 const raw=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));
 const result=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Timestamp':timestamp,'X-Signature':sign(secret,timestamp,raw)},body:raw,signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!result.ok)throw Error(`Subscription sync failed: ${result.status}`);
 return result.json();
}
/** applyDurably must atomically deduplicate event.id, ignore old revisions per org,
 * and enqueue the billing update. Return success only after durable commit.
 * Never change booking fees; event.effective is next_renewal, not immediate.
 */
export function discountReceiver({secret,applyDurably}){
 return async request=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const raw=Buffer.from(await request.arrayBuffer());
  if(raw.length>16384)return new Response('Too large',{status:413});
  if(!verify(secret,request.headers.get('X-Timestamp')||'',raw,request.headers.get('X-Signature')||''))return new Response('Invalid signature',{status:401});
  let event;try{event=JSON.parse(raw.toString())}catch{return new Response('Invalid JSON',{status:400})}
  if(event.type!=='discount.eligibility.changed'||typeof event.id!=='string'||typeof event.org!=='string'||!Number.isInteger(event.revision)||event.revision<1||!Number.isInteger(event.percent)||event.percent<0||event.percent>100||event.scope!=='subscription_only'||event.effective!=='next_renewal'||event.stackable!==false)return new Response('Invalid event',{status:400});
  try{await applyDurably(event);return new Response('Accepted',{status:200})}catch{return new Response('Retry later',{status:503})}
 };
}
