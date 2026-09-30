import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole, requireAdminTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});
async function marketScope(context:any,data:z.infer<typeof scope>,write=false){const access=await requireModuleEntitlement(context,{...data,moduleKey:"marketplace.core"});if(write)requireWritableTenantRole(access.role);return access;}

export const listMarketplaceVendors=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await marketScope(context,data);const db=context.supabase as any;const{data:rows,error}=await db.from("marketplace_vendors").select("*").eq("tenant_id",data.tenantId).order("name");if(error)throw new Error(error.message);return rows??[];});

const vendorSchema=scope.extend({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(240),status:z.enum(["draft","pending_review","active","suspended","closed"]).default("draft"),countryCode:z.string().length(2),currency:z.string().regex(/^[A-Z]{3}$/),commissionProfile:z.string().max(120).optional().nullable(),payoutProfile:z.string().max(120).optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})});
export const saveMarketplaceVendor=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof vendorSchema>)=>vendorSchema.parse(input)).handler(async({context,data})=>{await marketScope(context,data,true);const db=context.supabase as any;const values={tenant_id:data.tenantId,name:data.name,status:data.status,country_code:data.countryCode,currency:data.currency,commission_profile:data.commissionProfile??null,payout_profile:data.payoutProfile??null,metadata:data.metadata};const q=data.id?db.from("marketplace_vendors").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("marketplace_vendors").insert(values);const{data:row,error}=await q.select("*").single();if(error||!row)throw new Error(error?.message??"Vendor could not be saved");return row;});

export const listMarketplaceListings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await marketScope(context,data);const db=context.supabase as any;const{data:rows,error}=await db.from("marketplace_listings").select("*").eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(1000);if(error)throw new Error(error.message);return rows??[];});

const listingSchema=scope.extend({id:z.string().uuid().optional(),vendorId:z.string().uuid(),type:z.enum(["product","service","rental","consultation","auction"]),title:z.string().trim().min(1).max(240),description:z.string().max(10000).optional().nullable(),status:z.enum(["draft","pending_review","active","paused","archived"]).default("draft"),categoryKeys:z.array(z.string().max(120)).max(50).default([]),currency:z.string().regex(/^[A-Z]{3}$/),priceMinor:z.number().int().nonnegative().optional().nullable(),attributes:z.record(z.string(),z.unknown()).default({}),inventoryTracked:z.boolean().default(false),sku:z.string().max(160).optional().nullable(),quantityOnHand:z.number().nonnegative().optional().nullable()});
export const saveMarketplaceListing=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof listingSchema>)=>listingSchema.parse(input)).handler(async({context,data})=>{await marketScope(context,data,true);const db=context.supabase as any;const values={tenant_id:data.tenantId,vendor_id:data.vendorId,listing_type:data.type,title:data.title,description:data.description??null,status:data.status,category_keys:data.categoryKeys,currency:data.currency,price_minor:data.priceMinor??null,attributes:data.attributes,inventory_tracked:data.inventoryTracked};const q=data.id?db.from("marketplace_listings").update(values).eq("id",data.id).eq("tenant_id",data.tenantId):db.from("marketplace_listings").insert(values);const{data:row,error}=await q.select("*").single();if(error||!row)throw new Error(error?.message??"Listing could not be saved");if(data.inventoryTracked){const{error:invError}=await db.from("marketplace_inventory").upsert({listing_id:row.id,tenant_id:data.tenantId,sku:data.sku??null,quantity_on_hand:data.quantityOnHand??0},{onConflict:"listing_id"});if(invError)throw new Error(invError.message);}return row;});

const orderSchema=scope.extend({buyerRef:z.string().min(1).max(200),vendorId:z.string().uuid(),items:z.array(z.object({listingId:z.string().uuid(),quantity:z.number().positive(),metadata:z.record(z.string(),z.unknown()).default({})})).min(1).max(100),metadata:z.record(z.string(),z.unknown()).default({})});
export const createMarketplaceOrder=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof orderSchema>)=>orderSchema.parse(input)).handler(async({context,data})=>{await marketScope(context,data,true);const db=context.supabase as any;const{data:id,error}=await db.rpc("create_marketplace_order",{_tenant:data.tenantId,_tenant_product:data.tenantProductId,_buyer_ref:data.buyerRef,_vendor:data.vendorId,_items:data.items,_metadata:data.metadata});if(error||!id)throw new Error(error?.message??"Order could not be created");return{id};});

export const listMarketplaceOrders=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof scope>)=>scope.parse(input)).handler(async({context,data})=>{await marketScope(context,data);const db=context.supabase as any;const{data:orders,error}=await db.from("marketplace_orders").select("*").eq("tenant_id",data.tenantId).order("created_at",{ascending:false}).limit(500);if(error)throw new Error(error.message);const ids=(orders??[]).map((o:any)=>o.id);let items:any[]=[];if(ids.length){const res=await db.from("marketplace_order_items").select("*").eq("tenant_id",data.tenantId).in("order_id",ids);if(res.error)throw new Error(res.error.message);items=res.data??[];}return(orders??[]).map((o:any)=>({...o,items:items.filter((i:any)=>i.order_id===o.id)}));});

const transitionSchema=scope.extend({orderId:z.string().uuid(),status:z.enum(["paid","accepted","fulfilling","completed","cancelled","refunded"]),metadata:z.record(z.string(),z.unknown()).default({})});
export const transitionMarketplaceOrder=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((input:z.input<typeof transitionSchema>)=>transitionSchema.parse(input)).handler(async({context,data})=>{await marketScope(context,data,true);const db=context.supabase as any;const{error}=await db.rpc("transition_marketplace_order",{_order:data.orderId,_status:data.status,_metadata:data.metadata});if(error)throw new Error(error.message);return{ok:true};});

async function vendorPortalScope(context:any,input:{
  tenantId:string;tenantProductId:string;vendorId:string;
  roles?:Array<"vendor_owner"|"vendor_admin"|"vendor_staff"|"vendor_viewer">;
}){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const now=Date.now();
  const[{data:tp},{data:grant},{data:vendor},{data:membership}]=await Promise.all([
    admin.from("tenant_products").select("id,status,product_key").eq("id",input.tenantProductId)
      .eq("tenant_id",input.tenantId).maybeSingle(),
    admin.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
      .eq("module_key","marketplace.core").eq("enabled",true).maybeSingle(),
    admin.from("marketplace_vendors").select("*").eq("id",input.vendorId).eq("tenant_id",input.tenantId).maybeSingle(),
    admin.from("marketplace_vendor_users").select("role,status").eq("tenant_id",input.tenantId)
      .eq("vendor_id",input.vendorId).eq("user_id",context.userId).eq("status","active").maybeSingle()
  ]);
  if(!tp||tp.status!=="active"||!vendor)throw new Error("Active marketplace vendor scope required");
  if(!grant||!grant.enabled||(grant.starts_at&&Date.parse(grant.starts_at)>now)||(grant.ends_at&&Date.parse(grant.ends_at)<=now)){
    throw new Error("Marketplace entitlement required");
  }
  if(!membership)throw new Error("Vendor portal access required");
  if(input.roles?.length&&!input.roles.includes(membership.role))throw new Error("Vendor portal role does not permit this action");
  return{admin,vendor,role:String(membership.role),productKey:String(tp.product_key)};
}

const vendorInviteSchema=scope.extend({
  vendorId:z.string().uuid(),email:z.string().email().max(320),
  role:z.enum(["vendor_owner","vendor_admin","vendor_staff","vendor_viewer"]).default("vendor_staff"),
  expiresInHours:z.number().int().min(1).max(720).default(168)
});
export const inviteMarketplaceVendorUser=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof vendorInviteSchema>)=>vendorInviteSchema.parse(input))
.handler(async({context,data})=>{
  const access=await marketScope(context,data);
  requireAdminTenantRole(access.role);
  const db=context.supabase as any;
  const{data:vendor}=await db.from("marketplace_vendors").select("id")
    .eq("id",data.vendorId).eq("tenant_id",data.tenantId).maybeSingle();
  if(!vendor)throw new Error("Marketplace vendor not found");
  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const email=data.email.trim().toLowerCase();
  const expiresAt=new Date(Date.now()+data.expiresInHours*3600000).toISOString();
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:invite,error}=await admin.from("marketplace_vendor_invitations").insert({
    tenant_id:data.tenantId,vendor_id:data.vendorId,email,role:data.role,
    token_hash:tokenHash,expires_at:expiresAt,invited_by:context.userId
  }).select("id,tenant_id,vendor_id,email,role,expires_at").single();
  if(error||!invite)throw new Error(error?.message??"Vendor invitation could not be created");
  return{invite,token};
});

export const acceptMarketplaceVendorInvitation=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{token:string})=>z.object({token:z.string().min(32).max(200)}).parse(input))
.handler(async({context,data})=>{
  const email=String(context.claims.email??"").trim().toLowerCase();
  if(!email)throw new Error("Verified account email is required");
  const tokenHash=createHash("sha256").update(data.token).digest("hex");
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:invite,error}=await admin.from("marketplace_vendor_invitations").select("*")
    .eq("token_hash",tokenHash).is("accepted_at",null).is("revoked_at",null)
    .gt("expires_at",new Date().toISOString()).maybeSingle();
  if(error||!invite)throw new Error("Vendor invitation is invalid or expired");
  if(invite.email!==email)throw new Error("Vendor invitation email does not match the signed-in account");
  const{error:userError}=await admin.from("marketplace_vendor_users").upsert({
    tenant_id:invite.tenant_id,vendor_id:invite.vendor_id,user_id:context.userId,
    role:invite.role,status:"active"
  },{onConflict:"vendor_id,user_id"});
  if(userError)throw new Error(userError.message);
  await admin.from("marketplace_vendor_invitations").update({
    accepted_by:context.userId,accepted_at:new Date().toISOString()
  }).eq("id",invite.id);
  return{tenantId:invite.tenant_id,vendorId:invite.vendor_id,role:invite.role};
});

export const listMyMarketplaceVendors=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.handler(async({context})=>{
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const{data:memberships,error}=await admin.from("marketplace_vendor_users")
    .select("tenant_id,vendor_id,role,status").eq("user_id",context.userId).eq("status","active");
  if(error)throw new Error(error.message);
  const ids=[...new Set((memberships??[]).map((m:any)=>m.vendor_id))];
  if(!ids.length)return[];
  const{data:vendors,error:vendorError}=await admin.from("marketplace_vendors").select("*").in("id",ids);
  if(vendorError)throw new Error(vendorError.message);
  const byId=new Map((vendors??[]).map((v:any)=>[v.id,v]));
  return(memberships??[]).map((m:any)=>({...m,vendor:byId.get(m.vendor_id)??null})).filter((x:any)=>x.vendor);
});

const myVendorWorkspaceSchema=scope.extend({vendorId:z.string().uuid()});
export const getMyMarketplaceVendorWorkspace=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof myVendorWorkspaceSchema>)=>myVendorWorkspaceSchema.parse(input))
.handler(async({context,data})=>{
  const access=await vendorPortalScope(context,data);
  const admin=access.admin;
  const{data:listings,error:listingError}=await admin.from("marketplace_listings").select("*")
    .eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId).order("updated_at",{ascending:false}).limit(1000);
  if(listingError)throw new Error(listingError.message);
  const listingIds=(listings??[]).map((l:any)=>l.id);
  const availability=listingIds.length
    ?await admin.from("marketplace_availability").select("*").eq("tenant_id",data.tenantId)
      .in("listing_id",listingIds).order("starts_at",{ascending:true}).limit(5000)
    :{data:[],error:null};
  if(availability.error)throw new Error(availability.error.message);
  const{data:orders,error:orderError}=await admin.from("marketplace_orders").select("*")
    .eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId)
    .order("created_at",{ascending:false}).limit(500);
  if(orderError)throw new Error(orderError.message);
  const orderIds=(orders??[]).map((o:any)=>o.id);
  const items=orderIds.length
    ?await admin.from("marketplace_order_items").select("*").eq("tenant_id",data.tenantId).in("order_id",orderIds)
    :{data:[],error:null};
  if(items.error)throw new Error(items.error.message);
  return{
    vendor:access.vendor,
    role:access.role,
    listings:listings??[],
    availability:availability.data??[],
    orders:(orders??[]).map((o:any)=>({...o,items:(items.data??[]).filter((i:any)=>i.order_id===o.id)}))
  };
});

const myVendorProfileSchema=scope.extend({
  vendorId:z.string().uuid(),name:z.string().trim().min(1).max(240).optional(),
  publicProfile:z.record(z.string(),z.unknown()).default({})
});
export const updateMyMarketplaceVendorProfile=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof myVendorProfileSchema>)=>myVendorProfileSchema.parse(input))
.handler(async({context,data})=>{
  const access=await vendorPortalScope(context,{...data,roles:["vendor_owner","vendor_admin"]});
  const metadata={
    ...(access.vendor.metadata&&typeof access.vendor.metadata==="object"?access.vendor.metadata:{}),
    publicProfile:data.publicProfile
  };
  const patch:any={metadata};
  if(data.name!==undefined)patch.name=data.name;
  const{data:row,error}=await access.admin.from("marketplace_vendors").update(patch)
    .eq("id",data.vendorId).eq("tenant_id",data.tenantId).select("*").single();
  if(error||!row)throw new Error(error?.message??"Vendor profile could not be updated");
  return row;
});

const myListingSchema=scope.extend({
  vendorId:z.string().uuid(),id:z.string().uuid().optional(),
  type:z.enum(["product","service","rental","consultation","auction"]),
  title:z.string().trim().min(1).max(240),description:z.string().max(10000).optional().nullable(),
  status:z.enum(["draft","pending_review","paused"]).default("draft"),
  categoryKeys:z.array(z.string().max(120)).max(50).default([]),
  currency:z.string().regex(/^[A-Z]{3}$/),priceMinor:z.number().int().nonnegative().optional().nullable(),
  attributes:z.record(z.string(),z.unknown()).default({}),
  inventoryTracked:z.boolean().default(false),sku:z.string().max(160).optional().nullable(),
  quantityOnHand:z.number().nonnegative().optional().nullable()
});
export const saveMyMarketplaceListing=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof myListingSchema>)=>myListingSchema.parse(input))
.handler(async({context,data})=>{
  const access=await vendorPortalScope(context,{...data,roles:["vendor_owner","vendor_admin","vendor_staff"]});
  const admin=access.admin;
  if(data.id){
    const{data:existing}=await admin.from("marketplace_listings").select("id,status").eq("id",data.id)
      .eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId).maybeSingle();
    if(!existing)throw new Error("Vendor listing not found");
  }
  const values={
    tenant_id:data.tenantId,vendor_id:data.vendorId,listing_type:data.type,title:data.title,
    description:data.description??null,status:data.status,category_keys:data.categoryKeys,
    currency:data.currency,price_minor:data.priceMinor??null,attributes:data.attributes,
    inventory_tracked:data.inventoryTracked
  };
  const q=data.id
    ?admin.from("marketplace_listings").update(values).eq("id",data.id).eq("vendor_id",data.vendorId)
    :admin.from("marketplace_listings").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Vendor listing could not be saved");
  if(data.inventoryTracked){
    const{error:invError}=await admin.from("marketplace_inventory").upsert({
      listing_id:row.id,tenant_id:data.tenantId,sku:data.sku??null,quantity_on_hand:data.quantityOnHand??0
    },{onConflict:"listing_id"});
    if(invError)throw new Error(invError.message);
  }
  return row;
});

const myAvailabilitySchema=scope.extend({
  vendorId:z.string().uuid(),listingId:z.string().uuid(),id:z.string().uuid().optional(),
  startsAt:z.string().datetime(),endsAt:z.string().datetime(),
  capacity:z.number().nonnegative().optional().nullable(),available:z.boolean().default(true),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const saveMyMarketplaceAvailability=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof myAvailabilitySchema>)=>myAvailabilitySchema.parse(input))
.handler(async({context,data})=>{
  const access=await vendorPortalScope(context,{...data,roles:["vendor_owner","vendor_admin","vendor_staff"]});
  if(Date.parse(data.endsAt)<=Date.parse(data.startsAt))throw new Error("Availability end must be after start");
  const admin=access.admin;
  const{data:listing}=await admin.from("marketplace_listings").select("id").eq("id",data.listingId)
    .eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId).maybeSingle();
  if(!listing)throw new Error("Vendor listing not found");
  const values={
    tenant_id:data.tenantId,listing_id:data.listingId,starts_at:data.startsAt,ends_at:data.endsAt,
    capacity:data.capacity??null,available:data.available,metadata:data.metadata
  };
  const q=data.id
    ?admin.from("marketplace_availability").update(values).eq("id",data.id).eq("listing_id",data.listingId)
    :admin.from("marketplace_availability").insert(values);
  const{data:row,error}=await q.select("*").single();
  if(error||!row)throw new Error(error?.message??"Vendor availability could not be saved");
  return row;
});

const vendorOrderTransitionSchema=scope.extend({
  vendorId:z.string().uuid(),orderId:z.string().uuid(),
  status:z.enum(["accepted","fulfilling","completed"]),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const transitionMyMarketplaceOrder=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof vendorOrderTransitionSchema>)=>vendorOrderTransitionSchema.parse(input))
.handler(async({context,data})=>{
  const access=await vendorPortalScope(context,{...data,roles:["vendor_owner","vendor_admin","vendor_staff"]});
  const admin=access.admin;
  const{data:order}=await admin.from("marketplace_orders").select("id,status,vendor_id")
    .eq("id",data.orderId).eq("tenant_id",data.tenantId).eq("vendor_id",data.vendorId).maybeSingle();
  if(!order)throw new Error("Vendor order not found");
  const{error}=await admin.rpc("transition_marketplace_order",{
    _order:data.orderId,_status:data.status,_metadata:{...data.metadata,vendorPortalUserId:context.userId}
  });
  if(error)throw new Error(error.message);
  return{ok:true};
});


async function customerMarketplaceScope(context:any,input:{
  tenantId:string;tenantProductId:string;
}){
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as any;
  const now=Date.now();
  const[{data:tp},{data:grant},{data:portal}]=await Promise.all([
    admin.from("tenant_products").select("id,status,product_key,region_key").eq("id",input.tenantProductId)
      .eq("tenant_id",input.tenantId).maybeSingle(),
    admin.from("tenant_module_entitlements").select("enabled,starts_at,ends_at")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
      .eq("module_key","marketplace.core").eq("enabled",true).maybeSingle(),
    admin.from("customer_portal_users").select("id,crm_person_id,role,status")
      .eq("tenant_id",input.tenantId).eq("tenant_product_id",input.tenantProductId)
      .eq("user_id",context.userId).eq("status","active").maybeSingle()
  ]);
  if(!tp||tp.status!=="active")throw new Error("Active marketplace product required");
  if(!grant||!grant.enabled||(grant.starts_at&&Date.parse(grant.starts_at)>now)||(grant.ends_at&&Date.parse(grant.ends_at)<=now)){
    throw new Error("Marketplace entitlement required");
  }
  if(!portal)throw new Error("Customer portal access required");
  const{data:person}=await admin.from("crm_people").select("id,display_name,email,phone_e164")
    .eq("id",portal.crm_person_id).eq("tenant_id",input.tenantId).maybeSingle();
  if(!person)throw new Error("CRM customer not found");
  return{admin,tp,portal,person,buyerRef:String(person.id)};
}

const customerCatalogueSchema=scope.extend({
  vendorId:z.string().uuid().optional().nullable(),
  categoryKey:z.string().max(120).optional().nullable()
});
export const getCustomerMarketplaceCatalogue=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof customerCatalogueSchema>)=>customerCatalogueSchema.parse(input))
.handler(async({context,data})=>{
  const access=await customerMarketplaceScope(context,data);
  const admin=access.admin;
  let vq=admin.from("marketplace_vendors").select("id,name,country_code,currency,metadata")
    .eq("tenant_id",data.tenantId).eq("status","active").order("name").limit(1000);
  if(data.vendorId)vq=vq.eq("id",data.vendorId);
  const{data:vendors,error:vendorError}=await vq;
  if(vendorError)throw new Error(vendorError.message);
  const vendorIds=(vendors??[]).map((v:any)=>v.id);
  if(!vendorIds.length)return{vendors:[],listings:[],availability:[]};
  let lq=admin.from("marketplace_listings").select("*")
    .eq("tenant_id",data.tenantId).eq("status","active").in("vendor_id",vendorIds)
    .order("updated_at",{ascending:false}).limit(2000);
  if(data.categoryKey)lq=lq.contains("category_keys",[data.categoryKey]);
  const{data:listings,error:listingError}=await lq;
  if(listingError)throw new Error(listingError.message);
  const listingIds=(listings??[]).map((l:any)=>l.id);
  const availability=listingIds.length
    ?await admin.from("marketplace_availability")
      .select("id,listing_id,starts_at,ends_at,capacity,available,metadata")
      .eq("tenant_id",data.tenantId).in("listing_id",listingIds).eq("available",true)
      .gte("ends_at",new Date().toISOString()).order("starts_at",{ascending:true}).limit(5000)
    :{data:[],error:null};
  if(availability.error)throw new Error(availability.error.message);
  return{vendors:vendors??[],listings:listings??[],availability:availability.data??[]};
});

const customerOrderSchema=scope.extend({
  vendorId:z.string().uuid(),
  items:z.array(z.object({
    listingId:z.string().uuid(),quantity:z.number().positive(),
    metadata:z.record(z.string(),z.unknown()).default({})
  })).min(1).max(100),
  metadata:z.record(z.string(),z.unknown()).default({})
});
export const createCustomerMarketplaceOrder=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof customerOrderSchema>)=>customerOrderSchema.parse(input))
.handler(async({context,data})=>{
  const access=await customerMarketplaceScope(context,data);
  const admin=access.admin;
  const{data:vendor}=await admin.from("marketplace_vendors").select("id,status")
    .eq("id",data.vendorId).eq("tenant_id",data.tenantId).eq("status","active").maybeSingle();
  if(!vendor)throw new Error("Marketplace provider is not available");
  const metadata={
    ...data.metadata,
    customerPortalUserId:context.userId,
    crmPersonId:access.person.id
  };
  const{data:id,error}=await admin.rpc("create_marketplace_order",{
    _tenant:data.tenantId,_tenant_product:data.tenantProductId,_buyer_ref:access.buyerRef,
    _vendor:data.vendorId,_items:data.items,_metadata:metadata
  });
  if(error||!id)throw new Error(error?.message??"Marketplace order could not be created");
  return{id};
});

export const listMyMarketplacePurchases=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((input:z.input<typeof scope>)=>scope.parse(input))
.handler(async({context,data})=>{
  const access=await customerMarketplaceScope(context,data);
  const admin=access.admin;
  const{data:orders,error}=await admin.from("marketplace_orders").select("*")
    .eq("tenant_id",data.tenantId).eq("buyer_ref",access.buyerRef)
    .order("created_at",{ascending:false}).limit(500);
  if(error)throw new Error(error.message);
  const ids=(orders??[]).map((o:any)=>o.id);
  const items=ids.length
    ?await admin.from("marketplace_order_items").select("*").eq("tenant_id",data.tenantId).in("order_id",ids)
    :{data:[],error:null};
  if(items.error)throw new Error(items.error.message);
  return(orders??[]).map((o:any)=>({
    ...o,items:(items.data??[]).filter((i:any)=>i.order_id===o.id)
  }));
});
