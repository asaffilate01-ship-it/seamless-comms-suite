import {randomUUID,createHash} from 'node:crypto';
import {mkdir,lstat,open,readFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const validScope=c=>c?.tenantId==='travenexa-flightlounge'&&typeof c.actorId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(c.actorId);
const validRef=r=>typeof r==='string'&&/^offer_[a-f0-9]{32}$/.test(r);
// Durable single-host store. Directory must be on a private persistent volume.
export function createFileOfferStore({directory,now=()=>Date.now()}={}){
 if(typeof directory!=='string'||!directory.startsWith('/'))throw Error('absolute_private_store_directory_required');
 const root=resolve(directory);
 const filename=(c,ref)=>join(root,createHash('sha256').update(JSON.stringify([c.tenantId,c.actorId,ref])).digest('hex')+'.json');
 async function ready(){await mkdir(root,{recursive:true,mode:0o700});const st=await lstat(root);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('private_store_permissions_required');}
 return {
  async put(context,{query,offer}){
   if(!validScope(context))throw Error('authenticated_actor_required');
   if(!offer||offer.source!=='duffel'||offer.live!==true||offer.bookable!==false||!(Date.parse(offer.expiresAt)>now()))throw Error('live_offer_required');
   const offerRef='offer_'+randomUUID().replaceAll('-','');
   const record={tenantId:context.tenantId,actorId:context.actorId,offerRef,query,offer,storedAt:new Date(now()).toISOString(),expiresAt:new Date(Math.min(Date.parse(offer.expiresAt),now()+30*60000)).toISOString()};
   const text=JSON.stringify(record);if(Buffer.byteLength(text)>128000)throw Error('offer_record_too_large');
   await ready();const handle=await open(filename(context,offerRef),'wx',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
   return offerRef;
  },
  async get(context,offerRef){
   if(!validScope(context)||!validRef(offerRef))return null;
   await ready();const path=filename(context,offerRef);
   try{const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.size>128000||(st.mode&0o077)!==0)return null;
    const record=JSON.parse(await readFile(path,'utf8'));
    if(record.tenantId!==context.tenantId||record.actorId!==context.actorId||record.offerRef!==offerRef)return null;
    if(!(Date.parse(record.expiresAt)>now())||!(Date.parse(record.offer?.expiresAt)>now())){await unlink(path).catch(()=>{});return null;}
    return record;
   }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
  },
  async remove(context,offerRef){if(!validScope(context)||!validRef(offerRef))return false;await ready();try{await unlink(filename(context,offerRef));return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
 };
}
export {validScope};
