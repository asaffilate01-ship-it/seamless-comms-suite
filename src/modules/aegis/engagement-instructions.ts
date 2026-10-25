type CurrentOrder={id:string;title:string;content:string;version:number;created_at:string};
type OwnReceipt={id:string;recorded_at:string};
export async function readEngagementInstructions(db:any,tenantId:string,engagementId:string,userId:string){
 if(!userId)throw new Error('Authenticated member required');
 const parent=await db.from('aegis_operations').select('id,parent_id').eq('tenant_id',tenantId).eq('id',engagementId).eq('kind','engagement').maybeSingle();
 if(parent.error||!parent.data)throw new Error('Engagement unavailable or access denied');
 if(!parent.data.parent_id)throw new Error('Engagement site configuration unavailable');
 // The status view checks all accessible versions; never infer current state from a bounded list.
 const result=await db.from('aegis_post_orders_status').select('id,title,content,version,created_at').eq('tenant_id',tenantId).eq('site_id',parent.data.parent_id).eq('is_current',true).maybeSingle();
 if(result.error)throw new Error('Current site instructions unavailable; refresh before acknowledgement');
 const order=result.data as CurrentOrder|null;let receipt:OwnReceipt|null=null;
 if(order){
  const own=await db.from('aegis_post_order_receipts').select('id,recorded_at').eq('tenant_id',tenantId).eq('order_id',order.id).eq('actor',userId).maybeSingle();
  if(own.error)throw new Error('Your exact-version receipt could not be checked');
  receipt=own.data as OwnReceipt|null;
 }
 return {order,receipt,siteId:parent.data.parent_id as string,sampledAt:new Date().toISOString()};
}
