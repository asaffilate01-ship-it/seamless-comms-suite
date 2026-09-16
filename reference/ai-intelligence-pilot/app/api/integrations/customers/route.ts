import {connector,readBody,fail,apiError} from '@/lib/server';
import {lookupCustomer,customerHistory,saveCustomer} from '@/lib/customers';
import {receptionEnabled} from '@/lib/reception';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{const {integration:i}=await connector(req);await receptionEnabled(i.workspace_id,i.product_id);const b=await readBody(req,4000);let result;
 if(b.action==='lookup')result=await lookupCustomer(i.workspace_id,i.product_id,b.phone);
 else if(b.action==='history')result=await customerHistory(i.workspace_id,i.product_id,b.customerId);
 else if(b.action==='save'){const timestamp=Number(req.headers.get('x-event-timestamp'));if(!timestamp||Math.abs(Date.now()-timestamp)>300000)fail('Use a current x-event-timestamp in milliseconds.',401);result={customer:await saveCustomer(i.workspace_id,i.product_id,b,i.name)}}else fail('Choose lookup, history or save.');
 return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return apiError(e);}}
