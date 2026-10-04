export type RuntimeSignal = {
  configured: boolean;
  valid: boolean;
};

export type CountryRuntimePreflight = {
  functionUrl: RuntimeSignal;
  appUrl: RuntimeSignal;
  provisioningSecret: RuntimeSignal;
  syncSecret: RuntimeSignal;
  provisioningReady: boolean;
  bridgeReady: boolean;
};

export type HaccoraRuntimePreflight = {
  checkedAt: string;
  publicUrl: RuntimeSignal;
  workerSecret: RuntimeSignal;
  schedulerRuntimeReady: boolean;
  countries: {
    GB: CountryRuntimePreflight;
    DE: CountryRuntimePreflight;
  };
  readyForUkProvisioning: boolean;
  readyForDeProvisioning: boolean;
  missing: string[];
  note: string;
};

type Env = Record<string, string | undefined>;

function httpsSignal(env: Env, key: string): RuntimeSignal {
  const value = env[key]?.trim() ?? "";
  if (!value) return { configured: false, valid: false };
  try {
    return { configured: true, valid: new URL(value).protocol === "https:" };
  } catch {
    return { configured: true, valid: false };
  }
}

function secretSignal(env: Env, key: string): RuntimeSignal {
  const value = env[key] ?? "";
  return { configured: value.length > 0, valid: value.length >= 32 };
}

function countrySignals(env: Env, prefix: "HACCORA_UK" | "HACCORA_DE"): CountryRuntimePreflight {
  const functionUrl = httpsSignal(env, `${prefix}_FUNCTION_URL`);
  const appUrl = httpsSignal(env, `${prefix}_APP_URL`);
  const provisioningSecret = secretSignal(env, `${prefix}_PROVISIONING_SECRET`);
  const syncSecret = secretSignal(env, `${prefix}_SYNC_SECRET`);
  return {
    functionUrl,
    appUrl,
    provisioningSecret,
    syncSecret,
    provisioningReady: functionUrl.valid && appUrl.valid && provisioningSecret.valid,
    bridgeReady: functionUrl.valid && syncSecret.valid,
  };
}

export function getHaccoraRuntimePreflight(env: Env = process.env): HaccoraRuntimePreflight {
  const publicUrl = httpsSignal(env, "OMNIQORA_PUBLIC_URL");
  const workerSecret = secretSignal(env, "CONTROL_PLANE_WORKER_SECRET");
  const GB = countrySignals(env, "HACCORA_UK");
  const DE = countrySignals(env, "HACCORA_DE");

  const requirements: Array<[string, boolean]> = [
    ["OMNIQORA_PUBLIC_URL", publicUrl.valid],
    ["CONTROL_PLANE_WORKER_SECRET", workerSecret.valid],
    ["HACCORA_UK_FUNCTION_URL", GB.functionUrl.valid],
    ["HACCORA_UK_APP_URL", GB.appUrl.valid],
    ["HACCORA_UK_PROVISIONING_SECRET", GB.provisioningSecret.valid],
    ["HACCORA_UK_SYNC_SECRET", GB.syncSecret.valid],
    ["HACCORA_DE_FUNCTION_URL", DE.functionUrl.valid],
    ["HACCORA_DE_APP_URL", DE.appUrl.valid],
    ["HACCORA_DE_PROVISIONING_SECRET", DE.provisioningSecret.valid],
    ["HACCORA_DE_SYNC_SECRET", DE.syncSecret.valid],
  ];

  return {
    checkedAt: new Date().toISOString(),
    publicUrl,
    workerSecret,
    schedulerRuntimeReady: publicUrl.valid && workerSecret.valid,
    countries: { GB, DE },
    readyForUkProvisioning: publicUrl.valid && GB.provisioningReady,
    readyForDeProvisioning: publicUrl.valid && DE.provisioningReady,
    missing: requirements.filter(([, valid]) => !valid).map(([name]) => name),
    note:
      "This checks server runtime configuration only. GitHub's PROVISIONING_WORKER_ENABLED switch and external AI provider credentials are intentionally not exposed to the application runtime.",
  };
}
