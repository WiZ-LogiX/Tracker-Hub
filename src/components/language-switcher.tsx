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
import { LANG_META, SUPPORTED_LANGS, type SupportedLang, changeAppLanguage, normalizeLang } from "@/i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = normalizeLang(i18n.language);
  const ariaLabel = mounted ? t("common.language", "Language") : "Language";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
          aria-label={ariaLabel}
        >
          <Globe className="h-4 w-4" />
          <span className="uppercase text-[11px] font-semibold tracking-wider">
            {current}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SUPPORTED_LANGS.map((lng) => {
          const isSelected = current === lng;
          return (
            <DropdownMenuItem
              key={lng}
              onClick={() => changeAppLanguage(lng)}
              className={`flex items-center justify-between cursor-pointer ${
                isSelected ? "font-bold text-primary" : ""
              }`}
            >
              <span>{LANG_META[lng].label}</span>
              {isSelected && <Check className="h-4 w-4 ms-2 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}