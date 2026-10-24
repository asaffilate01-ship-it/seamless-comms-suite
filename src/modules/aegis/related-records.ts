import type {QueueItem,QueueKind} from './control-room';
export type RelatedRecord={label:string;sourceRef:string;item:QueueItem|null};
export async function readRelatedRecords(db:any,tenantId:string,kind:QueueKind,row:any):Promise<RelatedRecord[]>{
 if(row.tenant_id!==tenantId)throw new Error('Related source scope mismatch');
 const targets:{label:string;id:string;table:string;expected?:string}[]=[];
 if(kind==='corrective'&&row.report_id)targets.push({label:'Source inspection / report',id:row.report_id,table:'aegis_reports',expected:'report'});
 if(['incident','engagement'].includes(kind)&&row.parent_id)targets.push({label:'Parent operation',id:row.parent_id,table:'aegis_operations'});
 if(['report','handover','instructions','visitor','key','equipment'].includes(kind)&&row.site_id)targets.push({label:'Site context',id:row.site_id,table:'aegis_operations',expected:'site'});
 return Promise.all(targets.map(async target=>{
  let q=db.from(target.table).select(target.table==='aegis_reports'?'id,title,stage':'id,title,status,kind').eq('tenant_id',tenantId).eq('id',target.id);
  if(target.expected==='site')q=q.eq('kind','site');
  const result=await q.maybeSingle();if(result.error)throw new Error('Related context could not be loaded; refresh before review');
  const r=result.data,targetKind=target.expected==='report'?'report':r?.kind;
  // Missing, denied or unsupported targets have one indistinguishable unavailable result.
  if(!r||!['site','engagement','report'].includes(targetKind))return {label:target.label,sourceRef:target.id,item:null};
  return {label:target.label,sourceRef:target.id,item:{id:targetKind+':'+r.id,kind:targetKind as QueueKind,title:r.title,status:r.stage??r.status,sourceRef:r.id,section:targetKind==='report'?'aegis-reports':'aegis-operations',rank:0,mine:false}};
 }));
}
export function followSourceTrail(trail:QueueItem[],next:QueueItem):QueueItem[]{const index=trail.findIndex(i=>i.kind===next.kind&&i.sourceRef===next.sourceRef);return index>=0?trail.slice(0,index+1):[...trail.slice(-15),next];}
