export type IntelligenceTask={taskClass:string;instruction:string;context:Record<string,unknown>};
export type IntelligenceResult={provider:string;model:string;mode:"simulation"|"live";summary:string;confidence:number;tokens:{input:number;output:number};estimatedCostPence:number;structured:Record<string,unknown>};

export async function runIntelligence(task:IntelligenceTask):Promise<IntelligenceResult>{
  const entity=String(task.context.application??task.context.site??"the application");
  return {provider:"simulation",model:"rules-v1",mode:"simulation",summary:`Analysed ${task.taskClass} for ${entity}. A human review is required before any external action.`,confidence:0.94,tokens:{input:0,output:0},estimatedCostPence:0,structured:{recommendation:"review",reasons:["Relevant event accepted","Policy controls applied","No live AI credential connected"],instruction:task.instruction}};
}
