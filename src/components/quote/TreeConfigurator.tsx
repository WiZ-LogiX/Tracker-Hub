"use client";

/**
 * TreeConfigurator — expandable hierarchical quote builder.
 *
 * Builds Quotation → Product → Section → Unit → Component.
 * Loads/saves via hierarchy CRUD server functions.
 * Uses TanStack Query for caching + optimistic updates.
 */
import { useCallback, createContext, useContext, useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Package,
  LayoutGrid,
  Box,
  Layers,
  GripVertical,
  Search,
  X,
} from "lucide-react";
import {
  loadHierarchy,
  addProduct,
  updateProduct,
  deleteProduct,
  reorderProducts,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  addUnit,
  updateUnit,
  deleteUnit,
  reorderUnits,
  addComponent,
  updateComponent,
  deleteComponent,
  reorderComponents,
} from "@/lib/hierarchy.functions";
import { recomputeQuotationPrices } from "@/lib/quote.functions";
import { listAllCatalogItems, type DetailedCatalogItem } from "@/lib/catalog-v2.functions";
import { formatEGP } from "@/lib/pricing";
import {
  componentAmountDetails,
  type ComponentLike,
  type CatalogEntityLike,
} from "@/lib/pricing/componentAmount";
import { log } from "@/lib/log";
import { UnitEditor } from "@/components/quote/UnitEditor";
import type { UnitEditorValue, WidthTier } from "@/components/quote/UnitEditor";
import { BreakdownPanel } from "@/components/quote/BreakdownPanel";
import type { BreakdownTree } from "@/components/quote/BreakdownPanel";
import { CatalogPicker } from "@/components/quote/CatalogPicker";
import type { CatalogPickerKind, CatalogPickerItem } from "@/components/quote/CatalogPicker";

// ── Types ──────────────────────────────────────────────────────────────────

export const CatalogLookupContext = createContext<Map<string, DetailedCatalogItem>>(new Map());

interface ComponentNode {
  id: string;
  unit_id: string | null;
  section_id?: string | null;
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band" | "veneer" | "finish";
  catalog_id: string | null;
  qty: number;
  unit_of_measure: string;
  area_function_key: string | null;
  multiplication_mode?: "one_time" | "per_unit";
  position: number;
}

interface UnitNode {
  id: string;
  section_id: string;
  unit_type_id: string | null;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  qty: number;
  dimension_unit: "mm" | "m" | "m2";
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
  material_id: string | null;
  finish_id: string | null;
  veneer_id: string | null;
  position: number;
  components?: ComponentNode[];
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

const COMPONENT_KINDS = ["material", "hardware", "accessory", "manufacturing", "veneer", "edge_band", "finish"] as const;

const PRODUCT_TYPES = ["kitchen", "wardrobe", "living_room", "bedroom", "office", "bathroom", "custom"] as const;

// ── Main component ─────────────────────────────────────────────────────────

interface TreeConfiguratorProps {
  quotationId: string | null;
  /** Called when user saves with a valid tree. Receives the built tree. */
  onSave?: (tree: TreeData) => void;
  /** Called when validation fails. */
  onValidationError?: (errors: string[]) => void;
  /** Called when tree or pricing changes on an existing quotation. */
  onTreeChange?: () => void;
}

export function TreeConfigurator({
  quotationId,
  onSave,
  onValidationError,
  onTreeChange,
}: TreeConfiguratorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["hierarchy", quotationId ?? "new"],
    [quotationId],
  );

  // ── Server function wrappers ──────────────────────────────────────────

  const loadHierarchyFn = useServerFn(loadHierarchy);
  const listAllCatalogItemsFn = useServerFn(listAllCatalogItems);
  const addProductFn = useServerFn(addProduct);
  const updateProductFn = useServerFn(updateProduct);
  const deleteProductFn = useServerFn(deleteProduct);
  const reorderProductsFn = useServerFn(reorderProducts);
  const addSectionFn = useServerFn(addSection);
  const updateSectionFn = useServerFn(updateSection);
  const deleteSectionFn = useServerFn(deleteSection);
  const reorderSectionsFn = useServerFn(reorderSections);
  const addUnitFn = useServerFn(addUnit);
  const updateUnitFn = useServerFn(updateUnit);
  const deleteUnitFn = useServerFn(deleteUnit);
  const reorderUnitsFn = useServerFn(reorderUnits);
  const addComponentFn = useServerFn(addComponent);
  const updateComponentFn = useServerFn(updateComponent);
  const deleteComponentFn = useServerFn(deleteComponent);
  const reorderComponentsFn = useServerFn(reorderComponents);
  const recomputeQuotePricesFn = useServerFn(recomputeQuotationPrices);

  const syncQuotePricing = useCallback(async () => {
    if (quotationId) {
      try {
        await recomputeQuotePricesFn({ data: { quotationId } });
        onTreeChange?.();
      } catch (err) {
        log.warn("syncQuotePricing failed:", { err });
      }
    }
  }, [quotationId, recomputeQuotePricesFn, onTreeChange]);

  // ── Query: load hierarchy ─────────────────────────────────────────────

  const { data: tree, isLoading } = useQuery<TreeData>({
    queryKey,
    queryFn: async () => {
      if (!quotationId) return [];
      const result = await loadHierarchyFn({ data: { quotationId } });
      return (result as TreeData) ?? [];
    },
    enabled: !!quotationId,
  });

  // ── Catalog lookup map (for showing names next to linked components) ──

  const { data: catalogItems } = useQuery<DetailedCatalogItem[]>({
    queryKey: ["catalog-lookup"],
    queryFn: async () => {
      const result = await listAllCatalogItemsFn({ data: {} });
      return (result as DetailedCatalogItem[]) ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const catalogLookup = useMemo(() => {
    const map = new Map<string, DetailedCatalogItem>();
    for (const item of catalogItems ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [catalogItems]);

  // ── Local tree state (for new quotes without quotationId) ─────────────

  const [localTree, setLocalTree] = useState<TreeData>([]);

  // For new quotes, use localTree; for existing, use query data
  const effectiveTree = quotationId ? (tree ?? []) : localTree;
  const setTree = useCallback(
    (updater: TreeData | ((prev: TreeData) => TreeData)) => {
      if (quotationId) {
        // For existing quotes, we refetch after mutations
        return;
      }
      setLocalTree((prev) =>
        typeof updater === "function" ? updater(prev) : updater,
      );
    },
    [quotationId],
  );

  // ── Validation ────────────────────────────────────────────────────────

  const validate = useCallback(
    (data: TreeData): string[] => {
      const errors: string[] = [];
      for (const product of data) {
        for (const section of product.sections) {
          if (section.units.length === 0) {
            errors.push(
              t("treeConfigurator.errorEmptySection", {
                product: product.label ?? product.product_type_code,
                section: section.label ?? `#${section.position + 1}`,
              }),
            );
          }
        }
      }
      return errors;
    },
    [t],
  );

  const handleSave = useCallback(() => {
    const errors = validate(effectiveTree);
    if (errors.length > 0) {
      onValidationError?.(errors);
      errors.forEach((e) => toast.error(e));
      return;
    }
    onSave?.(effectiveTree);
  }, [effectiveTree, validate, onSave, onValidationError]);

  // ── Mutation helpers ──────────────────────────────────────────────────

  const nextPosition = useCallback(
    (items: { position: number }[]) =>
      items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0,
    [],
  );

  // ── Product mutations ─────────────────────────────────────────────────

  const handleAddProduct = useCallback(
    async (productTypeCode: string) => {
      const pos = nextPosition(effectiveTree);

      // Optimistic: add to local tree immediately
      const optimistic: ProductNode = {
        id: `_optimistic_${Date.now()}`,
        quotation_id: quotationId ?? "",
        product_type_code: productTypeCode,
        label: null,
        position: pos,
        sections: [],
      };

      if (!quotationId) {
        setTree((prev) => [...prev, optimistic]);
      }

      try {
        if (quotationId) {
          await addProductFn({
            data: { quotationId, productTypeCode, position: pos },
          });
          await queryClient.invalidateQueries({ queryKey });
        }
        toast.success(t("treeConfigurator.productAdded"));
      } catch (err) {
        // Rollback optimistic
        if (!quotationId) {
          setTree((prev) => prev.filter((p) => p.id !== optimistic.id));
        }
        toast.error(t("treeConfigurator.errorAdd"));
      }
    },
    [
      effectiveTree,
      quotationId,
      queryClient,
      queryKey,
      t,
      nextPosition,
      addProductFn,
      setTree,
    ],
  );

  const handleUpdateProduct = useCallback(
    async (id: string, patch: Partial<ProductNode>) => {
      // Optimistic
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        );
      }

      try {
        await updateProductFn({
          data: {
            id,
            label: patch.label,
            position: patch.position,
            productTypeCode: patch.product_type_code,
          },
        });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch {
        if (!quotationId) {
          setTree((prev) => prev); // revert would need snapshot; skip for local
        }
        toast.error(t("treeConfigurator.errorUpdate"));
      }
    },
    [quotationId, queryClient, queryKey, t, updateProductFn, setTree],
  );

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      // Optimistic
      if (!quotationId) {
        setTree((prev) => prev.filter((p) => p.id !== id));
      }

      try {
        await deleteProductFn({ data: { id } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
        toast.success(t("treeConfigurator.productDeleted"));
      } catch {
        toast.error(t("treeConfigurator.errorDelete"));
      }
    },
    [quotationId, queryClient, queryKey, t, deleteProductFn, setTree],
  );

  const handleReorderProducts = useCallback(
    async (ids: string[]) => {
      if (!quotationId) {
        setTree((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          return ids
            .map((id) => map.get(id))
            .filter(Boolean)
            .map((p, i) => ({ ...p!, position: i }));
        });
      }

      try {
        await reorderProductsFn({ data: { ids } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch {
        toast.error(t("treeConfigurator.errorReorder"));
      }
    },
    [quotationId, queryClient, queryKey, t, reorderProductsFn, setTree],
  );

  // ── Section mutations ─────────────────────────────────────────────────

  const handleAddSection = useCallback(
    async (productId: string) => {
      const product = effectiveTree.find((p) => p.id === productId);
      const pos = product ? nextPosition(product.sections) : 0;

      const optimistic: SectionNode = {
        id: `_optimistic_${Date.now()}`,
        quotation_product_id: productId,
        label: null,
        material_id: null,
        finish_id: null,
        veneer_id: null,
        position: pos,
        units: [],
      };

      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) =>
            p.id === productId
              ? { ...p, sections: [...p.sections, optimistic] }
              : p,
          ),
        );
      }

      try {
        if (quotationId) {
          await addSectionFn({
            data: { quotationProductId: productId, position: pos },
          });
          await queryClient.invalidateQueries({ queryKey });
        }
        toast.success(t("treeConfigurator.sectionAdded"));
      } catch {
        if (!quotationId) {
          setTree((prev) =>
            prev.map((p) =>
              p.id === productId
                ? {
                    ...p,
                    sections: p.sections.filter(
                      (s) => s.id !== optimistic.id,
                    ),
                  }
                : p,
            ),
          );
        }
        toast.error(t("treeConfigurator.errorAdd"));
      }
    },
    [
      effectiveTree,
      quotationId,
      queryClient,
      queryKey,
      t,
      nextPosition,
      addSectionFn,
      setTree,
    ],
  );

  const handleUpdateSection = useCallback(
    async (id: string, patch: Partial<SectionNode>) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) =>
              s.id === id ? { ...s, ...patch } : s,
            ),
          })),
        );
      }

      try {
        await updateSectionFn({
          data: {
            id,
            label: patch.label,
            materialId: patch.material_id,
            finishId: patch.finish_id,
            veneerId: patch.veneer_id,
            position: patch.position,
          },
        });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch {
        toast.error(t("treeConfigurator.errorUpdate"));
      }
    },
    [quotationId, queryClient, queryKey, t, updateSectionFn, setTree],
  );

  const handleDeleteSection = useCallback(
    async (productId: string, sectionId: string) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) =>
            p.id === productId
              ? { ...p, sections: p.sections.filter((s) => s.id !== sectionId) }
              : p,
          ),
        );
      }

      try {
        await deleteSectionFn({ data: { id: sectionId } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
        toast.success(t("treeConfigurator.sectionDeleted"));
      } catch {
        toast.error(t("treeConfigurator.errorDelete"));
      }
    },
    [quotationId, queryClient, queryKey, t, deleteSectionFn, setTree],
  );

  const handleReorderSections = useCallback(
    async (productId: string, ids: string[]) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => {
            if (p.id !== productId) return p;
            const map = new Map(p.sections.map((s) => [s.id, s]));
            return {
              ...p,
              sections: ids
                .map((id) => map.get(id))
                .filter(Boolean)
                .map((s, i) => ({ ...s!, position: i })),
            };
          }),
        );
      }

      try {
        await reorderSectionsFn({ data: { ids } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch {
        toast.error(t("treeConfigurator.errorReorder"));
      }
    },
    [quotationId, queryClient, queryKey, t, reorderSectionsFn, setTree],
  );

  // ── Unit mutations ────────────────────────────────────────────────────

  const handleAddUnit = useCallback(
    async (sectionId: string) => {
      const section = effectiveTree
        .flatMap((p) => p.sections)
        .find((s) => s.id === sectionId);
      const pos = section ? nextPosition(section.units) : 0;

      const optimistic: UnitNode = {
        id: `_optimistic_${Date.now()}`,
        section_id: sectionId,
        unit_type_id: null,
        length_mm: 0,
        width_mm: 600,
        height_mm: 720,
        depth_mm: 600,
        dimension_unit: "mm",
        qty: 1,
        finish_id: null,
        width_tier: null,
        override_factor_keys: {},
        position: pos,
        components: [],
      };

      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) =>
              s.id === sectionId
                ? { ...s, units: [...s.units, optimistic] }
                : s,
            ),
          })),
        );
      }

      try {
        if (quotationId) {
          await addUnitFn({ data: { sectionId, position: pos } });
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
        toast.success(t("treeConfigurator.unitAdded"));
      } catch {
        if (!quotationId) {
          setTree((prev) =>
            prev.map((p) => ({
              ...p,
              sections: p.sections.map((s) => ({
                ...s,
                units: s.units.map((u) => (u.id === optimistic.id ? optimistic : u)),
              })),
            })),
          );
        }
        toast.error(t("treeConfigurator.errorAdd"));
      }
    },
    [
      effectiveTree,
      quotationId,
      queryClient,
      queryKey,
      t,
      nextPosition,
      addUnitFn,
      setTree,
      syncQuotePricing,
    ],
  );

  const handleUpdateUnit = useCallback(
    async (id: string, patch: Partial<UnitNode>) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              units: s.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
            })),
          })),
        );
      }

      try {
        await updateUnitFn({
          data: {
            id,
            unitTypeId: patch.unit_type_id,
            widthMm: patch.width_mm,
            heightMm: patch.height_mm,
            depthMm: patch.depth_mm,
            qty: patch.qty,
            finishId: patch.finish_id,
            widthTier: patch.width_tier as "narrow" | "standard" | "wide" | "extra_wide" | null | undefined,
            position: patch.position,
            overrideFactorKeys: patch.override_factor_keys,
          },
        });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
      } catch {
        toast.error(t("treeConfigurator.errorUpdate"));
      }
    },
    [quotationId, queryClient, queryKey, t, updateUnitFn, setTree, syncQuotePricing],
  );

  const handleDeleteUnit = useCallback(
    async (sectionId: string, unitId: string) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              units: s.units.map((u) => (u.id === unitId ? u : u)),
            })),
          })),
        );
      }

      try {
        await deleteUnitFn({ data: { id: unitId } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
        toast.success(t("treeConfigurator.unitDeleted"));
      } catch {
        toast.error(t("treeConfigurator.errorDelete"));
      }
    },
    [quotationId, queryClient, queryKey, t, deleteUnitFn, setTree, syncQuotePricing],
  );

  const handleReorderUnits = useCallback(
    async (sectionId: string, ids: string[]) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              units: ids
                .map((id) => s.units.find((u) => u.id === id))
                .filter(Boolean)
                .map((u, i) => ({ ...u!, position: i })),
            })),
          })),
        );
      }

      try {
        await reorderUnitsFn({ data: { ids } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
      } catch {
        toast.error(t("treeConfigurator.errorReorder"));
      }
    },
    [quotationId, queryClient, queryKey, t, reorderUnitsFn, setTree, syncQuotePricing],
  );

  // ── Component mutations ───────────────────────────────────────────────

  const handleAddComponent = useCallback(
    async (unitId: string, kind: string, catalogItem?: CatalogPickerItem) => {
      const unit = effectiveTree
        .flatMap((p) => p.sections)
        .flatMap((s) => s.units)
        .find((u) => u.id === unitId);
      const pos = unit ? nextPosition(unit.components) : 0;

      const areaBased = kind === "veneer" || kind === "finish" || kind === "material";
      const edgeBased = kind === "edge_band";
      const defaultAreaFn: string | null = areaBased
        ? "door_panel"
        : edgeBased
          ? "edge_band"
          : null;

      const optimistic: ComponentNode = {
        id: `_optimistic_${Date.now()}`,
        unit_id: unitId,
        kind: kind as ComponentNode["kind"],
        catalog_id: catalogItem?.id ?? null,
        qty: 1,
        unit_of_measure:
          catalogItem?.pricingUnit
            ? catalogItem.pricingUnit
            : kind === "manufacturing"
              ? "minute"
              : areaBased
                ? "m2"
                : edgeBased
                  ? "m"
                  : "pcs",
        area_function_key: defaultAreaFn,
        position: pos,
      };

      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              units: s.units.map((u) =>
                u.id === unitId
                  ? { ...u, components: [...u.components, optimistic] }
                  : u,
              ),
            })),
          })),
        );
      }

      try {
        if (quotationId) {
          await addComponentFn({
            data: {
              unitId,
              kind: kind as any,
              catalogId: catalogItem?.id ?? null,
              position: pos,
              unitOfMeasure: optimistic.unit_of_measure,
              areaFunctionKey: optimistic.area_function_key ?? undefined,
            },
          });
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
        toast.success(t("treeConfigurator.componentAdded"));
      } catch {
        if (!quotationId) {
          setTree((prev) =>
            prev.map((p) => ({
              ...p,
              sections: p.sections.map((s) => ({
                ...s,
                units: s.units.map((u) =>
                  u.id === unitId
                    ? {
                        ...u,
                        components: u.components.filter(
                          (c) => c.id !== optimistic.id,
                        ),
                      }
                    : u,
                ),
              })),
            })),
          );
        }
        toast.error(t("treeConfigurator.errorAdd"));
      }
    },
    [
      effectiveTree,
      quotationId,
      queryClient,
      queryKey,
      t,
      nextPosition,
      addComponentFn,
      setTree,
      syncQuotePricing,
    ],
  );

  // ── Section component mutations ───────────────────────────────────────

  const handleAddSectionComponent = useCallback(
    async (sectionId: string, kind: string, catalogItem?: CatalogPickerItem) => {
      const section = effectiveTree
        .flatMap((p) => p.sections)
        .find((s) => s.id === sectionId);
      const pos = section ? nextPosition(section.components || []) : 0;

      const areaBased = kind === "veneer" || kind === "finish" || kind === "material";
      const edgeBased = kind === "edge_band";
      const defaultAreaFn: string | null = areaBased
        ? "door_panel"
        : edgeBased
          ? "edge_band"
          : null;

      const optimistic: ComponentNode = {
        id: `_optimistic_${Date.now()}`,
        unit_id: null,
        kind: kind as ComponentNode["kind"],
        catalog_id: catalogItem?.id ?? null,
        qty: 1,
        unit_of_measure:
          catalogItem?.pricingUnit
            ? catalogItem.pricingUnit
            : kind === "manufacturing"
              ? "minute"
              : areaBased
                ? "m2"
                : edgeBased
                  ? "m"
                  : "pcs",
        area_function_key: defaultAreaFn,
        position: pos,
      };

      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) =>
              s.id === sectionId
                ? { ...s, components: [...(s.components || []), optimistic] }
                : s,
            ),
          })),
        );
      }

      try {
        if (quotationId) {
          await addComponentFn({
            data: {
              sectionId,
              kind: kind as any,
              catalogId: catalogItem?.id ?? null,
              position: pos,
              unitOfMeasure: optimistic.unit_of_measure,
              areaFunctionKey: optimistic.area_function_key ?? undefined,
            },
          });
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
        toast.success(t("treeConfigurator.componentAdded"));
      } catch {
        if (!quotationId) {
          setTree((prev) =>
            prev.map((p) => ({
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      components: (s.components || []).filter(
                        (c) => c.id !== optimistic.id,
                      ),
                    }
                  : s,
              ),
            })),
          );
        }
        toast.error(t("treeConfigurator.errorAdd"));
      }
    },
    [
      effectiveTree,
      quotationId,
      queryClient,
      queryKey,
      t,
      nextPosition,
      addComponentFn,
      setTree,
      syncQuotePricing,
    ],
  );

  const handleDeleteSectionComponent = useCallback(
    async (sectionId: string, componentId: string) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) =>
              s.id === sectionId
                ? {
                    ...s,
                    components: (s.components || []).filter(
                      (c) => c.id !== componentId,
                    ),
                  }
                : s,
            ),
          })),
        );
      }

      try {
        await deleteComponentFn({ data: { id: componentId } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
        toast.success(t("treeConfigurator.componentDeleted"));
      } catch {
        toast.error(t("treeConfigurator.errorDelete"));
      }
    },
    [quotationId, queryClient, queryKey, t, deleteComponentFn, setTree, syncQuotePricing],
  );

  const handleReorderSectionComponents = useCallback(
    async (sectionId: string, ids: string[]) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => {
              if (s.id !== sectionId) return s;
              const map = new Map((s.components || []).map((c) => [c.id, c]));
              return {
                ...s,
                components: ids
                  .map((id) => map.get(id))
                  .filter(Boolean)
                  .map((c, i) => ({ ...c!, position: i })),
              };
            }),
          })),
        );
      }

      try {
        await reorderComponentsFn({ data: { ids } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
      } catch {
        toast.error(t("treeConfigurator.errorReorder"));
      }
    },
    [quotationId, queryClient, queryKey, t, reorderComponentsFn, setTree, syncQuotePricing],
  );

  // ── Catalog picker state ─────────────────────────────────────────────

  type PickerTarget =
    | { type: "unit_component"; unitId: string; componentId?: string }
    | { type: "section_component"; sectionId: string; componentId?: string }
    | { type: "section_material"; sectionId: string }
    | { type: "section_finish"; sectionId: string }
    | { type: "section_veneer"; sectionId: string };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<CatalogPickerKind>("material");
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const openPicker = useCallback(
    (
      kind: string,
      targetOrUnitId:
        | string
        | {
            unitId?: string;
            sectionId?: string;
            componentId?: string;
            attribute?: "material" | "finish" | "veneer";
          },
      componentId?: string,
    ) => {
      setPickerKind(kind as CatalogPickerKind);
      if (typeof targetOrUnitId === "string") {
        setPickerTarget({
          type: "unit_component",
          unitId: targetOrUnitId,
          componentId,
        });
      } else {
        const opts = targetOrUnitId;
        if (opts.attribute && opts.sectionId) {
          setPickerTarget({
            type:
              opts.attribute === "material"
                ? "section_material"
                : opts.attribute === "finish"
                  ? "section_finish"
                  : "section_veneer",
            sectionId: opts.sectionId,
          });
        } else if (opts.sectionId && !opts.unitId) {
          setPickerTarget({
            type: "section_component",
            sectionId: opts.sectionId,
            componentId: opts.componentId,
          });
        } else if (opts.unitId) {
          setPickerTarget({
            type: "unit_component",
            unitId: opts.unitId,
            componentId: opts.componentId,
          });
        }
      }
      setPickerOpen(true);
    },
    [],
  );

  const handleUpdateComponent = useCallback(
    async (id: string, patch: Partial<ComponentNode>) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              components: (s.components || []).map((c) =>
                c.id === id ? { ...c, ...patch } : c,
              ),
              units: s.units.map((u) => ({
                ...u,
                components: u.components.map((c) =>
                  c.id === id ? { ...c, ...patch } : c,
                ),
              })),
            })),
          })),
        );
      }

      try {
        await updateComponentFn({
          data: {
            id,
            kind: patch.kind as any,
            catalogId: patch.catalog_id,
            qty: patch.qty,
            unitOfMeasure: patch.unit_of_measure,
            areaFunctionKey:
              patch.area_function_key === undefined
                ? undefined
                : patch.area_function_key,
            position: patch.position,
          },
        });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
      } catch {
        toast.error(t("treeConfigurator.errorUpdate"));
      }
    },
    [quotationId, queryClient, queryKey, t, updateComponentFn, setTree, syncQuotePricing],
  );

  const handleCatalogSelect = useCallback(
    async (item: CatalogPickerItem) => {
      if (!pickerTarget) return;

      if (pickerTarget.type === "section_material") {
        await handleUpdateSection(pickerTarget.sectionId, { material_id: item.id });
      } else if (pickerTarget.type === "section_finish") {
        await handleUpdateSection(pickerTarget.sectionId, { finish_id: item.id });
      } else if (pickerTarget.type === "section_veneer") {
        await handleUpdateSection(pickerTarget.sectionId, { veneer_id: item.id });
      } else if (pickerTarget.type === "section_component") {
        if (pickerTarget.componentId) {
          await handleUpdateComponent(pickerTarget.componentId, {
            catalog_id: item.id,
            unit_of_measure: item.pricingUnit || (pickerKind === "edge_band" ? "m" : "pcs"),
          });
        } else {
          await handleAddSectionComponent(pickerTarget.sectionId, pickerKind, item);
        }
      } else if (pickerTarget.type === "unit_component") {
        if (pickerTarget.componentId) {
          await handleUpdateComponent(pickerTarget.componentId, {
            catalog_id: item.id,
            unit_of_measure: item.pricingUnit || (pickerKind === "edge_band" ? "m" : "pcs"),
          });
        } else {
          await handleAddComponent(pickerTarget.unitId, pickerKind, item);
        }
      }

      setPickerTarget(null);
      setPickerOpen(false);
    },
    [
      pickerTarget,
      pickerKind,
      handleUpdateSection,
      handleUpdateComponent,
      handleAddSectionComponent,
      handleAddComponent,
    ],
  );

  const handleDeleteComponent = useCallback(
    async (unitId: string, componentId: string) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              units: s.units.map((u) =>
                u.id === unitId
                  ? {
                      ...u,
                      components: u.components.filter(
                        (c) => c.id !== componentId,
                      ),
                    }
                  : u,
              ),
            })),
          })),
        );
      }

      try {
        await deleteComponentFn({ data: { id: componentId } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
        toast.success(t("treeConfigurator.componentDeleted"));
      } catch {
        toast.error(t("treeConfigurator.errorDelete"));
      }
    },
    [quotationId, queryClient, queryKey, t, deleteComponentFn, setTree, syncQuotePricing],
  );

  const handleReorderComponents = useCallback(
    async (unitId: string, ids: string[]) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              units: s.units.map((u) => {
                if (u.id !== unitId) return u;
                const map = new Map(u.components.map((c) => [c.id, c]));
                return {
                  ...u,
                  components: ids
                    .map((id) => map.get(id))
                    .filter(Boolean)
                    .map((c, i) => ({ ...c!, position: i })),
                };
              }),
            })),
          })),
        );
      }

      try {
        await reorderComponentsFn({ data: { ids } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
          await syncQuotePricing();
        }
      } catch {
        toast.error(t("treeConfigurator.errorReorder"));
      }
    },
    [quotationId, queryClient, queryKey, t, reorderComponentsFn, setTree, syncQuotePricing],
  );

  // ── Breakdown panel data ─────────────────────────────────────────────

  const breakdownTree = useMemo<BreakdownTree>(() => ({
    products: effectiveTree.map((p) => ({
      id: p.id,
      label: p.label,
      sections: p.sections.map((s) => ({
        id: s.id,
        label: s.label,
        material_id: s.material_id,
        finish_id: s.finish_id,
        veneer_id: s.veneer_id,
        components: (s.components || []).map((c) => ({
          id: c.id,
          kind: c.kind,
          catalog_id: c.catalog_id,
          qty: c.qty,
          unit_of_measure: c.unit_of_measure,
          area_function_key: c.area_function_key,
        })),
        units: s.units.map((u) => ({
          id: u.id,
          unit_type_id: u.unit_type_id,
          width_mm: u.width_mm,
          height_mm: u.height_mm,
          depth_mm: u.depth_mm,
          qty: u.qty,
          override_factor_keys: u.override_factor_keys,
          components: u.components.map((c) => ({
            id: c.id,
            kind: c.kind,
            catalog_id: c.catalog_id,
            qty: c.qty,
            unit_of_measure: c.unit_of_measure,
            area_function_key: c.area_function_key,
          })),
        })),
      })),
    })),
  }), [effectiveTree]);

  const handleOverrideChange = useCallback(
    (unitId: string, overrides: Record<string, number>) => {
      handleUpdateUnit(unitId, { override_factor_keys: overrides });
    },
    [handleUpdateUnit],
  );

  // ── Render ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <CatalogLookupContext.Provider value={catalogLookup}>
    <div className="space-y-4">
      {/* Add product buttons */}
      <div className="flex flex-wrap gap-2">
        {PRODUCT_TYPES.map((pt) => (
          <Button
            key={pt}
            size="sm"
            variant="outline"
            onClick={() => handleAddProduct(pt)}
            className="gap-1"
          >
            <Plus className="h-3 w-3" /> {t(`treeConfigurator.productType.${pt}`)}
          </Button>
        ))}
      </div>

      {/* Tree */}
      {effectiveTree.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
          {t("treeConfigurator.emptyTree")}
        </div>
      ) : (
        <div className="space-y-2">
          {effectiveTree.map((product, pIdx) => (
            <ProductNodeComponent
              key={product.id}
              product={product}
              index={pIdx}
              total={effectiveTree.length}
              onUpdate={handleUpdateProduct}
              onDelete={handleDeleteProduct}
              onMoveUp={() => {
                if (pIdx === 0) return;
                const ids = effectiveTree.map((p) => p.id);
                [ids[pIdx - 1], ids[pIdx]] = [ids[pIdx], ids[pIdx - 1]];
                handleReorderProducts(ids);
              }}
              onMoveDown={() => {
                if (pIdx === effectiveTree.length - 1) return;
                const ids = effectiveTree.map((p) => p.id);
                [ids[pIdx], ids[pIdx + 1]] = [ids[pIdx + 1], ids[pIdx]];
                handleReorderProducts(ids);
              }}
              onAddSection={handleAddSection}
              onUpdateSection={handleUpdateSection}
              onDeleteSection={handleDeleteSection}
              onReorderSections={handleReorderSections}
              onAddSectionComponent={handleAddSectionComponent}
              onDeleteSectionComponent={handleDeleteSectionComponent}
              onReorderSectionComponents={handleReorderSectionComponents}
              onAddUnit={handleAddUnit}
              onUpdateUnit={handleUpdateUnit}
              onDeleteUnit={handleDeleteUnit}
              onReorderUnits={handleReorderUnits}
              onAddComponent={handleAddComponent}
              onUpdateComponent={handleUpdateComponent}
              onDeleteComponent={handleDeleteComponent}
              onReorderComponents={handleReorderComponents}
              onOpenPicker={openPicker}
              tree={effectiveTree}
              catalogLookup={catalogLookup}
            />
          ))}
        </div>
      )}

      {/* Breakdown panel */}
      {effectiveTree.length > 0 && (
        <BreakdownPanel
          tree={breakdownTree}
          onOverrideChange={handleOverrideChange}
          embedded
        />
      )}

      {/* Save button */}
      {effectiveTree.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} className="gap-2">
            {t("treeConfigurator.save")}
          </Button>
        </div>
      )}

      {/* Catalog picker dialog */}
      <CatalogPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind={pickerKind}
        onSelect={handleCatalogSelect}
      />
    </div>
    </CatalogLookupContext.Provider>
  );
}

// ── Product node ───────────────────────────────────────────────────────────

interface ProductNodeProps {
  product: ProductNode;
  index: number;
  total: number;
  onUpdate: (id: string, patch: Partial<ProductNode>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddSection: (productId: string) => Promise<void>;
  onUpdateSection: (id: string, patch: Partial<SectionNode>) => Promise<void>;
  onDeleteSection: (productId: string, sectionId: string) => Promise<void>;
  onReorderSections: (productId: string, ids: string[]) => Promise<void>;
  onAddSectionComponent: (sectionId: string, kind: string, catalogItem?: CatalogPickerItem) => Promise<void>;
  onDeleteSectionComponent: (sectionId: string, componentId: string) => Promise<void>;
  onReorderSectionComponents: (sectionId: string, ids: string[]) => Promise<void>;
  onAddUnit: (sectionId: string) => Promise<void>;
  onUpdateUnit: (id: string, patch: Partial<UnitNode>) => Promise<void>;
  onDeleteUnit: (sectionId: string, unitId: string) => Promise<void>;
  onReorderUnits: (sectionId: string, ids: string[]) => Promise<void>;
  onAddComponent: (unitId: string, kind: string) => Promise<void>;
  onUpdateComponent: (id: string, patch: Partial<ComponentNode>) => Promise<void>;
  onDeleteComponent: (unitId: string, componentId: string) => Promise<void>;
  onReorderComponents: (unitId: string, ids: string[]) => Promise<void>;
  onOpenPicker: (kind: string, targetOrUnitId: any, componentId?: string) => void;
  tree: TreeData;
  catalogLookup: Map<string, DetailedCatalogItem>;
}

function ProductNodeComponent({
  product,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onReorderSections,
  onAddSectionComponent,
  onDeleteSectionComponent,
  onReorderSectionComponents,
  onAddUnit,
  onUpdateUnit,
  onDeleteUnit,
  onReorderUnits,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  onReorderComponents,
  onOpenPicker,
  tree,
  catalogLookup,
}: ProductNodeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(product.label ?? "");

  const totalUnits = product.sections.reduce((s, sec) => s + sec.units.length, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg bg-muted/20">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-right hover:bg-muted/40 transition rounded-t-lg"
          >
            <Package className="h-4 w-4 text-primary shrink-0" />
            {open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium text-sm flex-1 text-left">
              {product.label ?? t(`treeConfigurator.productType.${product.product_type_code}`)}
            </span>
            <Badge variant="secondary" className="text-xs">
              {product.sections.length} {t("treeConfigurator.sections")} · {totalUnits} {t("treeConfigurator.units")}
            </Badge>
          </button>
        </CollapsibleTrigger>

        {/* Inline edit bar */}
        {editing && (
          <div className="px-3 pb-2 flex items-center gap-2 border-t">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("treeConfigurator.labelPlaceholder")}
              className="h-8 text-sm"
              autoFocus
            />
            <Button
              size="sm"
              onClick={() => {
                onUpdate(product.id, { label: label || null });
                setEditing(false);
              }}
            >
              {t("common.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        )}

        {/* Actions bar */}
        {!editing && (
          <div className="px-3 pb-1 flex items-center gap-1 text-xs">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={index === 0}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={index === total - 1}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              {t("common.edit")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}

        <CollapsibleContent className="px-3 pb-3 space-y-2">
          <Separator />

          {/* Sections */}
          {product.sections.map((section, sIdx) => (
            <SectionNodeComponent
              key={section.id}
              section={section}
              productId={product.id}
              index={sIdx}
              total={product.sections.length}
              onUpdate={onUpdateSection}
              onDelete={(sId) => onDeleteSection(product.id, sId)}
              onMoveUp={() => {
                if (sIdx === 0) return;
                const ids = product.sections.map((s) => s.id);
                [ids[sIdx - 1], ids[sIdx]] = [ids[sIdx], ids[sIdx - 1]];
                onReorderSections(product.id, ids);
              }}
              onMoveDown={() => {
                if (sIdx === product.sections.length - 1) return;
                const ids = product.sections.map((s) => s.id);
                [ids[sIdx], ids[sIdx + 1]] = [ids[sIdx + 1], ids[sIdx]];
                onReorderSections(product.id, ids);
              }}
              onAddSectionComponent={onAddSectionComponent}
              onDeleteSectionComponent={onDeleteSectionComponent}
              onReorderSectionComponents={onReorderSectionComponents}
              onAddUnit={onAddUnit}
              onUpdateUnit={onUpdateUnit}
              onDeleteUnit={onDeleteUnit}
              onReorderUnits={onReorderUnits}
              onAddComponent={onAddComponent}
              onUpdateComponent={onUpdateComponent}
              onDeleteComponent={onDeleteComponent}
              onReorderComponents={onReorderComponents}
              onOpenPicker={onOpenPicker}
              catalogLookup={catalogLookup}
            />
          ))}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAddSection(product.id)}
            className="gap-1 text-xs"
          >
            <Plus className="h-3 w-3" /> {t("treeConfigurator.addSection")}
          </Button>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ── Section node ───────────────────────────────────────────────────────────

interface SectionNodeProps {
  section: SectionNode;
  productId: string;
  index: number;
  total: number;
  onUpdate: (id: string, patch: Partial<SectionNode>) => Promise<void>;
  onDelete: (sectionId: string) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddSectionComponent: (sectionId: string, kind: string, catalogItem?: CatalogPickerItem) => Promise<void>;
  onDeleteSectionComponent: (sectionId: string, componentId: string) => Promise<void>;
  onReorderSectionComponents: (sectionId: string, ids: string[]) => Promise<void>;
  onAddUnit: (sectionId: string) => Promise<void>;
  onUpdateUnit: (id: string, patch: Partial<UnitNode>) => Promise<void>;
  onDeleteUnit: (sectionId: string, unitId: string) => Promise<void>;
  onReorderUnits: (sectionId: string, ids: string[]) => Promise<void>;
  onAddComponent: (unitId: string, kind: string) => Promise<void>;
  onUpdateComponent: (id: string, patch: Partial<ComponentNode>) => Promise<void>;
  onDeleteComponent: (unitId: string, componentId: string) => Promise<void>;
  onReorderComponents: (unitId: string, ids: string[]) => Promise<void>;
  onOpenPicker: (kind: string, targetOrUnitId: any, componentId?: string) => void;
  catalogLookup: Map<string, DetailedCatalogItem>;
}

function SectionNodeComponent({
  section,
  productId,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddSectionComponent,
  onDeleteSectionComponent,
  onReorderSectionComponents,
  onAddUnit,
  onUpdateUnit,
  onDeleteUnit,
  onReorderUnits,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  onReorderComponents,
  onOpenPicker,
  catalogLookup,
}: SectionNodeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(section.label ?? "");
  const [localMaterialId, setLocalMaterialId] = useState(section.material_id ?? "");
  const [localFinishId, setLocalFinishId] = useState(section.finish_id ?? "");
  const [localVeneerId, setLocalVeneerId] = useState(section.veneer_id ?? "");

  const isEmpty = section.units.length === 0;

  const hasMaterials = section.material_id || section.finish_id || section.veneer_id;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`border rounded-md ${isEmpty ? "border-destructive/50 bg-destructive/5" : "bg-background"}`}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-muted/30 transition rounded-t-md"
          >
            <LayoutGrid className="h-4 w-4 text-muted-foreground shrink-0" />
            {open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium text-sm flex-1 text-left">
              {section.label ?? `${t("treeConfigurator.section")} #${index + 1}`}
            </span>
            {section.material_id && (
              <Badge variant="outline" className="text-xs bg-blue-50">
                {catalogLookup.get(section.material_id)?.name ?? catalogLookup.get(section.material_id)?.code ?? "Material"}
              </Badge>
            )}
            {section.veneer_id && (
              <Badge variant="outline" className="text-xs bg-teal-50">
                {catalogLookup.get(section.veneer_id)?.name ?? catalogLookup.get(section.veneer_id)?.code ?? "Veneer"}
              </Badge>
            )}
            {section.finish_id && (
              <Badge variant="outline" className="text-xs bg-indigo-50">
                {catalogLookup.get(section.finish_id)?.name ?? catalogLookup.get(section.finish_id)?.code ?? "Finish"}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {section.units.length} {t("treeConfigurator.units")}
            </span>
            {isEmpty && (
              <Badge variant="destructive" className="text-xs">
                {t("treeConfigurator.empty")}
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>

        {editing && (
          <div className="px-3 pb-2 space-y-2 border-t">
            <div className="flex items-center gap-2 pt-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("treeConfigurator.labelPlaceholder")}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{t("treeConfigurator.kind.material")}</Label>
                <Select value={localMaterialId || "none"} onValueChange={(v) => setLocalMaterialId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder={t("treeConfigurator.kind.material")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("unitEditor.noFinish")}</SelectItem>
                    {Array.from(catalogLookup.entries())
                      .filter(([, item]) => item.kind === "material")
                      .sort((a, b) => (a[1].name || a[1].code).localeCompare(b[1].name || b[1].code))
                      .map(([id, item]) => (
                        <SelectItem key={id} value={id}>
                          {item.name ? `${item.name} (${item.code})` : item.code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{t("treeConfigurator.kind.veneer")}</Label>
                <Select value={localVeneerId || "none"} onValueChange={(v) => setLocalVeneerId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder={t("treeConfigurator.kind.veneer")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("unitEditor.noFinish")}</SelectItem>
                    {Array.from(catalogLookup.entries())
                      .filter(([, item]) => item.kind === "veneer")
                      .sort((a, b) => (a[1].name || a[1].code).localeCompare(b[1].name || b[1].code))
                      .map(([id, item]) => (
                        <SelectItem key={id} value={id}>
                          {item.name ? `${item.name} (${item.code})` : item.code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{t("treeConfigurator.kind.finish")}</Label>
                <Select value={localFinishId || "none"} onValueChange={(v) => setLocalFinishId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder={t("treeConfigurator.kind.finish")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("unitEditor.noFinish")}</SelectItem>
                    {Array.from(catalogLookup.entries())
                      .filter(([, item]) => item.kind === "finish")
                      .sort((a, b) => (a[1].name || a[1].code).localeCompare(b[1].name || b[1].code))
                      .map(([id, item]) => (
                        <SelectItem key={id} value={id}>
                          {item.name ? `${item.name} (${item.code})` : item.code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onUpdate(section.id, {
                    label: label || null,
                    material_id: localMaterialId || null,
                    finish_id: localFinishId || null,
                    veneer_id: localVeneerId || null,
                  });
                  setEditing(false);
                }}
              >
                {t("common.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        {!editing && (
          <div className="px-3 pb-1 flex items-center gap-1 text-xs">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              disabled={index === 0}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              disabled={index === total - 1}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            >
              {t("common.edit")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(section.id); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}

        <CollapsibleContent className="px-3 pb-3 space-y-2.5">
          <Separator />

          {/* Section Defaults & Primary Materials */}
          <div className="p-2.5 bg-muted/20 rounded border border-border/40 space-y-2 text-xs">
            <div className="font-medium text-foreground/80 flex items-center justify-between">
              <span>{t("treeConfigurator.sectionMaterials", { defaultValue: "Section Defaults & Materials" })}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {/* Primary Material */}
              <div className="flex items-center justify-between p-2 rounded bg-card border border-border/50">
                <div className="flex flex-col gap-0.5 truncate mr-2">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    {t("treeConfigurator.kind.material", { defaultValue: "Primary Material" })}
                  </span>
                  <span className="text-xs font-medium truncate" title={catalogLookup.get(section.material_id ?? "")?.name}>
                    {section.material_id ? (catalogLookup.get(section.material_id)?.name ?? catalogLookup.get(section.material_id)?.code) : t("unitEditor.noFinish", { defaultValue: "None" })}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => onOpenPicker("material", { sectionId: section.id, attribute: "material" })}
                  >
                    {section.material_id ? t("common.change", { defaultValue: "Change" }) : t("common.select", { defaultValue: "Select" })}
                  </Button>
                  {section.material_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onUpdate(section.id, { material_id: null })}
                      title={t("common.clear", { defaultValue: "Clear" })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Primary Veneer */}
              <div className="flex items-center justify-between p-2 rounded bg-card border border-border/50">
                <div className="flex flex-col gap-0.5 truncate mr-2">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    {t("treeConfigurator.kind.veneer", { defaultValue: "Primary Veneer" })}
                  </span>
                  <span className="text-xs font-medium truncate" title={catalogLookup.get(section.veneer_id ?? "")?.name}>
                    {section.veneer_id ? (catalogLookup.get(section.veneer_id)?.name ?? catalogLookup.get(section.veneer_id)?.code) : t("unitEditor.noFinish", { defaultValue: "None" })}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => onOpenPicker("veneer", { sectionId: section.id, attribute: "veneer" })}
                  >
                    {section.veneer_id ? t("common.change", { defaultValue: "Change" }) : t("common.select", { defaultValue: "Select" })}
                  </Button>
                  {section.veneer_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onUpdate(section.id, { veneer_id: null })}
                      title={t("common.clear", { defaultValue: "Clear" })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Primary Finish */}
              <div className="flex items-center justify-between p-2 rounded bg-card border border-border/50">
                <div className="flex flex-col gap-0.5 truncate mr-2">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    {t("treeConfigurator.kind.finish", { defaultValue: "Primary Finish" })}
                  </span>
                  <span className="text-xs font-medium truncate" title={catalogLookup.get(section.finish_id ?? "")?.name}>
                    {section.finish_id ? (catalogLookup.get(section.finish_id)?.name ?? catalogLookup.get(section.finish_id)?.code) : t("unitEditor.noFinish", { defaultValue: "None" })}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => onOpenPicker("finish", { sectionId: section.id, attribute: "finish" })}
                  >
                    {section.finish_id ? t("common.change", { defaultValue: "Change" }) : t("common.select", { defaultValue: "Select" })}
                  </Button>
                  {section.finish_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onUpdate(section.id, { finish_id: null })}
                      title={t("common.clear", { defaultValue: "Clear" })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section Shared Components */}
          <div className="p-2.5 bg-muted/15 rounded border border-border/40 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground/90">
                <span>{t("treeConfigurator.sectionComponents", { defaultValue: "Section Shared Components" })}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {section.components?.length ?? 0}
                </Badge>
              </div>
            </div>

            {section.components && section.components.length > 0 ? (
              <div className="space-y-1.5">
                {section.components.map((comp, cIdx) => (
                  <ComponentNodeComponent
                    key={comp.id}
                    component={comp}
                    section={section}
                    index={cIdx}
                    total={section.components!.length}
                    onUpdate={(patch) => onUpdateComponent(comp.id, patch)}
                    onDelete={() => onDeleteSectionComponent(section.id, comp.id)}
                    onOpenPicker={(kind) => onOpenPicker(kind, { sectionId: section.id, componentId: comp.id })}
                    onMoveUp={() => {
                      if (cIdx === 0) return;
                      const ids = section.components!.map((c) => c.id);
                      [ids[cIdx - 1], ids[cIdx]] = [ids[cIdx], ids[cIdx - 1]];
                      onReorderSectionComponents(section.id, ids);
                    }}
                    onMoveDown={() => {
                      if (cIdx === section.components!.length - 1) return;
                      const ids = section.components!.map((c) => c.id);
                      [ids[cIdx], ids[cIdx + 1]] = [ids[cIdx + 1], ids[cIdx]];
                      onReorderSectionComponents(section.id, ids);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground/70 italic py-0.5">
                {t("treeConfigurator.noSectionComponents", { defaultValue: "No shared components for this section yet. Add shared hardware, finishes, or operations below." })}
              </div>
            )}

            <div className="flex flex-wrap gap-1 pt-1">
              {COMPONENT_KINDS.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenPicker(kind, { sectionId: section.id })}
                  className="gap-1 text-xs h-7 border-dashed"
                >
                  <Plus className="h-3 w-3" /> {t(`treeConfigurator.kind.${kind}`)}
                </Button>
              ))}
            </div>
          </div>

          {/* Section Units */}
          {section.units.map((unit, uIdx) => (
            <UnitNodeComponent
              key={unit.id}
              unit={unit}
              section={section}
              sectionId={section.id}
              index={uIdx}
              total={section.units.length}
              onUpdate={onUpdateUnit}
              onDelete={(uId) => onDeleteUnit(section.id, uId)}
              onMoveUp={() => {
                if (uIdx === 0) return;
                const ids = section.units.map((u) => u.id);
                [ids[uIdx - 1], ids[uIdx]] = [ids[uIdx], ids[uIdx - 1]];
                onReorderUnits(section.id, ids);
              }}
              onMoveDown={() => {
                if (uIdx === section.units.length - 1) return;
                const ids = section.units.map((u) => u.id);
                [ids[uIdx], ids[uIdx + 1]] = [ids[uIdx + 1], ids[uIdx]];
                onReorderUnits(section.id, ids);
              }}
              onAddComponent={onAddComponent}
              onUpdateComponent={onUpdateComponent}
              onDeleteComponent={onDeleteComponent}
              onReorderComponents={onReorderComponents}
              onOpenPicker={onOpenPicker}
              catalogLookup={catalogLookup}
            />
          ))}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAddUnit(section.id)}
            className="gap-1 text-xs"
          >
            <Plus className="h-3 w-3" /> {t("treeConfigurator.addUnit")}
          </Button>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ── Unit node ──────────────────────────────────────────────────────────────

interface UnitNodeProps {
  unit: UnitNode;
  section: SectionNode;
  sectionId: string;
  index: number;
  total: number;
  onUpdate: (id: string, patch: Partial<UnitNode>) => Promise<void>;
  onDelete: (unitId: string) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddComponent: (unitId: string, kind: string) => Promise<void>;
  onUpdateComponent: (id: string, patch: Partial<ComponentNode>) => Promise<void>;
  onDeleteComponent: (unitId: string, componentId: string) => Promise<void>;
  onReorderComponents: (unitId: string, ids: string[]) => Promise<void>;
  onOpenPicker: (kind: string, targetOrUnitId: any, componentId?: string) => void;
  catalogLookup: Map<string, DetailedCatalogItem>;
}

function UnitNodeComponent({
  unit,
  section,
  sectionId,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  onReorderComponents,
  onOpenPicker,
  catalogLookup,
}: UnitNodeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [localValue, setLocalValue] = useState<UnitEditorValue>({
    unitTypeId: unit.unit_type_id,
    lengthMm: unit.length_mm ?? 0,
    widthMm: unit.width_mm,
    heightMm: unit.height_mm,
    depthMm: unit.depth_mm,
    qty: unit.qty,
    dimensionUnit: unit.dimension_unit ?? "mm",
    finishId: unit.finish_id,
    widthTier: unit.width_tier as WidthTier | null,
    components: unit.components.map((c) => ({
      _bomId: c.id,
      kind: c.kind,
      catalogId: c.catalog_id,
      qty: c.qty,
      unitOfMeasure: c.unit_of_measure,
      areaFunctionKey: c.area_function_key ?? null,
      label: c.catalog_id ?? c.kind,
    })),
    overrideFactorKeys: unit.override_factor_keys,
  });

  // Sync localValue when unit prop changes (e.g. after save/invalidation)
  useEffect(() => {
    if (!editing) {
      setLocalValue({
        unitTypeId: unit.unit_type_id,
        lengthMm: unit.length_mm ?? 0,
        widthMm: unit.width_mm,
        heightMm: unit.height_mm,
        depthMm: unit.depth_mm,
        qty: unit.qty,
        dimensionUnit: unit.dimension_unit ?? "mm",
        finishId: unit.finish_id,
        widthTier: unit.width_tier as WidthTier | null,
        components: unit.components.map((c) => ({
          _bomId: c.id,
          kind: c.kind,
          catalogId: c.catalog_id,
          qty: c.qty,
          unitOfMeasure: c.unit_of_measure,
          areaFunctionKey: c.area_function_key ?? null,
          label: c.catalog_id ?? c.kind,
        })),
        overrideFactorKeys: unit.override_factor_keys,
      });
    }
  }, [unit, editing]);

  const filterCounts = useMemo(() => {
    const comps = unit.components;
    return {
      all: comps.length,
      material: comps.filter((c) => c.kind === "material" || c.kind === "edge_band").length,
      hardware: comps.filter((c) => c.kind === "hardware").length,
      accessory: comps.filter((c) => c.kind === "accessory").length,
      finish: comps.filter((c) => c.kind === "finish" || c.kind === "veneer").length,
      manufacturing: comps.filter((c) => c.kind === "manufacturing").length,
    };
  }, [unit.components]);

  const displayedComponents = useMemo(() => {
    if (kindFilter === "all") return unit.components;
    if (kindFilter === "material") return unit.components.filter((c) => c.kind === "material" || c.kind === "edge_band");
    if (kindFilter === "hardware") return unit.components.filter((c) => c.kind === "hardware");
    if (kindFilter === "accessory") return unit.components.filter((c) => c.kind === "accessory");
    if (kindFilter === "finish") return unit.components.filter((c) => c.kind === "finish" || c.kind === "veneer");
    if (kindFilter === "manufacturing") return unit.components.filter((c) => c.kind === "manufacturing");
    return unit.components;
  }, [unit.components, kindFilter]);

  const handleSave = useCallback(async () => {
    // Sync unit-level fields to tree
    await onUpdate(unit.id, {
      unit_type_id: localValue.unitTypeId,
      length_mm: localValue.lengthMm,
      width_mm: localValue.widthMm,
      height_mm: localValue.heightMm,
      depth_mm: localValue.depthMm,
      qty: localValue.qty,
      dimension_unit: localValue.dimensionUnit,
      finish_id: localValue.finishId,
      width_tier: localValue.widthTier,
      override_factor_keys: localValue.overrideFactorKeys,
    });

    // Sync components: delete removed, add new, update changed
    const existingIds = new Set(unit.components.map((c) => c.id));
    const editorIds = new Set(
      localValue.components.map((c) => c._bomId).filter((id) => id && !id.startsWith("_")),
    );

    // Delete components removed from editor
    for (const comp of unit.components) {
      if (!editorIds.has(comp.id)) {
        await onDeleteComponent(unit.id, comp.id);
      }
    }

    // Add new components or update existing
    let position = 0;
    for (const comp of localValue.components) {
      const realId = comp._bomId && !comp._bomId.startsWith("_") ? comp._bomId : null;
      if (realId && existingIds.has(realId)) {
        // Update existing
        await onUpdateComponent(realId, {
          kind: comp.kind,
          catalog_id: comp.catalogId,
          qty: comp.qty,
          unit_of_measure: comp.unitOfMeasure,
          area_function_key: comp.areaFunctionKey ?? null,
          position,
        });
      } else {
        // Add new
        await onAddComponent(unit.id, comp.kind);
      }
      position++;
    }

    setEditing(false);
    toast.success(t("common.saved"));
  }, [unit, localValue, onUpdate, onDeleteComponent, onUpdateComponent, onAddComponent, t]);

  const handleCancel = useCallback(() => {
    // Reset to tree values
    setLocalValue({
      unitTypeId: unit.unit_type_id,
      lengthMm: unit.length_mm ?? 0,
      widthMm: unit.width_mm,
      heightMm: unit.height_mm,
      depthMm: unit.depth_mm,
      dimensionUnit: unit.dimension_unit ?? "mm",
      qty: unit.qty,
      finishId: unit.finish_id,
      widthTier: unit.width_tier as WidthTier | null,
      components: unit.components.map((c) => ({
        _bomId: c.id,
        kind: c.kind,
        catalogId: c.catalog_id,
        qty: c.qty,
        unitOfMeasure: c.unit_of_measure,
        areaFunctionKey: c.area_function_key ?? null,
        label: c.catalog_id ?? c.kind,
      })),
      overrideFactorKeys: unit.override_factor_keys,
    });
    setEditing(false);
  }, [unit]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-md bg-background">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-muted/30 transition rounded-t-md"
          >
            <Box className="h-4 w-4 text-muted-foreground shrink-0" />
            {open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium text-sm flex-1 text-left">
              {t("treeConfigurator.unit")} #{index + 1}
            </span>
            <span className="text-xs text-muted-foreground">
              {unit.width_mm}×{unit.height_mm}×{unit.depth_mm}mm · ×{unit.qty}
            </span>
            <span className="text-xs text-muted-foreground">
              {unit.components.length} {t("treeConfigurator.components")}
            </span>
          </button>
        </CollapsibleTrigger>

        {!editing && (
          <div className="px-3 pb-1 flex items-center gap-1 text-xs">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              disabled={index === 0}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              disabled={index === total - 1}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); setEditing(true); setOpen(true); }}
            >
              {t("common.edit")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(unit.id); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}

        <CollapsibleContent className="px-3 pb-3 space-y-2">
          <Separator />
          {editing ? (
            <>
              <UnitEditor
                value={localValue}
                onChange={setLocalValue}
              />
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSave}>
                  {t("common.save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  {t("common.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Section Inheritance Info */}
              {((!unit.finish_id && section.finish_id) || section.material_id) && (
                <div className="flex flex-wrap items-center gap-2 p-1.5 bg-muted/30 rounded text-xs border border-border/40 mb-2">
                  {!unit.finish_id && section.finish_id && (
                    <div className="flex items-center gap-1 text-indigo-700 dark:text-indigo-300">
                      <span className="text-[11px] font-medium">↳ {t("treeConfigurator.inheritsSectionFinish", { defaultValue: "Inheriting Finish:" })}</span>
                      <Badge variant="outline" className="text-[10px] bg-indigo-50/50 dark:bg-indigo-950/50 border-indigo-200">
                        {catalogLookup.get(section.finish_id)?.name ?? catalogLookup.get(section.finish_id)?.code ?? "Finish"}
                      </Badge>
                    </div>
                  )}
                  {section.material_id && (
                    <div className="flex items-center gap-1 text-blue-700 dark:text-blue-300">
                      <span className="text-[11px] font-medium">{t("treeConfigurator.sectionPrimaryMaterial", { defaultValue: "Section Material:" })}</span>
                      <Badge variant="outline" className="text-[10px] bg-blue-50/50 dark:bg-blue-950/50 border-blue-200">
                        {catalogLookup.get(section.material_id)?.name ?? catalogLookup.get(section.material_id)?.code ?? "Material"}
                      </Badge>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 p-2 bg-muted/20 rounded border border-border/30 text-xs flex-wrap mb-2">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground font-medium">{t("treeConfigurator.width", { defaultValue: "W" })}:</span>
                  <Input
                    type="number"
                    data-testid="unit-width-input"
                    className="h-6 w-16 text-xs font-mono"
                    value={unit.width_mm}
                    onChange={(e) => onUpdate(unit.id, { width_mm: Number(e.target.value) || 0 })}
                  />
                  <span className="text-muted-foreground text-[10px]">mm</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground font-medium">{t("treeConfigurator.height", { defaultValue: "H" })}:</span>
                  <Input
                    type="number"
                    data-testid="unit-height-input"
                    className="h-6 w-16 text-xs font-mono"
                    value={unit.height_mm}
                    onChange={(e) => onUpdate(unit.id, { height_mm: Number(e.target.value) || 0 })}
                  />
                  <span className="text-muted-foreground text-[10px]">mm</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground font-medium">{t("treeConfigurator.depth", { defaultValue: "D" })}:</span>
                  <Input
                    type="number"
                    data-testid="unit-depth-input"
                    className="h-6 w-16 text-xs font-mono"
                    value={unit.depth_mm}
                    onChange={(e) => onUpdate(unit.id, { depth_mm: Number(e.target.value) || 0 })}
                  />
                  <span className="text-muted-foreground text-[10px]">mm</span>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-muted-foreground font-medium">{t("common.qty", { defaultValue: "Unit Qty" })}:</span>
                  <Input
                    type="number"
                    min={1}
                    data-testid="unit-qty-input"
                    className="h-6 w-14 text-xs font-mono font-bold"
                    value={unit.qty}
                    onChange={(e) => onUpdate(unit.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </div>

              {/* Component Category Filter Pills */}
              {unit.components.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mb-2 pt-1 border-b border-border/30 pb-1.5">
                  <Button
                    size="sm"
                    variant={kindFilter === "all" ? "secondary" : "ghost"}
                    className="h-6 text-[11px] px-2 py-0"
                    onClick={() => setKindFilter("all")}
                  >
                    {t("treeConfigurator.filterAll", { defaultValue: "All" })} ({filterCounts.all})
                  </Button>
                  {filterCounts.material > 0 && (
                    <Button
                      size="sm"
                      variant={kindFilter === "material" ? "secondary" : "ghost"}
                      className="h-6 text-[11px] px-2 py-0"
                      onClick={() => setKindFilter("material")}
                    >
                      {t("treeConfigurator.filterMaterials", { defaultValue: "Materials & Boards" })} ({filterCounts.material})
                    </Button>
                  )}
                  {filterCounts.hardware > 0 && (
                    <Button
                      size="sm"
                      variant={kindFilter === "hardware" ? "secondary" : "ghost"}
                      className="h-6 text-[11px] px-2 py-0"
                      onClick={() => setKindFilter("hardware")}
                    >
                      {t("treeConfigurator.filterHardware", { defaultValue: "Hardware" })} ({filterCounts.hardware})
                    </Button>
                  )}
                  {filterCounts.accessory > 0 && (
                    <Button
                      size="sm"
                      variant={kindFilter === "accessory" ? "secondary" : "ghost"}
                      className="h-6 text-[11px] px-2 py-0"
                      onClick={() => setKindFilter("accessory")}
                    >
                      {t("treeConfigurator.filterAccessories", { defaultValue: "Accessories" })} ({filterCounts.accessory})
                    </Button>
                  )}
                  {filterCounts.finish > 0 && (
                    <Button
                      size="sm"
                      variant={kindFilter === "finish" ? "secondary" : "ghost"}
                      className="h-6 text-[11px] px-2 py-0"
                      onClick={() => setKindFilter("finish")}
                    >
                      {t("treeConfigurator.filterFinishes", { defaultValue: "Finishes & Veneers" })} ({filterCounts.finish})
                    </Button>
                  )}
                  {filterCounts.manufacturing > 0 && (
                    <Button
                      size="sm"
                      variant={kindFilter === "manufacturing" ? "secondary" : "ghost"}
                      className="h-6 text-[11px] px-2 py-0"
                      onClick={() => setKindFilter("manufacturing")}
                    >
                      {t("treeConfigurator.filterOperations", { defaultValue: "Operations" })} ({filterCounts.manufacturing})
                    </Button>
                  )}
                </div>
              )}

              {displayedComponents.map((comp) => {
                const realIdx = unit.components.findIndex((c) => c.id === comp.id);
                return (
                  <ComponentNodeComponent
                    key={comp.id}
                    component={comp}
                    unit={unit}
                    section={section}
                    index={realIdx}
                    total={unit.components.length}
                    onUpdate={(patch) => onUpdateComponent(comp.id, patch)}
                    onDelete={() => onDeleteComponent(unit.id, comp.id)}
                    onOpenPicker={(kind) => onOpenPicker(kind, unit.id, comp.id)}
                    onMoveUp={() => {
                      if (realIdx === 0) return;
                      const ids = unit.components.map((c) => c.id);
                      [ids[realIdx - 1], ids[realIdx]] = [ids[realIdx], ids[realIdx - 1]];
                      onReorderComponents(unit.id, ids);
                    }}
                    onMoveDown={() => {
                      if (realIdx === unit.components.length - 1) return;
                      const ids = unit.components.map((c) => c.id);
                      [ids[realIdx], ids[realIdx + 1]] = [ids[realIdx + 1], ids[realIdx]];
                      onReorderComponents(unit.id, ids);
                    }}
                  />
                );
              })}
              <div className="flex flex-wrap gap-1">
                {COMPONENT_KINDS.map((kind) => (
                  <Button
                    key={kind}
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenPicker(kind, unit.id)}
                    className="gap-1 text-xs"
                  >
                    <Plus className="h-3 w-3" /> {t(`treeConfigurator.kind.${kind}`)}
                  </Button>
                ))}
              </div>
            </>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ── Component node (leaf) ──────────────────────────────────────────────────

interface ComponentNodeProps {
  component: ComponentNode;
  unit?: UnitNode;
  section?: SectionNode;
  index: number;
  total: number;
  onUpdate: (patch: Partial<ComponentNode>) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenPicker: (kind: CatalogPickerKind) => void;
}

function ComponentNodeComponent({
  component,
  unit,
  section,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onOpenPicker,
}: ComponentNodeProps) {
  const { t } = useTranslation();
  const catalogLookup = useContext(CatalogLookupContext);
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(component.qty);

  const cat = component.catalog_id ? catalogLookup.get(component.catalog_id) : undefined;

  const kindColors: Record<string, string> = {
    material: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-300",
    hardware: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300",
    accessory: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-300",
    manufacturing: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 border-purple-300",
    edge_band: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300",
    veneer: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-300",
    finish: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 border-indigo-300",
  };

  const SURFACE_KEYS = [
    "direct",
    "cabinet_side",
    "cabinet_top",
    "cabinet_bottom",
    "back_panel",
    "shelf",
    "door_panel",
    "drawer_front",
    "edge_band",
  ] as const;

  const needsSurface =
    component.kind === "veneer" ||
    component.kind === "finish" ||
    component.kind === "edge_band" ||
    component.kind === "material";

  const defaultAreaKey = !unit
    ? "direct"
    : component.kind === "edge_band"
      ? "edge_band"
      : (component.kind === "material" && (component.unit_of_measure === "m2" || component.unit_of_measure === "m")) ||
        component.kind === "veneer" ||
        component.kind === "finish"
      ? "door_panel"
      : null;

  const [surface, setSurface] = useState(component.area_function_key ?? defaultAreaKey ?? "direct");

  const effectiveAreaKey = component.area_function_key ?? defaultAreaKey;

  // Derive section run dimensions from child units:
  // w = sum(w_i * q_i), h = max(h_i), d = max(d_i)
  const sectionDims = useMemo(() => {
    if (!section?.units || section.units.length === 0) return { w: 0, h: 0, d: 0 };
    let w = 0;
    let h = 0;
    let d = 0;
    for (const u of section.units) {
      const q = (u.qty ?? 1) > 0 ? (u.qty ?? 1) : 1;
      const uw = u.width_mm ?? 0;
      const uh = u.height_mm ?? 0;
      const ud = u.depth_mm ?? 0;
      w += uw * q;
      if (uh > h) h = uh;
      if (ud > d) d = ud;
    }
    return { w, h, d };
  }, [section?.units]);

  const dims = useMemo(() => {
    if (unit) {
      return {
        w: (unit.width_mm ?? 0) > 0 ? unit.width_mm : 0,
        h: (unit.height_mm ?? 0) > 0 ? unit.height_mm : 0,
        d: (unit.depth_mm ?? 0) > 0 ? unit.depth_mm : 0,
      };
    }
    return sectionDims;
  }, [unit, sectionDims]);

  const totalSectionUnitQty = useMemo(() => {
    if (!section?.units) return 1;
    return section.units.reduce((sum, u) => sum + Math.max(1, u.qty ?? 1), 0);
  }, [section?.units]);

  const multMode = component.multiplication_mode ?? "one_time";
  const effectiveMultiplier = !unit && multMode === "per_unit" ? Math.max(1, totalSectionUnitQty) : 1;

  const calcDetails = useMemo(() => {
    if (!cat) return null;
    const compLike: ComponentLike = {
      kind: component.kind,
      catalogId: component.catalog_id,
      qty: component.qty,
      unitOfMeasure: component.unit_of_measure,
      areaFunctionKey: effectiveAreaKey,
    };
    const entity: CatalogEntityLike = {
      pricingUnit: cat.pricingUnit,
      pricePerUnit: cat.unitPrice,
      defaultWastagePct: cat.defaultWastagePct,
      pricePerPiece: cat.unitPrice,
      rateUnit: cat.pricingUnit,
      rate: cat.unitPrice,
    };
    try {
      const details = componentAmountDetails(compLike, entity, dims, () => null);
      if (effectiveMultiplier > 1) {
        return {
          ...details,
          amount: Math.round(details.amount * effectiveMultiplier * 100) / 100,
          totalConsumption: Math.round((details.totalConsumption ?? 0) * effectiveMultiplier * 10000) / 10000,
          wastageCost: Math.round((details.wastageCost ?? 0) * effectiveMultiplier * 100) / 100,
        };
      }
      return details;
    } catch {
      return null;
    }
  }, [cat, component, effectiveAreaKey, dims, effectiveMultiplier]);

  const isUnpriced = !cat || !calcDetails;

  return (
    <div
      data-testid={`component-node-${component.id}`}
      className="flex flex-col gap-1 px-2.5 py-2 rounded-md bg-muted/30 border border-border/40 text-sm hover:border-border transition"
    >
      {/* Row 1: Kind, Catalog Info / Warnings, Cost, and Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-grab" />
        <Badge className={`text-xs ${kindColors[component.kind] ?? ""}`} variant="outline">
          {t(`treeConfigurator.kind.${component.kind}`, { defaultValue: component.kind })}
        </Badge>
        {!unit && (
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-primary/10 text-primary border-primary/20">
              {t("treeConfigurator.shared", { defaultValue: "Shared" })}
            </Badge>
            <button
              type="button"
              onClick={() => {
                const next = (component.multiplication_mode ?? "one_time") === "one_time" ? "per_unit" : "one_time";
                onUpdate({ multiplication_mode: next });
              }}
              title={
                (component.multiplication_mode ?? "one_time") === "per_unit"
                  ? "Multiplied per unit in section"
                  : "Single flat charge for section"
              }
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground border border-border/50 font-mono transition cursor-pointer"
            >
              {(component.multiplication_mode ?? "one_time") === "per_unit"
                ? `${t("treeConfigurator.multiplicationPerUnit", { defaultValue: "Per-Unit" })} (×${Math.max(1, totalSectionUnitQty)})`
                : t("treeConfigurator.multiplicationOneTime", { defaultValue: "Flat (1×)" })}
            </button>
          </div>
        )}

        {isUnpriced ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <span
              data-testid="pricing-required"
              className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive font-medium border border-destructive/20 flex items-center gap-1"
            >
              ⚠ {t("treeConfigurator.pricingRequired", { defaultValue: "Pricing information required" })}
            </span>
            <Button
              size="sm"
              variant="outline"
              data-testid="select-catalog-item"
              className="h-6 text-xs gap-1 border-primary/40 text-primary"
              onClick={() => onOpenPicker(component.kind as CatalogPickerKind)}
            >
              <Search className="h-3 w-3" />
              {t("treeConfigurator.selectCatalogItem", { defaultValue: "Select Catalog Item" })}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[200px] truncate">
            <span className="font-medium text-xs text-foreground truncate" title={cat.name}>
              {cat.name}
            </span>
            <code
              data-testid="component-sku"
              className="text-[11px] px-1.5 py-0.5 rounded bg-muted/80 font-mono text-muted-foreground border border-border/40"
              title={`SKU: ${cat.code}`}
            >
              {cat.code}
            </code>
            {cat.brand && (
              <span className="text-[11px] text-muted-foreground truncate" title={`Brand: ${cat.brand}`}>
                ({cat.brand})
              </span>
            )}
            <span
              data-testid="component-pricing-basis"
              className="text-[11px] text-muted-foreground font-mono whitespace-nowrap"
            >
              @{calcDetails.pricingBasis}
            </span>
            <Button
              size="sm"
              variant="ghost"
              data-testid="change-catalog-item"
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => onOpenPicker(component.kind as CatalogPickerKind)}
              title={t("treeConfigurator.changeCatalogItem", { defaultValue: "Change catalog item" })}
            >
              {t("common.change", { defaultValue: "Change" })}
            </Button>
          </div>
        )}

        {/* Cost subtotal on right side */}
        <div className="flex items-center gap-2 ml-auto">
          <span
            data-testid="component-cost"
            className={`font-mono text-xs font-semibold tabular-nums ${isUnpriced ? "text-muted-foreground" : "text-foreground"}`}
          >
            {formatEGP(calcDetails?.amount ?? 0)}
          </span>

          {!editing && (
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={onMoveUp}
                disabled={index === 0}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={onMoveDown}
                disabled={index === total - 1}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setEditing(true)}
              >
                {t("common.edit")}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Calculation Breakdown / Inline Editor */}
      {editing ? (
        <div className="flex items-center gap-2 pt-1.5 border-t border-border/30 flex-wrap">
          {needsSurface && (
            <select
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              className="h-7 text-xs rounded border border-input bg-background px-1"
              title={t("treeConfigurator.surface")}
            >
              {SURFACE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k === "direct"
                    ? t("treeConfigurator.strategyDirect", { defaultValue: "Direct Consumption" })
                    : t(`treeConfigurator.surface.${k}`, { defaultValue: k })}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{t("treeConfigurator.qty")}:</span>
            <Input
              type="number"
              min={0}
              step={0.001}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="h-7 w-20 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => onOpenPicker(component.kind as CatalogPickerKind)}
          >
            <Search className="h-3 w-3" />
            {t("treeConfigurator.changeCatalogItem", { defaultValue: "Change Item" })}
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onUpdate({
                qty,
                ...(needsSurface ? { area_function_key: surface } : {}),
              });
              setEditing(false);
            }}
          >
            {t("common.save")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setEditing(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-muted-foreground pl-6 pr-1 gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Dimensions & Surface function */}
            {needsSurface && effectiveAreaKey && (
              <span className="font-mono text-[11px]">
                {effectiveAreaKey === "direct"
                  ? t("treeConfigurator.strategyDirect", { defaultValue: "Direct Consumption" })
                  : `${t(`treeConfigurator.surface.${effectiveAreaKey}`, { defaultValue: effectiveAreaKey })}: ${dims.w}×${dims.h}mm`}
              </span>
            )}

            {/* Consumption */}
            {calcDetails && (
              <span data-testid="component-consumption" className="font-mono text-[11px] text-foreground/90">
                {t("treeConfigurator.consumption", { defaultValue: "Consumption" })}: {calcDetails.consumptionPerItem} {calcDetails.consumptionUnit}/item · {t("treeConfigurator.total", { defaultValue: "Total" })}: {calcDetails.totalConsumption} {calcDetails.consumptionUnit}
              </span>
            )}

            {/* Qty & Multiplier */}
            <div className="flex items-center gap-1">
              <span>{t("treeConfigurator.qty")}:</span>
              <Input
                type="number"
                min={0}
                step={1}
                data-testid="component-qty-input"
                value={component.qty}
                onChange={(e) => onUpdate({ qty: Number(e.target.value) || 0 })}
                className="h-5 w-14 text-xs font-mono font-medium px-1"
              />
              <span>{component.unit_of_measure}</span>
              {unit && unit.qty > 1 && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  (×{unit.qty} {t("treeConfigurator.units", { defaultValue: "units" })} = {component.qty * unit.qty})
                </span>
              )}
              {!unit && multMode === "per_unit" && totalSectionUnitQty > 1 && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  (×{totalSectionUnitQty} {t("treeConfigurator.units", { defaultValue: "units" })} = {component.qty * totalSectionUnitQty})
                </span>
              )}
            </div>
          </div>

          {/* Wastage and Total Multiplier Breakdown */}
          {calcDetails && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {calcDetails.wastageCost > 0 && (
                <span className="text-muted-foreground">
                  (Base: {formatEGP(calcDetails.baseCost)} + Wastage {calcDetails.wastagePct}%: {formatEGP(calcDetails.wastageCost)})
                </span>
              )}
              {unit && unit.qty > 1 && (
                <span className="font-medium text-foreground">
                  Total for ×{unit.qty}: {formatEGP(calcDetails.amount * unit.qty)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
