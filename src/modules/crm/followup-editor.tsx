import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { editCrmFollowUp } from './functions';
import { toast } from 'sonner';

type Task={id:string;title:string;due_at:string|null;priority:'low'|'normal'|'high'|'urgent';updated_at:string};
function localDate(value:string|null){if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export function FollowUpEditor({tenantId,task,onClose}:{tenantId:string;task:Task;onClose:()=>void}){
 const [title,setTitle]=useState(task.title),[due,setDue]=useState(localDate(task.due_at)),[priority,setPriority]=useState(task.priority);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),locked=useRef(false);
 const save=useServerFn(editCrmFollowUp),qc=useQueryClient();
 return <Dialog open onOpenChange={open=>{if(!open&&!locked.current)onClose();}}><DialogContent><DialogHeader><DialogTitle>Edit follow-up</DialogTitle><DialogDescription>Change the task title, due date or priority. Clear the date to leave it undated.</DialogDescription></DialogHeader>
 <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(locked.current)return;locked.current=true;setBusy(true);setError('');
 try{await save({data:{tenantId,taskId:task.id,expectedUpdatedAt:task.updated_at,title,priority,dueAt:due===localDate(task.due_at)?task.due_at:due?new Date(due).toISOString():null}});
 await Promise.all(['crm-followups','crm-tasks','crm-deal','crm-360'].map(key=>qc.invalidateQueries({queryKey:[key,tenantId]})));toast.success('Follow-up updated');onClose();}
 catch(e){setError(e instanceof Error?e.message:'Follow-up update failed');}
 finally{locked.current=false;setBusy(false);}}}>
 <label className="grid gap-1 text-sm">Title<Input required maxLength={240} disabled={busy} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <label className="grid gap-1 text-sm">Due (local time)<Input type="datetime-local" disabled={busy} value={due} onChange={e=>setDue(e.target.value)}/></label>
 <label className="grid gap-1 text-sm">Priority<select className="h-10 rounded-md border bg-background px-3" disabled={busy} value={priority} onChange={e=>setPriority(e.target.value as Task['priority'])}>{['low','normal','high','urgent'].map(p=><option key={p}>{p}</option>)}</select></label>
 {error&&<div role="alert" className="text-sm text-destructive"><p>{error}</p><p>For a changed task, close this editor, refresh the worklist and reopen it.</p></div>}
 <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy?'Saving…':'Save changes'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button></div>
 </form></DialogContent></Dialog>;
}
