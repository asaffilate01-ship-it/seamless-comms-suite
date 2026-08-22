/**
 * Browser-side locale detection.
 * German-speaking visitors (e.g. Germany, Austria, Switzerland) get German,
 * everyone else defaults to English. Turkish, Arabic and French are also
 * detected for the promo site.
 */
export type DetectedLang = "de" | "en" | "tr" | "ar" | "fr";

const GERMAN_TIMEZONES = ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "Europe/Busingen"];

function tags(): string[] {
  if (typeof navigator === "undefined") return [];
  const list = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  return list.filter(Boolean).map((l) => l.toLowerCase());
}

export function detectLang(): DetectedLang {
  const all = tags();
  for (const tag of all) {
    if (tag.startsWith("de")) return "de";
    if (tag.startsWith("tr")) return "tr";
    if (tag.startsWith("ar")) return "ar";
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("en")) return "en";
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && GERMAN_TIMEZONES.includes(tz)) return "de";
  } catch {
    /* ignore */
  }
  return "en";
}

/* ---------------------------------------------------------------------------
 * Region / currency geofencing.
 * UK -> GBP, Eurozone & wider Europe -> EUR, UAE -> AED, Pakistan -> PKR,
 * USA and rest of world -> USD.
 * ------------------------------------------------------------------------- */

export type DetectedCurrency = "GBP" | "EUR" | "USD" | "AED" | "PKR";

const EUR_TIMEZONE_PREFIXES = ["Europe/", "Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Azores"];
const NON_EUR_EUROPE_TZ = ["Europe/London", "Europe/Belfast", "Europe/Guernsey", "Europe/Jersey", "Europe/Isle_of_Man"];
const UK_TIMEZONES = NON_EUR_EUROPE_TZ;

/** Region code (ISO 3166 alpha-2) from browser language tags, e.g. en-GB -> GB. */
function regionFromLanguages(): string | null {
  for (const tag of tags()) {
    const parts = tag.split("-");
    const region = parts.find((p) => p.length === 2 && /^[a-z]{2}$/.test(p) && p !== parts[0]);
    if (region) return region.toUpperCase();
  }
  return null;
}

function timeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function detectCurrency(): DetectedCurrency {
  const region = regionFromLanguages();
  if (region === "GB") return "GBP";
  if (region === "AE") return "AED";
  if (region === "PK") return "PKR";
  if (region === "US" || region === "CA" || region === "AU" || region === "NZ") return "USD";

  const tz = timeZone();
  if (tz) {
    if (UK_TIMEZONES.includes(tz)) return "GBP";
    if (tz === "Asia/Dubai") return "AED";
    if (tz === "Asia/Karachi") return "PKR";
    if (EUR_TIMEZONE_PREFIXES.some((p) => tz.startsWith(p))) return "EUR";
    if (tz.startsWith("America/")) return "USD";
  }

  const EUR_REGIONS = [
    "DE","AT","FR","IT","ES","PT","NL","BE","LU","IE","FI","EE","LV","LT","SK","SI","GR","CY","MT","HR",
    "PL","CZ","HU","RO","BG","SE","DK","NO","CH","UA","TR",
  ];
  if (region && EUR_REGIONS.includes(region)) return "EUR";
  return "USD";
}
