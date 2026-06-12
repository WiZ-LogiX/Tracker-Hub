import { Globe, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { LANG_META, SUPPORTED_LANGS, type SupportedLang } from "@/i18n";

export function LanguageSwitcher() {
  const { i18n, t, ready } = useTranslation();
  const current = i18n.language as SupportedLang;
  // Avoid hydration mismatch: aria-label must match between SSR and first client render.
  // i18n's `ready` is true once loaded — until then render a stable fallback (the same
  // string the server emits).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ariaLabel = mounted ? t("common.language") : "Language";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={ariaLabel}>
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGS.map((lng) => (
          <DropdownMenuItem key={lng} onClick={() => i18n.changeLanguage(lng)}>
            <span className="flex-1">{LANG_META[lng].label}</span>
            {current === lng && <Check className="h-4 w-4 ms-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}