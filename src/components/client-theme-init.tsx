"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { applyLangToDocument, normalizeLang } from "@/i18n";

export function ClientThemeInit() {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Theme initialization
    const theme = (localStorage.getItem("pelecanon-theme") as "light" | "dark" | "system") || "system";
    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Language initialization
    const rawLang = localStorage.getItem("pelecanon-lang") || "ar";
    const lang = normalizeLang(rawLang);
    applyLangToDocument(lang);
    if (!i18n.isInitialized || i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }

    // Listen for storage changes (other tabs)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "pelecanon-theme" && e.newValue) {
        const t = e.newValue as "light" | "dark" | "system";
        const d = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", d);
      }
      if (e.key === "pelecanon-lang" && e.newValue) {
        const newLang = normalizeLang(e.newValue);
        applyLangToDocument(newLang);
        i18n.changeLanguage(newLang);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [i18n]);

  return null;
}