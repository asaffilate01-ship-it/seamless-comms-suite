/**
 * Browser-side locale detection.
 * German-speaking visitors (e.g. Germany, Austria, Switzerland) get German,
 * everyone else defaults to English. Turkish, Arabic and Ukrainian are also
 * detected for the promo site.
 */
export type DetectedLang = "de" | "en" | "tr" | "ar" | "uk";

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
    if (tag.startsWith("uk")) return "uk";
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
