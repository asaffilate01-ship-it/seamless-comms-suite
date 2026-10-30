import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { documentWorkspace } from './functions';

export function DocumentHistory({ tenantId, productKey, id }: { tenantId: string; productKey: string; id: string }) {
  const call = useServerFn(documentWorkspace);
  const [after, setAfter] = useState<number | undefined>();
  const q = useQuery({ queryKey: ['document-history', tenantId, productKey, id, after],
    queryFn: async () => {
      const response = await call({ data: { action: 'history', tenantId, productKey, id, after } });
      if (response.kind !== 'history') throw new Error('Unexpected document response');
      return { events: response.events, next: response.next };
    },
    retry: false, gcTime: 0 });
  const page = !q.isFetching && !q.isError ? q.data : null;
  return <section aria-label="Document history" className="w-full space-y-2 border-t pt-3">
    <p className="text-sm font-medium">Recorded history · UTC · oldest first</p>
    {q.isFetching ? <p role="status">Loading history…</p> : q.isError ? <p role="alert">History unavailable. Access may have changed.</p> : null}
    {page && <><ol className="space-y-1 text-sm">{page.events.map(event => <li key={event.id}>{event.at} · {event.event}</li>)}</ol>{page.events.length === 0 && <p>No events on this page.</p>}</>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={q.isFetching} onClick={() => { if (after === undefined) void q.refetch(); else setAfter(undefined); }}>Refresh from start</Button>
      {page?.next != null && <Button size="sm" variant="outline" onClick={() => setAfter(page.next!)}>Next history page</Button>}
    </div>
  </section>;
}
