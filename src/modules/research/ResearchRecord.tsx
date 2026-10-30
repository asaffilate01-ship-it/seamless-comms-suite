import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { getResearchRecord } from './functions';

type Item = {id: string; status: string; created_at: string; preset: string};
export function ResearchRecord({tenantId, productKey, item, busy, onDownload}: {
  tenantId: string; productKey: string; item: Item; busy: boolean; onDownload: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <details className="rounded border p-3" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm">{new Date(item.created_at).toLocaleString()} · {item.preset} · {item.status === 'reserved' ? 'Pending / outcome unconfirmed' : item.status}</summary>
    {open && (item.status === 'completed'
      ? <RecordContent tenantId={tenantId} productKey={productKey} id={item.id} busy={busy} onDownload={onDownload}/>
      : <p className="mt-3 text-sm">{item.status === 'failed' ? 'This search failed. It still counts towards the allowance.' : 'The outcome is not confirmed. Refresh history; checking status does not submit another paid search.'}</p>)}
  </details>;
}
function RecordContent({tenantId,productKey,id,busy,onDownload}: {tenantId:string;productKey:string;id:string;busy:boolean;onDownload:()=>void}) {
  const read = useServerFn(getResearchRecord);
  const q = useQuery({queryKey:['research-record',tenantId,productKey,id],queryFn:()=>read({data:{tenantId,productKey,requestId:id}}), retry:false, gcTime:0, staleTime:0, refetchOnMount:'always'});
  if(q.isError) return <p role="alert" className="mt-3 text-sm">This record is unavailable, expired or no longer accessible.</p>;
  if(q.isPending || q.isFetching) return <p role="status" className="mt-3 text-sm">Checking access and loading sources…</p>;
  const result=q.data;
  return <div className="mt-3 space-y-3">
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={onDownload}>Download research record</Button><Button size="sm" variant="ghost" onClick={()=>q.refetch()}>Refresh record</Button></div>
    <p className="text-xs">Retrieved {new Date(result.retrievedAt).toLocaleString()} · Review required</p>
    {result.sources.length === 0 && <p>No matching usable sources returned.</p>}
    {result.sources.map(source=><article key={source.url}>
      <a className="font-medium underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a>
      <p className="break-all text-xs text-muted-foreground">{source.url}</p>
      <p className="text-xs text-muted-foreground">Published: {source.publishedAt || 'Unknown'} · Updated: {source.updatedAt || 'Unknown'}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{source.snippet || 'No excerpt available. Open the source to review it.'}</p>
    </article>)}
  </div>;
}
