export function createClient(endpoint,csrfToken) {
 return async function api(path,body={}) {
  const result=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(csrfToken?{'X-CSRF-Token':csrfToken}:{})},body:JSON.stringify({path,body})});
  if(!result.ok) throw new Error('Request failed');
  return result.json();
 };
}
