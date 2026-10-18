import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Credential-gated SERVER route. The Python worker never receives a Supabase
// service-role key and cannot name a tenant or choose arbitrary URLs.
const uuid = z.string().uuid();
const workerRequest = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("claim") }),
  z.object({
    operation: z.literal("finish"),
    jobId: uuid,
    leaseToken: uuid,
    success: z.boolean(),
    title: z.string().max(200).nullable().default(null),
    content: z.string().max(50000).nullable().default(null),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
    httpStatus: z.number().int().min(100).max(599).nullable().default(null),
    failure: z.string().max(300).nullable().default(null),
  }),
]);
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: {
    "cache-control": "no-store", "x-content-type-options": "nosniff",
  } });
}
function authorised(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied, "utf8"), Buffer.from(secret, "utf8"));
}

export async function serveWebIntelWorker(request: Request) {
  const secret = process.env.WEB_INTELLIGENCE_WORKER_SECRET ?? "";
  if (secret.length < 32) return response({ error: "Worker not configured" }, 503);
  if (!authorised(request, secret)) return response({ error: "Unauthorized" }, 401);
  if (Number(request.headers.get("content-length") || "0") > 100000) {
    return response({ error: "Request too large" }, 413);
  }

  let input: z.infer<typeof workerRequest>;
  try {
    const raw = await request.text();
    if (raw.length > 100000) return response({ error: "Request too large" }, 413);
    input = workerRequest.parse(JSON.parse(raw));
  } catch {
    return response({ error: "Invalid worker payload" }, 422);
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (input.operation === "claim") {
      const result = await db.rpc("claim_web_intel_job");
      if (result.error) throw new Error("claim_failed");
      return response({ job: result.data ?? null });
    }
    if (input.success) {
      if (!input.content || !input.contentSha256 || !input.httpStatus
        || input.httpStatus < 200 || input.httpStatus > 299) {
        return response({ error: "Missing verified evidence" }, 422);
      }
      const digest = createHash("sha256").update(input.content, "utf8").digest("hex");
      if (digest !== input.contentSha256) return response({ error: "Evidence hash mismatch" }, 422);
    }
    const result = await db.rpc("finish_web_intel_job", {
      _job: input.jobId,
      _lease: input.leaseToken,
      _success: input.success,
      _title: input.title,
      _content: input.success ? input.content : null,
      _sha256: input.success ? input.contentSha256 : null,
      _http_status: input.httpStatus,
      _failure: input.success ? null : (input.failure || "worker_failed"),
    });
    if (result.error) return response({ error: "Job lease or evidence rejected" }, 409);
    return response({ receipt: result.data });
  } catch {
    return response({ error: "Worker service unavailable" }, 503);
  }
}
