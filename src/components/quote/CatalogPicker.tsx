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
} from "@/lib/catalog-v2.functions";
import { formatEGP } from "@/lib/pricing";
import { Loader2 } from "lucide-react";

export type CatalogPickerKind =
  | "material"
  | "hardware"
  | "accessory"
  | "manufacturing"
  | "edge_band"
  | "veneer";

export interface CatalogPickerItem {
  id: string;
  code: string;
  price: number;
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
};

const UNIT_LABELS: Record<CatalogPickerKind, string> = {
  material: "/ m²",
  hardware: "/ pc",
  accessory: "/ pc",
  manufacturing: "/ min",
  edge_band: "/ m",
  veneer: "/ m²",
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

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let raw: any[] = [];
      switch (kind) {
        case "material":
        case "edge_band": {
          const res = await fetchMaterials({ data: {} });
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
      }

      const priceField = PRICE_FIELDS[kind];
      const mapped: CatalogPickerItem[] = raw.map((r: any) => ({
        id: r.id,
        code: r.code,
        price: Number(r[priceField] ?? 0),
      }));
      setItems(mapped);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kind, fetchMaterials, fetchHardware, fetchAccessories, fetchManufacturing, fetchVeneers]);

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
                value={item.code}
                onSelect={() => handleSelect(item)}
                className="flex items-center justify-between gap-4"
              >
                <span className="font-medium">{item.code}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {formatEGP(item.price)} {UNIT_LABELS[kind]}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
