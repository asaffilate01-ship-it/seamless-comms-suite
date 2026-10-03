import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requireAdminRole,requireService,requireTenantMembership,requireWriteRole} from "@/modules/platform/access";

const uuid=z.string().uuid(),product=z.string().min(2).max(80);
const scope=z.object({tenantId:uuid,productKey:product});

export const getChildcareWorkspace=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.infer<typeof scope>)=>scope.parse(i)).handler(async({context,data})=>{
 await requireTenantMembership(context,data.tenantId);const db=context.supabase as any;
 const rs=await Promise.all([
  db.from("childcare_parent_profiles").select("*,person:crm_people(*)").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(200),
  db.from("childcare_children").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("created_at",{ascending:false}).limit(300),
  db.from("childcare_provider_profiles").select("*,person:crm_people(*)").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(300),
  db.from("childcare_provider_availability").select("*").eq("tenant_id",data.tenantId).order("starts_at").limit(500),
  db.from("childcare_matches").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("updated_at",{ascending:false}).limit(300),
  db.from("childcare_compliance_records").select("*").eq("tenant_id",data.tenantId).eq("product_key",data.productKey).order("checked_at",{ascending:false}).limit(500)
 ]);
 for(const r of rs)if(r.error)throw new Error(r.error.message);
 return{parents:rs[0].data??[],children:rs[1].data??[],providers:rs[2].data??[],availability:rs[3].data??[],matches:rs[4].data??[],compliance:rs[5].data??[]};
});

const parent=scope.extend({personId:uuid,householdRef:z.string().max(120).nullish(),requirements:z.record(z.string(),z.unknown()).default({})});
export const saveChildcareParent=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof parent>)=>parent.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.childcare");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("childcare_parent_profiles").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  person_id:data.personId,household_ref:data.householdRef??null,requirements:data.requirements,status:"active",updated_at:new Date().toISOString()},
 {onConflict:"tenant_id,product_key,person_id"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const child=scope.extend({parentProfileId:uuid,childRef:z.string().min(1).max(120),dateOfBirth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 careNeeds:z.record(z.string(),z.unknown()).default({})});
export const saveChildcareChild=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof child>)=>child.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.childcare");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("childcare_children").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  parent_profile_id:data.parentProfileId,child_ref:data.childRef,date_of_birth:data.dateOfBirth??null,care_needs:data.careNeeds,status:"active"},
 {onConflict:"tenant_id,product_key,child_ref"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const provider=scope.extend({personId:uuid,providerRef:z.string().min(1).max(120),providerType:z.string().min(1).max(80).default("childminder"),
 regulatorRef:z.string().max(160).nullish(),serviceArea:z.record(z.string(),z.unknown()).default({}),capacity:z.number().int().min(0).nullish(),
 ageRanges:z.array(z.unknown()).max(100).default([]),services:z.array(z.unknown()).max(100).default([])});
export const saveChildcareProvider=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof provider>)=>provider.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.childcare");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("childcare_provider_profiles").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  person_id:data.personId,provider_ref:data.providerRef,provider_type:data.providerType,regulator_ref:data.regulatorRef??null,
  service_area:data.serviceArea,capacity:data.capacity??null,age_ranges:data.ageRanges,services:data.services,status:"onboarding",updated_at:new Date().toISOString()},
 {onConflict:"tenant_id,product_key,provider_ref"}).select("*").single();if(error)throw new Error(error.message);return row;
});

const availability=scope.extend({providerId:uuid,startsAt:z.string().datetime(),endsAt:z.string().datetime(),
 availablePlaces:z.number().int().min(0).default(1),recurrence:z.record(z.string(),z.unknown()).default({})});
export const setChildcareAvailability=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof availability>)=>availability.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.childcare");requireWriteRole(a.role);
 if(Date.parse(data.endsAt)<=Date.parse(data.startsAt))throw new Error("Availability end must be after start");
 const {data:row,error}=await(context.supabase as any).from("childcare_provider_availability").insert({tenant_id:data.tenantId,
  provider_id:data.providerId,starts_at:data.startsAt,ends_at:data.endsAt,available_places:data.availablePlaces,recurrence:data.recurrence,status:"available"})
  .select("*").single();if(error)throw new Error(error.message);return row;
});

const match=scope.extend({childId:uuid,providerId:uuid,score:z.number().min(0).max(100).nullish(),reasons:z.array(z.unknown()).max(100).default([])});
export const createChildcareMatch=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof match>)=>match.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.childcare");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("childcare_matches").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  child_id:data.childId,provider_id:data.providerId,score:data.score??null,reasons:data.reasons,status:"suggested",updated_at:new Date().toISOString()},
 {onConflict:"child_id,provider_id"}).select("*").single();if(error)throw new Error(error.message);return row;
});

export const updateChildcareMatch=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:{tenantId:string;matchId:string;status:"contacted"|"visit"|"offered"|"accepted"|"declined"|"expired"})=>
 z.object({tenantId:uuid,matchId:uuid,status:z.enum(["contacted","visit","offered","accepted","declined","expired"])}).parse(i))
.handler(async({context,data})=>{const a=await requireService(context,data.tenantId,"omniqora.childcare");requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("childcare_matches").update({status:data.status,updated_at:new Date().toISOString()})
  .eq("tenant_id",data.tenantId).eq("id",data.matchId).select("*").single();if(error)throw new Error(error.message);return row;});

const compliance=scope.extend({providerId:uuid,requirementKey:z.string().regex(/^[a-z0-9.-]{2,120}$/),title:z.string().min(1).max(200),
 status:z.enum(["missing","requested","received","verified","expired","rejected","not_required"]),evidenceDocumentId:uuid.nullish(),
 issuedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),expiresAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
 metadata:z.record(z.string(),z.unknown()).default({})});
export const saveChildcareCompliance=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof compliance>)=>compliance.parse(i)).handler(async({context,data})=>{
 const a=await requireService(context,data.tenantId,"omniqora.childcare");if(["verified","rejected","not_required"].includes(data.status))requireAdminRole(a.role);else requireWriteRole(a.role);
 const {data:row,error}=await(context.supabase as any).from("childcare_compliance_records").upsert({tenant_id:data.tenantId,product_key:data.productKey,
  provider_id:data.providerId,requirement_key:data.requirementKey,title:data.title,status:data.status,evidence_document_id:data.evidenceDocumentId??null,
  issued_at:data.issuedAt??null,expires_at:data.expiresAt??null,checked_by:["verified","rejected","not_required"].includes(data.status)?context.userId:null,
  checked_at:["verified","rejected","not_required"].includes(data.status)?new Date().toISOString():null,metadata:data.metadata},
 {onConflict:"provider_id,requirement_key"}).select("*").single();if(error)throw new Error(error.message);return row;
});
