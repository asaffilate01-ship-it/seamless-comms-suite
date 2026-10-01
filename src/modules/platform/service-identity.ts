import { createHash, timingSafeEqual } from "node:crypto";

export type ServiceIdentityScope = {
  tenantId: string;
  productKey: string;
  brandIds?: string[];
  locationIds?: string[];
  capabilities: string[];
};

export type ServiceCredentialRecord = {
  id: string;
  keyId: string;
  secretHash: string;
  status: "active" | "disabled" | "expired";
  expiresAt?: string | null;
  scopes: ServiceIdentityScope[];
};

export function hashServiceSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifyServiceSecret(secret: string, expectedHash: string) {
  const actual = Buffer.from(hashServiceSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseServiceAuthorization(header: string | null) {
  if (!header?.startsWith("Bearer ")) throw new Error("Service authorization required");
  const token = header.slice(7);
  const separator = token.indexOf(".");
  if (separator < 1 || separator === token.length - 1) throw new Error("Invalid service credential");
  const keyId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(keyId) || secret.length < 32 || secret.length > 256) {
    throw new Error("Invalid service credential");
  }
  return { keyId, secret };
}

export function authoriseServiceScope(
  record: ServiceCredentialRecord,
  requested: {
    tenantId: string;
    productKey: string;
    brandId?: string | null;
    locationId?: string | null;
    capability: string;
  },
  now = new Date(),
) {
  if (record.status !== "active") throw new Error("Service credential is not active");
  if (record.expiresAt && Date.parse(record.expiresAt) <= now.getTime()) {
    throw new Error("Service credential expired");
  }
  const match = record.scopes.find((scope) =>
    scope.tenantId === requested.tenantId &&
    scope.productKey === requested.productKey &&
    (!requested.brandId || !scope.brandIds?.length || scope.brandIds.includes(requested.brandId)) &&
    (!requested.locationId || !scope.locationIds?.length || scope.locationIds.includes(requested.locationId)) &&
    scope.capabilities.includes(requested.capability)
  );
  if (!match) throw new Error("Service scope refused");
  return match;
}
