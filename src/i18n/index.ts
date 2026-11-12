import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const SUPPORTED_LANGS = ["ar", "en", "fr"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export const LANG_META: Record<SupportedLang, { label: string; dir: "rtl" | "ltr" }> = {
  ar: { label: "العربية", dir: "rtl" },
  en: { label: "English", dir: "ltr" },
  fr: { label: "Français", dir: "ltr" },
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        ar: { translation: ar },
        en: { translation: en },
        fr: { translation: fr },
      },
      // English is the safe fallback: any key missing in the active locale
      // resolves to its English string, so the page never stays in Arabic
      // just because the user picked English.
      fallbackLng: "en",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      load: "languageOnly",
      interpolation: {
        escapeValue: false,
        prefix: "{{",
        suffix: "}}",
      },
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "pelecanon-lang",
        caches: ["localStorage"],
      },
      saveMissing: false,
      returnEmptyString: false,
      // If a key can't be found in the active locale OR the fallback, show
      // the last segment of the dotted path (e.g. "title" for "materials.title")
      // instead of an empty string. Keeps the UI legible while we backfill.
      parseMissingKeyHandler: (key: string) => {
        const segments = key.split(".");
        return segments[segments.length - 1] ?? key;
      },
    });
}

export function normalizeLang(lang: string | null | undefined): SupportedLang {
  if (!lang) return "ar";
  const code = lang.split("-")[0].toLowerCase();
  return (SUPPORTED_LANGS as readonly string[]).includes(code) ? (code as SupportedLang) : "ar";
}

export function applyLangToDocument(lang: string) {
  if (typeof document === "undefined") return;
  const validLang = normalizeLang(lang);
  const meta = LANG_META[validLang];
  document.documentElement.lang = validLang;
  document.documentElement.dir = meta.dir;
}

export function changeAppLanguage(lang: string) {
  const validLang = normalizeLang(lang);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("pelecanon-lang", validLang);
    } catch {}
  }
  i18n.changeLanguage(validLang);
  applyLangToDocument(validLang);
}

export default i18n;