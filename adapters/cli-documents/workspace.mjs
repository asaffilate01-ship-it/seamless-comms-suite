import { createDocumentClient } from './client.mjs';

// Configuration is server-owned; each origin must serve exactly one tenant/product.
export function bindingFor(raw, scope) {
  if (!raw) return null;
  try {
    const bindings = JSON.parse(raw);
    if (!Array.isArray(bindings) || bindings.length > 100) throw Error();
    const origins = new Set(), scopes = new Set();
    for (const b of bindings) {
      if (!b || Object.keys(b).sort().join(',') !== 'endpoint,productKey,tenantId' ||
          !/^[a-f0-9-]{36}$/.test(b.tenantId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(b.productKey)) throw Error();
      const url = new URL(b.endpoint);
      if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error();
      const key = `${b.tenantId}:${b.productKey}`;
      if (origins.has(url.origin) || scopes.has(key)) throw Error();
      origins.add(url.origin); scopes.add(key);
    }
    return bindings.find(b => b.tenantId === scope.tenantId && b.productKey === scope.productKey) ?? null;
  } catch { throw new Error('Document workspace configuration is unavailable'); }
}

export async function workspaceAccess(db, actor, scope, raw) {
  const [member, product] = await Promise.all([
    db.from('tenant_members').select('role').eq('tenant_id', scope.tenantId).eq('user_id', actor).maybeSingle(),
    db.from('tenant_products').select('status').eq('tenant_id', scope.tenantId).eq('product_key', scope.productKey).maybeSingle(),
  ]);
  if (member.error || product.error || !member.data || product.data?.status !== 'active') {
    throw new Error('Document workspace access unavailable');
  }
  return { binding: bindingFor(raw, scope), canWrite: ['owner', 'admin', 'agent'].includes(member.data.role) };
}

export function workspaceClient(binding, authorization) {
  if (!binding) throw new Error('Document workspace is not configured');
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new Error('Authentication required');
  return createDocumentClient({ endpoint: binding.endpoint, getBearer: async () => authorization.slice(7) });
}

// The dashboard cannot add execution/recovery actions to the public product API.
export async function workspaceOperation(client, access, input) {
  if (!['list', 'submit', 'download', 'history', 'delete'].includes(input.action)) throw new Error('Unsupported document action');
  if (['submit', 'delete'].includes(input.action) && !access.canWrite) throw new Error('Read-only document access');
  if (input.action === 'delete' && input.confirmed !== true) throw new Error('Confirm document deletion');
  try {
    switch (input.action) {
      case 'list': return { kind: 'list', configured: true, canWrite: access.canWrite, ...await client.list({ before: input.before, limit: 20 }) };
      case 'submit': return { kind: 'submitted', ...await client.submit(input) };
      case 'history': return { kind: 'history', ...await client.history(input.id, { after: input.after, limit: 20 }) };
      case 'delete': return { kind: 'deleted', ...await client.remove(input.id) };
      case 'download': return { kind: 'download', base64: (await client.download(input.id)).toString('base64'), filename: `draft-${input.id}.odt` };
    }
  } catch { throw new Error('Document service unavailable or access denied. Refresh status before retrying.'); }
}
