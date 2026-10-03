import {createFileRoute} from "@tanstack/react-router";
import {drainPlatformWebhooks,verifyWebhookWorkerSecret} from "@/modules/platform/webhook-delivery.server";
export const Route=createFileRoute("/api/platform/webhooks/drain")({
  server:{handlers:{POST:async({request})=>{
    if(!verifyWebhookWorkerSecret(request.headers.get("x-omniqora-worker-secret")))return Response.json({error:"Forbidden"},{status:403});
    try{
      const url=new URL(request.url);const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")??25)));
      return Response.json(await drainPlatformWebhooks(limit),{headers:{"cache-control":"no-store"}});
    }catch(error){return Response.json({error:error instanceof Error?error.message:"Webhook worker failed"},{status:503})}
  }}}
});
