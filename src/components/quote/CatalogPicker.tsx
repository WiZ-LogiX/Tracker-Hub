import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useServerFn } from "@tanstack/react-start";
import {
  listMaterials,
  listHardware,
  listAccessories,
  listManufacturingOperations,
  listVeneers,
  listFinishes,
  listEdgeBands,
} from "@/lib/catalog-v2.functions";
import { formatEGP } from "@/lib/pricing";
import { Loader2 } from "lucide-react";

export type CatalogPickerKind =
  | "material"
  | "hardware"
  | "accessory"
  | "manufacturing"
  | "edge_band"
  | "veneer"
  | "finish";

export interface CatalogPickerItem {
  id: string;
  code: string;
  name: string;
  kind: CatalogPickerKind;
  pricingUnit: string;
  price: number;
  brand?: string | null;
  defaultWastagePct?: number;
  /** Extra metadata for the pricing engine */
  extra?: Record<string, unknown>;
}

interface CatalogPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CatalogPickerKind;
  onSelect: (item: CatalogPickerItem) => void;
}

const PRICE_FIELDS: Record<CatalogPickerKind, string> = {
  material: "price_per_unit",
  hardware: "price_per_piece",
  accessory: "price_per_piece",
  manufacturing: "rate",
  edge_band: "price_per_unit",
  veneer: "price_per_m2",
  finish: "price_per_unit",
};

export function CatalogPicker({
  open,
  onOpenChange,
  kind,
  onSelect,
}: CatalogPickerProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CatalogPickerItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMaterials = useServerFn(listMaterials);
  const fetchHardware = useServerFn(listHardware);
  const fetchAccessories = useServerFn(listAccessories);
  const fetchManufacturing = useServerFn(listManufacturingOperations);
  const fetchVeneers = useServerFn(listVeneers);
  const fetchFinishes = useServerFn(listFinishes);
  const fetchEdgeBands = useServerFn(listEdgeBands);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let raw: any[] = [];
      switch (kind) {
        case "material": {
          const res = await fetchMaterials({ data: {} });
          raw = res ?? [];
          break;
        }
        case "edge_band": {
          const res = await fetchEdgeBands({ data: {} });
          raw = res ?? [];
          break;
        }
        case "hardware": {
          const res = await fetchHardware({ data: {} });
          raw = res ?? [];
          break;
        }
        case "accessory": {
          const res = await fetchAccessories({ data: {} });
          raw = res ?? [];
          break;
        }
        case "manufacturing": {
          const res = await fetchManufacturing({ data: {} });
          raw = res ?? [];
          break;
        }
        case "veneer": {
          const res = await fetchVeneers({ data: {} });
          raw = res ?? [];
          break;
        }
        case "finish": {
          const res = await fetchFinishes({ data: {} });
          raw = res ?? [];
          break;
        }
      }

      const priceField = PRICE_FIELDS[kind];
      const mapped: CatalogPickerItem[] = raw.map((r: any) => {
        let pricingUnit = "piece";
        if (kind === "material") pricingUnit = r.pricing_unit || "m2";
        else if (kind === "edge_band") pricingUnit = "m";
        else if (kind === "veneer" || kind === "finish") pricingUnit = "m2";
        else if (kind === "manufacturing") pricingUnit = r.rate_unit || "piece";
        else if (kind === "hardware" || kind === "accessory") {
          const codeOrName = `${r.code || ""} ${r.label_i18n_key || ""}`.toLowerCase();
          pricingUnit = r.pricing_unit || (codeOrName.includes("set") || codeOrName.includes("runner") ? "set" : codeOrName.includes("pair") ? "pair" : "piece");
        }

        return {
          id: r.id,
          code: r.code,
          name: r.label_i18n_key || r.code,
          kind,
          pricingUnit,
          price: Number(r[priceField] ?? 0),
          brand: r.brand ?? null,
          defaultWastagePct: Number(r.default_wastage_pct ?? 0),
        };
      });

      setItems(mapped);
    } catch (err) {
      console.error("[CatalogPicker] fetchItems failed:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    kind,
    fetchMaterials,
    fetchHardware,
    fetchAccessories,
    fetchManufacturing,
    fetchVeneers,
    fetchFinishes,
    fetchEdgeBands,
  ]);

  useEffect(() => {
    if (open) {
      fetchItems();
    } else {
      setItems([]);
    }
  }, [open, fetchItems]);

  const handleSelect = useCallback(
    (item: CatalogPickerItem) => {
      onSelect(item);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("catalogPicker.search", {
          kind: t(`treeConfigurator.kind.${kind}`),
        })}
      />
      <CommandList>
        {loading ? (
          <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("catalogPicker.loading")}
          </div>
        ) : items.length === 0 ? (
          <CommandEmpty>
            {t("catalogPicker.empty", {
              kind: t(`treeConfigurator.kind.${kind}`),
            })}
          </CommandEmpty>
        ) : (
          <CommandGroup
            heading={t("catalogPicker.results", {
              count: items.length,
              kind: t(`treeConfigurator.kind.${kind}`),
            })}
          >
            {items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.code} ${item.name} ${item.brand ?? ""}`}
                onSelect={() => handleSelect(item)}
                className="flex items-center justify-between gap-4 py-2 cursor-pointer"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-medium text-sm truncate">
                    {item.name !== item.code ? item.name : item.code}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    SKU: {item.code} {item.brand ? `· ${item.brand}` : ""}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-sm font-semibold">
                    {formatEGP(item.price)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    / {item.pricingUnit}
                  </span>
                  {item.defaultWastagePct ? (
                    <div className="text-[10px] text-amber-600 font-medium">
                      +{item.defaultWastagePct}% wastage
                    </div>
                  ) : null}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
