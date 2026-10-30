// Parse only a bounded UTF-8 JSON body. Cleanup hooks must never delay rejection.
export async function readPassengerJson(request, {timeoutMs=5000}={}) {
  if(!Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>5000)
    throw Error('invalid_body_deadline');
  if(!request.body)throw Error('missing_body');
  const reader=request.body.getReader();
  const bytes=new Uint8Array(8192);
  const deadline=performance.now()+timeoutMs;
  let size=0,onAbort,timer;
  const discard=()=>{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}};
  const check=()=>{
    if(request.signal.aborted)throw Error('request_cancelled');
    if(performance.now()>=deadline)throw Error('body_timeout');
  };
  const cancelled=new Promise((_,reject)=>{
    onAbort=()=>{discard();reject(Error('request_cancelled'));};
    request.signal.addEventListener('abort',onAbort,{once:true});
    if(request.signal.aborted)onAbort();
    timer=setTimeout(()=>{discard();reject(Error('body_timeout'));},timeoutMs);
  });
  const read=async()=>{
    while(true){
      check();
      const {done,value}=await reader.read();
      check();
      if(done)break;
      if(!(value instanceof Uint8Array))throw Error('invalid_body_chunk');
      if(value.byteLength>bytes.length-size)throw Error('body_too_large');
      // Copy immediately: stream producers can reuse or mutate their backing buffers.
      bytes.set(value,size);size+=value.byteLength;
    }
    const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));
    check();return result;
  };
  try{return await Promise.race([read(),cancelled]);}
  finally{
    clearTimeout(timer);request.signal.removeEventListener('abort',onAbort);
    discard();try{reader.releaseLock();}catch{}
  }
}
