import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DecideGrowthSetupInput,
  GrowthSetup,
  GrowthSetupInput,
  GrowthSetupRequest,
  GrowthWorkspacePage,
  RequestGrowthSetupInput,
  SaveGrowthWriterInput,
} from "./setup.contract";
import { growthCredentialName, loadGrowthProviders } from "./studio.providers.server";

type SetupContext = { userId: string; supabase: SupabaseClient };
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

async function rpc<T>(context: SetupContext, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await (context.supabase as unknown as RpcClient).rpc(name, args);
  if (result.error) {
    // SQL functions return bounded, deliberate user messages. Unexpected database
    // errors must not expose connection details or internal schema diagnostics.
    if (["42501", "22023", "23505", "40001", "55000", "P0002"].includes(result.error.code ?? "")) {
      throw new Error(result.error.message);
    }
    throw new Error("Growth setup could not be completed. Refresh and try again.");
  }
  return result.data as T;
}

export function listGrowthSetupWorkspaces(context: SetupContext, input: { offset: number; limit: number }) {
  return rpc<GrowthWorkspacePage>(context, "growth_setup_list_workspaces", {
    _offset: input.offset,
    _limit: input.limit,
  });
}

export async function loadGrowthSetup(context: SetupContext, input: GrowthSetupInput): Promise<GrowthSetup> {
  const setup = await rpc<Omit<GrowthSetup, "providers">>(context, "growth_setup_workspace", {
    _tenant: input.tenantId,
    _product: input.productKey,
    _include_creative: input.includeCreative,
  });
  // The RPC authorises scope before any provider metadata is returned. The
  // provider inspector only returns readiness, model and scoped setup guidance.
  const providers = await loadGrowthProviders(context.supabase, input);
  return { ...setup, providers };
}

export function submitGrowthSetup(context: SetupContext, input: RequestGrowthSetupInput) {
  return rpc<GrowthSetupRequest>(context, "growth_setup_request", {
    _tenant: input.tenantId,
    _product: input.productKey,
    _include_creative: input.includeCreative,
    _request_key: input.requestKey,
    _note: input.note,
  });
}

export function reviewGrowthSetup(context: SetupContext, input: DecideGrowthSetupInput) {
  return rpc<GrowthSetupRequest>(context, "growth_setup_decide", {
    _tenant: input.tenantId,
    _product: input.productKey,
    _request: input.requestId,
    _expected_revision: input.expectedRevision,
    _decision: input.decision,
    _note: input.note,
  });
}

export async function configureGrowthWriter(context: SetupContext, input: SaveGrowthWriterInput) {
  const environment = process.env.OMNIQORA_GROWTH_ENVIRONMENT || "production";
  if (!["production", "staging", "development"].includes(environment)) {
    throw new Error("The Growth deployment environment needs operator configuration.");
  }
  const requiredSecretName = growthCredentialName(input, input.providerKey);
  // SQL derives and checks the same fixed secret reference atomically. Neither
  // this operation nor its request accepts a secret value or arbitrary env name.
  const bindingId = await rpc<string>(context, "growth_setup_save_writer", {
    _tenant: input.tenantId,
    _product: input.productKey,
    _provider: input.providerKey,
    _environment: environment,
    _model: input.model,
    _max_tokens: input.maxOutputTokens,
  });
  const providers = await loadGrowthProviders(context.supabase, input);
  const provider = providers.find((candidate) => candidate.id === bindingId);
  if (!provider) throw new Error("Writer settings were saved. Refresh to check provider readiness.");
  return { bindingId, provider, requiredSecretName, environment };
}
