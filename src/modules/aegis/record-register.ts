import type {QueueItem,QueueKind} from './control-room';
export const registerStatuses={site:['draft','active','archived'],engagement:['draft','scheduled','active','completed','cancelled'],incident:['open','review','resolved','closed'],corrective:['open','in_progress','submitted','closed'],handover:['draft','offered','returned','acknowledged'],report:['draft','submitted','approved','changes_requested'],instructions:['current','superseded'],visitor:['expected','approved','onsite','departed','cancelled'],key:['available','issued','returned','maintenance','lost'],equipment:['available','issued','returned','maintenance','lost']} as const;
const plans={
 site:{table:'aegis_operations',columns:'id,title,status,updated_at',sort:'updated_at',section:'aegis-operations'},
 engagement:{table:'aegis_operations',columns:'id,title,status,updated_at',sort:'updated_at',section:'aegis-operations'},
 incident:{table:'aegis_operations',columns:'id,title,status,updated_at',sort:'updated_at',section:'aegis-operations'},
 corrective:{table:'aegis_corrective_actions',columns:'id,stage,priority,due_on,updated_at',sort:'updated_at',section:'aegis-corrective'},
 handover:{table:'aegis_handovers',columns:'id,summary,stage,updated_at',sort:'updated_at',section:'aegis-handovers'},
 report:{table:'aegis_reports',columns:'id,title,kind,stage,updated_at',sort:'updated_at',section:'aegis-reports'},
 instructions:{table:'aegis_post_orders_status',columns:'id,title,version,is_current,created_at',sort:'created_at',section:'aegis-orders'},
 visitor:{table:'aegis_resources',columns:'id,label,stage,updated_at',sort:'updated_at',section:'aegis-custody'},
 key:{table:'aegis_resources',columns:'id,label,stage,updated_at',sort:'updated_at',section:'aegis-custody'},
 equipment:{table:'aegis_resources',columns:'id,label,stage,updated_at',sort:'updated_at',section:'aegis-custody'},
} as const;
export async function readRecordRegister(db:any,tenantId:string,kind:QueueKind,status:string,sourceId:string,page:number,filters:{query?:string;from?:string;to?:string}={}){
 if(!Object.hasOwn(plans,kind)||!Number.isInteger(page)||page<0||page>10000)throw new Error('Invalid register request');
 if(status!=='all'&&!(registerStatuses[kind] as readonly string[]).includes(status))throw new Error('Status does not belong to this category');
 if(sourceId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId))throw new Error('Enter a complete source UUID');
 const keyword=(filters.query??'').trim();
 if(keyword.length>120||/[%_*\\\x00-\x1f]/.test(keyword))throw new Error('Use up to 120 characters without wildcards or control characters');
 function date(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value||value<'1900-01-01'||value>'2200-12-31')throw new Error('Invalid date filter');return value;}
 const from=filters.from?date(filters.from):'',to=filters.to?date(filters.to):'';
 if(from&&to&&from>to)throw new Error('From date must not follow to date');
 const plan=plans[kind];let q=db.from(plan.table).select(plan.columns).eq('tenant_id',tenantId);
 if(['site','engagement','incident','visitor','key','equipment'].includes(kind))q=q.eq('kind',kind);
 if(status!=='all')q=q.eq(kind==='instructions'?'is_current':['site','engagement','incident'].includes(kind)?'status':'stage',kind==='instructions'?status==='current':status);
 if(sourceId)q=q.eq('id',sourceId);
 const searchColumn=kind==='corrective'?'evidence':kind==='handover'?'summary':['visitor','key','equipment'].includes(kind)?'label':'title';
 if(keyword)q=q.ilike(searchColumn,'%'+keyword+'%');
 if(from)q=q.gte(plan.sort,from+'T00:00:00Z');
 if(to)q=q.lt(plan.sort,new Date(Date.parse(to+'T00:00:00Z')+86400000).toISOString());
 const start=page*25,result=await q.order(plan.sort,{ascending:false}).order('id').range(start,start+25);
 if(result.error)throw new Error('Record register unavailable; refresh before reviewing');
 const items: (QueueItem&{recordedAt:string})[]=(result.data??[]).slice(0,25).map((r:any)=>({id:kind+':'+r.id,kind,sourceRef:r.id,section:plan.section,rank:0,mine:false,title:['visitor','key','equipment'].includes(kind)?r.label:kind==='corrective'?'Remediation · '+r.priority:kind==='handover'?r.summary.slice(0,160):kind==='instructions'?r.title+' · v'+r.version:r.title,status:kind==='instructions'?(r.is_current?'current':'superseded'):r.stage??r.status,recordedAt:r[plan.sort],...(r.due_on?{dueOn:r.due_on}:{})}));
 return {items,hasMore:(result.data??[]).length>25,page,pageSize:25,sampledAt:new Date().toISOString()};
}
