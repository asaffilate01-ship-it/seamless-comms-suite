/** Server-only factory. Never import this file into browser code. */
export function createEcosystemAdapter({app,secret,coreUrl,verifySession,admin=false}) {
 const allowed=new Set(admin?['/admin/overview','/admin/provider','/admin/grant','/admin/revoke','/admin/bundle']:['/catalogue','/referrals','/inbox','/outgoing','/status','/subscriptions','/discount','/link/start','/link/finish','/link/remove','/link/list']);
 return async function handle(request) {
  if(request.method!=='POST') return Response.json({error:'Method not allowed'},{status:405});
  // verifySession MUST validate session, selected organisation, role and CSRF/origin.
  const identity=await verifySession(request);
  if(!identity || !identity.actor || !identity.org) return Response.json({error:'Unauthorised'},{status:401});
  let data;try {data=await request.json()}catch{return Response.json({error:'Invalid JSON'},{status:400})}
  if(!allowed.has(data.path)) return Response.json({error:'Unknown operation'},{status:404});
  const payload={...data.body,actor:identity.actor,org:identity.org};
  try {
   const response=await fetch(new URL(data.path,coreUrl),{method:'POST',headers:{'Content-Type':'application/json','X-App':app,Authorization:`Bearer ${secret}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),redirect:'error'});
   return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Service temporarily unavailable'},{status:503})}
 }
}
