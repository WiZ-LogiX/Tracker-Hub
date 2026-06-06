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
      fallbackLng: "ar",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "pelecanon-lang",
        caches: ["localStorage"],
      },
    });
}

export function applyLangToDocument(lang: string) {
  if (typeof document === "undefined") return;
  const meta = LANG_META[(SUPPORTED_LANGS as readonly string[]).includes(lang) ? (lang as SupportedLang) : "ar"];
  document.documentElement.lang = lang;
  document.documentElement.dir = meta.dir;
}

export default i18n;
