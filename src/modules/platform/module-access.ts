export async function requireModuleEntitlement(
  context: any,
  input: { tenantId: string; tenantProductId: string; moduleKey: string },
) {
  const db = context.supabase as any;
  const { data: membership, error: membershipError } = await db
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (membershipError || !membership) throw new Error("Tenant access required");

  const { data: grant, error } = await db
    .from("tenant_module_entitlements")
    .select("module_key,enabled,limits,config,starts_at,ends_at")
    .eq("tenant_id", input.tenantId)
    .eq("tenant_product_id", input.tenantProductId)
    .eq("module_key", input.moduleKey)
    .maybeSingle();
  if (error || !grant || !grant.enabled) throw new Error("Module entitlement required");
  const now = Date.now();
  if (grant.starts_at && Date.parse(grant.starts_at) > now) throw new Error("Module entitlement not started");
  if (grant.ends_at && Date.parse(grant.ends_at) <= now) throw new Error("Module entitlement expired");

  return { role: membership.role as string, grant };
}

export function requireWritableTenantRole(role: string) {
  if (!["owner","admin","agent"].includes(role)) throw new Error("Write access required");
}

export function requireAdminTenantRole(role: string) {
  if (!["owner","admin"].includes(role)) throw new Error("Tenant admin access required");
}