import type {QueueItem,QueueKind} from './control-room';
export const siteActivityKinds=['engagement','incident','report','handover','visitor','key','equipment','instructions'] as const;
export type ActivityKind=typeof siteActivityKinds[number];
const plans={
 engagement:{table:'aegis_operations',columns:'id,title,status,updated_at',link:'parent_id',section:'aegis-operations'},
 incident:{table:'aegis_operations',columns:'id,title,status,updated_at',link:'parent_id',section:'aegis-operations'},
 report:{table:'aegis_reports',columns:'id,title,stage,updated_at',link:'site_id',section:'aegis-reports'},
 handover:{table:'aegis_handovers',columns:'id,summary,stage,updated_at',link:'site_id',section:'aegis-handovers'},
 visitor:{table:'aegis_resources',columns:'id,label,stage,updated_at',link:'site_id',section:'aegis-custody'},
 key:{table:'aegis_resources',columns:'id,label,stage,updated_at',link:'site_id',section:'aegis-custody'},
 equipment:{table:'aegis_resources',columns:'id,label,stage,updated_at',link:'site_id',section:'aegis-custody'},
 instructions:{table:'aegis_post_orders_status',columns:'id,title,version,is_current,created_at',link:'site_id',section:'aegis-orders'},
} as const;
export async function readSiteActivity(db:any,tenantId:string,parentId:string,parentKind:'site'|'engagement',kind:ActivityKind,page:number){
 if(!['site','engagement'].includes(parentKind)||!Object.hasOwn(plans,kind)||!Number.isInteger(page)||page<0||page>10000||(parentKind==='engagement'&&kind!=='incident'))throw new Error('Invalid activity request');
 const parent=await db.from('aegis_operations').select('id,title,kind').eq('tenant_id',tenantId).eq('id',parentId).eq('kind',parentKind).maybeSingle();
 if(parent.error||!parent.data)throw new Error('Parent record unavailable or access denied');
 const plan=plans[kind],sort=kind==='instructions'?'created_at':'updated_at';
 let q=db.from(plan.table).select(plan.columns).eq('tenant_id',tenantId).eq(plan.link,parentId);
 if(['engagement','incident','visitor','key','equipment'].includes(kind))q=q.eq('kind',kind);
 const start=page*25,result=await q.order(sort,{ascending:false}).order('id').range(start,start+25);
 if(result.error)throw new Error('Linked activity unavailable; retry before reviewing');
 const items: (QueueItem&{recordedAt:string})[]=(result.data??[]).slice(0,25).map((r:any)=>({id:kind+':'+r.id,kind:kind as QueueKind,sourceRef:r.id,title:kind==='handover'?r.summary.slice(0,160):['visitor','key','equipment'].includes(kind)?r.label:kind==='instructions'?r.title+' · v'+r.version:r.title,status:kind==='instructions'?(r.is_current?'current':'superseded'):r.stage??r.status,recordedAt:r[sort],section:plan.section,rank:0,mine:false}));
 return {items,hasMore:(result.data??[]).length>25,page,pageSize:25,sampledAt:new Date().toISOString()};
}
