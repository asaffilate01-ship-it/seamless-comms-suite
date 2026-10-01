import { createHash, timingSafeEqual } from "node:crypto";
import { decideProvisioning } from "./provisioning-policy";

function secureEqual(a: string, b: string) {
  const aa = createHash("sha256").update(a).digest();
  const bb = createHash("sha256").update(b).digest();
  return timingSafeEqual(aa, bb);
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function serveProvisioningWorker(request: Request) {
  const expected = process.env.CONTROL_PLANE_WORKER_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 32) return json({ error: "Provisioning worker is not configured" }, 503);
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  if (!secureEqual(auth.slice(7), expected)) return json({ error: "Unauthorized" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: claimed, error: claimError } = await db.rpc("server_claim_provisioning_jobs", { _limit: 20 });
  if (claimError) return json({ error: claimError.message }, 503);

  const results: Array<{ id: string; outcome: string; reason: string }> = [];

  for (const job of claimed ?? []) {
    try {
      let product: any = null;
      let service: any = null;
      let connection: any = null;

      if (job.target_kind === "product") {
        const response = await db.from("product_catalogue")
          .select("product_key,deployment_mode,implementation_status,product_role")
          .eq("product_key", job.target_key).maybeSingle();
        if (response.error) throw new Error(response.error.message);
        product = response.data;
        const link = await db.from("product_connections")
          .select("product_key,external_tenant_id,status")
          .eq("tenant_id", job.tenant_id).eq("product_key", job.target_key)
          .eq("status", "connected").limit(1).maybeSingle();
        if (link.error) throw new Error(link.error.message);
        connection = link.data;
      } else if (job.target_kind === "service") {
        const response = await db.from("service_catalogue")
          .select("service_key,provisioning_mode,implementation_status,owner_product_key")
          .eq("service_key", job.target_key).maybeSingle();
        if (response.error) throw new Error(response.error.message);
        service = response.data;
      } else if (job.target_kind === "integration") {
        const [productKey, ...externalParts] = String(job.target_key).split(":");
        const externalTenantId = externalParts.join(":");
        const response = await db.from("product_connections")
          .select("product_key,external_tenant_id,status")
          .eq("tenant_id", job.tenant_id)
          .eq("product_key", productKey)
          .eq("external_tenant_id", externalTenantId)
          .maybeSingle();
        if (response.error) throw new Error(response.error.message);
        connection = response.data;
      }

      const decision = decideProvisioning({ job, product, service, connection });
      if (decision.outcome === "succeed") {
        const complete = await db.rpc("server_complete_provisioning_job", {
          _job: job.id,
          _succeeded: true,
          _detail: { worker: "omniqora-control-plane", reason: decision.reason },
          _error: null,
        });
        if (complete.error) throw new Error(complete.error.message);
      } else {
        const blocked = await db.rpc("server_block_provisioning_job", {
          _job: job.id,
          _reason: decision.reason,
          _detail: { worker: "omniqora-control-plane" },
        });
        if (blocked.error) throw new Error(blocked.error.message);
      }
      results.push({ id: job.id, outcome: decision.outcome, reason: decision.reason });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Provisioning worker failed";
      await db.rpc("server_complete_provisioning_job", {
        _job: job.id,
        _succeeded: false,
        _detail: { worker: "omniqora-control-plane" },
        _error: reason,
      });
      results.push({ id: job.id, outcome: "failed", reason });
    }
  }

  return json({ claimed: (claimed ?? []).length, results });
}
