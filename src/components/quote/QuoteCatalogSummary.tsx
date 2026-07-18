"use client";

/**
 * QuoteCatalogSummary — catalog-organized view of all components in a quote.
 *
 * Groups components by kind (Materials, Finishes, Veneers, etc.)
 * with add/remove capability and links to parent units.
 */
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Package,
} from "lucide-react";
import { loadHierarchy, addComponent, deleteComponent } from "@/lib/hierarchy.functions";
import { listAllCatalogItems } from "@/lib/catalog-v2.functions";
import { CatalogPicker } from "@/components/quote/CatalogPicker";
import type { CatalogPickerKind, CatalogPickerItem } from "@/components/quote/CatalogPicker";

// ── Types ──────────────────────────────────────────────────────────────────

interface ComponentNode {
  id: string;
  unit_id: string;
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band" | "veneer" | "finish";
  catalog_id: string | null;
  qty: number;
  unit_of_measure: string;
  area_function_key: string | null;
  position: number;
}

interface UnitNode {
  id: string;
  section_id: string;
  unit_type_id: string | null;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  length_mm: number;
  dimension_unit: "mm" | "m" | "m2";
  qty: number;
  finish_id: string | null;
  width_tier: string | null;
  override_factor_keys: Record<string, number>;
  position: number;
  components: ComponentNode[];
}

interface SectionNode {
  id: string;
  quotation_product_id: string;
  label: string | null;
  position: number;
  units: UnitNode[];
}

interface ProductNode {
  id: string;
  quotation_id: string;
  product_type_code: string;
  label: string | null;
  position: number;
  sections: SectionNode[];
}

type TreeData = ProductNode[];

const KIND_ORDER = ["material", "veneer", "finish", "edge_band", "hardware", "accessory", "manufacturing"] as const;

const KIND_GROUPS: Record<string, { label: string; kinds: readonly string[] }> = {
  materials: { label: "Materials", kinds: ["material"] },
  veneers: { label: "Veneers", kinds: ["veneer"] },
  finishes: { label: "Finishes", kinds: ["finish"] },
  edge_bands: { label: "Edge Bands", kinds: ["edge_band"] },
  hardware: { label: "Hardware", kinds: ["hardware"] },
  accessories: { label: "Accessories", kinds: ["accessory"] },
  manufacturing: { label: "Manufacturing", kinds: ["manufacturing"] },
};

// ── Component ──────────────────────────────────────────────────────────────

interface QuoteCatalogSummaryProps {
  quotationId: string;
}

export function QuoteCatalogSummary({ quotationId }: QuoteCatalogSummaryProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["hierarchy", quotationId], [quotationId]);

  const loadHierarchyFn = useServerFn(loadHierarchy);
  const listAllCatalogItemsFn = useServerFn(listAllCatalogItems);
  const addComponentFn = useServerFn(addComponent);
  const deleteComponentFn = useServerFn(deleteComponent);

  // ── Load hierarchy ─────────────────────────────────────────────────────

  const { data: tree, isLoading } = useQuery<TreeData>({
    queryKey,
    queryFn: async () => {
      const result = await loadHierarchyFn({ data: { quotationId } });
      return (result as TreeData) ?? [];
    },
    enabled: !!quotationId,
  });

  // ── Catalog lookup ─────────────────────────────────────────────────────

  const { data: catalogItems } = useQuery<{ id: string; code: string; kind: string }[]>({
    queryKey: ["catalog-lookup"],
    queryFn: async () => {
      const result = await listAllCatalogItemsFn({ data: {} });
      return (result as any[]) ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const catalogLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of catalogItems ?? []) {
      map.set(item.id, item.code);
    }
    return map;
  }, [catalogItems]);

  // ── Flatten and group components ────────────────────────────────────────

  interface FlatComponent {
    component: ComponentNode;
    unitPath: string;
    unitId: string;
  }

  const { grouped, totalComponents } = useMemo(() => {
    if (!tree) return { grouped: new Map<string, FlatComponent[]>(), totalComponents: 0 };

    const all: FlatComponent[] = [];
    for (const product of tree) {
      for (const section of product.sections) {
        for (const unit of section.units) {
          const unitLabel =
            unit.unit_type_id?.slice(0, 8) ??
            `${unit.width_mm}×${unit.height_mm}×${unit.depth_mm}`;
          const path = [
            product.label ?? product.product_type_code,
            section.label ?? `Section #${section.position + 1}`,
            `Unit ${unitLabel}`,
          ].join(" › ");

          for (const comp of unit.components) {
            all.push({ component: comp, unitPath: path, unitId: unit.id });
          }
        }
      }
    }

    const map = new Map<string, FlatComponent[]>();
    for (const item of all) {
      const kind = item.component.kind;
      const list = map.get(kind) ?? [];
      list.push(item);
      map.set(kind, list);
    }

    return { grouped: map, totalComponents: all.length };
  }, [tree]);

  // ── Mutations ──────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (componentId: string) => {
      await deleteComponentFn({ data: { id: componentId } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t("treeConfigurator.componentDeleted"));
    },
    onError: () => {
      toast.error(t("treeConfigurator.errorDelete"));
    },
  });

  // ── Add component state ────────────────────────────────────────────────

  const [pickerKind, setPickerKind] = useState<CatalogPickerKind | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetUnitId, setTargetUnitId] = useState<string | null>(null);

  // All available units for the target selector
  const allUnits = useMemo(() => {
    if (!tree) return [];
    const units: { id: string; path: string }[] = [];
    for (const product of tree) {
      for (const section of product.sections) {
        for (const unit of section.units) {
          const unitLabel =
            unit.unit_type_id?.slice(0, 8) ??
            `${unit.width_mm}×${unit.height_mm}×${unit.depth_mm}`;
          units.push({
            id: unit.id,
            path: [
              product.label ?? product.product_type_code,
              section.label ?? `Section #${section.position + 1}`,
              `Unit ${unitLabel}`,
            ].join(" › "),
          });
        }
      }
    }
    return units;
  }, [tree]);

  const handleOpenAdd = useCallback(
    (kind: CatalogPickerKind) => {
      // If only one unit, add directly; otherwise need a target selector
      if (allUnits.length === 1) {
        setTargetUnitId(allUnits[0].id);
        setPickerKind(kind);
        setPickerOpen(true);
      } else if (allUnits.length > 1) {
        // Show a simple unit selector inline, then open picker
        setPickerKind(kind);
        setPickerOpen(true);
      }
    },
    [allUnits],
  );

  const handlePickerSelect = useCallback(
    async (item: CatalogPickerItem) => {
      if (!pickerKind || !targetUnitId) return;

      const uomMap: Record<CatalogPickerKind, string> = {
        material: "m2",
        hardware: "pcs",
        accessory: "pcs",
        manufacturing: "min",
        edge_band: "m",
        veneer: "m2",
        finish: "m2",
      };

      try {
        await addComponentFn({
          data: {
            unitId: targetUnitId,
            kind: pickerKind,
            catalogId: item.id,
            qty: 1,
            unitOfMeasure: uomMap[pickerKind],
          },
        });
        await queryClient.invalidateQueries({ queryKey });
        toast.success(t("treeConfigurator.componentAdded"));
      } catch {
        toast.error(t("treeConfigurator.errorAdd"));
      }

      setPickerKind(null);
      setTargetUnitId(null);
    },
    [pickerKind, targetUnitId, addComponentFn, queryClient, queryKey, t],
  );

  const kindColors: Record<string, string> = {
    material: "bg-blue-100 text-blue-800",
    hardware: "bg-amber-100 text-amber-800",
    accessory: "bg-green-100 text-green-800",
    manufacturing: "bg-purple-100 text-purple-800",
    edge_band: "bg-rose-100 text-rose-800",
    veneer: "bg-teal-100 text-teal-800",
    finish: "bg-indigo-100 text-indigo-800",
  };

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Loading catalog summary…
      </div>
    );
  }

  if (totalComponents === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 flex items-center gap-2">
        <Package className="h-4 w-4" />
        No components added yet. Use the tree above to add components to units.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {KIND_ORDER.map((kind) => {
          const items = grouped.get(kind);
          const groupConfig = Object.values(KIND_GROUPS).find((g) => g.kinds.includes(kind));
          const groupLabel = groupConfig?.label ?? kind;

          return (
            <Collapsible key={kind} defaultOpen={items && items.length > 0}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 px-1 text-sm font-medium hover:bg-muted/50 rounded text-left">
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 [[data-state=closed]>&]:-rotate-90 transition-transform" />
                <Badge className={`text-xs ${kindColors[kind] ?? ""}`} variant="outline">
                  {t(`treeConfigurator.kind.${kind}`)}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {items?.length ?? 0}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-5">
                {items && items.length > 0 ? (
                  <div className="space-y-0.5 pb-1">
                    {items.map(({ component, unitPath }) => (
                      <div
                        key={component.id}
                        className="flex items-center gap-2 py-1 px-2 rounded text-xs hover:bg-muted/30 group"
                      >
                        <span className="font-medium truncate max-w-[200px]" title={catalogLookup.get(component.catalog_id ?? "") ?? "—"}>
                          {catalogLookup.get(component.catalog_id ?? "") ?? "—"}
                        </span>
                        <span className="text-muted-foreground">
                          ×{component.qty} {component.unit_of_measure}
                        </span>
                        {component.area_function_key && (
                          <span className="text-muted-foreground font-mono">
                            {t(`treeConfigurator.surface.${component.area_function_key}`)}
                          </span>
                        )}
                        <span className="text-muted-foreground truncate flex-1" title={unitPath}>
                          {unitPath}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => deleteMutation.mutate(component.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-1 px-2 text-xs text-muted-foreground">None</div>
                )}
                <div className="pb-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-xs h-6"
                    onClick={() => handleOpenAdd(kind as CatalogPickerKind)}
                  >
                    <Plus className="h-3 w-3" /> Add {t(`treeConfigurator.kind.${kind}`)}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Unit target selector + CatalogPicker */}
      {pickerKind && pickerOpen && (
        <>
          {allUnits.length > 1 && !targetUnitId && (
            <div className="space-y-2 py-2">
              <div className="text-xs font-medium text-muted-foreground">Select target unit:</div>
              <div className="space-y-1">
                {allUnits.map((u) => (
                  <Button
                    key={u.id}
                    size="sm"
                    variant="outline"
                    className="w-full justify-start text-xs h-7"
                    onClick={() => setTargetUnitId(u.id)}
                  >
                    {u.path}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    setPickerKind(null);
                    setPickerOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <CatalogPicker
            open={pickerOpen && (!!targetUnitId || allUnits.length <= 1)}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (!open) {
                setPickerKind(null);
                setTargetUnitId(null);
              }
            }}
            kind={pickerKind}
            onSelect={handlePickerSelect}
          />
        </>
      )}
    </>
  );
}
