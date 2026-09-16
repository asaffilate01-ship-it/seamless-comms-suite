/** Server-to-server only. Never accept membership facts from browser JSON.
 * Call after an authoritative membership insert/update/removal in the source app.
 * Retry failed calls via the source app's durable job queue.
 */
export async function syncMembers({coreUrl,app,apiKey,members}){
 const r=await fetch(new URL('/members/sync',coreUrl),{method:'POST',headers:{'Content-Type':'application/json','X-App':app,Authorization:`Bearer ${apiKey}`},body:JSON.stringify({members}),signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!r.ok)throw Error(`Membership sync failed: ${r.status}`);
 return r.json();
}
