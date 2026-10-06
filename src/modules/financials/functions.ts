import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireAdminTenantRole } from "@/modules/platform/module-access";

const period=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),
 start:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),end:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 locationId:z.string().uuid().optional().nullable()
});

export const getFinancialOverview=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof period>)=>period.parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"financials.core"});
 const db=context.supabase as any;
 const{data:tp}=await db.from("tenant_products").select("product_key").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
 if(!tp)throw new Error("Tenant product not found");

 let aq=db.from("financial_actuals").select("kind,category,amount_minor,currency,period_start,period_end,location_id")
  .eq("tenant_id",data.tenantId).eq("product_key",tp.product_key)
  .gte("period_start",data.start).lte("period_end",data.end).limit(20000);
 let bq=db.from("financial_budgets").select("category,amount_minor,currency,period_start,period_end,location_id")
  .eq("tenant_id",data.tenantId).gte("period_start",data.start).lte("period_end",data.end).limit(5000);
 let fq=db.from("financial_forecasts").select("category,amount_minor,currency,basis,period_start,period_end,location_id")
  .eq("tenant_id",data.tenantId).gte("period_start",data.start).lte("period_end",data.end).limit(5000);
 if(data.locationId){aq=aq.eq("location_id",data.locationId);bq=bq.eq("location_id",data.locationId);fq=fq.eq("location_id",data.locationId);}
 const[actuals,budgets,forecasts]=await Promise.all([aq,bq,fq]);
 for(const result of[actuals,budgets,forecasts])if(result.error)throw new Error(result.error.message);

 const byCurrency:Record<string,{revenueMinor:number;costMinor:number;refundMinor:number;discountMinor:number;feeMinor:number;payoutMinor:number;taxMinor:number;otherMinor:number;budgetMinor:number;forecastMinor:number}>= {};
 function bucket(currency:string){
  return byCurrency[currency]??=( {revenueMinor:0,costMinor:0,refundMinor:0,discountMinor:0,feeMinor:0,payoutMinor:0,taxMinor:0,otherMinor:0,budgetMinor:0,forecastMinor:0} );
 }
 for(const row of actuals.data??[]){
  const b=bucket(String(row.currency));const amount=Number(row.amount_minor??0);
  const key=String(row.kind);
  if(key==="revenue")b.revenueMinor+=amount;
  else if(key==="cost")b.costMinor+=amount;
  else if(key==="refund")b.refundMinor+=amount;
  else if(key==="discount")b.discountMinor+=amount;
  else if(key==="fee")b.feeMinor+=amount;
  else if(key==="payout")b.payoutMinor+=amount;
  else if(key==="tax")b.taxMinor+=amount;
  else b.otherMinor+=amount;
 }
 for(const row of budgets.data??[])bucket(String(row.currency)).budgetMinor+=Number(row.amount_minor??0);
 for(const row of forecasts.data??[])bucket(String(row.currency)).forecastMinor+=Number(row.amount_minor??0);

 const currencies=Object.entries(byCurrency).map(([currency,b])=>({
  currency,...b,
  netRevenueMinor:b.revenueMinor-b.refundMinor-b.discountMinor,
  contributionBeforeTaxMinor:b.revenueMinor-b.refundMinor-b.discountMinor-b.costMinor-b.feeMinor,
  budgetVarianceMinor:(b.revenueMinor-b.refundMinor-b.discountMinor)-b.budgetMinor,
  forecastVarianceMinor:(b.revenueMinor-b.refundMinor-b.discountMinor)-b.forecastMinor,
 }));
 return{period:{start:data.start,end:data.end},productKey:tp.product_key,locationId:data.locationId??null,currencies};
});

const budget=z.object({
 tenantId:z.string().uuid(),tenantProductId:z.string().uuid(),locationId:z.string().uuid().optional().nullable(),
 start:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),end:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 category:z.string().min(1).max(160),amountMinor:z.number().int(),currency:z.string().regex(/^[A-Z]{3}$/)
});
export const createFinancialBudget=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof budget>)=>budget.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"financials.core"});
 requireAdminTenantRole(access.role);const db=context.supabase as any;
 const{data:tp}=await db.from("tenant_products").select("product_key").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
 if(!tp)throw new Error("Tenant product not found");
 const{data:row,error}=await db.from("financial_budgets").insert({
  tenant_id:data.tenantId,product_key:tp.product_key,location_id:data.locationId??null,
  period_start:data.start,period_end:data.end,category:data.category,amount_minor:data.amountMinor,
  currency:data.currency,owner_user_id:context.userId,revision:1
 }).select("*").single();
 if(error||!row)throw new Error(error?.message??"Budget could not be created");return row;
});

const forecast=budget.extend({
 basis:z.enum(["manual","run_rate","model","scenario"]),assumptions:z.array(z.string().max(1000)).max(100).default([]),
 modelRunId:z.string().max(200).optional().nullable()
});
export const createFinancialForecast=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof forecast>)=>forecast.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"financials.core"});
 requireAdminTenantRole(access.role);const db=context.supabase as any;
 const{data:tp}=await db.from("tenant_products").select("product_key").eq("id",data.tenantProductId).eq("tenant_id",data.tenantId).maybeSingle();
 if(!tp)throw new Error("Tenant product not found");
 const{data:row,error}=await db.from("financial_forecasts").insert({
  tenant_id:data.tenantId,product_key:tp.product_key,location_id:data.locationId??null,
  period_start:data.start,period_end:data.end,category:data.category,amount_minor:data.amountMinor,
  currency:data.currency,basis:data.basis,assumptions:data.assumptions,model_run_id:data.modelRunId??null,revision:1
 }).select("*").single();
 if(error||!row)throw new Error(error?.message??"Forecast could not be created");return row;
});

export const listFinancialBenefits=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;tenantProductId:string})=>z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{...data,moduleKey:"financials.core"});
 const db=context.supabase as any;const{data:rows,error}=await db.from("financial_benefits").select("*")
  .eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(1000);
 if(error)throw new Error(error.message);return rows??[];
});
