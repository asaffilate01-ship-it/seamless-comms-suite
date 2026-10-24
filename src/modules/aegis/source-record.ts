export type SourceKind='incident'|'corrective'|'handover'|'report'|'instructions'|'visitor'|'key'|'equipment';
const sources={
 incident:{table:'aegis_operations',history:'aegis_operation_events',foreignKey:'operation_id',sort:'revision'},
 corrective:{table:'aegis_corrective_actions',history:'aegis_corrective_events',foreignKey:'action_id',sort:'revision'},
 handover:{table:'aegis_handovers',history:'aegis_handover_events',foreignKey:'handover_id',sort:'revision'},
 report:{table:'aegis_reports',history:'aegis_report_events',foreignKey:'report_id',sort:'revision'},
 instructions:{table:'aegis_post_orders_status',history:'aegis_post_order_receipts',foreignKey:'order_id',sort:'recorded_at'},
 visitor:{table:'aegis_resources',history:'aegis_resource_events',foreignKey:'resource_id',sort:'revision'},
 key:{table:'aegis_resources',history:'aegis_resource_events',foreignKey:'resource_id',sort:'revision'},
 equipment:{table:'aegis_resources',history:'aegis_resource_events',foreignKey:'resource_id',sort:'revision'},
} as const;
export const SOURCE_HISTORY_PAGE_SIZE=25;
export async function readSourceRecord(db:any,tenantId:string,kind:SourceKind,id:string,page:number){
 if(!Object.hasOwn(sources,kind)||!Number.isInteger(page)||page<0||page>10000)throw new Error('Invalid source request');
 const plan=sources[kind];
 let query=db.from(plan.table).select('*').eq('tenant_id',tenantId).eq('id',id);
 if(kind==='incident'||['visitor','key','equipment'].includes(kind))query=query.eq('kind',kind);
 const result=await query.maybeSingle();
 if(result.error||!result.data)throw new Error('Source record unavailable or access denied');
 const start=page*SOURCE_HISTORY_PAGE_SIZE;
 const history=await db.from(plan.history).select('*').eq('tenant_id',tenantId).eq(plan.foreignKey,id).order(plan.sort,{ascending:false}).order('id').range(start,start+SOURCE_HISTORY_PAGE_SIZE);
 if(history.error)throw new Error('Source history unavailable; refresh before reviewing');
 return {record:result.data,history:(history.data??[]).slice(0,SOURCE_HISTORY_PAGE_SIZE),hasMore:(history.data??[]).length>SOURCE_HISTORY_PAGE_SIZE,page,pageSize:SOURCE_HISTORY_PAGE_SIZE,sampledAt:new Date().toISOString()};
}
