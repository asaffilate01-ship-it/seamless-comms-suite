export type DataPlaneKind = "shared_postgres" | "regional_postgres" | "dedicated_postgres" | "external";

export type DataPlaneDefinition = {
  key: string;
  kind: DataPlaneKind;
  region: string;
  residencyCountries: string[];
  connectionSecretRef: string;
  storageSecretRef?: string | null;
  vectorSecretRef?: string | null;
  graphSecretRef?: string | null;
  status: "active" | "draining" | "disabled";
  capacityClass?: "small" | "medium" | "large" | "dedicated";
};

export type TenantDataPlaneBinding = {
  tenantId: string;
  dataPlaneKey: string;
  status: "active" | "migrating" | "suspended";
  migrationRevision: number;
  boundAt: string;
};

export type DataPlaneRoutingContext = {
  tenantId: string;
  countryCode?: string | null;
  requiredResidency?: string | null;
  dedicatedRequired?: boolean;
};

export function selectDataPlane(
  context: DataPlaneRoutingContext,
  planes: DataPlaneDefinition[],
  existing?: TenantDataPlaneBinding | null,
): DataPlaneDefinition {
  if (existing) {
    const current = planes.find((plane) => plane.key === existing.dataPlaneKey && plane.status !== "disabled");
    if (current) return current;
  }

  const candidates = planes.filter((plane) => {
    if (plane.status !== "active") return false;
    if (context.dedicatedRequired && plane.kind !== "dedicated_postgres") return false;
    if (context.requiredResidency && plane.region !== context.requiredResidency) return false;
    if (context.countryCode && plane.residencyCountries.length && !plane.residencyCountries.includes(context.countryCode)) {
      return false;
    }
    return true;
  });

  const selected = candidates.find((plane) => plane.kind === "regional_postgres")
    ?? candidates.find((plane) => plane.kind === "shared_postgres")
    ?? candidates[0]!;

  if (!selected) throw new Error("No eligible data plane");
  return selected;
}

/**
 * Product code must use tenantId and service contracts rather than a physical
 * database URL. This permits later tenant movement between shared, regional
 * and dedicated planes without changing the SaaS code.
 */
export type TenantDataRouter = {
  resolve(tenantId: string): Promise<DataPlaneDefinition>;
};
