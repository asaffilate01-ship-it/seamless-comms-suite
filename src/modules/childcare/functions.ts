import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireModuleEntitlement,
  requireWritableTenantRole,
  requireAdminTenantRole,
} from "@/modules/platform/module-access";

const scope=z.object({
  tenantId:z.string().uuid(),
  tenantProductId:z.string().uuid(),
});

async function staffScope(context:any,data:z.infer<typeof scope>,adminOnly=false){
  const access=await requireModuleEntitlement(context,{
    ...data,moduleKey:"childcare.core"
  });
  if(adminOnly)requireAdminTenantRole(access.role);
  else requireWritableTenantRole(access.role);
  return access;
}

async function portalEntitlement(admin:any,input:z.infer<typeof scope>){
  const now=Date.now();
  const[{data:tp},{data:grant}]=await Promise.all([
    admin.from("tenant_products").select("id,status,product_key,region_key")
      .eq("id",input.tenantProductId).eq("tenant_id",input.tenantId).maybeSingle(),
    admin.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
      .eq("module_key","childcare.core").eq("enabled",true).maybeSingle()
  ]);
  if(!tp||tp.status!=="active")throw new Error("Active childcare product required");
  if(!grant||!grant.enabled
    ||(grant.starts_at&&Date.parse(grant.starts_at)>now)
    ||(grant.ends_at&&Date.parse(grant.ends_at)<=now)){
    throw new Error("Childcare entitlement required");
  }
  return tp;
}

async function parentScope(context:any,data:z.infer<typeof scope>){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as any;
  const tp=await portalEntitlement(admin,data);
  const{data:portal}=await admin.from("customer_portal_users")
    .select("id,crm_person_id,role,status")
    .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("user_id",context.userId).eq("status","active").maybeSingle();
  if(!portal)throw new Error("Parent/customer portal access required");
  const{data:person}=await admin.from("crm_people")
    .select("id,display_name,email,phone_e164")
    .eq("id",portal.crm_person_id).eq("tenant_id",data.tenantId).maybeSingle();
  if(!person)throw new Error("CRM guardian record not found");
  return{admin,tp,portal,person};
}

async function providerScope(context:any,data:z.infer<typeof scope>&{vendorId:string},write=false){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as any;
  const tp=await portalEntitlement(admin,data);
  const{data:membership}=await admin.from("marketplace_vendor_users")
    .select("role,status").eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId)
    .eq("user_id",context.userId).eq("status","active").maybeSingle();
  if(!membership)throw new Error("Provider portal access required");
  if(write&&membership.role==="vendor_viewer")throw new Error("Provider write access required");
  const{data:vendor}=await admin.from("marketplace_vendors").select("*")
    .eq("id",data.vendorId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!vendor)throw new Error("Marketplace provider not found");
  return{admin,tp,vendor,role:String(membership.role)};
}

const childSchema=scope.extend({
  id:z.string().uuid().optional(),
  externalRef:z.string().max(200).optional().nullable(),
  firstName:z.string().trim().min(1).max(120),
  lastName:z.string().trim().max(120).optional().nullable(),
  dateOfBirth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status:z.enum(["active","inactive","archived"]).default("active"),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveChildcareChild=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof childSchema>)=>childSchema.parse(input))
.handler(async({context,data})=>{
  await staffScope(context,data);
  const db=context.supabase as any;
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,
    external_ref:data.externalRef??null,first_name:data.firstName,
    last_name:data.lastName??null,date_of_birth:data.dateOfBirth,status:data.status,
    metadata:data.metadata,created_by:context.userId
  };
  const q=data.id
    ?db.from("childcare_children").update(values).eq("id",data.id)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    :db.from("childcare_children").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Child record could not be saved");
  return row;
});

const guardianSchema=scope.extend({
  childId:z.string().uuid(),crmPersonId:z.string().uuid(),
  relationship:z.string().trim().min(1).max(80),
  isPrimary:z.boolean().default(false),
  canBook:z.boolean().default(true),
  canViewFunding:z.boolean().default(true),
  canManageChild:z.boolean().default(true),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const linkChildcareGuardian=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof guardianSchema>)=>guardianSchema.parse(input))
.handler(async({context,data})=>{
  await staffScope(context,data);
  const db=context.supabase as any;
  const[{data:child},{data:person}]=await Promise.all([
    db.from("childcare_children").select("id").eq("id",data.childId)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle(),
    db.from("crm_people").select("id").eq("id",data.crmPersonId)
      .eq("tenant_id",data.tenantId).maybeSingle()
  ]);
  if(!child||!person)throw new Error("Child or guardian CRM record not found");
  if(data.isPrimary){
    await db.from("childcare_guardian_links").update({is_primary:false})
      .eq("tenant_id",data.tenantId).eq("child_id",data.childId);
  }
  const{data:row,error}=await db.from("childcare_guardian_links").upsert({
    tenant_id:data.tenantId,child_id:data.childId,crm_person_id:data.crmPersonId,
    relationship:data.relationship,is_primary:data.isPrimary,can_book:data.canBook,
    can_view_funding:data.canViewFunding,can_manage_child:data.canManageChild,
    metadata:data.metadata
  },{onConflict:"child_id,crm_person_id"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Guardian link could not be saved");
  return row;
});

const providerProfileSchema=scope.extend({
  vendorId:z.string().uuid(),
  providerType:z.enum(["childminder","nursery","care_agency","other"]).default("childminder"),
  regulatorRef:z.string().max(200).optional().nullable(),
  registrationRef:z.string().max(200).optional().nullable(),
  serviceAgeGroups:z.array(z.string().max(100)).max(50).default([]),
  maxChildren:z.number().int().positive().max(1000).optional().nullable(),
  languages:z.array(z.string().max(40)).max(50).default([]),
  status:z.enum(["draft","onboarding","review","active","suspended","closed"]).default("draft"),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveChildcareProviderProfile=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof providerProfileSchema>)=>providerProfileSchema.parse(input))
.handler(async({context,data})=>{
  await staffScope(context,data);
  const db=context.supabase as any;
  const{data:vendor}=await db.from("marketplace_vendors").select("id,country_code,currency")
    .eq("id",data.vendorId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!vendor)throw new Error("Marketplace provider not found");
  const{data:row,error}=await db.from("childcare_provider_profiles").upsert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,vendor_id:data.vendorId,
    provider_type:data.providerType,regulator_ref:data.regulatorRef??null,
    registration_ref:data.registrationRef??null,service_age_groups:data.serviceAgeGroups,
    max_children:data.maxChildren??null,languages:data.languages,status:data.status,
    metadata:data.metadata
  },{onConflict:"tenant_product_id,vendor_id"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Childcare provider profile could not be saved");
  return row;
});

const placementSchema=scope.extend({
  id:z.string().uuid().optional(),
  childId:z.string().uuid(),vendorId:z.string().uuid(),
  listingId:z.string().uuid().optional().nullable(),
  bookingId:z.string().uuid().optional().nullable(),
  startsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fundedHoursPerWeek:z.number().nonnegative().max(168).optional().nullable(),
  privateHoursPerWeek:z.number().nonnegative().max(168).optional().nullable(),
  status:z.enum(["proposed","active","paused","ended","cancelled"]).default("proposed"),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveChildcarePlacement=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof placementSchema>)=>placementSchema.parse(input))
.handler(async({context,data})=>{
  await staffScope(context,data);
  if(data.endsOn&&data.endsOn<data.startsOn)throw new Error("Placement end cannot precede start");
  const db=context.supabase as any;
  const[{data:child},{data:vendor}]=await Promise.all([
    db.from("childcare_children").select("id").eq("id",data.childId)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId).maybeSingle(),
    db.from("marketplace_vendors").select("id").eq("id",data.vendorId)
      .eq("tenant_id",data.tenantId).maybeSingle()
  ]);
  if(!child||!vendor)throw new Error("Child or provider not found");
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,
    child_id:data.childId,vendor_id:data.vendorId,listing_id:data.listingId??null,
    booking_id:data.bookingId??null,starts_on:data.startsOn,ends_on:data.endsOn??null,
    funded_hours_per_week:data.fundedHoursPerWeek??null,
    private_hours_per_week:data.privateHoursPerWeek??null,status:data.status,
    metadata:data.metadata,created_by:context.userId
  };
  const q=data.id
    ?db.from("childcare_placements").update(values).eq("id",data.id)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    :db.from("childcare_placements").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Childcare placement could not be saved");
  return row;
});

const fundingCaseSchema=scope.extend({
  id:z.string().uuid().optional(),
  childId:z.string().uuid(),guardianCrmPersonId:z.string().uuid(),
  fundingType:z.string().trim().min(1).max(160),
  authority:z.string().max(240).optional().nullable(),
  eligibilityRef:z.string().max(240).optional().nullable(),
  approvedHoursPerWeek:z.number().nonnegative().max(168).optional().nullable(),
  hourlyRateMinor:z.number().int().nonnegative().optional().nullable(),
  currency:z.string().regex(/^[A-Z]{3}$/),
  startsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status:z.enum(["draft","checking","eligible","ineligible","approved","active","closed"]).default("draft"),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveChildcareFundingCase=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof fundingCaseSchema>)=>fundingCaseSchema.parse(input))
.handler(async({context,data})=>{
  await staffScope(context,data);
  if(data.startsOn&&data.endsOn&&data.endsOn<data.startsOn)throw new Error("Funding end cannot precede start");
  const db=context.supabase as any;
  const{data:guardian}=await db.from("childcare_guardian_links").select("id")
    .eq("tenant_id",data.tenantId).eq("child_id",data.childId)
    .eq("crm_person_id",data.guardianCrmPersonId).maybeSingle();
  if(!guardian)throw new Error("Funding guardian must be linked to the child");
  const values={
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,child_id:data.childId,
    guardian_crm_person_id:data.guardianCrmPersonId,funding_type:data.fundingType,
    authority:data.authority??null,eligibility_ref:data.eligibilityRef??null,
    approved_hours_per_week:data.approvedHoursPerWeek??null,
    hourly_rate_minor:data.hourlyRateMinor??null,currency:data.currency,
    starts_on:data.startsOn??null,ends_on:data.endsOn??null,status:data.status,
    metadata:data.metadata
  };
  const q=data.id
    ?db.from("childcare_funding_cases").update(values).eq("id",data.id)
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    :db.from("childcare_funding_cases").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Funding case could not be saved");
  return row;
});

const fundingClaimSchema=scope.extend({
  id:z.string().uuid().optional(),fundingCaseId:z.string().uuid(),
  periodStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  claimedMinutes:z.number().int().nonnegative(),
  claimedMinor:z.number().int().nonnegative(),paidMinor:z.number().int().nonnegative().default(0),
  currency:z.string().regex(/^[A-Z]{3}$/),
  status:z.enum(["draft","submitted","accepted","part_paid","paid","rejected","cancelled"]).default("draft"),
  externalRef:z.string().max(240).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveChildcareFundingClaim=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof fundingClaimSchema>)=>fundingClaimSchema.parse(input))
.handler(async({context,data})=>{
  await staffScope(context,data);
  if(data.periodEnd<data.periodStart)throw new Error("Claim end cannot precede start");
  if(data.paidMinor>data.claimedMinor)throw new Error("Paid amount cannot exceed claimed amount");
  const db=context.supabase as any;
  const{data:funding}=await db.from("childcare_funding_cases").select("id,currency")
    .eq("id",data.fundingCaseId).eq("tenant_id",data.tenantId)
    .eq("tenant_product_id",data.tenantProductId).maybeSingle();
  if(!funding)throw new Error("Funding case not found");
  if(funding.currency!==data.currency)throw new Error("Claim currency must match funding case");
  const values={
    tenant_id:data.tenantId,funding_case_id:data.fundingCaseId,
    period_start:data.periodStart,period_end:data.periodEnd,
    claimed_minutes:data.claimedMinutes,claimed_minor:data.claimedMinor,
    paid_minor:data.paidMinor,currency:data.currency,status:data.status,
    external_ref:data.externalRef??null,metadata:data.metadata
  };
  const q=data.id
    ?db.from("childcare_funding_claims").update(values).eq("id",data.id)
      .eq("tenant_id",data.tenantId)
    :db.from("childcare_funding_claims").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Funding claim could not be saved");
  return row;
});

export const getChildcareOperationsWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  await requireModuleEntitlement(context,{...data,moduleKey:"childcare.core"});
  const db=context.supabase as any;
  const[children,guardians,providers,placements,fundingCases,claims,training]=await Promise.all([
    db.from("childcare_children").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).neq("status","archived").order("created_at",{ascending:false}).limit(2000),
    db.from("childcare_guardian_links").select("*").eq("tenant_id",data.tenantId).limit(5000),
    db.from("childcare_provider_profiles").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).order("updated_at",{ascending:false}).limit(2000),
    db.from("childcare_placements").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).order("starts_on",{ascending:false}).limit(5000),
    db.from("childcare_funding_cases").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).order("updated_at",{ascending:false}).limit(5000),
    db.from("childcare_funding_claims").select("*").eq("tenant_id",data.tenantId)
      .order("period_start",{ascending:false}).limit(5000),
    db.from("childcare_training_records").select("*").eq("tenant_id",data.tenantId)
      .order("updated_at",{ascending:false}).limit(5000)
  ]);
  for(const result of[children,guardians,providers,placements,fundingCases,claims,training]){
    if(result.error)throw new Error(result.error.message);
  }
  return{
    children:children.data??[],guardians:guardians.data??[],providers:providers.data??[],
    placements:placements.data??[],fundingCases:fundingCases.data??[],
    fundingClaims:claims.data??[],training:training.data??[]
  };
});

const myChildSchema=scope.extend({
  id:z.string().uuid().optional(),
  firstName:z.string().trim().min(1).max(120),
  lastName:z.string().trim().max(120).optional().nullable(),
  dateOfBirth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  relationship:z.string().trim().min(1).max(80).default("parent")
});
export const saveMyChildcareChild=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof myChildSchema>)=>myChildSchema.parse(input))
.handler(async({context,data})=>{
  const access=await parentScope(context,data);
  const admin=access.admin;
  if(data.id){
    const{data:allowed}=await admin.rpc("is_childcare_guardian",{
      _tenant:data.tenantId,_child:data.id,_user:context.userId,
      _require_manage:true,_require_funding:false
    });
    if(allowed!==true)throw new Error("Guardian cannot manage this child");
    const{data:row,error}=await admin.from("childcare_children").update({
      first_name:data.firstName,last_name:data.lastName??null,date_of_birth:data.dateOfBirth
    }).eq("id",data.id).eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).select("*").single();
    if(error||!row)throw new Error(error?.message??"Child record could not be updated");
    return row;
  }

  const{data:child,error}=await admin.from("childcare_children").insert({
    tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,
    first_name:data.firstName,last_name:data.lastName??null,date_of_birth:data.dateOfBirth,
    status:"active",created_by:context.userId,metadata:{createdVia:"customer_portal"}
  }).select("*").single();
  if(error||!child)throw new Error(error?.message??"Child record could not be created");
  const{error:linkError}=await admin.from("childcare_guardian_links").insert({
    tenant_id:data.tenantId,child_id:child.id,crm_person_id:access.person.id,
    relationship:data.relationship,is_primary:true,can_book:true,
    can_view_funding:true,can_manage_child:true,metadata:{createdVia:"customer_portal"}
  });
  if(linkError){
    await admin.from("childcare_children").delete().eq("id",child.id);
    throw new Error(linkError.message);
  }
  return child;
});

export const getMyChildcareFamily=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  const access=await parentScope(context,data);
  const admin=access.admin;
  const{data:links,error:linkError}=await admin.from("childcare_guardian_links")
    .select("*").eq("tenant_id",data.tenantId).eq("crm_person_id",access.person.id);
  if(linkError)throw new Error(linkError.message);
  const childIds=(links??[]).map((x:any)=>x.child_id);
  if(!childIds.length)return{
    guardian:access.person,children:[],guardianLinks:[],placements:[],
    attendance:[],fundingCases:[],fundingClaims:[]
  };
  const[children,placements,funding]=await Promise.all([
    admin.from("childcare_children").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).in("id",childIds).neq("status","archived"),
    admin.from("childcare_placements").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).in("child_id",childIds),
    admin.from("childcare_funding_cases").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).in("child_id",childIds)
      .eq("guardian_crm_person_id",access.person.id)
  ]);
  for(const result of[children,placements,funding])if(result.error)throw new Error(result.error.message);
  const placementIds=(placements.data??[]).map((p:any)=>p.id);
  const fundingIds=(funding.data??[]).map((x:any)=>x.id);
  const[attendance,claims]=await Promise.all([
    placementIds.length
      ?admin.from("childcare_attendance").select("*").eq("tenant_id",data.tenantId)
        .in("placement_id",placementIds).order("attendance_date",{ascending:false}).limit(3000)
      :{data:[],error:null},
    fundingIds.length
      ?admin.from("childcare_funding_claims").select("*").eq("tenant_id",data.tenantId)
        .in("funding_case_id",fundingIds).order("period_start",{ascending:false}).limit(3000)
      :{data:[],error:null}
  ]);
  if(attendance.error)throw new Error(attendance.error.message);
  if(claims.error)throw new Error(claims.error.message);
  return{
    guardian:access.person,children:children.data??[],guardianLinks:links??[],
    placements:placements.data??[],attendance:attendance.data??[],
    fundingCases:funding.data??[],fundingClaims:claims.data??[]
  };
});

const guardianAttendanceSchema=scope.extend({
  attendanceId:z.string().uuid()
});
export const confirmMyChildcareAttendance=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof guardianAttendanceSchema>)=>guardianAttendanceSchema.parse(input))
.handler(async({context,data})=>{
  const access=await parentScope(context,data);
  const admin=access.admin;
  const{data:attendance}=await admin.from("childcare_attendance")
    .select("id,placement_id").eq("id",data.attendanceId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!attendance)throw new Error("Attendance record not found");
  const{data:placement}=await admin.from("childcare_placements")
    .select("child_id,tenant_product_id").eq("id",attendance.placement_id)
    .eq("tenant_id",data.tenantId).maybeSingle();
  if(!placement||placement.tenant_product_id!==data.tenantProductId)throw new Error("Attendance record not in this product");
  const{data:allowed}=await admin.rpc("is_childcare_guardian",{
    _tenant:data.tenantId,_child:placement.child_id,_user:context.userId,
    _require_manage:false,_require_funding:false
  });
  if(allowed!==true)throw new Error("Guardian access required");
  const{data:row,error}=await admin.from("childcare_attendance").update({
    confirmed_by_guardian_at:new Date().toISOString()
  }).eq("id",attendance.id).select("*").single();
  if(error||!row)throw new Error(error?.message??"Attendance could not be confirmed");
  return row;
});

const providerDetailsSchema=scope.extend({
  vendorId:z.string().uuid(),
  serviceAgeGroups:z.array(z.string().max(100)).max(50).default([]),
  maxChildren:z.number().int().positive().max(1000).optional().nullable(),
  languages:z.array(z.string().max(40)).max(50).default([]),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const updateMyChildcareProviderDetails=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof providerDetailsSchema>)=>providerDetailsSchema.parse(input))
.handler(async({context,data})=>{
  const access=await providerScope(context,data,true);
  const{data:profile}=await access.admin.from("childcare_provider_profiles")
    .select("*").eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
    .eq("vendor_id",data.vendorId).maybeSingle();
  if(!profile)throw new Error("Childcare provider profile has not been created by the agency");
  const metadata={
    ...(profile.metadata&&typeof profile.metadata==="object"?profile.metadata:{}),
    providerDeclared:data.metadata
  };
  const{data:row,error}=await access.admin.from("childcare_provider_profiles").update({
    service_age_groups:data.serviceAgeGroups,max_children:data.maxChildren??null,
    languages:data.languages,metadata
  }).eq("id",profile.id).select("*").single();
  if(error||!row)throw new Error(error?.message??"Provider details could not be updated");
  return row;
});

export const getMyChildcareProviderWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>&{vendorId:string})=>scope.extend({
  vendorId:z.string().uuid()
}).parse(input))
.handler(async({context,data})=>{
  const access=await providerScope(context,data,false);
  const admin=access.admin;
  const[{data:profile,error:profileError},{data:placements,error:placementError},{data:training,error:trainingError}]=await Promise.all([
    admin.from("childcare_provider_profiles").select("*")
      .eq("tenant_id",data.tenantId).eq("tenant_product_id",data.tenantProductId)
      .eq("vendor_id",data.vendorId).maybeSingle(),
    admin.from("childcare_placements").select("*").eq("tenant_id",data.tenantId)
      .eq("tenant_product_id",data.tenantProductId).eq("vendor_id",data.vendorId)
      .order("starts_on",{ascending:false}).limit(2000),
    admin.from("childcare_training_records").select("*").eq("tenant_id",data.tenantId)
      .eq("vendor_id",data.vendorId).order("updated_at",{ascending:false}).limit(1000)
  ]);
  if(profileError)throw new Error(profileError.message);
  if(placementError)throw new Error(placementError.message);
  if(trainingError)throw new Error(trainingError.message);
  const placementIds=(placements??[]).map((p:any)=>p.id);
  const attendance=placementIds.length
    ?await admin.from("childcare_attendance").select("*").eq("tenant_id",data.tenantId)
      .in("placement_id",placementIds).order("attendance_date",{ascending:false}).limit(5000)
    :{data:[],error:null};
  if(attendance.error)throw new Error(attendance.error.message);
  return{
    vendor:access.vendor,role:access.role,profile:profile??null,
    placements:placements??[],attendance:attendance.data??[],training:training??[]
  };
});

const attendanceSchema=scope.extend({
  vendorId:z.string().uuid(),placementId:z.string().uuid(),
  attendanceDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkInAt:z.string().datetime().optional().nullable(),
  checkOutAt:z.string().datetime().optional().nullable(),
  attendedMinutes:z.number().int().nonnegative().max(24*60).optional().nullable(),
  absenceReason:z.string().max(500).optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const recordMyChildcareAttendance=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof attendanceSchema>)=>attendanceSchema.parse(input))
.handler(async({context,data})=>{
  const access=await providerScope(context,data,true);
  if(data.checkInAt&&data.checkOutAt&&Date.parse(data.checkOutAt)<Date.parse(data.checkInAt)){
    throw new Error("Check-out cannot precede check-in");
  }
  const admin=access.admin;
  const{data:placement}=await admin.from("childcare_placements").select("id,vendor_id,tenant_product_id")
    .eq("id",data.placementId).eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId).maybeSingle();
  if(!placement||placement.tenant_product_id!==data.tenantProductId)throw new Error("Provider placement not found");
  const{data:row,error}=await admin.from("childcare_attendance").upsert({
    tenant_id:data.tenantId,placement_id:data.placementId,attendance_date:data.attendanceDate,
    check_in_at:data.checkInAt??null,check_out_at:data.checkOutAt??null,
    attended_minutes:data.attendedMinutes??null,absence_reason:data.absenceReason??null,
    confirmed_by_provider_at:new Date().toISOString(),metadata:data.metadata
  },{onConflict:"placement_id,attendance_date"}).select("*").single();
  if(error||!row)throw new Error(error?.message??"Attendance could not be recorded");
  return row;
});

const trainingSchema=scope.extend({
  vendorId:z.string().uuid(),id:z.string().uuid().optional(),
  trainingKey:z.string().trim().min(1).max(160),title:z.string().trim().min(1).max(240),
  issuer:z.string().max(240).optional().nullable(),
  completedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expiresOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  documentId:z.string().uuid().optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveMyChildcareTraining=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof trainingSchema>)=>trainingSchema.parse(input))
.handler(async({context,data})=>{
  const access=await providerScope(context,data,true);
  if(data.completedOn&&data.expiresOn&&data.expiresOn<data.completedOn)throw new Error("Training expiry cannot precede completion");
  const status=data.documentId?"evidence_uploaded":"declared";
  const values={
    tenant_id:data.tenantId,vendor_id:data.vendorId,training_key:data.trainingKey,
    title:data.title,issuer:data.issuer??null,completed_on:data.completedOn??null,
    expires_on:data.expiresOn??null,document_id:data.documentId??null,status,
    metadata:data.metadata
  };
  const q=data.id
    ?access.admin.from("childcare_training_records").update(values)
      .eq("id",data.id).eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId)
    :access.admin.from("childcare_training_records").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Training record could not be saved");
  return row;
});

const verifyTrainingSchema=scope.extend({
  trainingId:z.string().uuid(),decision:z.enum(["verified","rejected"])
});
export const verifyChildcareTraining=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof verifyTrainingSchema>)=>verifyTrainingSchema.parse(input))
.handler(async({context,data})=>{
  await staffScope(context,data,true);
  const db=context.supabase as any;
  const{data:row,error}=await db.from("childcare_training_records").update({
    status:data.decision,
    metadata:{reviewedBy:context.userId,reviewedAt:new Date().toISOString()}
  }).eq("id",data.trainingId).eq("tenant_id",data.tenantId).select("*").single();
  if(error||!row)throw new Error(error?.message??"Training record could not be reviewed");
  return row;
});
