const encoder = new TextEncoder();

export async function verifyWebhookSignature(body:string,timestamp:string,signature:string,secret:string){
  const age=Math.abs(Date.now()-Number(timestamp)*1000);
  if(!Number.isFinite(age)||age>300_000) return false;
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,encoder.encode(`${timestamp}.${body}`));
  const expected=Array.from(new Uint8Array(signed)).map(b=>b.toString(16).padStart(2,"0")).join("");
  if(expected.length!==signature.length) return false;
  let diff=0; for(let i=0;i<expected.length;i++) diff|=expected.charCodeAt(i)^signature.charCodeAt(i);
  return diff===0;
}

export function getAppSecret(raw:string|undefined,app:string){
  if(!raw) return null;
  try{const parsed=JSON.parse(raw) as Record<string,string>;return typeof parsed[app]==="string"?parsed[app]:null}catch{return null}
}

export async function signWebhookPayload(body:string,timestamp:string,secret:string){
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,encoder.encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(signed)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
