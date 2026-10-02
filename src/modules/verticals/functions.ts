import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid=z.string().uuid();

export const getVerticalPackages=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;productKey?:string})=>z.object({tenantId:uuid,productKey:z.string().max(80).optional()}).parse(i))
.handler(async({context,data})=>{
 const db=context.supabase as any;
 const [catalogue,enabled,practice,payroll,companies,compliance]=await Promise.all([
  db.from("vertical_package_catalogue").select("*").neq("status","retired").order("family").order("name"),
  db.from("tenant_vertical_packages").select("*").eq("tenant_id",data.tenantId),
  db.from("practice_jobs").select("*").eq("tenant_id",data.tenantId).order("due_at",{ascending:true}).limit(100),
  db.from("payroll_runs").select("*").eq("tenant_id",data.tenantId).order("pay_date",{ascending:false}).limit(100),
  db.from("company_secretarial_entities").select("*,obligations:company_secretarial_obligations(*)").eq("tenant_id",data.tenantId).order("legal_name"),
  db.from("tenant_compliance_pack_status").select("*,pack:compliance_pack_definitions(*)").eq("tenant_id",data.tenantId)
 ]);
 for(const r of[catalogue,enabled,practice,payroll,companies,compliance])if(r.error)throw new Error(r.error.message);
 return{catalogue:catalogue.data??[],enabled:enabled.data??[],practice:practice.data??[],payroll:payroll.data??[],companies:companies.data??[],compliance:compliance.data??[]};
});

const enable=z.object({tenantId:uuid,productKey:z.string().min(2).max(80),packageKey:z.string().min(3).max(100)});
export const enableVerticalPackage=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof enable>)=>enable.parse(i)).handler(async({context,data})=>{
 const r=await(context.supabase as any).rpc("vertical_enable_package",{_tenant:data.tenantId,_product:data.productKey,_package:data.packageKey,_config:{}});
 if(r.error)throw new Error(r.error.message);return{ok:true};
});

const payroll=z.object({tenantId:uuid,productKey:z.string().min(2).max(80),employerRef:z.string().min(1).max(200),periodKey:z.string().min(1).max(100),payDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
export const createPayrollRun=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof payroll>)=>payroll.parse(i)).handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("payroll_runs").insert({tenant_id:data.tenantId,product_key:data.productKey,employer_ref:data.employerRef,period_key:data.periodKey,pay_date:data.payDate,status:"draft"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});

const company=z.object({tenantId:uuid,productKey:z.string().min(2).max(80),legalName:z.string().min(1).max(240),jurisdiction:z.string().min(2).max(40),companyNumber:z.string().max(80).nullish()});
export const createSecretarialEntity=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof company>)=>company.parse(i)).handler(async({context,data})=>{
 const{data:row,error}=await(context.supabase as any).from("company_secretarial_entities").insert({tenant_id:data.tenantId,product_key:data.productKey,jurisdiction:data.jurisdiction,company_number:data.companyNumber??null,legal_name:data.legalName,status:"active"}).select("*").single();
 if(error)throw new Error(error.message);return row;
});
