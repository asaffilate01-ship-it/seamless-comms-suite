import { z } from 'zod';

export const MODULE_ID = 'rrci';
export const accessSchema = z.object({
  workspace: z.string().uuid(), tenant: z.string().uuid(), subject: z.string().uuid(),
  name: z.string(), environment: z.enum(['demo', 'pilot', 'production']),
  role: z.enum(['reader', 'editor', 'reviewer', 'admin']),
  permissions: z.array(z.string()), entitlement_until: z.number(),
});
export type HostAccess = z.infer<typeof accessSchema>;
export const browserOperations = z.enum(['catalogue', 'query', 'audit', 'source.upsert',
  'source.health', 'relationship.propose', 'relationship.review', 'action.propose', 'action.review']);
export type Operation = z.infer<typeof browserOperations>;
export const requiredPermission: Record<Operation, string> = {
  catalogue: 'read', query: 'read', audit: 'audit', 'source.upsert': 'admin', 'source.health': 'sync',
  'relationship.propose': 'write', 'relationship.review': 'approve',
  'action.propose': 'write', 'action.review': 'approve',
};

// Standalone hosts implement these ports without importing Omniqora business features.
export interface IdentityEntitlementPort { resolve(workspace: string): Promise<HostAccess>; }
export interface IntelligencePort { call(access: HostAccess, operation: Operation, payload: Record<string, unknown>): Promise<unknown>; }
export interface ConnectorPort {
  // Adapters must map source ACLs to verified host subject IDs and maintain stable ordered event IDs.
  changes(connectionId: string, cursor: string | null): Promise<{ events: unknown[]; cursor: string; complete: boolean }>;
}
export interface NotificationPort { approvalPending(workspace: string, proposalId: string): Promise<void>; }
