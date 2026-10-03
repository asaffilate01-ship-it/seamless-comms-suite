import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";
const uuid=z.string().uuid(),product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product.nullish()});

export const getStrategicAnalytics=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const productFilter=(q:any)=>data.productKey?q.eq("product_key",data.productKey):q;
 const metrics=productFilter(db.from("analytics_metric_points").select("*").eq("tenant_id",data.tenantId)).order("period_start",{ascending:false}).limit(500);
 const budgets=productFilter(db.from("financial_budgets").select("*").eq("tenant_id",data.tenantId)).order("period_end",{ascending:false}).limit(100);
 const forecasts=productFilter(db.from("financial_forecasts").select("*").eq("tenant_id",data.tenantId)).order("period_end",{ascending:false}).limit(100);
 const actuals=productFilter(db.from("financial_actuals").select("*").eq("tenant_id",data.tenantId)).order("period_end",{ascending:false}).limit(500);
 const benefits=productFilter(db.from("financial_benefits").select("*").eq("tenant_id",data.tenantId)).order("period_end",{ascending:false}).limit(200);
 const [m,b,f,a,be]=await Promise.all([metrics,budgets,forecasts,actuals,benefits]);for(const r of[m,b,f,a,be])if(r.error)throw new Error(r.error.message);
 return{metrics:m.data??[],budgets:b.data??[],forecasts:f.data??[],actuals:a.data??[],benefits:be.data??[]};
});

const metric=z.object({tenantId:uuid,productKey:product.nullish(),metricKey:z.string().min(1).max(160),dimensionKey:z.string().max(120).nullish(),
 dimensionValue:z.string().max(240).nullish(),periodStart:z.string().datetime(),periodEnd:z.string().datetime(),value:z.number(),
 unit:z.string().min(1).max(40).default("count"),source:z.string().min(1).max(80).default("system"),metadata:z.record(z.string(),z.unknown()).default({})});
export const recordMetricPoint=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof metric>)=>metric.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.analytics");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("analytics_metric_points").insert({tenant_id:data.tenantId,product_key:data.productKey??null,
  metric_key:data.metricKey,dimension_key:data.dimensionKey??null,dimension_value:data.dimensionValue??null,period_start:data.periodStart,period_end:data.periodEnd,
  value:data.value,unit:data.unit,source:data.source,metadata:data.metadata}).select("*").single();if(error)throw new Error(error.message);return row;
});

const budget=z.object({tenantId:uuid,productKey:product.nullish(),name:z.string().min(1).max(200),periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),currency:z.string().regex(/^[A-Z]{3}$/),lines:z.array(z.unknown()).max(1000).default([])});
export const createFinancialBudget=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof budget>)=>budget.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.analytics");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("financial_budgets").insert({tenant_id:data.tenantId,product_key:data.productKey??null,name:data.name,
  period_start:data.periodStart,period_end:data.periodEnd,currency:data.currency,lines:data.lines,status:"draft"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const approveFinancialBudget=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;budgetId:string})=>z.object({tenantId:uuid,budgetId:uuid}).parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.analytics");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("financial_budgets").update({status:"approved",approved_by:context.userId,approved_at:new Date().toISOString(),
  updated_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",data.budgetId).select("*").single();if(error)throw new Error(error.message);return row;
});

const actual=z.object({tenantId:uuid,productKey:product.nullish(),periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),category:z.string().min(1).max(160),amountMinor:z.number().int(),
 currency:z.string().regex(/^[A-Z]{3}$/),sourceRef:z.string().max(500).nullish(),evidenceRef:z.string().max(500).nullish()});
export const recordFinancialActual=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof actual>)=>actual.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.analytics");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("financial_actuals").insert({tenant_id:data.tenantId,product_key:data.productKey??null,
  period_start:data.periodStart,period_end:data.periodEnd,category:data.category,amount_minor:data.amountMinor,currency:data.currency,
  source_ref:data.sourceRef??null,evidence_ref:data.evidenceRef??null}).select("*").single();if(error)throw new Error(error.message);return row;
});

const benefit=z.object({tenantId:uuid,productKey:product.nullish(),benefitKey:z.string().regex(/^[a-z0-9.-]{3,120}$/),title:z.string().min(1).max(240),
 baselineMinor:z.number().int(),actualMinor:z.number().int(),currency:z.string().regex(/^[A-Z]{3}$/),
 periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 methodology:z.string().min(10).max(5000),evidenceRefs:z.array(z.string().max(500)).max(100).default([])});
export const recordFinancialBenefit=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof benefit>)=>benefit.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.analytics");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("financial_benefits").upsert({tenant_id:data.tenantId,product_key:data.productKey??null,
  benefit_key:data.benefitKey,title:data.title,baseline_minor:data.baselineMinor,actual_minor:data.actualMinor,currency:data.currency,
  period_start:data.periodStart,period_end:data.periodEnd,methodology:data.methodology,evidence_refs:data.evidenceRefs,status:"review"},
  {onConflict:"tenant_id,benefit_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const reviewFinancialBenefit=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;benefitId:string;decision:"accepted"|"rejected"})=>z.object({tenantId:uuid,benefitId:uuid,
 decision:z.enum(["accepted","rejected"])}).parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.analytics");requireAdminRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("financial_benefits").update({status:data.decision,reviewed_by:context.userId,
  reviewed_at:new Date().toISOString()}).eq("tenant_id",data.tenantId).eq("id",data.benefitId).select("*").single();if(error)throw new Error(error.message);return row;
});
