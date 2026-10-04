import {
  auctionProviderReadiness,
  getAuctionProviderLot,
  searchAuctionProvider,
} from "../../../src/modules/automotive/auction-providers.ts";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type,x-oq-timestamp,x-oq-signature",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
};

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}
function hex(bytes:ArrayBuffer){
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function hmac(secret:string,payload:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));
}
function constantTimeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0; for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
}
async function verify(req:Request,raw:string){
  const secret=Deno.env.get("OQ_BRIDGE_AUTOHASHI_A")??"";
  if(secret.length<32)return {ok:false,error:"AutoHashi bridge secret is not configured"};
  const timestamp=req.headers.get("x-oq-timestamp")??"";
  const signature=req.headers.get("x-oq-signature")??"";
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Date.now()-ts)>5*60*1000)return {ok:false,error:"Bridge timestamp is invalid or expired"};
  const expected=await hmac(secret,timestamp+"."+raw);
  if(!signature||!constantTimeEqual(expected,signature.toLowerCase()))return {ok:false,error:"Bridge signature is invalid"};
  return {ok:true as const};
}
function providerConfig(requested:unknown){
  const wanted=typeof requested==="string"?requested:"auto";
  const theCar=Deno.env.get("THECARAPI_API_KEY")??"";
  const carStack=Deno.env.get("CARSTACK_API_TOKEN")??"";
  if(wanted==="vehicle.auction.thecarapi"){
    if(!theCar)throw new Error("TheCarAPI is not configured");
    return {providerKey:wanted as const,secret:theCar};
  }
  if(wanted==="vehicle.auction.carstack"){
    if(!carStack)throw new Error("CarStack is not configured");
    return {providerKey:wanted as const,secret:carStack};
  }
  if(wanted!=="auto")throw new Error("Unsupported auction read provider");
  if(theCar)return {providerKey:"vehicle.auction.thecarapi" as const,secret:theCar};
  if(carStack)return {providerKey:"vehicle.auction.carstack" as const,secret:carStack};
  throw new Error("No Japanese auction read provider is configured");
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const raw=await req.text();
  const verified=await verify(req,raw);
  if(!verified.ok)return json({error:verified.error},401);
  let body:any={};
  try{body=raw?JSON.parse(raw):{};}catch{return json({error:"Invalid JSON"},400);}
  try{
    if(body.action==="health"){
      const readiness=auctionProviderReadiness({
        THECARAPI_API_KEY:Deno.env.get("THECARAPI_API_KEY"),
        CARSTACK_API_TOKEN:Deno.env.get("CARSTACK_API_TOKEN"),
      }).filter(p=>p.stage==="built_read").map(p=>({key:p.key,name:p.name,configured:p.configured,capabilities:p.capabilities}));
      return json({ok:true,executionEnabled:false,providers:readiness});
    }
    if(body.action==="search"){
      const provider=providerConfig(body.providerKey);
      const result=await searchAuctionProvider({providerKey:provider.providerKey,secret:provider.secret,filters:{
        query:body.filters?.query??null,
        make:body.filters?.make??null,
        model:body.filters?.model??null,
        yearMin:body.filters?.yearMin??null,
        yearMax:body.filters?.yearMax??null,
        odometerMaxKm:body.filters?.odometerMaxKm??null,
        grade:body.filters?.grade??null,
        steering:body.filters?.steering??"rhd",
        page:body.filters?.page??1,
        pageSize:Math.min(50,body.filters?.pageSize??24),
      }});
      return json({ok:true,executionEnabled:false,...result});
    }
    if(body.action==="detail"){
      if(!body.externalLotId)return json({error:"externalLotId is required"},400);
      const provider=providerConfig(body.providerKey);
      const lot=await getAuctionProviderLot({providerKey:provider.providerKey,secret:provider.secret,externalLotId:String(body.externalLotId)});
      return json({ok:true,executionEnabled:false,lot});
    }
    if(String(body.action??"").startsWith("bid.")){
      return json({error:"Live bid execution is disabled until a contracted Japan execution provider passes certification",executionEnabled:false},501);
    }
    return json({error:"Unsupported action"},400);
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},502);
  }
});
