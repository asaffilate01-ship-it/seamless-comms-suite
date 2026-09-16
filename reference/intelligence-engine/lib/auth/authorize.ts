export type InternalIdentity={id:string;email:string;role:"owner"|"admin"|"operator"|"viewer"};
type Bindings={ADMIN_EMAILS?:string};

export function getInternalIdentity(request:Request,bindings:Bindings):InternalIdentity|null{
  const id=request.headers.get("oai-authenticated-user-id");
  const email=request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if(!id||!email) return null;
  const admins=(bindings.ADMIN_EMAILS??"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  return {id,email,role:admins.includes(email)?"owner":"operator"};
}

export function requireInternalIdentity(request:Request,bindings:Bindings,allowed:InternalIdentity["role"][]){
  const identity=getInternalIdentity(request,bindings);
  if(!identity) return {response:Response.json({error:"Authentication required"},{status:401})};
  if(!allowed.includes(identity.role)) return {response:Response.json({error:"Insufficient permission"},{status:403})};
  return {identity};
}
