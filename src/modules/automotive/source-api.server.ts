import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { automotiveProduct, vehicleIdentityBaseSchema } from "./contracts";
import { queueAutomotiveEvent } from "./event-bus.server";

const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const scope = z.enum(["vehicles:read","vehicles:write","appraisals:write","passports:read","passports:write"]);
const configSchema = z.object({
  id,
  tenantId:z.string().uuid(),
  product:automotiveProduct,
  secretEnv:z.string().regex(/^OQ_AUTOMOTIVE_API_[A-Z0-9_]+$/),
  scopes:z.array(scope).min(1),
  enabled:z.boolean(),
}).strict();

type Config=z.infer<typeof configSchema>;

function configs():Config[]{
  return z.array(configSchema).max(500).parse(JSON.parse(process.env.OMNIQORA_AUTOMOTIVE_API_CONNECTIONS_JSON??"[]"));
}
function equal(a:string,b:string){
  const x=createHash("sha256").update(a).digest(),y=createHash("sha256").update(b).digest();
  return timingSafeEqual(x,y);
}
function connection(request:Request,connectionId:string){
  const c=configs().find(x=>x.id===connectionId&&x.enabled);
  if(!c)throw Object.assign(new Error("Invalid connection"),{status:401});
  const header=request.headers.get("authorization")??"";
  const secret=process.env[c.secretEnv];
  if(!header.startsWith("Bearer ")||!secret||secret.length<32||!equal(header.slice(7),secret))throw Object.assign(new Error("Invalid credential"),{status:401});
  return c;
}
function db(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Object.assign(new Error("Automotive API unavailable"),{status:503});
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function requireScope(c:Config,s:z.infer<typeof scope>){if(!c.scopes.includes(s))throw Object.assign(new Error("Scope not granted"),{status:403});}
function response(body:unknown,status=200){return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}

const requestSchema=z.object({
  operation:z.enum(["vehicle.create","vehicle.get","appraisal.create","passport.get","passport.snapshot"]),
  payload:z.record(z.unknown()),
}).strict();

async function idempotent<T>(client:ReturnType<typeof db>,c:Config,key:string,operation:string,run:()=>Promise<T>):Promise<T>{
  if(!/^[A-Za-z0-9_.:-]{8,120}$/.test(key))throw Object.assign(new Error("Valid idempotency key required"),{status:422});
  const {data:prior}=await client.from("automotive_api_requests").select("response_payload,status").eq("tenant_id",c.tenantId).eq("connection_id",c.id).eq("idempotency_key",key).maybeSingle();
  if(prior?.status==="completed")return prior.response_payload as T;
  if(prior)throw Object.assign(new Error("Request already processing"),{status:409});
  const {error}=await client.from("automotive_api_requests").insert({tenant_id:c.tenantId,connection_id:c.id,idempotency_key:key,operation,status:"processing"});
  if(error){if(error.code==="23505")throw Object.assign(new Error("Duplicate request"),{status:409});throw error;}
  try{
    const result=await run();
    await client.from("automotive_api_requests").update({status:"completed",response_payload:result,completed_at:new Date().toISOString()}).eq("tenant_id",c.tenantId).eq("connection_id",c.id).eq("idempotency_key",key);
    return result;
  }catch(error){
    await client.from("automotive_api_requests").update({status:"failed",error_code:"operation_failed",completed_at:new Date().toISOString()}).eq("tenant_id",c.tenantId).eq("connection_id",c.id).eq("idempotency_key",key);
    throw error;
  }
}

export async function serveAutomotiveSourceApi(request:Request,connectionId:string){
  try{
    const c=connection(request,connectionId);
    if(request.headers.get("content-type")?.split(";")[0]!=="application/json")return response({error:"JSON content type required"},415);
    const raw=await request.text(); if(new TextEncoder().encode(raw).byteLength>262144)return response({error:"Request too large"},413);
    const body=requestSchema.parse(JSON.parse(raw));
    const client=db();

    if(body.operation==="vehicle.get"){
      requireScope(c,"vehicles:read");
      const p=z.object({vehicleId:z.string().uuid()}).strict().parse(body.payload);
      const {data,error}=await client.from("automotive_vehicles").select("*").eq("tenant_id",c.tenantId).eq("vehicle_id",p.vehicleId).maybeSingle();
      if(error)throw error;if(!data)return response({error:"Vehicle not found"},404);return response(data);
    }
    if(body.operation==="passport.get"){
      requireScope(c,"passports:read");
      const p=z.object({vehicleId:z.string().uuid()}).strict().parse(body.payload);
      const {data,error}=await client.from("automotive_passport_snapshots").select("snapshot_id,revision,passport,source_manifest,generated_at").eq("tenant_id",c.tenantId).eq("vehicle_id",p.vehicleId).order("revision",{ascending:false}).limit(1).maybeSingle();
      if(error)throw error;if(!data)return response({error:"Passport not found"},404);return response(data);
    }

    const key=request.headers.get("idempotency-key")??"";
    const result=await idempotent(client,c,key,body.operation,async()=>{
      if(body.operation==="vehicle.create"){
        requireScope(c,"vehicles:write");
        const parsed=vehicleIdentityBaseSchema.omit({tenantId:true,vehicleId:true}).superRefine((v,ctx)=>{if(!v.vrm&&!v.vin&&!v.chassisNumber)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Vehicle identifier required"});}).parse(body.payload);
        const {data,error}=await client.from("automotive_vehicles").insert({
          tenant_id:c.tenantId,origin:parsed.origin,vrm:parsed.vrm??null,vin:parsed.vin??null,chassis_number:parsed.chassisNumber??null,
          model_code:parsed.modelCode??null,make:parsed.make,model:parsed.model,derivative:parsed.derivative??null,first_registration_date:parsed.firstRegistrationDate??null,
        }).select("vehicle_id").single();
        if(error||!data)throw new Error("Unable to create vehicle");
        await queueAutomotiveEvent({tenantId:c.tenantId,product:c.product,type:"vehicle.created",subject:{vehicleId:data.vehicle_id},data:{origin:parsed.origin}});
        return {vehicleId:data.vehicle_id};
      }
      if(body.operation==="appraisal.create"){
        requireScope(c,"appraisals:write");
        const p=z.object({vehicleId:z.string().uuid(),requestedItems:z.array(z.string().min(1).max(120)).min(1).max(100),expiresAt:z.string().datetime().optional()}).strict().parse(body.payload);
        const {data,error}=await client.from("automotive_appraisals").insert({
          tenant_id:c.tenantId,vehicle_id:p.vehicleId,product:c.product,status:"capture_requested",requested_items:p.requestedItems,
          require_fresh_capture:true,allow_library_upload:false,capture_geolocation:false,expires_at:p.expiresAt??new Date(Date.now()+7*86400000).toISOString(),
        }).select("appraisal_id").single();
        if(error||!data)throw new Error("Unable to create appraisal");
        await queueAutomotiveEvent({tenantId:c.tenantId,product:c.product,type:"appraisal.created",subject:{vehicleId:p.vehicleId,appraisalId:data.appraisal_id},data:{captureGeolocation:false}});
        await queueAutomotiveEvent({tenantId:c.tenantId,product:c.product,type:"media.requested",subject:{vehicleId:p.vehicleId,appraisalId:data.appraisal_id},data:{requestedItems:p.requestedItems,captureGeolocation:false}});
        return {appraisalId:data.appraisal_id};
      }
      if(body.operation==="passport.snapshot"){
        requireScope(c,"passports:write");
        const p=z.object({vehicleId:z.string().uuid()}).strict().parse(body.payload);
        const [{data:vehicle},{data:evidence},{data:latest}]=await Promise.all([
          client.from("automotive_vehicles").select("*").eq("tenant_id",c.tenantId).eq("vehicle_id",p.vehicleId).maybeSingle(),
          client.from("automotive_evidence").select("evidence_id,kind,capture_item,sha256,received_at,source,location_captured").eq("tenant_id",c.tenantId).eq("vehicle_id",p.vehicleId).order("received_at",{ascending:true}),
          client.from("automotive_passport_snapshots").select("revision").eq("tenant_id",c.tenantId).eq("vehicle_id",p.vehicleId).order("revision",{ascending:false}).limit(1).maybeSingle(),
        ]);
        if(!vehicle)throw Object.assign(new Error("Vehicle not found"),{status:404});
        const revision=Number(latest?.revision??0)+1;
        const passport={schemaVersion:1,vehicle,evidence:evidence??[],generatedAt:new Date().toISOString()};
        const manifest=(evidence??[]).map((e:any)=>({type:"evidence",id:e.evidence_id,hash:e.sha256}));
        const {data,error}=await client.from("automotive_passport_snapshots").insert({tenant_id:c.tenantId,vehicle_id:p.vehicleId,revision,passport,source_manifest:manifest}).select("snapshot_id").single();
        if(error||!data)throw new Error("Unable to create passport");
        await queueAutomotiveEvent({tenantId:c.tenantId,product:c.product,type:"vehicle.passport.updated",subject:{vehicleId:p.vehicleId},data:{revision,snapshotId:data.snapshot_id}});
        return {snapshotId:data.snapshot_id,revision};
      }
      throw Object.assign(new Error("Unsupported operation"),{status:422});
    });
    return response(result);
  }catch(error){
    const status=typeof error==="object"&&error&&"status" in error?Number((error as any).status):error instanceof z.ZodError?422:503;
    return response({error:[401,403,404,409,413,415,422].includes(status)?(error instanceof Error?error.message:"Request rejected"):"Automotive API unavailable"},[401,403,404,409,413,415,422,503].includes(status)?status:503);
  }
}
