import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Save only lookup coordinates, never task payloads or credentials. */
export function QueueReferenceActions({
  tenantId,
  productKey,
  requestId,
}: {
  tenantId: string;
  productKey: string;
  requestId: string;
}) {
  const [notice, setNotice] = useState("");
  const [copying, setCopying] = useState(false);
  async function copy() {
    setCopying(true);
    setNotice("");
    try {
      await navigator.clipboard.writeText(requestId);
      setNotice("Request reference copied.");
    } catch {
      setNotice("Copy unavailable. Select the reference above or download it instead.");
    } finally {
      setCopying(false);
    }
  }
  function download() {
    let url: string | undefined;
    try {
      const text = [
        "Omniqora queue request reference",
        "",
        `Request reference: ${requestId}`,
        `Workspace ID: ${tenantId}`,
        `Product: ${productKey}`,
        "",
        "Open this workspace and product, choose Find an earlier queue request, and paste the request reference.",
        "This reference is not a credential or proof that a task was accepted, completed or billed.",
        "Lookup requires current workspace access. This file cannot retry or cancel a task.",
        "",
      ].join("\n");
      url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "omniqora-queue-reference.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setNotice("Reference download requested. Keep the file for later lookup.");
    } catch {
      setNotice("Download unavailable. Select and save the reference above.");
    } finally {
      if (url) {
        const savedUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(savedUrl), 1000);
      }
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={copying}
          onClick={() => void copy()}
        >
          {copying ? "Copying…" : "Copy request reference"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={download}>
          Download reference
        </Button>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
