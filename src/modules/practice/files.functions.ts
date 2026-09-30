import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const bucket = "practice-request-files";
const requestSchema = z.object({ requestId: z.string().uuid() });
export const listPracticeRequestFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof requestSchema>) => requestSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("practice_request_files")
      .select("id,file_name,size_bytes,created_at")
      .eq("request_id", data.requestId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
const uploadSchema = requestSchema.extend({
  fileName: z.string().min(1).max(240),
  base64: z.string().min(4).max(6990508),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/csv"]),
});
export const uploadPracticeRequestFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof uploadSchema>) => uploadSchema.parse(i))
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { data: allowed, error } = await db.rpc("practice_request_access", {
      _request: data.requestId,
      _write: true,
    });
    if (error || !allowed) throw new Error("Open request and write access required");
    const { validatePracticeFile } = await import("./files.server");
    const bytes = validatePracticeFile(data.base64, data.mimeType);
    const { createHash, randomUUID } = await import("node:crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    // Private bucket is provisioned lazily, with no public object policies.
    const { data: existing, error: bucketError } = await admin.storage.getBucket(bucket);
    if (!existing) {
      if (bucketError && !String(bucketError.message).toLowerCase().includes("not found"))
        throw new Error("Private file storage unavailable");
      const { error: createError } = await admin.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "text/csv"],
      });
      if (createError && !String(createError.message).toLowerCase().includes("already exists"))
        throw new Error("Private file storage unavailable");
    } else if (existing.public) throw new Error("File storage must be private");
    const path = `${data.requestId}/${randomUUID()}`;
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: data.mimeType, upsert: false });
    if (uploadError) throw new Error("File upload failed");
    // Recheck access after the upload: revoked membership or a closed request must not gain a file reference.
    const check = await db.rpc("practice_request_access", {
      _request: data.requestId,
      _write: true,
    });
    if (check.error || !check.data) {
      await admin.storage.from(bucket).remove([path]);
      throw new Error("Request access changed");
    }
    const { data: row, error: insertError } = await admin
      .from("practice_request_files")
      .insert({
        request_id: data.requestId,
        storage_path: path,
        file_name: data.fileName.replace(/[\\/\r\n]/g, "_"),
        mime_type: data.mimeType,
        size_bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (insertError) {
      await admin.storage.from(bucket).remove([path]);
      throw new Error("File could not be recorded");
    }
    return row;
  });
export const downloadPracticeRequestFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { fileId: string }) => z.object({ fileId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: file, error } = await (context.supabase as any)
      .from("practice_request_files")
      .select("storage_path,file_name")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error || !file) throw new Error("File unavailable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error: linkError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(file.storage_path, 60, { download: file.file_name });
    if (linkError) throw new Error("Download unavailable");
    return { url: link.signedUrl };
  });
