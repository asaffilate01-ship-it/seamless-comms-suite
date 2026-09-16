import {workspace,requireRole,sameOrigin,readBody,fail,apiError} from '@/lib/server';
import {lookupCustomer,customerHistory,saveCustomer} from '@/lib/customers';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{sameOrigin(req);const {w,user}=await workspace();requireRole(w,['owner','admin','operator']);const b=await readBody(req,4000);let result;
 if(b.action==='lookup')result=await lookupCustomer(w.id,b.productId,b.phone);
 else if(b.action==='history')result=await customerHistory(w.id,b.productId,b.customerId);
 else if(b.action==='save'){if(w.paused)fail('Customer updates are paused for this workspace.',409);result={customer:await saveCustomer(w.id,b.productId,b,user.email)}}else fail('Choose lookup, history or save.');
 return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return apiError(e);}}
