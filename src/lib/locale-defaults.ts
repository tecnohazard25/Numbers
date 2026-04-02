export interface LocaleDefaults {
  currency: string;
  date_format: string;
  time_format: string;
  decimal_separator: string;
  thousands_separator: string;
}

export const SUPPORTED_LOCALES: { value: string; label: string }[] = [
  { value: "it-IT", label: "Italiano (Italia)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "fr-FR", label: "Français (France)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "pl-PL", label: "Polski" },
  { value: "ro-RO", label: "Română" },
];

export const LOCALE_DEFAULTS: Record<string, LocaleDefaults> = {
  "it-IT": {
    currency: "EUR",
    date_format: "dd/MM/yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: ".",
  },
  "en-US": {
    currency: "USD",
    date_format: "MM/dd/yyyy",
    time_format: "hh:mm a",
    decimal_separator: ".",
    thousands_separator: ",",
  },
  "en-GB": {
    currency: "GBP",
    date_format: "dd/MM/yyyy",
    time_format: "HH:mm",
    decimal_separator: ".",
    thousands_separator: ",",
  },
  "de-DE": {
    currency: "EUR",
    date_format: "dd.MM.yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: ".",
  },
  "fr-FR": {
    currency: "EUR",
    date_format: "dd/MM/yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: " ",
  },
  "es-ES": {
    currency: "EUR",
    date_format: "dd/MM/yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: ".",
  },
  "pt-BR": {
    currency: "BRL",
    date_format: "dd/MM/yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: ".",
  },
  "nl-NL": {
    currency: "EUR",
    date_format: "dd-MM-yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: ".",
  },
  "pl-PL": {
    currency: "PLN",
    date_format: "dd.MM.yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: " ",
  },
  "ro-RO": {
    currency: "RON",
    date_format: "dd.MM.yyyy",
    time_format: "HH:mm",
    decimal_separator: ",",
    thousands_separator: ".",
  },
};

export function getLocaleDefaults(locale: string): LocaleDefaults {
  return (
    LOCALE_DEFAULTS[locale] ??
    LOCALE_DEFAULTS["it-IT"]
  );
}

export function detectBrowserLocale(): string {
  if (typeof navigator === "undefined") return "it-IT";
  const browserLang = navigator.language;
  // Exact match
  if (LOCALE_DEFAULTS[browserLang]) return browserLang;
  // Partial match (e.g. "it" → "it-IT")
  const prefix = browserLang.split("-")[0];
  const match = Object.keys(LOCALE_DEFAULTS).find((k) =>
    k.startsWith(prefix)
  );
  return match ?? "it-IT";
}

export const CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "BRL", "PLN", "RON", "SEK", "NOK", "DKK", "CZK", "HUF",
];
