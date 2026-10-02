import { createHmac, timingSafeEqual } from "node:crypto";

export function twilioSignature(url: string, params: Record<string,string>, authToken: string) {
  const base=url+Object.keys(params).sort().map(k=>k+params[k]).join("");
  return createHmac("sha1",authToken).update(base,"utf8").digest("base64");
}
export function verifyTwilioSignature(url:string,params:Record<string,string>,provided:string|null,authToken:string){
  if(!provided||!authToken)return false;
  const expected=Buffer.from(twilioSignature(url,params,authToken));
  const actual=Buffer.from(provided);
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export async function parseUrlEncoded(request:Request){
  const body=await request.text();
  const params=Object.fromEntries(new URLSearchParams(body).entries());
  return {body,params};
}
export function twiml(inner:string,status=200){
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,{
    status,headers:{"content-type":"text/xml; charset=utf-8","cache-control":"no-store"}
  });
}
export function xmlEscape(value:string){
  return value.replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]!));
}
