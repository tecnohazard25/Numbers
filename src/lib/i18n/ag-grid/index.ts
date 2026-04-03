import { AG_GRID_LOCALE_IT } from "./it";
import { AG_GRID_LOCALE_EN } from "./en";

const AG_GRID_LOCALES: Record<string, Record<string, string>> = {
  it: AG_GRID_LOCALE_IT,
  en: AG_GRID_LOCALE_EN,
};

export function getAgGridLocale(lang: string): Record<string, string> {
  return AG_GRID_LOCALES[lang] ?? AG_GRID_LOCALE_IT;
}
