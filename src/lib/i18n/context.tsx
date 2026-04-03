"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import type { ReactNode } from "react";

import itLocale from "./locales/it.json";
import enLocale from "./locales/en.json";

/* ------------------------------------------------------------------ */
/*  Utilities                                                         */
/* ------------------------------------------------------------------ */

function flattenKeys(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenKeys(value as Record<string, unknown>, fullKey)
      );
    } else {
      result[fullKey] = String(value);
    }
  }

  return result;
}

export function localeToLang(locale: string): "it" | "en" {
  const prefix = locale.split("-")[0].toLowerCase();
  if (prefix === "en") return "en";
  return "it";
}

/* ------------------------------------------------------------------ */
/*  Pre-computed flat dictionaries                                    */
/* ------------------------------------------------------------------ */

const dictionaries: Record<"it" | "en", Record<string, string>> = {
  it: flattenKeys(itLocale as unknown as Record<string, unknown>),
  en: flattenKeys(enLocale as unknown as Record<string, unknown>),
};

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

interface I18nContextValue {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  lang: "it" | "en";
}

const I18nContext = createContext<I18nContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

interface I18nProviderProps {
  locale: string;
  children: ReactNode;
}

export function I18nProvider({ locale, children }: I18nProviderProps) {
  const lang = localeToLang(locale);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text =
        dictionaries[lang][key] ?? dictionaries["it"][key] ?? key;

      if (params) {
        for (const [param, value] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${param}\\}`, "g"), String(value));
        }
      }

      return text;
    },
    [lang]
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({ t, locale, lang }),
    [t, locale, lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return ctx;
}
