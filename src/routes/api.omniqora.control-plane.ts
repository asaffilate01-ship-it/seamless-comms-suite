import {createHash,timingSafeEqual} from "node:crypto";
import {createFileRoute} from "@tanstack/react-router";
import {supabaseAdmin} from "@/integrations/supabase/client.server";

function equalSecret(a:string,b:string){
  if(!a||!b)return false;
  return timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest());
}
function authorised(request:Request,productKey:string){
  const supplied=(request.headers.get("authorization")??"").replace(/^Bearer\s+/i,"");
  if(!supplied)return false;
  const master=process.env["OMNIQORA_CONTROL_PLANE_TOKEN"]??"";
  let scoped="";
  try{
    const parsed=JSON.parse(process.env["OMNIQORA_CONTROL_PLANE_TOKENS"]??"{}") as Record<string,unknown>;
    if(typeof parsed[productKey]==="string")scoped=String(parsed[productKey]);
  }catch{return false}
  return equalSecret(supplied,scoped)||equalSecret(supplied,master);
}

type Command=
 | {action:"health";productKey:string}
 | {action:"manifest";productKey:string;tenantId:string}
 | {action:"claim_events";productKey:string;worker:string;limit?:number}
 | {action:"finish_event";productKey:string;eventId:number;success:boolean;error?:string|null};

export const Route=createFileRoute("/api/omniqora/control-plane")({
  server:{handlers:{POST:async({request})=>{
    try{
      const body=await request.json() as Command;
      const productKey=String(body.productKey??"").trim();
      if(!productKey)return Response.json({ok:false,error:"product_key_required"},{status:400});
      if(!authorised(request,productKey))return Response.json({ok:false,error:"unauthorized"},{status:401});

      if(body.action==="health"){
        const{data,error}=await supabaseAdmin.from("omniqora_product_catalogue")
          .select("product_key,name,active,runtime_key").eq("product_key",productKey).maybeSingle();
        if(error)throw new Error(error.message);
        if(!data?.active)return Response.json({ok:false,error:"product_not_active"},{status:404});
        return Response.json({ok:true,product:data});
      }

      if(body.action==="manifest"){
        const{data,error}=await supabaseAdmin.rpc("server_omniqora_tenant_manifest",{
          p_tenant:body.tenantId,p_product_key:productKey,
        });
        if(error)throw new Error(error.message);
        return Response.json({ok:true,manifest:data});
      }

      if(body.action==="claim_events"){
        const worker=String(body.worker??"").trim();
        if(!worker)return Response.json({ok:false,error:"worker_required"},{status:400});
        const{data,error}=await supabaseAdmin.rpc("server_claim_omniqora_events",{
          p_product_key:productKey,p_worker:worker,p_limit:Math.max(1,Math.min(200,Number(body.limit??50))),
        });
        if(error)throw new Error(error.message);
        return Response.json({ok:true,events:data??[]});
      }

      if(body.action==="finish_event"){
        const{data:event,error:eventError}=await supabaseAdmin.from("omniqora_event_outbox")
          .select("id,target_product_key").eq("id",body.eventId).maybeSingle();
        if(eventError)throw new Error(eventError.message);
        if(!event||event.target_product_key!==productKey)
          return Response.json({ok:false,error:"event_not_found_for_product"},{status:404});
        const{data,error}=await supabaseAdmin.rpc("server_finish_omniqora_event",{
          p_event:body.eventId,p_success:Boolean(body.success),p_error:body.error??null,
        });
        if(error)throw new Error(error.message);
        return Response.json({ok:true,finished:Boolean(data)});
      }

      return Response.json({ok:false,error:"unsupported_control_plane_action"},{status:400});
    }catch(error){
      console.error("[omniqora-control-plane]",error);
      return Response.json({ok:false,error:error instanceof Error?error.message:"control_plane_failed"},{status:400});
    }
  }}}
});
