function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
function runnerAuth(req:Request){
  const expected=Deno.env.get("AUTOHASHI_AUCTION_VISION_RUNNER_SECRET")??"";
  return expected.length>=32&&(req.headers.get("x-autohashi-vision-runner-secret")??"")===expected;
}
function workerUrl(){
  const base=(Deno.env.get("SUPABASE_URL")??"").replace(/\/$/,"");
  if(!base)throw new Error("SUPABASE_URL is not configured");
  return base+"/functions/v1/automotive-auction-intelligence-worker";
}
async function workerCall(actionBody:Record<string,unknown>){
  const secret=Deno.env.get("OMNIQORA_INTELLIGENCE_WORKER_SECRET")??"";
  if(secret.length<32)throw new Error("OMNIQORA_INTELLIGENCE_WORKER_SECRET is not configured");
  const response=await fetch(workerUrl(),{method:"POST",headers:{"Content-Type":"application/json","x-omniqora-worker-secret":secret},body:JSON.stringify(actionBody)});
  const raw=await response.text();let body:any={};
  try{body=raw?JSON.parse(raw):{};}catch{throw new Error("Auction intelligence worker returned non-JSON");}
  if(!response.ok||body?.error)throw new Error(String(body?.error??"Auction intelligence worker request failed"));
  return body;
}
async function providerExtract(job:any){
  const url=(Deno.env.get("AUTOHASHI_AUCTION_VISION_PROVIDER_URL")??"").trim();
  const token=Deno.env.get("AUTOHASHI_AUCTION_VISION_PROVIDER_TOKEN")??"";
  if(!/^https:\/\//i.test(url))throw new Error("AUTOHASHI_AUCTION_VISION_PROVIDER_URL must be HTTPS");
  const payload={
    task:"Extract Japanese vehicle auction-sheet evidence into the exact supplied schema. Do not guess unreadable fields. Preserve Japanese inspector comments and damage codes verbatim where visible.",
    schema:job.extractionSchema,
    subject:job.subject,
    sourceEvidence:job.sourceEvidence,
    learningExamples:Array.isArray(job.learningExamples)?job.learningExamples.slice(0,20):[],
    requirements:{
      structuredJsonOnly:true,
      preserveSourceText:true,
      noPurchaseDecision:true,
      noBidAuthority:true,
      lowerConfidenceWhenUnreadable:true,
      learningExamplesAreReferenceOnly:true,
      neverCopyValuesNotVisibleInCurrentEvidence:true,
    }
  };
  const headers:Record<string,string>={"Content-Type":"application/json","Accept":"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(payload)});
  const raw=await response.text();let body:any={};
  try{body=raw?JSON.parse(raw):{};}catch{throw new Error("Vision provider returned non-JSON");}
  if(!response.ok)throw new Error(String(body?.error??body?.message??"Vision provider request failed"));
  const extraction=body.extraction??body.result?.extraction??body.result??body;
  if(!extraction||typeof extraction!=="object")throw new Error("Vision provider did not return a structured extraction");
  return {extraction,rawText:typeof body.rawText==="string"?body.rawText:null,sourceRef:typeof body.sourceRef==="string"?body.sourceRef:"configured-vision-provider"};
}
Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  if(!runnerAuth(req))return json({error:"Vision runner authentication failed"},401);
  let body:any={};try{body=await req.json();}catch{body={};}
  const maxJobs=Math.min(10,Math.max(1,Number(body.maxJobs??1)));
  const workerKey=String(body.workerKey??"auction-vision-runner").slice(0,120);
  const outputs:any[]=[];
  for(let i=0;i<maxJobs;i++){
    let claimed:any=null;
    try{
      const claim=await workerCall({action:"claim",workerKey});
      claimed=claim.job;
      if(!claimed)break;
      const result=await providerExtract(claimed);
      const completed=await workerCall({action:"complete",workerKey,jobId:claimed.id,...result});
      outputs.push({jobId:claimed.id,ok:true,decision:completed.decision??null});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      if(claimed?.id){
        try{await workerCall({action:"fail",workerKey,jobId:claimed.id,error:message});}catch{}
      }
      outputs.push({jobId:claimed?.id??null,ok:false,error:message});
      if(!claimed)break;
    }
  }
  return json({ok:true,processed:outputs.length,results:outputs});
});
