import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {getAegisSiteActivity} from './site-activity.functions';
import {siteActivityKinds,type ActivityKind} from './site-activity';
import type {QueueItem} from './control-room';
const labels:Record<ActivityKind,string>={engagement:'Engagements',incident:'Incidents',report:'Inspections & reports',handover:'Handovers',visitor:'Visitors',key:'Keys',equipment:'Equipment',instructions:'Instruction versions'};
export function SiteActivityPanel({tenantId,parentId,parentKind,onInspect}:{tenantId:string;parentId:string;parentKind:'site'|'engagement';onInspect:(item:QueueItem)=>void}){
 const read=useServerFn(getAegisSiteActivity),[kind,setKind]=useState<ActivityKind>(parentKind==='site'?'engagement':'incident'),[page,setPage]=useState(0);
 const q=useQuery({queryKey:['aegis-site-activity',tenantId,parentKind,parentId,kind,page],queryFn:()=>read({data:{tenantId,parentId,parentKind,kind,page}}),retry:false,staleTime:0,gcTime:0});
 return <section className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">{parentKind==='site'?'Site activity':'Engagement incidents'}</h4><Button variant="outline" size="sm" disabled={q.isFetching} onClick={()=>q.refetch()}>Refresh activity</Button></div><p className="my-2 text-xs text-muted-foreground">Directly linked records only, under their own access rules. To see shift-linked incidents, open that engagement. Indirect corrective actions remain under their reports. No total or operational safety status is inferred.</p>
 <label className="block text-sm">Activity category<select aria-label="Site activity category" value={kind} onChange={e=>{setKind(e.target.value as ActivityKind);setPage(0)}} className="my-2 w-full rounded border bg-background p-2">{(parentKind==='site'?siteActivityKinds:['incident'] as const).map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
 {q.error?<p role="alert">{q.error.message}</p>:q.isPending?<p className="text-sm">Loading authorised linked records…</p>:<><div className="space-y-2">{q.data?.items.map(item=><div key={item.id} className="rounded border p-3"><Badge variant="outline">{item.status.replaceAll('_',' ')}</Badge><Button variant="link" className="mt-1 h-auto max-w-full whitespace-normal p-0 text-left" onClick={()=>onInspect(item)}>{item.title}</Button><p className="mt-1 break-all text-xs text-muted-foreground">Source {item.sourceRef} · {item.recordedAt}</p></div>)}</div>{q.data?.items.length===0&&<p className="text-sm text-muted-foreground">No directly linked records visible on this page.</p>}<p className="mt-3 text-xs text-muted-foreground">Page {page+1} · Up to 25 records · Sampled {q.data?.sampledAt}. Changes can shift pages.</p></>}
 <div className="mt-3 flex justify-between gap-3"><Button size="sm" variant="outline" disabled={page===0||q.isFetching} onClick={()=>setPage(page-1)}>Newer records</Button><Button size="sm" variant="outline" disabled={!q.data?.hasMore||q.isFetching||page>=10000} onClick={()=>setPage(page+1)}>Older records</Button></div></section>;
}
