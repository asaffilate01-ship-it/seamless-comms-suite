import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPracticeRequestFiles,
  uploadPracticeRequestFile,
  downloadPracticeRequestFile,
} from "./files.functions";
import { toast } from "sonner";
export function RequestFiles({ requestId, canUpload }: { requestId: string; canUpload: boolean }) {
  const list = useServerFn(listPracticeRequestFiles),
    upload = useServerFn(uploadPracticeRequestFile),
    download = useServerFn(downloadPracticeRequestFile),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ["practice-request-files", requestId];
  const query = useQuery({ queryKey: key, queryFn: () => list({ data: { requestId } }) });
  return (
    <div className="my-3 space-y-2 text-sm">
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data?.map((f: any) => (
        <button
          type="button"
          key={f.id}
          className="block text-left text-primary underline"
          onClick={async () => {
            try {
              const r = await download({ data: { fileId: f.id } });
              window.location.assign(r.url);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          {f.file_name} · {Math.ceil(f.size_bytes / 1024)} KB
        </button>
      ))}
      {canUpload && (
        <label className="block text-xs text-muted-foreground">
          Attach PDF, PNG, JPEG or CSV (max 5 MB)
          <input
            className="mt-2 block w-full text-sm"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.csv"
            disabled={busy}
            onChange={async (e) => {
              const input = e.currentTarget,
                file = input.files?.[0];
              if (!file) return;
              if (file.size > 5242880) {
                toast.error("Maximum file size is 5 MB");
                input.value = "";
                return;
              }
              setBusy(true);
              try {
                const base64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onerror = () => reject(new Error("Cannot read file"));
                  reader.onload = () => resolve(String(reader.result).split(",")[1]);
                  reader.readAsDataURL(file);
                });
                await upload({
                  data: {
                    requestId,
                    fileName: file.name,
                    mimeType: (file.name.toLowerCase().endsWith(".csv")
                      ? "text/csv"
                      : file.type) as any,
                    base64,
                  },
                });
                await cache.invalidateQueries({ queryKey: key });
                toast.success("File uploaded; submit your response when ready");
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setBusy(false);
                input.value = "";
              }
            }}
          />
          {busy && <span role="status">Uploading…</span>}
        </label>
      )}
    </div>
  );
}
