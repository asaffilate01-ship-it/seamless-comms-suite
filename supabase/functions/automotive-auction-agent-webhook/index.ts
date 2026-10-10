import {createClient} from "npm:@supabase/supabase-js@2.110.8";

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
}
function hex(bytes:ArrayBuffer){
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function hmac(secret:string,payload:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));
}
function same(a:string,b:string){
  if(a.length!==b.length)return false;let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function db(){
  const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key)throw new Error("Service database is not configured");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function verify(req:Request,raw:string){
  const secret=Deno.env.get("AUTOHASHI_AUCTION_AGENT_WEBHOOK_SECRET")??"";
  if(secret.length<32)return {ok:false,error:"Webhook secret is not configured"};
  const timestamp=req.headers.get("x-auction-timestamp")??"";
  const signature=(req.headers.get("x-auction-signature")??"").toLowerCase();
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Date.now()-ts)>5*60*1000)return {ok:false,error:"Webhook timestamp is invalid or expired"};
  const expected=await hmac(secret,timestamp+"."+raw);
  return signature&&same(signature,expected)?{ok:true as const}:{ok:false,error:"Webhook signature is invalid"};
}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const raw=await req.text(),verified=await verify(req,raw);
  if(!verified.ok)return json({error:verified.error},401);
  let body:any={};
  try{body=raw?JSON.parse(raw):{};}catch{return json({error:"Invalid JSON"},400);}
  const eventId=String(body.event_id??"");
  const idempotencyKey=String(body.idempotency_key??eventId);
  const eventType=String(body.event_type??"");
  const providerKey=String(body.provider_key??"vehicle.auction.agent");
  if(eventId.length<4||idempotencyKey.length<4||eventType.length<4)return json({error:"event_id, idempotency_key and event_type are required"},400);

  try{
    const client=db();
    const duplicate=await client.from("automotive_bid_provider_events").select("id,processing_status")
      .eq("provider_key",providerKey).eq("provider_event_id",eventId).maybeSingle();
    if(duplicate.error)throw duplicate.error;
    if(duplicate.data&&["processed","ignored"].includes(duplicate.data.processing_status)){
      return json({ok:true,duplicate:true,eventId,status:duplicate.data.processing_status});
    }

    let instruction:any=null;
    const instructionId=typeof body.instruction_id==="string"?body.instruction_id:"";
    const providerReference=typeof body.provider_reference==="string"?body.provider_reference:"";
    if(instructionId){
      const found=await client.from("automotive_bid_instructions").select("*").eq("id",instructionId).maybeSingle();
      if(found.error)throw found.error;instruction=found.data;
    }
    if(!instruction&&providerReference){
      const found=await client.from("automotive_bid_instructions").select("*").eq("provider_reference",providerReference)
        .order("created_at",{ascending:false}).limit(2);
      if(found.error)throw found.error;
      if((found.data??[]).length>1)throw new Error("Provider reference is ambiguous across AutoHashi tenants");
      instruction=found.data?.[0]??null;
    }
    if(!instruction)return json({error:"Bid instruction not found"},404);
    const tenantId=String(instruction.tenant_id??"");
    if(!/^[0-9a-f-]{36}$/i.test(tenantId))throw new Error("Bid instruction tenant is invalid");

    let eventRow=duplicate.data;
    if(!eventRow){
      const inserted=await client.from("automotive_bid_provider_events").insert({
        tenant_id:tenantId,product_key:"autohashi",bid_instruction_id:instruction.id,provider_key:providerKey,
        provider_event_id:eventId,idempotency_key:idempotencyKey,event_type:eventType,provider_reference:providerReference||instruction.provider_reference,
        payload:body,signature_valid:true,processing_status:"received"
      }).select("*").single();
      if(inserted.error)throw inserted.error;
      eventRow=inserted.data;
    }

    const now=new Date().toISOString();
    let nextStatus:string|null=null,processingNote="Event recorded",limitViolation=false;
    if(eventType==="auction.bid.accepted")nextStatus="accepted";
    else if(eventType==="auction.bid.rejected")nextStatus="rejected";
    else if(eventType==="auction.bid.lost")nextStatus="lost";
    else if(eventType==="auction.bid.cancelled")nextStatus="cancelled";
    else if(eventType==="auction.bid.won"){
      const hammer=Number(body.hammer_price_jpy);
      if(!Number.isInteger(hammer)||hammer<0)processingNote="Won event missing valid hammer_price_jpy";
      else if(hammer>Number(instruction.max_bid_minor)){
        nextStatus="error";limitViolation=true;
        processingNote="Provider reported hammer price above authorised maximum";
      }else nextStatus="won";
    }

    const terminalStates=new Set(["won","lost","rejected","cancelled"]);
    if(instruction.limit_violation){
      nextStatus=null;processingNote="Ignored because the bid instruction is safety-locked after a maximum-bid violation";
    }else if(nextStatus&&terminalStates.has(String(instruction.status))&&nextStatus!==instruction.status){
      nextStatus=null;processingNote="Ignored out-of-order event because the bid instruction is already terminal";
    }

    if(nextStatus){
      const update:any={
        status:nextStatus,last_provider_status_at:now,updated_at:now,
        provider_reference:providerReference||instruction.provider_reference,
        result_payload:{...(instruction.result_payload??{}),lastProviderEvent:body}
      };
      if(eventType==="auction.bid.won"&&Number.isInteger(Number(body.hammer_price_jpy)))update.hammer_price_minor=Number(body.hammer_price_jpy);
      if(limitViolation){
        update.limit_violation=true;
        update.last_error=processingNote;
      }
      const changed=await client.from("automotive_bid_instructions").update(update).eq("tenant_id",tenantId).eq("id",instruction.id);
      if(changed.error)throw changed.error;
      if(eventType==="auction.bid.won"&&!limitViolation){
        const lot=await client.from("automotive_auction_lots").update({status:"won",updated_at:now})
          .eq("tenant_id",tenantId).eq("id",instruction.auction_lot_id).select("*").single();
        if(lot.error)throw lot.error;
        const hammer=Number(body.hammer_price_jpy),sheet=lot.data.auction_sheet??{};
        const make=String(sheet.make??"").trim(),model=String(sheet.model??"").trim();
        if(make&&model&&Number.isInteger(hammer)&&hammer>0){
          const outcome=await client.from("automotive_auction_price_outcomes").insert({
            tenant_id:tenantId,product_key:"autohashi",auction_lot_id:lot.data.id,provider_key:lot.data.provider_key,
            external_lot_id:lot.data.external_lot_id,make,model,model_code:sheet.modelCode??null,
            model_year:Number.isInteger(sheet.year)?sheet.year:null,grade:lot.data.grade,mileage_km:lot.data.odometer_km,
            hammer_jpy:hammer,source:"provider_webhook",outcome_at:now,metadata:{providerEventId:eventId,providerReference}
          });
          if(outcome.error)throw outcome.error;
          const predictions=await client.from("automotive_auction_price_predictions").select("*")
            .eq("tenant_id",tenantId).eq("auction_lot_id",lot.data.id).eq("status","predicted");
          if(predictions.error)throw predictions.error;
          for(const prediction of predictions.data??[]){
            if(prediction.predicted_hammer_jpy===null)continue;
            const predicted=Number(prediction.predicted_hammer_jpy),absolute=Math.abs(hammer-predicted);
            const calibrated=await client.from("automotive_auction_price_predictions").update({
              actual_hammer_jpy:hammer,absolute_error_jpy:absolute,error_pct:hammer>0?Number(((absolute/hammer)*100).toFixed(4)):null,
              status:"calibrated",calibrated_at:now
            }).eq("id",prediction.id);
            if(calibrated.error)throw calibrated.error;
          }
        }
      }else if(eventType==="auction.bid.lost"){
        const lot=await client.from("automotive_auction_lots").update({status:"ended",updated_at:now}).eq("tenant_id",tenantId).eq("id",instruction.auction_lot_id);
        if(lot.error)throw lot.error;
      }
    }

    const processed=await client.from("automotive_bid_provider_events").update({
      processed_at:now,processing_status:nextStatus?"processed":"ignored",processing_note:processingNote
    }).eq("id",eventRow.id);
    if(processed.error)throw processed.error;
    return json({ok:true,eventId,instructionId:instruction.id,eventType,status:nextStatus??instruction.status,limitViolation});
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},500);
  }
});
