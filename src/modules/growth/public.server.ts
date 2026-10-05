import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const tokenSchema=z.string().min(32).max(200);
const responseSchema=z.object({
  token:tokenSchema,
  score:z.number().finite(),
  comment:z.string().max(4000).optional().nullable()
});

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}

export async function servePublicFeedbackInfo(request:Request){
  try{
    const url=new URL(request.url);
    const token=tokenSchema.parse(url.searchParams.get("token")??"");
    const admin=supabaseAdmin as any;
    const{data:req}=await admin.from("feedback_requests")
      .select("survey_id,delivery_status,expires_at")
      .eq("token_hash",hashToken(token)).maybeSingle();
    if(!req||req.expires_at<=new Date().toISOString()
      ||["responded","cancelled","failed"].includes(req.delivery_status)){
      return json({error:"Feedback request is invalid or expired"},404);
    }
    const{data:survey}=await admin.from("feedback_surveys")
      .select("name,survey_type,config,status").eq("id",req.survey_id).maybeSingle();
    if(!survey||survey.status!=="active")return json({error:"Feedback survey is unavailable"},404);
    return json({
      name:survey.name,type:survey.survey_type,
      config:survey.config&&typeof survey.config==="object"?survey.config:{},
      expiresAt:req.expires_at
    });
  }catch{
    return json({error:"Feedback request is invalid or expired"},404);
  }
}

export async function servePublicFeedbackSubmission(request:Request){
  try{
    const length=Number(request.headers.get("content-length")??0);
    if(length>20_000)return json({error:"Request is too large"},413);
    const body=responseSchema.parse(await request.json());
    const admin=supabaseAdmin as any;
    const{data:id,error}=await admin.rpc("submit_public_feedback",{
      _token_hash:hashToken(body.token),_score:body.score,_comment:body.comment??""
    });
    if(error||!id)return json({error:"Feedback could not be submitted"},400);
    return json({ok:true,responseId:id},201);
  }catch{
    return json({error:"Feedback could not be submitted"},400);
  }
}
