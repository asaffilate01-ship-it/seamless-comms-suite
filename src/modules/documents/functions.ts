import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const scope = z.object({ tenantId: z.string().uuid(), productKey: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) });
const input = z.discriminatedUnion('action', [
  scope.extend({ action: z.literal('list'), before: z.number().int().positive().optional() }).strict(),
  scope.extend({ action: z.literal('submit'), requestId: z.string().uuid(), document: z.object({
    title: z.string().trim().min(1).max(160), paragraphs: z.array(z.string().min(1).max(4000)).min(1).max(20),
  }).strict() }).strict(),
  scope.extend({ action: z.literal('download'), id: z.string().uuid() }).strict(),
]);

export const documentWorkspace = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof input>) => input.parse(value))
  .handler(async ({ context, data }) => {
    const { workspaceAccess, workspaceClient } = await import('../../../adapters/cli-documents/workspace.mjs');
    const { getRequest } = await import('@tanstack/react-start/server');
    const access = await workspaceAccess(context.supabase, context.userId, data, process.env.CLI_DOCUMENT_BINDINGS);
    if (data.action === 'list' && !access.binding) {
      return { kind: 'list' as const, configured: false, canWrite: access.canWrite, jobs: [], next: null };
    }
    if (data.action === 'submit' && !access.canWrite) throw new Error('Read-only document access');
    const client = workspaceClient(access.binding, getRequest().headers.get('authorization'));
    try {
      if (data.action === 'list') return { kind: 'list' as const, configured: true, canWrite: access.canWrite, ...await client.list({ before: data.before, limit: 20 }) };
      if (data.action === 'submit') return { kind: 'submitted' as const, ...await client.submit(data) };
      return { kind: 'download' as const, base64: (await client.download(data.id)).toString('base64'), filename: `draft-${data.id}.odt` };
    } catch { throw new Error('Document service unavailable or access denied. Refresh status before retrying.'); }
  });
