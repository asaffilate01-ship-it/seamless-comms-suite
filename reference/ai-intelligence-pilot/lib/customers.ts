import {one,rows,stmt,db,product,id,now,fail,Row} from './server';
import {callerPhone} from './phone';
import {boundedText} from './policy';
export async function lookupCustomer(w:string,p:string,phone:unknown){
 await product(w,p);const parsed=callerPhone(phone);
 if(parsed.state!=='number')return {status:parsed.state,phone:null,matches:[],identityVerified:false,more:false};
 const records=await rows('SELECT id,name,phone,external_ref,revision,updated_at FROM reception_customers WHERE workspace_id=? AND product_id=? AND phone=? ORDER BY name,id LIMIT 21',w,p,parsed.number);
 return {status:records.length>1?'ambiguous':records.length===1?'matched':'unknown',phone:parsed.number,matches:records.slice(0,20),more:records.length>20,identityVerified:false};
}
export async function customerHistory(w:string,p:string,customerId:unknown){
 await product(w,p);const customer=await one('SELECT id,name,phone,external_ref,revision,updated_at FROM reception_customers WHERE id=? AND workspace_id=? AND product_id=?',boundedText(customerId,100),w,p);if(!customer)fail('Customer not found.',404);
 const items=await rows('SELECT id,kind,summary,status,source_ref,created_at,human_handler_name,handoff_note FROM reception_items WHERE workspace_id=? AND product_id=? AND customer_id=? ORDER BY created_at DESC,id DESC LIMIT 20',w,p,customer.id);
 const lastHuman=await one('SELECT human_handler_id AS id,human_handler_name AS name,handoff_note,summary,created_at FROM reception_items WHERE workspace_id=? AND product_id=? AND customer_id=? AND human_handler_id IS NOT NULL ORDER BY created_at DESC,reception_items.id DESC LIMIT 1',w,p,customer.id);
 const team=await receptionTeam(w);return {customer,items,lastHuman:lastHuman?{...lastHuman,available:null,stillOnTeam:team.some(t=>t.id===lastHuman.id)}:null,historyScope:'Latest 20 linked reception requests in this product. Source CRM history is not connected.',identityVerified:false};
}
export async function receptionTeam(w:string){return rows("SELECT owner_id AS id,'Workspace owner' AS name FROM workspaces WHERE id=? UNION SELECT user_id AS id,email AS name FROM members WHERE workspace_id=? AND role IN ('owner','admin','operator') ORDER BY name",w,w);}
export async function saveCustomer(w:string,p:string,b:Row,actor:string){
 await product(w,p);const name=boundedText(b.name,120),phone=callerPhone(b.phone),ref=boundedText(b.externalRef,160);if(!name||phone.state!=='number'||!ref)fail('Add a name, an international number with country code, and a stable customer reference.');
 const prior=await one('SELECT * FROM reception_customers WHERE workspace_id=? AND product_id=? AND external_ref=?',w,p,ref);
 if(prior&&prior.name===name&&prior.phone===phone.number)return prior;
 if(prior&&b.revision!==prior.revision)fail('The customer changed. Fetch the current profile before updating it.',409);
 if(!prior&&b.revision&&b.revision!==0)fail('The customer no longer exists. Reload the profile.',409);
 const cid=prior?.id||id(),op=id(),t=now();let result;
 if(prior){result=await db().batch([stmt('UPDATE reception_customers SET name=?,phone=?,revision=revision+1,updated_at=? WHERE id=? AND workspace_id=? AND product_id=? AND revision=?',name,phone.number,t,cid,w,p,prior.revision),stmt("INSERT INTO audit(id,workspace_id,actor,event,detail,resource_id,created_at) SELECT ?,?,?,'customer.updated','Updated reception customer',?,? WHERE changes()=1",op,w,actor,cid,t)]);if(!result[0].meta.changes)fail('The customer changed. Refresh before updating it.',409)}
 else{await db().batch([stmt('INSERT OR IGNORE INTO reception_customers(id,workspace_id,product_id,external_ref,name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',cid,w,p,ref,name,phone.number,t,t),stmt("INSERT INTO audit(id,workspace_id,actor,event,detail,resource_id,created_at) SELECT ?,?,?,'customer.created','Created reception customer',?,? WHERE changes()=1",op,w,actor,cid,t)])}
 const saved=(await one('SELECT * FROM reception_customers WHERE workspace_id=? AND product_id=? AND external_ref=?',w,p,ref))!;if(saved.name!==name||saved.phone!==phone.number)fail('This customer reference was saved with different details. Reload the profile.',409);return saved;
}
