import type {
  SaveStudioBrand,
  SaveStudioCampaign,
  SaveStudioEvidence,
  StudioBrand,
  StudioCampaign,
  StudioEvidence,
  StudioGenerationResult,
  StudioRun,
  StudioScope,
  StudioWorkspace,
} from "./studio.types";

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

async function rpc<T>(db: RpcClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const scopeArgs = (scope: StudioScope) => ({ _tenant: scope.tenantId, _product: scope.productKey });

export const getStudioWorkspace = (db: RpcClient, scope: StudioScope) =>
  rpc<StudioWorkspace>(db, "growth_studio_workspace", scopeArgs(scope));

export const saveStudioBrand = (db: RpcClient, input: SaveStudioBrand) =>
  rpc<StudioBrand>(db, "growth_studio_save_brand", {
    ...scopeArgs(input),
    _id: input.id ?? null,
    _expected_revision: input.expectedRevision ?? null,
    _data: {
      name: input.name,
      voice: input.voice,
      offer: input.offer,
      rules: input.rules,
      audience: input.audience,
      locale: input.locale,
      disclosure: input.disclosure,
    },
  });

export const saveStudioEvidence = (db: RpcClient, input: SaveStudioEvidence) =>
  rpc<StudioEvidence>(db, "growth_studio_save_evidence", {
    ...scopeArgs(input),
    _id: input.id ?? null,
    _expected_revision: input.expectedRevision ?? null,
    _brand: input.brandId,
    _data: {
      title: input.title,
      content: input.content,
      sourceUrl: input.sourceUrl ?? null,
      kind: input.kind,
      validUntil: input.validUntil ?? null,
    },
  });

export const saveStudioCampaign = (db: RpcClient, input: SaveStudioCampaign) =>
  rpc<StudioCampaign>(db, "growth_studio_save_campaign", {
    ...scopeArgs(input),
    _id: input.id ?? null,
    _expected_revision: input.expectedRevision ?? null,
    _brand: input.brandId,
    _data: {
      title: input.title,
      objective: input.objective,
      channel: input.channel,
      locale: input.locale,
      evidenceIds: input.evidenceIds,
    },
  });

export const startStudioRun = (
  db: RpcClient,
  input: StudioScope & {
    campaignId: string;
    requestKey: string;
    writerBindingId: string | null;
    classifierBindingId: string | null;
    providerKey: string;
    model: string;
  },
) =>
  rpc<{ run: StudioRun; created: boolean; claimToken: string | null }>(
    db,
    "growth_studio_start_run",
    {
      ...scopeArgs(input),
      _campaign: input.campaignId,
      _request_key: input.requestKey,
      _writer_binding: input.writerBindingId,
      _classifier_binding: input.classifierBindingId,
      _provider: input.providerKey,
      _model: input.model,
    },
  );

export const getStudioRun = (db: RpcClient, input: StudioScope & { runId: string }) =>
  rpc<StudioRun>(db, "growth_studio_get_run", { ...scopeArgs(input), _run: input.runId });

/** Only call with a server-owned service client after startStudioRun authorises the actor. */
export const finishStudioRun = (
  db: RpcClient,
  input: StudioScope & {
    runId: string;
    claimToken: string;
    status: "completed" | "blocked" | "failed";
    result?: StudioGenerationResult | Record<string, unknown> | null;
    error?: string | null;
  },
) =>
  rpc<StudioRun>(db, "growth_studio_finish_run", {
    ...scopeArgs(input),
    _run: input.runId,
    _claim_token: input.claimToken,
    _status: input.status,
    _result: input.result ?? null,
    _error: input.error ?? null,
  });

export const reviewStudioRun = (
  db: RpcClient,
  input: StudioScope & {
    runId: string;
    expectedRevision: number;
    decision: "approved" | "rejected";
    note?: string;
  },
) =>
  rpc<StudioRun>(db, "growth_studio_review_run", {
    ...scopeArgs(input),
    _run: input.runId,
    _expected_revision: input.expectedRevision,
    _decision: input.decision,
    _note: input.note ?? "",
  });

export const handoffStudioRun = (
  db: RpcClient,
  input: StudioScope & {
    runId: string;
    expectedRevision?: number;
  },
) =>
  rpc<StudioRun>(db, "growth_studio_handoff_run", {
    ...scopeArgs(input),
    _run: input.runId,
    _expected_revision: input.expectedRevision ?? null,
  });
