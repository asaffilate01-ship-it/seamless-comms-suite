import {createHash} from "node:crypto";
import {z} from "zod";

const schema=z.object({
 token:z.string().min(20).max(500),
 score:z.number().min(-1000).max(1000),
 comment:z.string().max(5000).nullish(),
 sentiment:z.enum(["positive","neutral","negative"]).nullish()
});

export async function servePublicFeedback(request:Request){
 try{
  const raw=await request.json();const input=schema.parse(raw);
  const{supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as any;
  const hash=createHash("sha256").update(input.token).digest("hex");
  const{data:req,error}=await db.from("feedback_requests").select("*").eq("token_hash",hash).maybeSingle();
  if(error)throw new Error(error.message);
  if(!req)return Response.json({error:"Feedback request not found"},{status:404});
  if(Date.parse(req.expires_at)<=Date.now())return Response.json({error:"Feedback request expired"},{status:410});
  if(req.delivery_status==="responded")return Response.json({ok:true,idempotent:true});
  const{data:survey,error:surveyError}=await db.from("feedback_surveys").select("id,tenant_id,product_key,status").eq("id",req.survey_id).maybeSingle();
  if(surveyError||!survey||survey.status!=="active")return Response.json({error:"Feedback survey unavailable"},{status:409});
  const{data:response,error:insertError}=await db.from("feedback_responses").insert({
   tenant_id:req.tenant_id,survey_id:req.survey_id,person_id:req.person_id??null,subject_type:req.subject_type??null,subject_id:req.subject_id??null,
   score:input.score,comment:input.comment??null,sentiment:input.sentiment??null,recovery_status:"none",
   metadata:{feedbackRequestId:req.id,channel:req.channel}
  }).select("*").single();
  if(insertError)throw new Error(insertError.message);
  await db.from("feedback_requests").update({delivery_status:"responded"}).eq("id",req.id);
  return Response.json({ok:true,responseId:response.id},{headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
 }catch(error){
  if(error instanceof z.ZodError)return Response.json({error:"Invalid feedback response"},{status:422});
  return Response.json({error:error instanceof Error?error.message:"Feedback response failed"},{status:503});
 }
}
