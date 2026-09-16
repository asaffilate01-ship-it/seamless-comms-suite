import { runIntelligence } from "./provider";

export type WorkflowDefinition={applicationId:string;name:string;riskClass:"low"|"medium"|"high";steps:Array<{key:string;type:"validate"|"enrich"|"reason"|"approve"|"notify";instruction:string}>};
export type StepResult={key:string;type:string;status:"completed"|"waiting_approval"|"simulated";durationMs:number;output:Record<string,unknown>};

export async function executeWorkflow(definition:WorkflowDefinition,input:Record<string,unknown>){
  const started=Date.now(); const steps:StepResult[]=[];
  for(const step of definition.steps){
    const stepStarted=Date.now();
    if(step.type==="approve"||((step.type==="notify")&&definition.riskClass!=="low")){
      steps.push({key:step.key,type:step.type,status:"waiting_approval",durationMs:Date.now()-stepStarted,output:{reason:"Human approval policy"}}); break;
    }
    if(step.type==="reason"){
      const result=await runIntelligence({taskClass:definition.name,instruction:step.instruction,context:{...input,application:definition.applicationId}});
      steps.push({key:step.key,type:step.type,status:"simulated",durationMs:Date.now()-stepStarted,output:result}); continue;
    }
    steps.push({key:step.key,type:step.type,status:"completed",durationMs:Date.now()-stepStarted,output:{accepted:true}});
  }
  const waiting=steps.some(step=>step.status==="waiting_approval");
  return {status:waiting?"waiting_approval":"completed",mode:"simulation" as const,durationMs:Date.now()-started,steps};
}
