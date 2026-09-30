import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireModuleEntitlement, requireWritableTenantRole } from "@/modules/platform/module-access";

const scope=z.object({tenantId:z.string().uuid(),tenantProductId:z.string().uuid()});

export const listInventoryBalances=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof scope>&{stockLocationId?:string|null})=>scope.extend({stockLocationId:z.string().uuid().optional().nullable()}).parse(i))
.handler(async({context,data})=>{
 await requireModuleEntitlement(context,{...data,moduleKey:"inventory.core"});
 const db=context.supabase as any;
 let q=db.from("inventory_stock_balances")
  .select("tenant_id,item_id,stock_location_id,on_hand,reserved,reorder_point,updated_at,item:inventory_items(id,external_ref,sku,name,unit,track_stock),stock_location:inventory_stock_locations(id,name,location_kind,location_id)")
  .eq("tenant_id",data.tenantId).order("updated_at",{ascending:false}).limit(5000);
 if(data.stockLocationId)q=q.eq("stock_location_id",data.stockLocationId);
 const{data:rows,error}=await q;if(error)throw new Error(error.message);
 return(rows??[]).map((row:any)=>({...row,available:Number(row.on_hand??0)-Number(row.reserved??0)}));
});

const itemSchema=scope.extend({
 productKey:z.string().min(1).max(80),externalRef:z.string().min(1).max(200),
 sku:z.string().max(120).optional().nullable(),name:z.string().min(1).max(240),
 unit:z.string().min(1).max(40).default("each"),trackStock:z.boolean().default(true),
 metadata:z.record(z.string(),z.unknown()).default({})
});
export const upsertInventoryItem=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof itemSchema>)=>itemSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"inventory.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const{data:row,error}=await db.from("inventory_items").upsert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,product_key:data.productKey,
  external_ref:data.externalRef,sku:data.sku??null,name:data.name,unit:data.unit,track_stock:data.trackStock,metadata:data.metadata
 },{onConflict:"tenant_id,product_key,external_ref"}).select("*").single();
 if(error||!row)throw new Error(error?.message??"Inventory item could not be saved");return row;
});

const locSchema=scope.extend({
 locationId:z.string().uuid().optional().nullable(),externalRef:z.string().max(200).optional().nullable(),
 name:z.string().min(1).max(200),kind:z.enum(["store","warehouse","kitchen","vehicle","virtual","supplier"])
});
export const createStockLocation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof locSchema>)=>locSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"inventory.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const{data:row,error}=await db.from("inventory_stock_locations").insert({
  tenant_id:data.tenantId,tenant_product_id:data.tenantProductId,location_id:data.locationId??null,
  external_ref:data.externalRef??null,name:data.name,location_kind:data.kind
 }).select("*").single();
 if(error||!row)throw new Error(error?.message??"Stock location could not be created");return row;
});

const reserveSchema=scope.extend({
 itemId:z.string().uuid(),stockLocationId:z.string().uuid(),quantity:z.number().positive(),
 contextType:z.string().min(1).max(80),contextId:z.string().min(1).max(200),
 idempotencyKey:z.string().min(8).max(160),expiresAt:z.string().datetime().optional().nullable()
});
export const reserveInventory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((i:z.input<typeof reserveSchema>)=>reserveSchema.parse(i))
.handler(async({context,data})=>{
 const access=await requireModuleEntitlement(context,{tenantId:data.tenantId,tenantProductId:data.tenantProductId,moduleKey:"inventory.core"});
 requireWritableTenantRole(access.role);const db=context.supabase as any;
 const{data:id,error}=await db.rpc("reserve_inventory",{
  _tenant:data.tenantId,_item:data.itemId,_location:data.stockLocationId,_quantity:data.quantity,
  _context_type:data.contextType,_context_id:data.contextId,_idempotency_key:data.idempotencyKey,
  _expires_at:data.expiresAt??null
 });
 if(error||!id)throw new Error(error?.message??"Stock could not be reserved");return{id};
});
