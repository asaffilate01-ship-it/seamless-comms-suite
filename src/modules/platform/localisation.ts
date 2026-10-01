export type RegionPack = {
  region_key: string;
  country_code: string;
  currency: string;
  timezones: string[];
  supported_locales: string[];
  data_region: string;
  provider_preferences?: Record<string, string[]>;
};

export type LocalePack = {
  locale: string;
  language_code: string;
  country_code?: string | null;
  rtl: boolean;
  date_format?: string | null;
  number_format?: string | null;
  terminology?: Record<string, string>;
};

export function resolveRuntimeLocale(region: RegionPack, requested?: string | null) {
  const locale = requested || region.supported_locales[0];
  if (!locale || !region.supported_locales.includes(locale)) {
    throw new Error("Locale is not supported for this region");
  }
  return {
    locale,
    currency: region.currency,
    timezone: region.timezones[0] ?? "UTC",
    dataRegion: region.data_region,
  };
}
