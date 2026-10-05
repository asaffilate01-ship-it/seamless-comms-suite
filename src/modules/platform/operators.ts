export type PlatformOperatorRole =
  | "platform_owner"
  | "platform_admin"
  | "platform_support"
  | "platform_billing"
  | "platform_auditor";

export type ProductOperatorRole =
  | "landlord_owner"
  | "landlord_admin"
  | "landlord_support"
  | "landlord_billing"
  | "landlord_auditor";

export type TenantRole = "owner" | "admin" | "agent" | "viewer";

export type OperatorContext =
  | { level: "platform"; userId: string; role: PlatformOperatorRole }
  | { level: "product"; userId: string; productKey: string; role: ProductOperatorRole; regionKeys: string[] }
  | { level: "tenant"; userId: string; tenantId: string; role: TenantRole };

export function canManageTenant(context: OperatorContext, tenant: {
  tenantId: string;
  productKey?: string | null;
  regionKey?: string | null;
}) {
  if (context.level === "platform") {
    return context.role === "platform_owner" || context.role === "platform_admin";
  }
  if (context.level === "product") {
    if (!tenant.productKey || context.productKey !== tenant.productKey) return false;
    if (tenant.regionKey && context.regionKeys.length && !context.regionKeys.includes(tenant.regionKey)) return false;
    return context.role === "landlord_owner" || context.role === "landlord_admin";
  }
  return context.tenantId === tenant.tenantId && (context.role === "owner" || context.role === "admin");
}

export function canSupportTenant(context: OperatorContext, tenant: {
  tenantId: string;
  productKey?: string | null;
  regionKey?: string | null;
}) {
  if (context.level === "platform") {
    return ["platform_owner","platform_admin","platform_support"].includes(context.role);
  }
  if (context.level === "product") {
    if (!tenant.productKey || context.productKey !== tenant.productKey) return false;
    if (tenant.regionKey && context.regionKeys.length && !context.regionKeys.includes(tenant.regionKey)) return false;
    return ["landlord_owner","landlord_admin","landlord_support"].includes(context.role);
  }
  return context.tenantId === tenant.tenantId && ["owner","admin","agent"].includes(context.role);
}