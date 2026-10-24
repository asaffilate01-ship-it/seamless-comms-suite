import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCrmDeal, editCrmDeal } from './functions';
import type { Deal } from './sales-model';
import { toast } from 'sonner';

export function DealDetails({tenantId,dealId,canWrite,onClose}:{tenantId:string;dealId:string;canWrite:boolean;onClose:()=>void}){
 const [page,setPage]=useState(0),[busy,setBusy]=useState(false);
 const read=useServerFn(getCrmDeal),save=useServerFn(editCrmDeal),qc=useQueryClient(),locked=useRef(false);
 const query=useQuery({queryKey:['crm-deal',tenantId,dealId,page],queryFn:()=>read({data:{tenantId,dealId,page}}),retry:false,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,placeholderData:previous=>previous});
 const refresh=()=>Promise.all(['crm-deal','crm-opportunities','crm-360'].map(key=>qc.invalidateQueries({queryKey:[key,tenantId]})));
 return <Dialog open onOpenChange={open=>{if(!open&&!locked.current)onClose();}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Deal details</DialogTitle><DialogDescription>Review and update the deal, with its recorded activity history.</DialogDescription></DialogHeader>
 {query.isPending?<p>Loading deal…</p>:query.isError?<div role="alert"><p>{query.error.message}</p><Button onClick={()=>void query.refetch()}>Retry</Button></div>:query.data&&<>
 <DealForm key={query.data.deal.id+':'+query.data.deal.updated_at} deal={query.data.deal} canWrite={canWrite} busy={busy} onSave={async values=>{
 if(locked.current)return;locked.current=true;setBusy(true);
 try{await save({data:{tenantId,dealId,expectedUpdatedAt:query.data.deal.updated_at,...values}});setPage(0);await refresh();toast.success('Deal saved');}
 catch(error){toast.error(error instanceof Error?error.message:'Deal update failed');}
 finally{locked.current=false;setBusy(false);}
 }}/>
 <div className="flex items-center justify-between"><h3 className="font-semibold">Activity history</h3><Button variant="outline" disabled={busy} onClick={()=>{setPage(0);void refresh();}}>Refresh deal and history</Button></div>
 <p className="text-xs text-muted-foreground">Refreshing reloads saved values and discards unsaved edits if the deal changed.</p>
 {query.isFetching?<p role="status">Loading activity…</p>:<ol className="space-y-3">{query.data.activities.map((a:any)=><li key={a.id} className="rounded-md border p-3"><p className="text-sm">{a.summary}</p><time className="text-xs text-muted-foreground" dateTime={a.occurred_at}>{new Date(a.occurred_at).toLocaleString()}</time></li>)}</ol>}
 {!query.isFetching&&!query.data.activities.length&&<p className="text-sm text-muted-foreground">No activity on this page.</p>}
 <div className="flex items-center gap-3"><Button variant="outline" disabled={page===0||busy||query.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page+1}</span><Button variant="outline" disabled={!query.data.hasMore||busy||query.isFetching} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
 </>}
 </DialogContent></Dialog>;
}
function localDate(value:string|null){if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function DealForm({deal,canWrite,busy,onSave}:{deal:Deal;canWrite:boolean;busy:boolean;onSave:(values:{title:string;amount:number|null;currency:string|null;expectedCloseAt:string|null})=>Promise<void>}){
 const [title,setTitle]=useState(deal.title),[amount,setAmount]=useState(deal.amount===null?'':String(deal.amount));
 const [currency,setCurrency]=useState(deal.currency??''),[closeAt,setCloseAt]=useState(localDate(deal.expected_close_at));
 return <form className="space-y-3" onSubmit={e=>{e.preventDefault();if(!canWrite||busy)return;void onSave({title,amount:amount===''?null:Number(amount),currency:currency||null,expectedCloseAt:closeAt===localDate(deal.expected_close_at)?deal.expected_close_at:closeAt?new Date(closeAt).toISOString():null});}}>
 <p className="text-sm text-muted-foreground">Status: {deal.status} · Probability: {deal.probability_percent??0}%</p>
 <label className="grid gap-1 text-sm">Title<Input required maxLength={240} disabled={!canWrite||busy} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Value<Input type="number" min="0" max="9999999999999999" step="0.01" disabled={!canWrite||busy} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <label className="grid gap-1 text-sm">Currency<Input placeholder="GBP" pattern="[A-Z]{3}" maxLength={3} required={amount!==''} disabled={!canWrite||busy} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label></div>
 <label className="grid gap-1 text-sm">Expected close (local time)<Input type="datetime-local" disabled={!canWrite||busy} value={closeAt} onChange={e=>setCloseAt(e.target.value)}/></label>
 {canWrite?<Button disabled={busy} type="submit">{busy?'Saving…':'Save deal'}</Button>:<p className="text-sm text-muted-foreground">Read-only access</p>}
 </form>;
}
