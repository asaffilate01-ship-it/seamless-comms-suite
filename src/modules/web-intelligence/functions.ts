import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminRole, requireService, requireTenantMembership } from "@/modules/platform/access";

// All reads use the request's user-scoped Supabase client (RLS applies).
// Source approval and work submission are re-authorised inside narrow SQL RPCs.
const uuid = z.string().uuid();
const scope = z.object({ tenantId: uuid, productKey: z.string().min(2).max(80) });
const category = z.enum(["food", "regulatory", "education", "automotive", "other"]);

export type WebIntelSource = {
  id: string;
  name: string;
  url: string;
  hostname: string;
  category: string;
  purpose: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  requested_by?: string;
  created_at: string;
};
export type WebIntelJob = {
  id: string;
  source_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  created_at: string;
  completed_at: string | null;
  http_status: number | null;
  failure_reason: string | null;
};
export type WebIntelDocument = {
  id: string;
  job_id: string;
  source_url: string;
  title: string;
  content_sha256: string;
  captured_at: string;
  trust_level: string;
  preview: string;
};
export type WebIntelMonitor = {
  id: string;
  tenant_id: string;
  product_key: string;
  source_id: string;
  enabled: boolean;
  interval_hours: 24 | 72 | 168;
  retention_days: 7 | 30 | 90;
  next_due_at: string | null;
  last_enqueued_at: string | null;
  last_observed_at: string | null;
  updated_at: string;
};
export type WebIntelChange = {
  id: string;
  job_id: string;
  source_id: string;
  change_kind: "initial" | "changed" | "unchanged";
  previous_sha256: string | null;
  current_sha256: string;
  detected_at: string;
};
export type WebIntelWorkspace = {
  entitled: boolean;
  isPlatformAdmin: boolean;
  sources: WebIntelSource[];
  reviews: WebIntelSource[];
  jobs: WebIntelJob[];
  documents: WebIntelDocument[];
  monitors: WebIntelMonitor[];
  changes: WebIntelChange[];
};

export const getWebIntelWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.parse(input))
  .handler(async ({ context, data }): Promise<WebIntelWorkspace> => {
    await requireTenantMembership(context, data.tenantId);
    const db = context.supabase as any;
    const [platform, entitlement] = await Promise.all([
      db.rpc("is_platform_admin", { _user: context.userId }),
      db.rpc("has_tenant_entitlement", {
        _tenant: data.tenantId,
        _service: "omniqora.web-intelligence",
      }),
    ]);
    if (platform.error || entitlement.error) throw new Error("Web Intelligence access check unavailable");
    const isPlatformAdmin = platform.data === true;

    const [sources, jobs, documents, reviews, monitors, changes] = await Promise.all([
      db.from("web_intel_sources")
        .select("id,name,url,hostname,category,purpose,status,created_at")
        .eq("status", "approved").order("name").limit(100),
      db.from("web_intel_jobs")
        .select("id,source_id,status,created_at,completed_at,http_status,failure_reason")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .order("created_at", { ascending: false }).limit(25),
      db.from("web_intel_documents")
        .select("id,job_id,source_url,title,content_sha256,captured_at,trust_level,content_text")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .order("captured_at", { ascending: false }).limit(10),
      isPlatformAdmin
        ? db.from("web_intel_sources")
            .select("id,name,url,hostname,category,purpose,status,requested_by,created_at")
            .in("status", ["pending", "approved"])
            .order("created_at", { ascending: false }).limit(60)
        : Promise.resolve({ data: [], error: null }),
      db.from("web_intel_monitors")
        .select("id,tenant_id,product_key,source_id,enabled,interval_hours,retention_days,next_due_at,last_enqueued_at,last_observed_at,updated_at")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .order("updated_at", { ascending: false }).limit(30),
      db.from("web_intel_changes")
        .select("id,job_id,source_id,change_kind,previous_sha256,current_sha256,detected_at")
        .eq("tenant_id", data.tenantId).eq("product_key", data.productKey)
        .order("detected_at", { ascending: false }).limit(30),
    ]);
    for (const result of [sources, jobs, documents, reviews, monitors, changes]) {
      if (result.error) throw new Error("Web Intelligence data is unavailable");
    }
    return {
      entitled: entitlement.data === true,
      isPlatformAdmin,
      sources: (sources.data ?? []) as WebIntelSource[],
      reviews: (reviews.data ?? []) as WebIntelSource[],
      jobs: (jobs.data ?? []) as WebIntelJob[],
      monitors: (monitors.data ?? []) as WebIntelMonitor[],
      changes: (changes.data ?? []) as WebIntelChange[],
      documents: ((documents.data ?? []) as Array<Record<string, unknown>>).map((doc) => ({
        id: String(doc.id),
        job_id: String(doc.job_id),
        source_url: String(doc.source_url),
        title: String(doc.title),
        content_sha256: String(doc.content_sha256),
        captured_at: String(doc.captured_at),
        trust_level: String(doc.trust_level),
        preview: String(doc.content_text ?? "").slice(0, 1000),
      })),
    };
  });

export const requestWebIntelSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.extend({
    sourceId: uuid,
    idempotencyKey: uuid,
  }).parse(input))
  .handler(async ({ context, data }) => {
    const access = await requireService(context, data.tenantId, "omniqora.web-intelligence");
    requireAdminRole(access.role);
    const result = await (context.supabase as any).rpc("queue_web_intel_job", {
      _tenant: data.tenantId,
      _product: data.productKey,
      _source: data.sourceId,
      _idempotency: data.idempotencyKey,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as WebIntelJob;
  });

export const proposeWebIntelSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    name: z.string().trim().min(3).max(160),
    category,
    url: z.string().url().max(700),
    purpose: z.string().trim().min(16).max(500),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const admin = await (context.supabase as any).rpc("is_platform_admin", { _user: context.userId });
    if (admin.error || admin.data !== true) throw new Error("Platform administrator required");
    const url = new URL(data.url);
    // No credentials, ports, fragments, IP literals or non-HTTPS schemes.
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash
      || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url.hostname)
      || /(^|\.)(localhost|local|internal)$/.test(url.hostname)
      || /^[0-9.]+$/.test(url.hostname)) {
      throw new Error("Only public HTTPS sources can be proposed");
    }
    const result = await (context.supabase as any).rpc("propose_web_intel_source", {
      _name: data.name,
      _category: data.category,
      _url: url.href,
      _purpose: data.purpose,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as WebIntelSource;
  });

export const reviewWebIntelSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    sourceId: uuid,
    decision: z.enum(["approved", "rejected", "revoked"]),
    note: z.string().trim().min(16).max(1000),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const admin = await (context.supabase as any).rpc("is_platform_admin", { _user: context.userId });
    if (admin.error || admin.data !== true) throw new Error("Platform reviewer required");
    const result = await (context.supabase as any).rpc("review_web_intel_source", {
      _source: data.sourceId, _decision: data.decision, _note: data.note,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as WebIntelSource;
  });

/** The server does not trust client tenant ID, role, entitlements or source approvals.
 * Those checks are repeated inside the narrow PostgreSQL RPC before mutation.
 * Newly configured monitors default to paused unless explicitly enabled.
 */
export const configureWebIntelMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.extend({
    sourceId: uuid,
    intervalHours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
    retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    enabled: z.boolean(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const access = await requireService(context, data.tenantId, "omniqora.web-intelligence");
    requireAdminRole(access.role);
    const result = await (context.supabase as any).rpc("configure_web_intel_monitor", {
      _tenant: data.tenantId,
      _product: data.productKey,
      _source: data.sourceId,
      _interval_hours: data.intervalHours,
      _retention_days: data.retentionDays,
      _enabled: data.enabled,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as WebIntelMonitor;
  });
