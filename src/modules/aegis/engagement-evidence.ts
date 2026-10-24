export const fieldEvidenceKinds=['attendance_in','attendance_out','checkpoint_observation','welfare_check'] as const;
export type FieldEvidenceKind=typeof fieldEvidenceKinds[number];
export function canRecordEngagement(role:string,userId:string,status:string,assignedId:string|null){return !!userId&&status==='active'&&(['owner','admin'].includes(role)||(role==='agent'&&assignedId===userId));}
type Evidence={id:string;kind:string;actor:string;checkpoint_id:string|null;note:string;recorded_at:string;evidence_class:string};
type Checkpoint={id:string;label:string};
export async function readEngagementEvidence(db:any,tenantId:string,engagementId:string,kind:string,page:number){
 if((kind!=='all'&&!(fieldEvidenceKinds as readonly string[]).includes(kind))||!Number.isInteger(page)||page<0||page>10000)throw new Error('Invalid field evidence request');
 const parent=await db.from('aegis_operations').select('id,status,parent_id,assigned_user_id').eq('tenant_id',tenantId).eq('id',engagementId).eq('kind','engagement').maybeSingle();
 if(parent.error||!parent.data)throw new Error('Engagement unavailable or access denied');
 let q=db.from('aegis_field_events').select('id,kind,actor,checkpoint_id,note,recorded_at,evidence_class').eq('tenant_id',tenantId).eq('operation_id',engagementId);
 if(kind!=='all')q=q.eq('kind',kind);
 const start=page*25,events=await q.order('recorded_at',{ascending:false}).order('id').range(start,start+25);
 if(events.error)throw new Error('Field evidence unavailable; refresh before review');
 let checkpoints:Checkpoint[]=[],checkpointsLimited=false;
 if(parent.data.status==='active'){
  if(!parent.data.parent_id)throw new Error('Engagement site configuration unavailable');
  const result=await db.from('aegis_checkpoints').select('id,label').eq('tenant_id',tenantId).eq('site_id',parent.data.parent_id).eq('status','active').order('label').order('id').limit(101);
  if(result.error)throw new Error('Active checkpoint evidence unavailable');
  checkpoints=(result.data??[]).slice(0,100);checkpointsLimited=(result.data??[]).length>100;
 }
 return {events:(events.data??[]).slice(0,25) as Evidence[],hasMore:(events.data??[]).length>25,page,pageSize:25,checkpoints,checkpointsLimited,status:parent.data.status as string,assignedId:parent.data.assigned_user_id as string|null,sampledAt:new Date().toISOString()};
}
