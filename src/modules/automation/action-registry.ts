export type AutomationActionRisk="read"|"low"|"medium"|"high";

export type AutomationActionDefinition={
  key:string;
  moduleKey:string;
  description:string;
  risk:AutomationActionRisk;
  requiresApproval:boolean;
};

export const AUTOMATION_ACTION_CATALOGUE:AutomationActionDefinition[]=[
  {key:"crm.task.create",moduleKey:"crm.core",description:"Create an internal CRM task.",risk:"low",requiresApproval:false},
  {key:"creative.brief.create",moduleKey:"creative.core",description:"Create a draft Voxentri creative brief.",risk:"low",requiresApproval:false},
  {key:"feedback.request.create",moduleKey:"feedback.core",description:"Create a feedback request record for later delivery.",risk:"low",requiresApproval:false},
  {key:"connect.message.request",moduleKey:"connect.core",description:"Request an outbound customer message through Connect.",risk:"medium",requiresApproval:true},
  {key:"dispatch.job.create",moduleKey:"dispatch.core",description:"Create a dispatch job proposal.",risk:"medium",requiresApproval:true},
  {key:"loyalty.entry.apply",moduleKey:"loyalty.core",description:"Apply a loyalty ledger mutation.",risk:"medium",requiresApproval:true},
  {key:"compliance.review.request",moduleKey:"compliance.core",description:"Create an internal compliance review request.",risk:"low",requiresApproval:false},
  {key:"intelligence.decision",moduleKey:"intelligence.core",description:"Request an AI decision/draft through governed Intelligence.",risk:"medium",requiresApproval:false},
];

export function automationActionDefinition(key:string){
 return AUTOMATION_ACTION_CATALOGUE.find((action)=>action.key===key)??null;
}
