import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService} from "@/modules/platform/access";

const uuid=z.string().uuid();
const scope=z.object({
 tenantId:uuid,productKey:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/),
});
const teamScope=scope.extend({teamId:uuid});
const createSchema=scope.extend({
 teamName:z.string().trim().min(3).max(120),
 missionPurpose:z.string().trim().min(12).max(1200),
});
const stepSchema=z.object({
 employeeId:uuid,
 role:z.enum(["lead","analyst","researcher","reviewer","reporter"]),
 instructions:z.string().trim().min(10).max(1000),
 expectedOutput:z.string().trim().min(10).max(1000),
}).strict();
const saveSchema=teamScope.extend({
 steps:z.array(stepSchema).min(2).max(8),
}).superRefine((input,ctx)=>{
 if(input.steps[0]?.role!=="lead")ctx.addIssue({
  code:"custom",message:"First employee must lead the shadow plan",path:["steps",0,"role"],
 });
 const ids=input.steps.map(s=>s.employeeId);
 if(new Set(ids).size!==ids.length)ctx.addIssue({
  code:"custom",message:"A shadow plan requires distinct AI employees",path:["steps"],
 });
});
const transitionSchema=teamScope.extend({
 action:z.enum(["submit","approve","return","pause","resume","retire"]),
 note:z.string().trim().max(1000).nullable().optional(),
});
export type TeamStepInput=z.infer<typeof stepSchema>;
export interface WorkforceShadowTeam {
 id:string;tenant_id:string;product_key:string;
 team_name:string;mission_purpose:string;
 status:"draft"|"pending_review"|"approved_plan"|"paused"|"retired";
 revision:number;created_by:string;last_edited_by:string;
 reviewed_by:string|null;reviewed_at:string|null;review_note:string|null;
 created_at:string;updated_at:string;
}
export interface WorkforceShadowStep {
 team_id:string;employee_id:string;position:number;
 step_role:TeamStepInput["role"];instructions:string;expected_output:string;
 execution_mode:"shadow_only";
}
export interface WorkforceShadowEvent {
 id:string;team_id:string;event_key:string;revision:number;
 note:string|null;created_at:string;
}
export interface WorkforceShadowWorkspace {
 teams:WorkforceShadowTeam[];
 steps:WorkforceShadowStep[];
 events:WorkforceShadowEvent[];
}
export interface WorkforceShadowPreview {
 teamId:string;revision:number;status:string;mode:"sequential_shadow_only";
 canExecute:false;modelCalls:0;toolCalls:0;customerActions:0;scheduled:false;
 stepCount:number;inactiveMembers:number;humanReviewRequired:true;
 steps:Array<{position:number;role:string;employeeId:string;employeeName:string;
   expectedOutput:string;requiresHumanReview:true;execute:false}>;
}
async function administrator(context:any,tenantId:string){
 const access=await requireService(context,tenantId,"omniqora.ai-workforce");
 requireAdminRole(access.role);
}
export const getAiWorkforceShadowWorkspace=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
 .handler(async({context,data}):Promise<WorkforceShadowWorkspace>=>{
  await administrator(context,data.tenantId);
  const db=context.supabase as any;
  const [teams,steps,events]=await Promise.all([
   db.from("ai_workforce_shadow_teams")
    .select("id,tenant_id,product_key,team_name,mission_purpose,status,revision,created_by,last_edited_by,reviewed_by,reviewed_at,review_note,created_at,updated_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("updated_at",{ascending:false}).limit(60),
   db.from("ai_workforce_shadow_steps")
    .select("team_id,employee_id,position,step_role,instructions,expected_output,execution_mode")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("position").limit(480),
   db.from("ai_workforce_shadow_events")
    .select("id,team_id,event_key,revision,note,created_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .order("created_at",{ascending:false}).limit(150),
  ]);
  for(const q of [teams,steps,events])if(q.error)throw new Error(q.error.message);
  return {teams:teams.data??[],steps:steps.data??[],events:events.data??[]};
 });
export const createAiWorkforceShadowTeam=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof createSchema>)=>createSchema.parse(input))
 .handler(async({context,data}):Promise<string>=>{
  await administrator(context,data.tenantId);
  const {data:id,error}=await(context.supabase as any).rpc("create_ai_workforce_shadow_team",{
   _tenant:data.tenantId,_product:data.productKey,
   _name:data.teamName,_purpose:data.missionPurpose,
  });
  if(error)throw new Error(error.message);
  return id as string;
 });
export const saveAiWorkforceShadowPlan=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof saveSchema>)=>saveSchema.parse(input))
 .handler(async({context,data}):Promise<WorkforceShadowTeam>=>{
  await administrator(context,data.tenantId);
  const {data:team,error}=await(context.supabase as any).rpc("save_ai_workforce_shadow_plan",{
   _tenant:data.tenantId,_product:data.productKey,
   _team:data.teamId,_steps:data.steps,
  });
  if(error)throw new Error(error.message);
  return team as WorkforceShadowTeam;
 });
export const transitionAiWorkforceShadowTeam=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof transitionSchema>)=>transitionSchema.parse(input))
 .handler(async({context,data}):Promise<WorkforceShadowTeam>=>{
  await administrator(context,data.tenantId);
  const {data:team,error}=await(context.supabase as any).rpc("transition_ai_workforce_shadow_team",{
   _tenant:data.tenantId,_product:data.productKey,_team:data.teamId,
   _action:data.action,_note:data.note??null,
  });
  if(error)throw new Error(error.message);
  return team as WorkforceShadowTeam;
 });
export const previewAiWorkforceShadowTeam=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof teamScope>)=>teamScope.parse(input))
 .handler(async({context,data}):Promise<WorkforceShadowPreview>=>{
  await administrator(context,data.tenantId);
  const {data:preview,error}=await(context.supabase as any).rpc("preview_ai_workforce_shadow_team",{
   _tenant:data.tenantId,_product:data.productKey,_team:data.teamId,
  });
  if(error)throw new Error(error.message);
  if(!preview||preview.canExecute!==false||preview.modelCalls!==0||
   preview.toolCalls!==0||preview.customerActions!==0||preview.scheduled!==false){
   throw new Error("Shadow team preview attempted unsupported execution");
  }
  return preview as WorkforceShadowPreview;
 });
