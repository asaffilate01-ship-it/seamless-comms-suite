import type {QueueItem} from './control-room';
type FindingAction={id:string;check_index:number;stage:string;assignee_id:string;due_on:string;priority:string;revision:number};
export type ReportFinding={index:number;label:string;finding:string;action:FindingAction|null;item:QueueItem|null};
export async function readReportFindings(db:any,tenantId:string,reportId:string){
 const parent=await db.from('aegis_reports').select('id,title,stage,checks').eq('tenant_id',tenantId).eq('id',reportId).maybeSingle();
 if(parent.error||!parent.data)throw new Error('Report unavailable or access denied');
 if(!Array.isArray(parent.data.checks)||parent.data.checks.length>30)throw new Error('Report checklist evidence unavailable');
 const result=await db.from('aegis_corrective_actions').select('id,check_index,stage,assignee_id,due_on,priority,revision').eq('tenant_id',tenantId).eq('report_id',reportId).order('check_index').order('id').limit(31);
 if(result.error)throw new Error('Finding actions unavailable; refresh before assigning work');
 const rows:FindingAction[]=result.data??[];const seen=new Set<number>();
 if(rows.length>30)throw new Error('Finding action evidence is inconsistent');
 for(const r of rows){if(!Number.isInteger(r.check_index)||seen.has(r.check_index)||parent.data.checks[r.check_index]?.result!=='fail')throw new Error('Finding action evidence is inconsistent');seen.add(r.check_index);}
 const findings:ReportFinding[]=parent.data.checks.flatMap((check:any,index:number)=>{
  if(check.result!=='fail')return [];
  const action=rows.find((r:any)=>r.check_index===index);
  const item:QueueItem|null=action?{id:'corrective:'+action.id,kind:'corrective',sourceRef:action.id,title:'Remediation · '+action.priority,status:action.stage,section:'aegis-corrective',rank:0,mine:false,dueOn:action.due_on}:null;
  return [{index,label:check.label as string,finding:check.finding as string,action:action??null,item}];
 });
 return {findings,reportStage:parent.data.stage as string,sampledAt:new Date().toISOString()};
}
