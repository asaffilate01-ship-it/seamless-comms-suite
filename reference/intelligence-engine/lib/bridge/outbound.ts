const forbiddenHosts=new Set(["localhost","0.0.0.0","127.0.0.1","::1"]);
export function validateCallbackUrl(value:string,allowlist:string|undefined){
  let url:URL;try{url=new URL(value)}catch{return {valid:false,reason:"invalid_url"} as const}
  if(url.protocol!=="https:")return {valid:false,reason:"https_required"} as const;
  const host=url.hostname.toLowerCase();if(forbiddenHosts.has(host)||/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host))return {valid:false,reason:"private_network_forbidden"} as const;
  const allowed=(allowlist??"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);if(!allowed.some(domain=>host===domain||host.endsWith(`.${domain}`)))return {valid:false,reason:"domain_not_allowed"} as const;
  return {valid:true,url} as const;
}
