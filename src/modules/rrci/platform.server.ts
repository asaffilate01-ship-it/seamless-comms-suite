import { z } from 'zod';
import { requiredPermission, type HostAccess, type Operation } from './contracts';

const bindingsSchema = z.record(z.object({ tenant: z.string().uuid(), url: z.string().url(), token: z.string().min(32) }));

export async function callIntelligence(access: HostAccess, operation: Operation, payload: Record<string, unknown>): Promise<unknown> {
  if (!access.permissions.includes(requiredPermission[operation]) || access.entitlement_until <= Date.now() / 1000) {
    throw new Error('This workspace does not permit this action.');
  }
  const bindings = bindingsSchema.parse(JSON.parse(process.env.RRCI_BINDINGS_JSON ?? '{}'));
  const binding = bindings[access.workspace];
  if (!binding || binding.tenant !== access.tenant) throw new Error('This workspace is awaiting service activation.');
  const url = new URL(binding.url);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    throw new Error('The intelligence service address is invalid.');
  }
  const response = await fetch(new URL('/v1/rrci', url), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${binding.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, workspace: access.workspace, payload,
      actor: { subject: access.subject, permissions: access.permissions, human: true,
        entitlement_until: access.entitlement_until, expires_at: Math.floor(Date.now() / 1000) + 30 } }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error ?? 'The intelligence service is unavailable. Please retry.');
  }
  return response.json();
}
