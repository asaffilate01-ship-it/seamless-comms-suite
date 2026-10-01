export function createOmniqoraPlatformClient({origin,token,fetchImpl=fetch}){
  const base=new URL(origin);
  if(base.protocol!=="https:"||base.username||base.password||base.search||base.hash)throw new Error("Use an Omniqora HTTPS origin");
  if(typeof token!=="string"||token.length<40)throw new Error("Configure a server-only Omniqora service credential");
  if(typeof window!=="undefined")throw new Error("Omniqora platform client is server-only");

  async function post(path,body){
    const response=await fetchImpl(new URL(path,base),{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(60000),
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    const raw=await response.text();
    if(raw.length>524288)throw new Error("Omniqora response too large");
    let data;try{data=raw?JSON.parse(raw):{};}catch{throw new Error("Invalid Omniqora response");}
    if(!response.ok)throw new Error(data?.error||("Omniqora request refused ("+response.status+")"));
    return data;
  }

  return{
    context(scope){return post("/api/platform/runtime",{operation:"context.get",...scope});},
    entitlement(scope,moduleKey){return post("/api/platform/runtime",{operation:"entitlement.check",...scope,moduleKey});},
    usage(scope,{moduleKey,metricKey,quantity,unit,sourceEventId,occurredAt=new Date().toISOString(),metadata={}}){
      return post("/api/platform/runtime",{operation:"usage.record",...scope,moduleKey,metricKey,quantity,unit,sourceEventId,occurredAt,metadata});
    },
    event(event){return post("/api/platform/events",event);},
  };
}
