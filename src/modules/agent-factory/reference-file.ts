import { z } from "zod";

export const referenceFileLimit = 8192;
export const requestReference = z.string().uuid();
/** Untrusted local file: coordinates only, never authorisation or task input. */
export function parseReferenceFile(text: string, scope: { tenantId: string; productKey: string }) {
  if (new TextEncoder().encode(text).length > referenceFileLimit)
    throw new Error("Reference file is too large (maximum 8 KB).");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "Omniqora queue request reference")
    throw new Error("Choose an Omniqora queue reference text file.");
  function field(label: string) {
    const matches = lines.filter((line) => line.startsWith(`${label}:`));
    if (matches.length !== 1) throw new Error("Reference file has missing or duplicate fields.");
    return matches[0].slice(label.length + 1).trim();
  }
  const requestId = requestReference.safeParse(field("Request reference"));
  const tenantId = requestReference.safeParse(field("Workspace ID"));
  const productKey = field("Product");
  if (!requestId.success || !tenantId.success || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(productKey))
    throw new Error("Reference file contains invalid identifiers.");
  if (
    tenantId.data.toLowerCase() !== scope.tenantId.toLowerCase() ||
    productKey !== scope.productKey
  )
    throw new Error(
      "This reference belongs to a different workspace or product. Open the matching workspace before importing.",
    );
  return requestId.data;
}
