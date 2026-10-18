import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireService,requireAdminRole} from "@/modules/platform/access";

const uuid=z.string().uuid();
const productKey=z.string().regex(/^[a-z0-9][a-z0-9.-]{1,80}$/);
const scope=z.object({tenantId:uuid,productKey,employeeId:uuid});
const fixture=z.enum(["fixture.crm.pipeline","fixture.dishbee.orders","fixture.finance.cashflow"]);
const request=scope.extend({taskId:uuid,fixtureKey:fixture,idempotencyKey:uuid});

async function admin(context:any,tenantId:string){
 const access=await requireService(context,tenantId,"omniqora.ai-workforce");
 requireAdminRole(access.role);
}

export type SandboxStatus="queued"|"processing"|"completed"|"failed"|"cancelled";
export interface SandboxFinding {observation:string;value:number;unit:string}
export interface SandboxAdmissionSummary {
 id:string;jobId:string;taskId:string;employeeId:string;
 fixtureKey:string;status:SandboxStatus;admittedAt:string;finishedAt:string|null;
 summary:string|null;findings:SandboxFinding[];costMinor:0;syntheticOnly:true;
}
export interface SandboxWorkspace {
 enabled:boolean;expiresAt:string|null;dailyLimit:number;
 admittedToday:number;admissions:SandboxAdmissionSummary[];
}
export const getAiWorkforceSandboxWorkspace=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
 .handler(async({context,data}):Promise<SandboxWorkspace>=>{
  await admin(context,data.tenantId);
  const db=context.supabase as any;
  const [pilot,admissions]=await Promise.all([
   db.from("ai_workforce_sandbox_pilots")
    .select("enabled,expires_at,daily_limit")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey).maybeSingle(),
   db.from("ai_workforce_sandbox_admissions")
    .select("id,job_id,employee_id,task_id,fixture_key,status,admitted_at,finished_at")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .eq("employee_id",data.employeeId)
    .order("admitted_at",{ascending:false}).limit(30),
  ]);
  if(pilot.error||admissions.error)throw new Error((pilot.error||admissions.error).message);
  const rows=admissions.data??[];
  const ids=rows.map((r:any)=>r.job_id);
  let jobs:any[]=[];
  if(ids.length){
   const q=await db.from("intelligence_jobs").select("id,status,result")
    .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
    .eq("job_type","ai-workforce.fixture").in("id",ids);
   if(q.error)throw new Error(q.error.message);
   jobs=q.data??[];
  }
  const byJob=new Map(jobs.map(j=>[j.id,j]));
  const today=new Date().toISOString().slice(0,10);
  return {
   enabled:pilot.data?.enabled===true&&
     Date.parse(pilot.data.expires_at)>Date.now(),
   expiresAt:pilot.data?.expires_at??null,
   dailyLimit:pilot.data?.daily_limit??0,
   admittedToday:rows.filter((r:any)=>r.admitted_at?.startsWith(today)).length,
   admissions:rows.map((r:any)=>{
     const result=byJob.get(r.job_id)?.result;
     const findings=(r.status==="completed"&&
       result?.dataOrigin==="synthetic_fixture"&&Array.isArray(result.findings))
       ?result.findings.filter((f:any)=>typeof f?.observation==="string"&&
         typeof f?.value==="number"&&typeof f?.unit==="string")
        .slice(0,8).map((f:any)=>({observation:f.observation.slice(0,150),value:f.value,unit:f.unit.slice(0,50)}))
       :[];
     return {
      id:r.id,jobId:r.job_id,taskId:r.task_id,employeeId:r.employee_id,
      fixtureKey:r.fixture_key,status:r.status,admittedAt:r.admitted_at,
      finishedAt:r.finished_at,summary:r.status==="completed"&&
       typeof result?.summary==="string"?result.summary.slice(0,200):null,
      findings,costMinor:0 as const,syntheticOnly:true as const,
     };
   }),
  };
 });

export const queueAiWorkforceFixtureRehearsal=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:z.input<typeof request>)=>request.parse(input))
 .handler(async({context,data}):Promise<{
  admissionId:string;jobId:string;status:string;alreadyExists:boolean;fixtureKey:string;syntheticOnly:true;modelCalls:0;
 }>=>{
  await admin(context,data.tenantId);
  const {data:queued,error}=await(context.supabase as any)
    .rpc("queue_ai_workforce_fixture_rehearsal",{
      _tenant:data.tenantId,_product:data.productKey,
      _employee:data.employeeId,_task:data.taskId,
      _fixture:data.fixtureKey,_idempotency:data.idempotencyKey,
    });
  if(error)throw new Error(error.message);
  if(!queued||queued.syntheticOnly!==true||queued.modelCalls!==0||
     typeof queued.admissionId!=="string"||typeof queued.jobId!=="string"){
   throw new Error("Refused an unverified fixture queue result");
  }
  return queued;
 });

export const cancelAiWorkforceFixtureRehearsal=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>scope.extend({admissionId:uuid}).parse(input))
 .handler(async({context,data}):Promise<{admissionId:string;status:"cancelled"}>=>{
  await admin(context,data.tenantId);
  const db=context.supabase as any;
  const linked=await db.from("ai_workforce_sandbox_admissions")
   .select("id").eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
   .eq("employee_id",data.employeeId).eq("id",data.admissionId).single();
  if(linked.error||!linked.data)throw new Error("Sandbox request not in employee scope");
  const {data:result,error}=await db.rpc("cancel_ai_workforce_fixture_rehearsal",{
   _tenant:data.tenantId,_product:data.productKey,_admission:data.admissionId,
  });
  if(error)throw new Error(error.message);
  if(!result||result.status!=="cancelled")throw new Error("Cancellation not confirmed");
  return {admissionId:data.admissionId,status:"cancelled"};
 });
