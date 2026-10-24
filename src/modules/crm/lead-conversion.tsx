import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { convertCrmLead } from './functions';
import type { Pipeline } from './sales-model';
import { toast } from 'sonner';

type Lead = { id: string; title: string; status: string; updated_at: string; converted_opportunity_id: string | null };
export function LeadConversion({ tenantId, lead, pipelines, canWrite }: { tenantId: string; lead: Lead; pipelines: Pipeline[]; canWrite: boolean }) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const [stageId,setStageId]=useState(''),[amount,setAmount]=useState(''),[currency,setCurrency]=useState('GBP');
 const locked=useRef(false),convert=useServerFn(convertCrmLead),qc=useQueryClient();
 const stages=pipelines.flatMap(p=>p.stages.filter(s=>!s.is_closed_won&&!s.is_closed_lost).map(s=>({...s,label:`${p.name} / ${s.name}`})));
 const selected=stages.some(s=>s.id===stageId)?stageId:stages[0]?.id??'';
 if(lead.converted_opportunity_id)return <span className="text-xs text-muted-foreground">Converted to deal</span>;
 if(!canWrite||!['new','working','qualified'].includes(lead.status))return null;
 async function refresh(){await Promise.all(['crm-leads','crm-opportunities','crm-360'].map(key=>qc.invalidateQueries({queryKey:[key,tenantId]})));}
 return <><Button variant="outline" size="sm" disabled={!stages.length} onClick={()=>{setAmount('');setStageId('');setOpen(true);}}>Convert to deal</Button>
 <Dialog open={open} onOpenChange={value=>{if(!locked.current)setOpen(value);}}><DialogContent><DialogHeader><DialogTitle>Convert lead to deal</DialogTitle><DialogDescription>{lead.title}. The contact, company and owner are retained. The lead remains linked to the new deal.</DialogDescription></DialogHeader>
 <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(locked.current||!selected)return;locked.current=true;setBusy(true);
 try{await convert({data:{tenantId,leadId:lead.id,stageId:selected,expectedUpdatedAt:lead.updated_at,amount:amount===''?null:Number(amount),currency}});setOpen(false);await refresh();toast.success('Lead converted to deal');}
 catch(error){toast.error(error instanceof Error?error.message:'Conversion failed');await refresh();}
 finally{locked.current=false;setBusy(false);}}}>
 <label className="grid gap-1 text-sm">Pipeline and stage<select className="h-10 rounded-md border bg-background px-3" value={selected} onChange={e=>setStageId(e.target.value)} disabled={busy}>{stages.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
 <label className="grid gap-1 text-sm">Deal value (optional)<Input type="number" min="0" max="9999999999999999" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
 <label className="grid gap-1 text-sm">Currency<select className="h-10 rounded-md border bg-background px-3" value={currency} onChange={e=>setCurrency(e.target.value)} disabled={busy}>{['GBP','EUR','USD','PKR','AED','CAD','AUD'].map(c=><option key={c}>{c}</option>)}</select></label>
 <div className="flex gap-2"><Button type="submit" disabled={busy||!selected}>{busy?'Converting…':'Create linked deal'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button></div>
 </form></DialogContent></Dialog></>;
}
