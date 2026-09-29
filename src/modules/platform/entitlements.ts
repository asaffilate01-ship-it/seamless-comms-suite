export type TenantModuleGrant = {
  tenantId: string;
  tenantProductId?: string | null;
  moduleKey: string;
  enabled: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  limits?: Record<string, number | string | boolean | null>;
  config?: Record<string, unknown>;
};

export type EntitlementDecision = {
  allowed: boolean;
  reason:
    | "enabled"
    | "missing"
    | "disabled"
    | "not_started"
    | "expired"
    | "limit_exceeded";
  grant?: TenantModuleGrant;
};

export function evaluateEntitlement(
  grant: TenantModuleGrant | null | undefined,
  options: {
    now?: Date;
    usage?: number;
    limitKey?: string;
  } = {},
): EntitlementDecision {
  if (!grant) return { allowed: false, reason: "missing" };
  if (!grant.enabled) return { allowed: false, reason: "disabled", grant };

  const now = options.now ?? new Date();
  if (grant.startsAt && Date.parse(grant.startsAt) > now.getTime()) {
    return { allowed: false, reason: "not_started", grant };
  }
  if (grant.endsAt && Date.parse(grant.endsAt) <= now.getTime()) {
    return { allowed: false, reason: "expired", grant };
  }

  if (options.limitKey && options.usage != null) {
    const limit = grant.limits?.[options.limitKey];
    if (typeof limit === "number" && options.usage >= limit) {
      return { allowed: false, reason: "limit_exceeded", grant };
    }
  }

  return { allowed: true, reason: "enabled", grant };
}

export function requireEntitlement(
  grant: TenantModuleGrant | null | undefined,
  options?: Parameters<typeof evaluateEntitlement>[1],
): TenantModuleGrant {
  const decision = evaluateEntitlement(grant, options);
  if (!decision.allowed || !decision.grant) {
    throw new Error(`Module entitlement refused: ${decision.reason}`);
  }
  return decision.grant;
}

export type ModuleCapabilityMap = Record<string, Set<string>>;

export function hasCapability(
  moduleCapabilities: ModuleCapabilityMap,
  moduleKey: string,
  capability: string,
): boolean {
  return moduleCapabilities[moduleKey]?.has(capability) ?? false;
}
