/** Canonical international format only; never guess a country from a local number. */
export function callerPhone(value:unknown):{state:'number'|'withheld'|'invalid';number:string|null}{
 if(value==null||value==='')return {state:'withheld',number:null};
 if(typeof value!=='string'||value.length>80)return {state:'invalid',number:null};
 const text=value.trim();if(!text||/^(anonymous|private|withheld|unknown|unavailable|restricted)$/i.test(text))return {state:'withheld',number:null};
 if(!/^[+\d\s().-]+$/.test(text))return {state:'invalid',number:null};
 const number=text.replace(/[\s().-]/g,'').replace(/^00/,'+');
 return /^\+[1-9]\d{6,14}$/.test(number)?{state:'number',number}:{state:'invalid',number:null};
}
