import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService} from "@/modules/platform/access";

const uuid=z.string().uuid();
const scope=z.object({tenantId:uuid,productKey:z.literal("omniqora"),employeeId:uuid});

export interface WorkforceWorkerPermit {
 workerRef:string;modelKey:string;status:"active"|"disabled"|"revoked";
 maxClaims:number;usedClaims:number;expiresAt:string;operatorReference:string;
}
export interface WorkforceOperatorEvent {
 id:string;eventKey:string;workerRef:string|null;
 admissionId:string|null;operatorReference:string|null;createdAt:string;
}
export interface WorkforceOperationalIssue {
 admissionId:string;runId:string;employeeId:string;
 status:string;reason:"uncertain_provider_charge"|"stale_worker"|"awaiting_human_review";
 reservedMinor:number|null;actualMinor:number|null;
 currency:string|null;providerReceiptRef:string|null;
 admittedAt:string;lockedAt:string|null;
}
export interface WorkforceOperationsWorkspace {
 pilotActive:boolean;pilotExpiresAt:string|null;
 workerPermits:WorkforceWorkerPermit[];
 issues:WorkforceOperationalIssue[];
 events:WorkforceOperatorEvent[];
 totals:{activePermits:number;claimSlotsRemaining:number;
   uncertainCharges:number;staleWorkers:number;waitingReview:number;
   reservedMinorOutstanding:number};
}

export const getAiWorkforceOperationsWorkspace=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((i:z.input<typeof scope>)=>scope.parse(i))
 .handler(async({context,data}):Promise<WorkforceOperationsWorkspace>=>{
   const access=await requireService(context,data.tenantId,"omniqora.ai-workforce");
   requireAdminRole(access.role);
   const db=context.supabase as any;
   const [pilot,permits,events,admissions]=await Promise.all([
     db.from("ai_workforce_readonly_pilots")
       .select("enabled,expires_at").eq("tenant_id",data.tenantId)
       .eq("product_key",data.productKey).maybeSingle(),
     db.from("ai_workforce_worker_allowlist")
       .select("worker_ref,model_key,status,max_claims,used_claims,expires_at,operator_reference")
       .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
       .order("updated_at",{ascending:false}).limit(40),
     db.from("ai_workforce_operator_events")
       .select("id,event_key,worker_ref,admission_id,operator_reference,created_at")
       .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
       .order("created_at",{ascending:false}).limit(60),
     db.from("ai_workforce_readonly_admissions")
       .select("id,run_id,job_id,reservation_id,employee_id,status,admitted_at")
       .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
       .eq("employee_id",data.employeeId)
       .in("status",["processing","waiting_review","reconciliation_required"])
       .order("admitted_at",{ascending:false}).limit(75),
   ]);
   for(const r of [pilot,permits,events,admissions]){
     if(r.error)throw new Error(r.error.message);
   }
   const all=admissions.data??[];
   const reservations=all.map((a:any)=>a.reservation_id);
   const jobs=all.map((a:any)=>a.job_id);
   const [bills,jobRows]=await Promise.all([
     reservations.length
       ?db.from("ai_budgeted_run_reservations")
         .select("id,tenant_id,product_key,status,reserved_minor,actual_minor,currency,provider_receipt_ref")
         .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
         .in("id",reservations)
       :Promise.resolve({data:[],error:null}),
     jobs.length
       ?db.from("intelligence_jobs")
         .select("id,tenant_id,product_key,locked_at,status")
         .eq("tenant_id",data.tenantId).eq("product_key",data.productKey)
         .in("id",jobs)
       :Promise.resolve({data:[],error:null}),
   ]);
   if(bills.error||jobRows.error)throw new Error((bills.error||jobRows.error).message);
   const billsById=new Map((bills.data??[]).map((x:any)=>[x.id,x]));
   const jobsById=new Map((jobRows.data??[]).map((x:any)=>[x.id,x]));
   const now=Date.now();
   const permitted=(permits.data??[]).map((w:any)=>({
     workerRef:String(w.worker_ref),modelKey:String(w.model_key),
     status:w.status as WorkforceWorkerPermit["status"],
     maxClaims:Number(w.max_claims),usedClaims:Number(w.used_claims),
     expiresAt:String(w.expires_at),operatorReference:String(w.operator_reference),
   }));
   const isPermitActive=(w:WorkforceWorkerPermit)=>
     w.status==="active"&&Date.parse(w.expiresAt)>now;
   const issues:WorkforceOperationalIssue[]=all.flatMap((a:any)=>{
     const bill=billsById.get(a.reservation_id);
     const job=jobsById.get(a.job_id);
     const lockedAt=typeof job?.locked_at==="string"?job.locked_at:null;
     const stale=a.status==="processing"&&lockedAt!==null&&
       Number.isFinite(Date.parse(lockedAt))&&now-Date.parse(lockedAt)>=15*60_000;
     if(!stale&&!["waiting_review","reconciliation_required"].includes(a.status))return [];
     const reason:WorkforceOperationalIssue["reason"]=
       a.status==="reconciliation_required"?"uncertain_provider_charge":
       stale?"stale_worker":"awaiting_human_review";
     return [{
       admissionId:a.id,runId:a.run_id,employeeId:a.employee_id,
       status:a.status,reason,
       reservedMinor:typeof bill?.reserved_minor==="number"?bill.reserved_minor:null,
       actualMinor:typeof bill?.actual_minor==="number"?bill.actual_minor:null,
       currency:typeof bill?.currency==="string"?bill.currency:null,
       providerReceiptRef:typeof bill?.provider_receipt_ref==="string"?bill.provider_receipt_ref:null,
       admittedAt:a.admitted_at,lockedAt,
     }];
   });
   const uncertain=issues.filter(x=>x.reason==="uncertain_provider_charge");
   const totals={
     activePermits:permitted.filter(isPermitActive).length,
     claimSlotsRemaining:permitted.filter(isPermitActive).reduce((n,w)=>n+Math.max(0,w.maxClaims-w.usedClaims),0),
     uncertainCharges:uncertain.length,
     staleWorkers:issues.filter(x=>x.reason==="stale_worker").length,
     waitingReview:issues.filter(x=>x.reason==="awaiting_human_review").length,
     reservedMinorOutstanding:uncertain.reduce((n,x)=>n+(x.reservedMinor??0),0),
   };
   return {
    pilotActive:pilot.data?.enabled===true&&Date.parse(pilot.data.expires_at)>now,
    pilotExpiresAt:pilot.data?.expires_at??null,workerPermits:permitted,
    issues,totals,
    events:(events.data??[]).map((event:any)=>({
      id:event.id,eventKey:String(event.event_key),
      workerRef:event.worker_ref??null,admissionId:event.admission_id??null,
      operatorReference:event.operator_reference??null,
      createdAt:event.created_at,
    })),
   };
 });
