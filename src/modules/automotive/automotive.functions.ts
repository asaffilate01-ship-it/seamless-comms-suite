import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { automotiveAddon, automotiveProduct, vehicleIdentityBaseSchema } from "./contracts";
import { addonAvailability } from "./entitlements";
import { providerStatus } from "./provider-registry";
import { queueAutomotiveEvent } from "./event-bus.server";

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Automotive service is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function tenantRole(context: any, tenantId: string) {
  const { data, error } = await context.supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error || !data) throw new Error("You do not have access to this workspace");
  return data.role as string;
}

const tenantInput = z.object({ tenantId: z.string().uuid() });

export const getAutomotiveOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tenantInput)
  .handler(async ({ context, data }) => {
    await tenantRole(context, data.tenantId);
    const client = serviceClient();

    const [entitlements, vehicles, evidence, inbound, endpoints] = await Promise.all([
      client.from("automotive_addon_entitlements").select("product,addon,enabled,plan,usage_limit,starts_at,ends_at").eq("tenant_id", data.tenantId),
      client.from("automotive_vehicles").select("vehicle_id,origin,vrm,vin,chassis_number,make,model,derivative,updated_at").eq("tenant_id", data.tenantId).order("updated_at", { ascending: false }).limit(25),
      client.from("automotive_evidence").select("evidence_id,vehicle_id,kind,capture_item,received_at,source,location_captured").eq("tenant_id", data.tenantId).order("received_at", { ascending: false }).limit(25),
      client.from("automotive_inbound_events").select("event_id,product,event_type,occurred_at,status").eq("tenant_id", data.tenantId).order("received_at", { ascending: false }).limit(25),
      client.from("automotive_webhook_endpoints").select("endpoint_id,product,endpoint_url,enabled,subscribed_events,updated_at").eq("tenant_id", data.tenantId).order("updated_at", { ascending: false }),
    ]);

    const firstError = [entitlements, vehicles, evidence, inbound, endpoints].find((r) => r.error)?.error;
    if (firstError) throw new Error("Automotive data is unavailable. Apply the automotive migration and retry.");

    const products = automotiveProduct.options.map((product) => ({
      product,
      addons: automotiveAddon.options.map((addon) => {
        const configured = entitlements.data?.find((row: any) => row.product === product && row.addon === addon);
        const defaultMode = addonAvailability(product, addon);
        return {
          addon,
          mode: defaultMode,
          enabled: configured ? Boolean(configured.enabled) : defaultMode === "core",
          plan: configured?.plan ?? (defaultMode === "core" ? "core" : "addon"),
          usageLimit: configured?.usage_limit ?? null,
        };
      }),
    }));

    return {
      products,
      providers: providerStatus(),
      vehicles: vehicles.data ?? [],
      evidence: evidence.data ?? [],
      inboundEvents: inbound.data ?? [],
      webhookEndpoints: endpoints.data ?? [],
    };
  });

export const setAutomotiveAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    product: automotiveProduct,
    addon: automotiveAddon,
    enabled: z.boolean(),
  }))
  .handler(async ({ context, data }) => {
    const role = await tenantRole(context, data.tenantId);
    if (!["owner", "admin"].includes(role)) throw new Error("Workspace administrator access is required");

    const mode = addonAvailability(data.product, data.addon);
    if (mode === "core" && !data.enabled) throw new Error("Core automotive modules cannot be disabled");

    const client = serviceClient();
    const { error } = await client.from("automotive_addon_entitlements").upsert({
      tenant_id: data.tenantId,
      product: data.product,
      addon: data.addon,
      enabled: data.enabled,
      plan: mode === "core" ? "core" : "addon",
      starts_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,product,addon" });
    if (error) throw new Error("Unable to update automotive add-on");
    return { ok: true };
  });

export const registerAutomotiveVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    origin: z.enum(["uk", "japan", "other"]),
    vrm: z.string().trim().max(20).optional(),
    vin: z.string().trim().max(40).optional(),
    chassisNumber: z.string().trim().max(64).optional(),
    modelCode: z.string().trim().max(64).optional(),
    make: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(120),
    derivative: z.string().trim().max(160).optional(),
  }))
  .handler(async ({ context, data }) => {
    await tenantRole(context, data.tenantId);
    const parsed = vehicleIdentityBaseSchema.omit({ vehicleId: true }).superRefine((value, ctx) => {
      if (!value.vrm && !value.vin && !value.chassisNumber) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one vehicle identifier is required" });
    }).parse({
      tenantId: data.tenantId,
      origin: data.origin,
      vrm: data.vrm || undefined,
      vin: data.vin || undefined,
      chassisNumber: data.chassisNumber || undefined,
      modelCode: data.modelCode || undefined,
      make: data.make,
      model: data.model,
      derivative: data.derivative || undefined,
    });
    const client = serviceClient();
    const { data: row, error } = await client.from("automotive_vehicles").insert({
      tenant_id: parsed.tenantId,
      origin: parsed.origin,
      vrm: parsed.vrm ?? null,
      vin: parsed.vin ?? null,
      chassis_number: parsed.chassisNumber ?? null,
      model_code: parsed.modelCode ?? null,
      make: parsed.make,
      model: parsed.model,
      derivative: parsed.derivative ?? null,
    }).select("vehicle_id").single();
    if (error || !row) throw new Error("Unable to register vehicle");
    await queueAutomotiveEvent({ tenantId: data.tenantId, product: "zivvo", type: "vehicle.created", subject: { vehicleId: row.vehicle_id as string }, data: { origin: parsed.origin } });
    return { vehicleId: row.vehicle_id as string };
  });


export const createAutomotiveAppraisal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    product: automotiveProduct,
    vehicleId: z.string().uuid(),
    requestedItems: z.array(z.string().min(1).max(120)).min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  }))
  .handler(async ({ context, data }) => {
    await tenantRole(context, data.tenantId);
    const client = serviceClient();
    const { data: vehicle, error: vehicleError } = await client
      .from("automotive_vehicles").select("vehicle_id").eq("tenant_id",data.tenantId).eq("vehicle_id",data.vehicleId).maybeSingle();
    if (vehicleError || !vehicle) throw new Error("Vehicle not found");

    const { data: row, error } = await client.from("automotive_appraisals").insert({
      tenant_id: data.tenantId,
      vehicle_id: data.vehicleId,
      product: data.product,
      status: "capture_requested",
      requested_items: data.requestedItems,
      require_fresh_capture: true,
      allow_library_upload: false,
      capture_geolocation: false,
      expires_at: data.expiresAt ?? new Date(Date.now() + 7*24*60*60*1000).toISOString(),
      created_by: context.userId,
    }).select("appraisal_id").single();
    if (error || !row) throw new Error("Unable to create appraisal");

    await client.from("automotive_status_history").insert({
      tenant_id:data.tenantId,vehicle_id:data.vehicleId,appraisal_id:row.appraisal_id,
      entity_type:"appraisal",entity_id:row.appraisal_id,to_status:"capture_requested",
      reason:"Remote appraisal created",actor_type:"user",actor_id:context.userId,
    });

    await queueAutomotiveEvent({
      tenantId:data.tenantId,product:data.product,type:"appraisal.created",
      subject:{vehicleId:data.vehicleId,appraisalId:row.appraisal_id},
      data:{requestedItems:data.requestedItems,captureGeolocation:false,allowLibraryUpload:false},
    });
    await queueAutomotiveEvent({
      tenantId:data.tenantId,product:data.product,type:"media.requested",
      subject:{vehicleId:data.vehicleId,appraisalId:row.appraisal_id},
      data:{requestedItems:data.requestedItems,captureGeolocation:false},
    });
    return { appraisalId: row.appraisal_id as string };
  });

export const createVehiclePassportSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ tenantId:z.string().uuid(), product:automotiveProduct, vehicleId:z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await tenantRole(context,data.tenantId);
    const client=serviceClient();
    const [vehicle,evidence,appraisals,jobs] = await Promise.all([
      client.from("automotive_vehicles").select("*").eq("tenant_id",data.tenantId).eq("vehicle_id",data.vehicleId).maybeSingle(),
      client.from("automotive_evidence").select("evidence_id,kind,capture_item,sha256,received_at,provider_timestamp,source,location_captured").eq("tenant_id",data.tenantId).eq("vehicle_id",data.vehicleId).order("received_at",{ascending:true}),
      client.from("automotive_appraisals").select("appraisal_id,status,product,created_at,completed_at").eq("tenant_id",data.tenantId).eq("vehicle_id",data.vehicleId).order("created_at",{ascending:true}),
      client.from("automotive_provider_jobs").select("job_id,provider,capability,status,completed_at").eq("tenant_id",data.tenantId).eq("vehicle_id",data.vehicleId).order("created_at",{ascending:true}),
    ]);
    if(vehicle.error||!vehicle.data)throw new Error("Vehicle not found");
    const {data:latest}=await client.from("automotive_passport_snapshots").select("revision").eq("tenant_id",data.tenantId).eq("vehicle_id",data.vehicleId).order("revision",{ascending:false}).limit(1).maybeSingle();
    const revision=Number(latest?.revision??0)+1;
    const passport={
      schemaVersion:1,vehicle:vehicle.data,
      evidence:evidence.data??[],appraisals:appraisals.data??[],providerJobs:jobs.data??[],
      generatedAt:new Date().toISOString(),
    };
    const sourceManifest=[
      ...(evidence.data??[]).map((x:any)=>({type:"evidence",id:x.evidence_id,hash:x.sha256})),
      ...(jobs.data??[]).map((x:any)=>({type:"provider_job",id:x.job_id,status:x.status})),
    ];
    const {data:row,error}=await client.from("automotive_passport_snapshots").insert({
      tenant_id:data.tenantId,vehicle_id:data.vehicleId,revision,passport,source_manifest:sourceManifest,generated_by:context.userId,
    }).select("snapshot_id").single();
    if(error||!row)throw new Error("Unable to create vehicle passport snapshot");
    await queueAutomotiveEvent({tenantId:data.tenantId,product:data.product,type:"vehicle.passport.updated",subject:{vehicleId:data.vehicleId},data:{revision,snapshotId:row.snapshot_id}});
    return {snapshotId:row.snapshot_id as string,revision};
  });
