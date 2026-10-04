import { resolveTxt as resolveDnsTxt } from "node:dns/promises";

export type DomainVerificationEvidence = {
  dnsVerified: boolean;
  sslActive: boolean;
  observedTxt: string[];
  httpStatus: number | null;
  failureReason: string | null;
};

type Dependencies = {
  resolveTxt?: typeof resolveDnsTxt;
  fetch?: typeof globalThis.fetch;
};

export async function verifyDomainOwnership(
  input: { domain: string; recordName: string; recordValue: string },
  dependencies: Dependencies = {},
): Promise<DomainVerificationEvidence> {
  const resolveTxt = dependencies.resolveTxt ?? resolveDnsTxt;
  const request = dependencies.fetch ?? globalThis.fetch;
  let observedTxt: string[] = [];

  try {
    const records = await resolveTxt(input.recordName);
    observedTxt = records.map((parts) => parts.join(""));
  } catch {
    return {
      dnsVerified: false,
      sslActive: false,
      observedTxt,
      httpStatus: null,
      failureReason: "DNS TXT challenge has not propagated yet",
    };
  }

  if (!observedTxt.includes(input.recordValue)) {
    return {
      dnsVerified: false,
      sslActive: false,
      observedTxt,
      httpStatus: null,
      failureReason: "DNS TXT challenge does not match",
    };
  }

  try {
    const response = await request(`https://${input.domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "Omniqora-Domain-Verifier/1.0" },
    });
    const sslActive = response.status >= 100 && response.status < 500;
    return {
      dnsVerified: true,
      sslActive,
      observedTxt,
      httpStatus: response.status,
      failureReason: sslActive ? null : `HTTPS endpoint returned ${response.status}`,
    };
  } catch {
    return {
      dnsVerified: true,
      sslActive: false,
      observedTxt,
      httpStatus: null,
      failureReason: "DNS ownership verified; HTTPS certificate or route is not active yet",
    };
  }
}
