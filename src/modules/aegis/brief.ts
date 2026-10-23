export type FieldEvent={id:string;operation_id:string;actor:string;kind:string;recorded_at:string;evidence_class:string};
/** Deterministic, scoped-source adapter. Not model output or safety clearance. */
export function buildSupervisorBrief(events:FieldEvent[]){
 const open=new Map<string,FieldEvent>();
 for(const e of [...events].sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at))){const k=e.operation_id+':'+e.actor;if(e.kind==='attendance_in')open.set(k,e);if(e.kind==='attendance_out')open.delete(k)}
 return {mode:'deterministic_source_brief' as const,window:'Latest 300 visible field events; counts may be incomplete',evidenceClass:'operator_reported' as const,total:events.length,openAttendance:[...open.values()].map(e=>({operationId:e.operation_id,sourceRef:e.id})),checkpointObservations:events.filter(e=>e.kind==='checkpoint_observation').map(e=>e.id),welfareRecords:events.filter(e=>e.kind==='welfare_check').map(e=>e.id),warning:'Records are operator-reported. No GPS/QR/NFC verification, emergency delivery, payroll approval or model inference is asserted.'};
}
