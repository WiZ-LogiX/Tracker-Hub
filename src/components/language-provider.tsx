import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { applyLangToDocument } from "@/i18n";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  useEffect(() => {
    applyLangToDocument(i18n.language);
    const handler = (lng: string) => applyLangToDocument(lng);
    i18n.on("languageChanged", handler);
    return () => i18n.off("languageChanged", handler);
  }, [i18n]);

  return <>{children}</>;
}
