import test from 'node:test';
import assert from 'node:assert/strict';
import {createEcosystemAdapter} from '../adapters/serverAdapter.mjs';
test('forged tenant and actor are replaced with server identity',async()=>{
 const original=global.fetch;let payload;
 global.fetch=async(url,options)=>{payload=JSON.parse(options.body);return Response.json([])};
 try{
 const handle=createEcosystemAdapter({app:'haccora',secret:'server-only',coreUrl:'http://localhost:8787',verifySession:async()=>({actor:'real',org:'real-org'})});
 await handle(new Request('https://app.test/api',{method:'POST',body:JSON.stringify({path:'/outgoing',body:{actor:'forged',org:'other'}})}));
 assert.equal(payload.actor,'real');assert.equal(payload.org,'real-org');
 }finally{global.fetch=original}
});
test('ordinary adapter rejects central admin operations',async()=>{
 const handle=createEcosystemAdapter({verifySession:async()=>({actor:'a',org:'o'})});
 const r=await handle(new Request('https://app.test/api',{method:'POST',body:JSON.stringify({path:'/admin/grant'})}));assert.equal(r.status,404);
});
