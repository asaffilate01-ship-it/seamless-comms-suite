import { env } from "cloudflare:workers";
import { requireInternalIdentity } from "@/lib/auth/authorize";
import { executeWorkflow, type WorkflowDefinition } from "@/lib/execution/engine";

type Bindings={DB?:D1Database;ADMIN_EMAILS?:string};
const templates:Record<string,WorkflowDefinition>={
  "daily-hospitality-briefing":{applicationId:"dishbee",name:"Daily hospitality briefing",riskClass:"medium",steps:[{key:"validate",type:"validate",instruction:"Validate source metrics"},{key:"analyse",type:"reason",instruction:"Identify margin, demand, compliance and waste exceptions"},{key:"approval",type:"approve",instruction:"Request operations approval"},{key:"notify",type:"notify",instruction:"Deliver the approved briefing"}]},
  "food-waste-variance":{applicationId:"cirqiva",name:"Food waste variance",riskClass:"medium",steps:[{key:"validate",type:"validate",instruction:"Validate shift and waste records"},{key:"analyse",type:"reason",instruction:"Explain the variance and recommend reduction actions"},{key:"approval",type:"approve",instruction:"Request site approval"}]},
  "drawing-revision-impact":{applicationId:"premisora",name:"Drawing revision impact",riskClass:"high",steps:[{key:"validate",type:"validate",instruction:"Validate revision metadata"},{key:"analyse",type:"reason",instruction:"Assess cost, programme, compliance and stakeholder impact"},{key:"approval",type:"approve",instruction:"Request project lead approval"}]}
};

export async function POST(request:Request,context:{params:Promise<{workflow:string}>}){
  const bindings=env as unknown as Bindings; const auth=requireInternalIdentity(request,bindings,["owner","admin","operator"]); if("response" in auth)return auth.response;
  const {workflow}=await context.params; const definition=templates[workflow]; if(!definition)return Response.json({error:"Unknown workflow"},{status:404});
  let input:Record<string,unknown>={}; try{input=await request.json() as Record<string,unknown>}catch{}
  const result=await executeWorkflow(definition,input); const runId=crypto.randomUUID();
  if(bindings.DB){
    const registered=await bindings.DB.prepare("SELECT id FROM workflows WHERE id = ? LIMIT 1").bind(workflow).first();
    if(registered) await bindings.DB.prepare("INSERT INTO workflow_runs (id, workflow_id, application_id, status, mode, input_json, output_json, started_by, finished_at, duration_ms, estimated_cost_pence) VALUES (?, ?, ?, ?, 'simulation', ?, ?, ?, CURRENT_TIMESTAMP, ?, 0)").bind(runId,workflow,definition.applicationId,result.status,JSON.stringify(input),JSON.stringify(result),auth.identity.id,result.durationMs).run();
  }
  return Response.json({run_id:runId,workflow,result},{status:result.status==="waiting_approval"?202:200});
}
