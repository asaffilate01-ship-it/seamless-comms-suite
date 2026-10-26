// Server-only adapter boundary. Not an HTTP endpoint and not activated by import.
// The host must supply persisted tenant authorisation, secret lookup and audit sinks.
const providers=new Set(['claude','gemini','google_routes']);
const failure=reason=>({status:'unavailable',reason});
export function createFlightLoungeConnectors({authorize,secretReader,audit,fetchImpl=fetch}={}) {
  async function run(context,{provider,input}={}) {
    if (!providers.has(provider)) return failure('unsupported_provider');
    if (!context?.tenantId || !context?.actorId || typeof authorize!=='function' ||
        typeof secretReader!=='function' || typeof audit!=='function') return failure('host_not_configured');
    try {
      // context must be constructed by authenticated server middleware, never request JSON.
      const grant=await authorize(context,{product:'flightlounge',provider,action:'read'});
      if (grant?.allowed!==true || grant.tenantId!==context.tenantId || grant.provider!==provider)
        return failure('not_authorized');
      const config=await secretReader(context.tenantId,provider);
      if (!config?.key || (provider!=='google_routes' && !/^[a-zA-Z0-9._-]{1,100}$/.test(config.model||'')))
        return failure('provider_not_configured');
      let url,headers={'Content-Type':'application/json'},body;
      if (provider==='google_routes') {
        const valid=p=>p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
        if (!valid(input?.origin)||!valid(input?.destination)) return failure('invalid_coordinates');
        url='https://routes.googleapis.com/directions/v2:computeRoutes';
        headers['X-Goog-Api-Key']=config.key;
        headers['X-Goog-FieldMask']='routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline';
        body={origin:{location:{latLng:input.origin}},destination:{location:{latLng:input.destination}},travelMode:'DRIVE'};
      } else {
        if(typeof input?.question!=='string'||!input.question.trim()||input.question.length>4000) return failure('invalid_question');
        // No passenger record or entire client-supplied offer payload is forwarded.
        const text='Travel planning assistance only. Do not invent live fares, availability, baggage rules or visa eligibility. Do not book or pay. Ask for verified supplier evidence when needed. User question: '+input.question;
        if(provider==='claude') {
          url='https://api.anthropic.com/v1/messages';headers['x-api-key']=config.key;headers['anthropic-version']='2023-06-01';
          body={model:config.model,max_tokens:1200,messages:[{role:'user',content:text}]};
        } else {
          url=`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
          headers['x-goog-api-key']=config.key;
          body={contents:[{role:'user',parts:[{text}]}],generationConfig:{maxOutputTokens:1200}};
        }
      }
      // Audit must succeed before any potentially billable provider request.
      await audit({tenantId:context.tenantId,actorId:context.actorId,provider,event:'request_started'});
      const response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
      if (!response.ok) return failure('provider_request_failed');
      const data=await response.json();
      let result;
      if(provider==='google_routes') {
        const route=data.routes?.[0];
        if(!route||!/^\d+(\.\d+)?s$/.test(route.duration)||!Number.isFinite(route.distanceMeters)||route.distanceMeters<0) return failure('invalid_provider_response');
        result={duration:route.duration,distanceMeters:route.distanceMeters,polyline:typeof route.polyline?.encodedPolyline==='string'?route.polyline.encodedPolyline:null,notice:'Ground-route estimate; not a guaranteed airport connection.'};
      } else {
        const text=provider==='claude'?data.content?.filter(p=>p.type==='text').map(p=>p.text).join('\n'):data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n');
        if(!text||typeof text!=='string') return failure('invalid_provider_response');
        result={text:text.slice(0,20000),authoritative:false,notice:'AI guidance; fares and conditions require supplier verification.'};
      }
      await audit({tenantId:context.tenantId,actorId:context.actorId,provider,event:'request_completed'});
      return {status:'provider_response',provider,result};
    } catch {return failure('connector_unavailable');} // never leak provider bodies or secrets
  }
  return {run};
}
