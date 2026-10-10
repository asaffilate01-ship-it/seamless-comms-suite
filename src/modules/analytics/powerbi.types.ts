export type BiChoice = {key: string; label: string};
export type BiModel = BiChoice & {
  workspaceId: string; datasetId: string; date: {table: string; column: string};
  measures: (BiChoice & {table: string; name: string; kind: 'additive' | 'nonadditive'; unit: 'number' | 'currency' | 'ratio'; blankAsZero: boolean})[];
  dimensions: (BiChoice & {table: string; column: string})[];
};
export type BiPublicModel = BiChoice & {measures: (BiChoice & {unit: string})[]; dimensions: BiChoice[]};
export type BiConfig = {entraTenantId: string; clientId: string; clientSecretEnv: string; redirectUri: string; models: BiModel[]; revision: string};
export type BiRequest = {modelKey: string; metricKey: string; dimensionKey?: string | null; currentStart: string; currentEnd: string; previousStart: string; previousEnd: string; maxSegments?: number};
export type BiValues = {current: number; previous: number; change: number; percentChange: number | null};
export type BiInvestigation = {
  metric: string; unit: string; periodDays: number; total: BiValues; segments: (BiValues & {segment: string})[];
  reconciliation: {status: string; currentDifference: number | null; previousDifference: number | null; tolerance: number | null};
  contributionEligible: boolean; percentagePointChange: number | null; warnings: string[]; narrative: string;
  evidence: {source: string; compilerVersion: string; modelKey: string; metricKey: string; dimensionKey: string | null; workspaceId: string; datasetId: string; queryHash: string; configurationRevision: string; retrievedAt: string;
    providerRequestId: string; currentPeriod: string[]; previousPeriod: string[]; rowCount: number; permissionMode: string; protectionLabel: string | null};
};
