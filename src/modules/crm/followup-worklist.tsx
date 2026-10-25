import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { completeCrmFollowUp, listCrmDealFollowUps } from './functions';
import { DealDetails } from './deal-details';
import { FollowUpEditor } from './followup-editor';
import { toast } from 'sonner';

export function FollowUpWorklist({tenantId,canWrite}:{tenantId:string;canWrite:boolean}) {
 const [editing,setEditing]=useState<any>(null);
 const [filter,setFilter]=useState<'all'|'overdue'|'upcoming'|'undated'>('all'),[page,setPage]=useState(0);
 const [dealId,setDealId]=useState(''),[busy,setBusy]=useState(false),locked=useRef(false);
 const list=useServerFn(listCrmDealFollowUps),complete=useServerFn(completeCrmFollowUp),qc=useQueryClient();
 const query=useQuery({queryKey:['crm-followups',tenantId,filter,page],queryFn:()=>list({data:{tenantId,filter,page}}),retry:false,gcTime:0});
 async function finish(task:any){
  if(locked.current||!canWrite)return;locked.current=true;setBusy(true);
  try{await complete({data:{tenantId,taskId:task.id,expectedUpdatedAt:task.updated_at}});setPage(0);
   await Promise.all(['crm-followups','crm-tasks','crm-deal','crm-360'].map(key=>qc.invalidateQueries({queryKey:[key,tenantId]})));toast.success('Follow-up completed');}
  catch(error){toast.error(error instanceof Error?error.message:'Completion failed');await query.refetch();}
  finally{locked.current=false;setBusy(false);}
 }
 return <div className="space-y-4">
  {editing&&canWrite&&<FollowUpEditor key={tenantId+":"+editing.id} tenantId={tenantId} task={editing} onClose={()=>setEditing(null)}/>}
  {dealId&&<DealDetails key={tenantId+':'+dealId} tenantId={tenantId} dealId={dealId} canWrite={canWrite} onClose={()=>setDealId('')}/>}
  <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Deal follow-ups<select className="h-10 rounded-md border bg-background px-3" disabled={busy} value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(0);}}><option value="all">All outstanding</option><option value="overdue">Overdue</option><option value="upcoming">Upcoming</option><option value="undated">No due date</option></select></label>
  <Button variant="outline" disabled={busy||query.isFetching} onClick={()=>void query.refetch()}>Refresh</Button></div>
  <p className="text-xs text-muted-foreground">Outstanding deal tasks across this workspace, 25 per page. Due times display in your local time. Refresh to update overdue status.</p>
  {query.isPending?<p role="status">Loading follow-ups…</p>:query.isError?<p role="alert" className="text-destructive">{query.error.message}</p>:query.data&&<>
  <p className="text-xs text-muted-foreground">As of {new Date(query.data.asOf).toLocaleString()}</p>
  <div className="space-y-3">{query.data.rows.map((task:any)=><Card key={task.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><h3 className="break-words font-semibold">{task.title}</h3>
  <p className="text-sm text-muted-foreground">{task.priority} priority · {task.status.replaceAll('_',' ')}</p>
  <p className={task.due_at&&Date.parse(task.due_at)<Date.parse(query.data.asOf)?'text-sm text-destructive':'text-sm'}>{task.due_at?new Date(task.due_at).toLocaleString():'No due date'}</p>
  {task.deal?<button type="button" className="text-left text-sm underline" onClick={()=>setDealId(task.deal.id)}>{task.deal.title} · {task.deal.status}</button>:<p className="text-sm text-muted-foreground">Linked deal unavailable</p>}</div>
  {canWrite&&<div className="flex gap-2"><Button variant="outline" disabled={busy||!task.deal} onClick={()=>setEditing(task)}>Edit</Button><Button disabled={busy||!task.deal} onClick={()=>void finish(task)}>Complete</Button></div>}</CardContent></Card>)}</div>
  {!query.data.rows.length&&<p className="rounded-md border p-6 text-muted-foreground">No follow-ups on this page. Try another filter or the previous page.</p>}
  <div className="flex items-center gap-3"><Button variant="outline" disabled={busy||query.isFetching||page===0} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1}</span><Button variant="outline" disabled={busy||query.isFetching||!query.data.hasMore} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
  </>}
 </div>;
}
