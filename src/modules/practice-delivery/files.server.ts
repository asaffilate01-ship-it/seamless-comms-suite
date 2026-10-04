const allowed=new Set(["application/pdf","image/png","image/jpeg","text/csv"]);
export function validatePracticeUpload(base64:string,mimeType:string){
 if(!allowed.has(mimeType))throw new Error("Unsupported practice file type");
 const bytes=Buffer.from(base64,"base64");
 if(!bytes.length||bytes.length>5*1024*1024)throw new Error("Practice file must be between 1 byte and 5 MB");
 if(mimeType==="application/pdf"&&!bytes.subarray(0,5).equals(Buffer.from("%PDF-")))throw new Error("PDF signature mismatch");
 if(mimeType==="image/png"&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error("PNG signature mismatch");
 if(mimeType==="image/jpeg"&&!(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9))throw new Error("JPEG signature mismatch");
 return bytes;
}
