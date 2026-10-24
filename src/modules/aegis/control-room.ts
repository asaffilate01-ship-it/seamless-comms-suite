export type QueueKind='incident'|'corrective'|'handover'|'report'|'instructions'|'visitor'|'key'|'equipment';
export type QueueItem={id:string;kind:QueueKind;title:string;status:string;sourceRef:string;section:string;rank:number;dueOn?:string;overdue?:boolean;mine:boolean};
type Incident={id:string;title:string;status:string;assigned_user_id:string|null};
type Action={id:string;report_id:string;stage:string;priority:string;due_on:string;assignee_id:string};
type Handover={id:string;summary:string;stage:string;created_by:string;incoming_id:string};
type Report={id:string;title:string;stage:string;created_by:string};
type Order={id:string;title:string;version:number;site_id:string};
export type ControlSources={incidents:Incident[];actions:Action[];handovers:Handover[];reports:Report[];orders:Order[];receipts:{order_id:string}[]};
export function buildControlQueue(s:ControlSources,userId:string,today:string):QueueItem[]{
 const rows:QueueItem[]=[];
 for(const r of s.incidents)if(['open','review'].includes(r.status))rows.push({id:'incident:'+r.id,kind:'incident',title:r.title,status:r.status,sourceRef:r.id,section:'aegis-operations',rank:30,mine:r.assigned_user_id===userId});
 for(const r of s.actions)if(r.stage!=='closed'){
  const overdue=r.due_on<today;
  rows.push({id:'corrective:'+r.id,kind:'corrective',title:'Remediation · '+r.priority,status:r.stage,sourceRef:r.id,section:'aegis-corrective',rank:({critical:90,high:60,normal:40}[r.priority]??40)+(overdue?20:0),dueOn:r.due_on,overdue,mine:r.assignee_id===userId});
 }
 for(const r of s.handovers)if(['offered','returned'].includes(r.stage))rows.push({id:'handover:'+r.id,kind:'handover',title:r.summary.slice(0,160),status:r.stage,sourceRef:r.id,section:'aegis-handovers',rank:20,mine:(r.stage==='offered'?r.incoming_id:r.created_by)===userId});
 for(const r of s.reports)if(r.stage==='submitted')rows.push({id:'report:'+r.id,kind:'report',title:r.title,status:'Awaiting supervisor review',sourceRef:r.id,section:'aegis-reports',rank:25,mine:false});
 const received=new Set(s.receipts.map(r=>r.order_id));
 for(const r of s.orders)if(!received.has(r.id))rows.push({id:'instructions:'+r.id,kind:'instructions',title:r.title+' · v'+r.version,status:'No receipt recorded for you',sourceRef:r.id,section:'aegis-orders',rank:10,mine:true});
 return rows.sort((a,b)=>b.rank-a.rank||(a.dueOn??'9999').localeCompare(b.dueOn??'9999')||a.id.localeCompare(b.id));
}
