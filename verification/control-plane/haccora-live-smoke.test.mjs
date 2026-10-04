import assert from "node:assert/strict";
import { test } from "node:test";
import { runHaccoraReadOnlySmoke } from "../../src/modules/haccora/haccora-smoke.server.ts";

function chain(data) {
  const value = { data, error: null };
  const q = {
    select(){ return q; }, eq(){ return q; }, order(){ return q; }, limit(){ return q; },
    async maybeSingle(){ return value; },
  };
  return q;
}

test("Haccora read-only smoke verifies connection, entitlements and compliance summary without a write probe", async () => {
  const previousUrl=process.env.HACCORA_UK_FUNCTION_URL;
  const previousSecret=process.env.HACCORA_UK_SYNC_SECRET;
  process.env.HACCORA_UK_FUNCTION_URL="https://haccora.example.test/functions/v1/omniqora-platform";
  process.env.HACCORA_UK_SYNC_SECRET="s".repeat(48);
  const db={
    from(table){
      if(table==="tenants")return chain({id:"11111111-1111-4111-8111-111111111111",country_code:"GB"});
      if(table==="tenant_products")return chain({status:"active",config:{mode:"dishbee-addon"}});
      if(table==="product_connections")return chain({status:"connected",external_tenant_id:"haccora-1",base_url:"https://app.haccora.co.uk"});
      throw new Error("unexpected table "+table);
    },
    async rpc(name,args){
      assert.equal(name,"has_tenant_entitlement");
      assert.equal(args._tenant,"11111111-1111-4111-8111-111111111111");
      return {data:true,error:null};
    },
  };
  const actions=[];
  const fetchImpl=async (_url,init)=>{
    const body=JSON.parse(String(init.body));
    actions.push(body.action);
    if(body.action==="validate_projection"){
      return new Response(JSON.stringify({ok:true,valid:true,persisted:false,reviewRequired:true}),{status:200,headers:{"content-type":"application/json"}});
    }
    return new Response(JSON.stringify({status:"ok",openChecks:2}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const result=await runHaccoraReadOnlySmoke(db,"11111111-1111-4111-8111-111111111111",fetchImpl);
    assert.equal(result.overall,"pass");
    assert.equal(result.compliance?.reachable,true);
    assert.equal(result.projection?.validated,true);
    assert.equal(result.projection?.persisted,false);
    assert.deepEqual(actions,["compliance_summary","validate_projection"]);
    assert(result.checks.some((item)=>item.key==="ai-copilot"&&item.ok));
    assert(result.checks.some((item)=>item.key==="projection-contract"&&item.ok));
  }finally{
    if(previousUrl===undefined)delete process.env.HACCORA_UK_FUNCTION_URL;else process.env.HACCORA_UK_FUNCTION_URL=previousUrl;
    if(previousSecret===undefined)delete process.env.HACCORA_UK_SYNC_SECRET;else process.env.HACCORA_UK_SYNC_SECRET=previousSecret;
  }
});

test("Haccora smoke fails closed when bridge configuration is absent", async () => {
  const previousUrl=process.env.HACCORA_UK_FUNCTION_URL;
  const previousSecret=process.env.HACCORA_UK_SYNC_SECRET;
  delete process.env.HACCORA_UK_FUNCTION_URL;
  delete process.env.HACCORA_UK_SYNC_SECRET;
  const db={
    from(table){
      if(table==="tenants")return chain({id:"11111111-1111-4111-8111-111111111111",country_code:"GB"});
      if(table==="tenant_products")return chain({status:"active",config:{}});
      if(table==="product_connections")return chain({status:"connected",external_tenant_id:"haccora-1"});
      throw new Error("unexpected table");
    },
    async rpc(){return {data:true,error:null};},
  };
  try{
    const result=await runHaccoraReadOnlySmoke(db,"11111111-1111-4111-8111-111111111111",async()=>{throw new Error("must not call fetch");});
    assert.equal(result.overall,"fail");
    assert(result.checks.some((item)=>item.key==="bridge-config"&&!item.ok));
    assert(result.checks.some((item)=>item.key==="compliance-summary"&&!item.ok));
  }finally{
    if(previousUrl!==undefined)process.env.HACCORA_UK_FUNCTION_URL=previousUrl;
    if(previousSecret!==undefined)process.env.HACCORA_UK_SYNC_SECRET=previousSecret;
  }
});
