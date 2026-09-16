export type WorkflowDraft={name?:string;applicationId?:string;trigger?:string;riskClass?:"low"|"medium"|"high";steps?:Array<{key?:string;type?:string;instruction?:string}>};
export type ValidationIssue={path:string;code:string;message:string};
const stepTypes=new Set(["validate","enrich","reason","approve","notify"]);
export function validateWorkflow(draft:WorkflowDraft){
  const errors:ValidationIssue[]=[];const warnings:ValidationIssue[]=[];
  if(!draft.name?.trim())errors.push({path:"name",code:"required",message:"Workflow name is required"});
  if(!draft.applicationId?.trim())errors.push({path:"applicationId",code:"required",message:"Application is required"});
  if(!draft.trigger?.includes("."))errors.push({path:"trigger",code:"invalid_event",message:"Use a namespaced event such as dishbee.shift.closed"});
  if(!draft.steps?.length)errors.push({path:"steps",code:"required",message:"Add at least one step"});
  const keys=new Set<string>();for(const [index,step] of (draft.steps??[]).entries()){
    if(!step.key?.trim())errors.push({path:`steps.${index}.key`,code:"required",message:"Step key is required"});
    else if(keys.has(step.key))errors.push({path:`steps.${index}.key`,code:"duplicate",message:"Step keys must be unique"});else keys.add(step.key);
    if(!step.type||!stepTypes.has(step.type))errors.push({path:`steps.${index}.type`,code:"invalid_type",message:"Unsupported step type"});
    if(!step.instruction?.trim())errors.push({path:`steps.${index}.instruction`,code:"required",message:"Step instruction is required"});
  }
  const hasApproval=draft.steps?.some(step=>step.type==="approve");
  if((draft.riskClass==="medium"||draft.riskClass==="high")&&!hasApproval)errors.push({path:"steps",code:"approval_required",message:"Medium and high-risk workflows require an approval step"});
  if(draft.steps?.at(-1)?.type==="reason")warnings.push({path:"steps",code:"unused_result",message:"Add an approval, notification or storage step after reasoning"});
  return {valid:errors.length===0,errors,warnings,summary:{steps:draft.steps?.length??0,hasApproval,riskClass:draft.riskClass??"medium"}};
}
