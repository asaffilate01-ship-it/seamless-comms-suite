// Final Node gateway boundary: handlers are trusted, but can still stall or fail.
// Buffer before writing headers so failures never deliver a partial successful fare.
export async function bufferPassengerResponse(handler, request, {timeoutMs=55000}={}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>55000)
    throw Error('invalid_passenger_deadline');
  const controller=new AbortController();
  const signal=AbortSignal.any([request.signal,controller.signal]);
  const deadline=performance.now()+timeoutMs;
  let reader,onAbort;
  const discard=body=>{try{Promise.resolve(body?.cancel()).catch(()=>{});}catch{}};
  const check=()=>{
    if(performance.now()>=deadline)controller.abort();
    if(signal.aborted)throw Error('passenger_request_cancelled');
  };
  const cancelled=new Promise((_,reject)=>{
    onAbort=()=>{discard(reader);reject(Error('passenger_request_cancelled'));};
    signal.addEventListener('abort',onAbort,{once:true});
    if(signal.aborted)onAbort();
  });
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const read=async()=>{
    check();
    const response=await handler(new Request(request,{signal}));
    if(signal.aborted || performance.now()>=deadline){discard(response?.body);check();}
    if(!(response instanceof Response))throw Error('invalid_passenger_response');
    const maxBytes=4000000;
    const length=response.headers.get('content-length');
    if(length && /^\d+$/.test(length) && Number(length)>maxBytes){
      discard(response.body);throw Error('passenger_response_too_large');
    }
    const bytes=Buffer.alloc(maxBytes);let size=0;
    try{
      if(response.body){
        reader=response.body.getReader();
        while(true){
          check();
          const {done,value}=await reader.read();
          check();
          if(done)break;
          if(!(value instanceof Uint8Array) || value.byteLength>maxBytes-size)
            throw Error('passenger_response_too_large');
          bytes.set(value,size);size+=value.byteLength;
        }
      }
      // Recalculate framing; never forward a stale length or chunked transfer header.
      const headers=Object.fromEntries(response.headers);
      delete headers['transfer-encoding'];
      delete headers['content-length'];
      headers['cache-control']='no-store';
      headers['x-content-type-options']='nosniff';
      headers['referrer-policy']='no-referrer';
      return {status:response.status,headers,body:bytes.subarray(0,size)};
    }finally{
      discard(reader);
      try{reader?.releaseLock();}catch{}
      reader=null;
    }
  };
  try{return await Promise.race([read(),cancelled]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
}
