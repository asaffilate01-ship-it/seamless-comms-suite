export type ProvisioningJobLike = {
  target_kind: "product" | "service" | "domain" | "branding" | "integration";
  target_key: string;
  action: string;
};

export type ProductCatalogueLike = {
  product_key: string;
  deployment_mode: string;
  implementation_status?: string | null;
  product_role?: string | null;
};

export type ServiceCatalogueLike = {
  service_key: string;
  provisioning_mode: string;
  implementation_status?: string | null;
  owner_product_key?: string | null;
};

export type ConnectionLike = {
  product_key: string;
  external_tenant_id: string;
  status: string;
};

export type ProvisioningDecision =
  | { outcome: "succeed"; reason: string }
  | { outcome: "block"; reason: string };

const implemented = (status?: string | null) =>
  status === "live_main" || status === "built_main";

export function decideProvisioning(input: {
  job: ProvisioningJobLike;
  product?: ProductCatalogueLike | null;
  service?: ServiceCatalogueLike | null;
  connection?: ConnectionLike | null;
}): ProvisioningDecision {
  const { job, product, service, connection } = input;

  if (job.target_kind === "branding") {
    return { outcome: "succeed", reason: "Branding is authoritative in the Omniqora control plane." };
  }

  if (job.target_kind === "domain") {
    return { outcome: "block", reason: "DNS ownership and SSL verification adapter is not configured yet." };
  }

  if (job.target_kind === "integration") {
    if (connection?.status === "connected") {
      return { outcome: "succeed", reason: "Product connector has been live-verified." };
    }
    return { outcome: "block", reason: "External product connector must be verified before activation." };
  }

  if (job.target_kind === "product") {
    if (!product) return { outcome: "block", reason: "Product catalogue entry is unavailable." };
    if (product.deployment_mode === "hosted" && implemented(product.implementation_status)) {
      return { outcome: "succeed", reason: "Hosted product is implemented on current main." };
    }
    if (connection?.status === "connected") {
      return { outcome: "succeed", reason: "External product workspace is connected and verified." };
    }
    return {
      outcome: "block",
      reason: "External product needs a connected workspace or product-specific provisioning adapter.",
    };
  }

  if (!service) return { outcome: "block", reason: "Service catalogue entry is unavailable." };
  if (!implemented(service.implementation_status)) {
    return {
      outcome: "block",
      reason:
        service.implementation_status === "draft_branch"
          ? "Service exists on a donor/draft branch but is not integrated into current main."
          : "Service is not implemented on current main.",
    };
  }
  if (service.provisioning_mode === "automatic" && service.owner_product_key === "omniqora") {
    return { outcome: "succeed", reason: "Shared Omniqora service is implemented and automatically provisionable." };
  }
  return {
    outcome: "block",
    reason: "Service needs an external/manual provisioning adapter before it can become active.",
  };
}
