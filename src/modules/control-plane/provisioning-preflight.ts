/**
 * Read-only readiness check for the SaaS Factory worker's core database contract.
 * This intentionally cannot claim or mutate a queued job.
 */
export const provisioningReadTables = [
  { table: "provisioning_jobs", column: "id" },
  { table: "tenant_products", column: "tenant_id" },
  { table: "tenant_services", column: "tenant_id" },
  { table: "product_connections", column: "id" },
] as const;

export type ReadOnlyProbeClient = {
  from(table: string): {
    select(column: string): {
      limit(count: number): PromiseLike<{ error: { message?: string } | null }>;
    };
  };
};

/** Fail closed if any required table or the service role's read permission is missing. */
export async function probeProvisioningSchema(db: ReadOnlyProbeClient): Promise<boolean> {
  const checks = await Promise.all(
    provisioningReadTables.map(async ({ table, column }) => {
      const result = await db.from(table).select(column).limit(1);
      return !result.error;
    }),
  );
  return checks.every(Boolean);
}
