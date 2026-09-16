import { createHmac, randomUUID } from "node:crypto";

export async function callTransformation(
  identity: { tenant: string; user: string; tenant_role: string },
  request: { command: string; project_id?: string; data: Record<string, unknown> },
): Promise<unknown> {
  const key = process.env.TRANSFORMATION_SIGNING_KEY;
  const base = process.env.TRANSFORMATION_URL;
  if (!key || key.length < 32 || !base) throw new Error("Transformation service has not been configured");
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) {
    throw new Error("Invalid transformation service URL");
  }
  if (url.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("A remote transformation service requires HTTPS");
  }
  const raw = JSON.stringify(request);
  if (Buffer.byteLength(raw) > 1048576) throw new Error("Split this import into smaller batches (maximum 1 MiB)");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const context = Buffer.from(JSON.stringify(identity)).toString("base64url");
  const signature = createHmac("sha256", key).update(`${timestamp}\n${nonce}\n${context}\n${raw}`).digest("hex");
  const response = await fetch(base.replace(/\/$/, "") + "/rpc", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
    headers: { "Content-Type": "application/json", "X-OQ-Timestamp": timestamp,
      "X-OQ-Nonce": nonce, "X-OQ-Context": context, "X-OQ-Signature": signature },
    body: raw,
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = result && typeof result === "object" && "error" in result ? String(result.error) : "Transformation request failed";
    throw new Error(error);
  }
  return result;
}
