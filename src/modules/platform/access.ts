export async function requireTenantMembership(context:any,tenantId:string){
 const db=context.supabase as any;
 const {data:membership,error}=await db.from("tenant_members").select("role").eq("tenant_id",tenantId).eq("user_id",context.userId).maybeSingle();
 if(error||!membership){
  const admin=await db.rpc("is_platform_admin",{_user:context.userId});
  if(admin.error||!admin.data)throw new Error("Tenant access required");
  return{role:"platform_admin",isPlatformAdmin:true};
 }
 return{role:membership.role as string,isPlatformAdmin:false};
}

export async function requireService(context:any,tenantId:string,serviceKey:string){
 const access=await requireTenantMembership(context,tenantId);
 const db=context.supabase as any;
 const {data,error}=await db.rpc("has_tenant_entitlement",{_tenant:tenantId,_service:serviceKey});
 if(error||!data)throw new Error(`${serviceKey} entitlement required`);
 return access;
}

export function requireWriteRole(role:string){
 if(!["owner","admin","agent","platform_admin"].includes(role))throw new Error("Write access required");
}

export function requireAdminRole(role:string){
 if(!["owner","admin","platform_admin"].includes(role))throw new Error("Tenant admin access required");
}
