export type TranslationBundle = Record<string, string>;

export type LocalisationLayer = {
  locale: string;
  fallbackLocale?: string | null;
  platform: TranslationBundle;
  product?: TranslationBundle;
  module?: Record<string, TranslationBundle>;
  tenant?: TranslationBundle;
};

export function mergeTranslations(layer: LocalisationLayer): TranslationBundle {
  const merged: TranslationBundle = { ...layer.platform };
  if (layer.product) Object.assign(merged, layer.product);
  for (const bundle of Object.values(layer.module ?? {})) Object.assign(merged, bundle);
  if (layer.tenant) Object.assign(merged, layer.tenant);
  return merged;
}

export function translate(bundle: TranslationBundle, key: string, fallback?: string): string {
  return bundle[key] ?? fallback ?? key;
}

export function isRtlLocale(locale: string): boolean {
  const language = locale.toLowerCase().split("-")[0];
  return ["ar","ur","fa","he"].includes(language);
}

/** AI may propose draft translations, but runtime bundles should prefer reviewed/approved entries. */
export type TranslationProposal = {
  locale: string;
  key: string;
  proposedValue: string;
  sourceLocale: string;
  sourceValue: string;
  modelRunId: string;
  status: "draft";
};