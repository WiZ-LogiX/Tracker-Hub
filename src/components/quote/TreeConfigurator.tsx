"use client";

/**
 * TreeConfigurator — expandable hierarchical quote builder.
 *
 * Builds Quotation → Product → Section → Unit → Component.
 * Loads/saves via hierarchy CRUD server functions.
 * Uses TanStack Query for caching + optimistic updates.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { log } from "@/lib/log";
import { UnitEditor } from "@/components/quote/UnitEditor";
import type { UnitEditorValue, WidthTier } from "@/components/quote/UnitEditor";
import { BreakdownPanel } from "@/components/quote/BreakdownPanel";
import type { BreakdownTree } from "@/components/quote/BreakdownPanel";

// ── Types ──────────────────────────────────────────────────────────────────

interface ComponentNode {
  id: string;
  unit_id: string;
  kind: "material" | "hardware" | "accessory" | "manufacturing";
  catalog_id: string | null;
  qty: number;
  unit_of_measure: string;
  position: number;
}

interface UnitNode {
  id: string;
  section_id: string;
  unit_type_id: string | null;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
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

const COMPONENT_KINDS = ["material", "hardware", "accessory", "manufacturing"] as const;

const PRODUCT_TYPES = ["kitchen", "wardrobe", "living_room", "bedroom", "office", "bathroom", "custom"] as const;

// ── Main component ─────────────────────────────────────────────────────────

interface TreeConfiguratorProps {
  quotationId: string | null;
  /** Called when user saves with a valid tree. Receives the built tree. */
  onSave?: (tree: TreeData) => void;
  /** Called when validation fails. */
  onValidationError?: (errors: string[]) => void;
}

export function TreeConfigurator({
  quotationId,
  onSave,
  onValidationError,
}: TreeConfiguratorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["hierarchy", quotationId ?? "new"],
    [quotationId],
  );

  // ── Server function wrappers ──────────────────────────────────────────

  const loadHierarchyFn = useServerFn(loadHierarchy);
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
          data: { id, label: patch.label, position: patch.position },
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
        width_mm: 600,
        height_mm: 720,
        depth_mm: 600,
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
        }
        toast.success(t("treeConfigurator.unitAdded"));
      } catch {
        if (!quotationId) {
          setTree((prev) =>
            prev.map((p) => ({
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      units: s.units.filter((u) => u.id !== optimistic.id),
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
      addUnitFn,
      setTree,
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
        }
      } catch {
        toast.error(t("treeConfigurator.errorUpdate"));
      }
    },
    [quotationId, queryClient, queryKey, t, updateUnitFn, setTree],
  );

  const handleDeleteUnit = useCallback(
    async (sectionId: string, unitId: string) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) =>
              s.id === sectionId
                ? { ...s, units: s.units.filter((u) => u.id !== unitId) }
                : s,
            ),
          })),
        );
      }

      try {
        await deleteUnitFn({ data: { id: unitId } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
        toast.success(t("treeConfigurator.unitDeleted"));
      } catch {
        toast.error(t("treeConfigurator.errorDelete"));
      }
    },
    [quotationId, queryClient, queryKey, t, deleteUnitFn, setTree],
  );

  const handleReorderUnits = useCallback(
    async (sectionId: string, ids: string[]) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => {
              if (s.id !== sectionId) return s;
              const map = new Map(s.units.map((u) => [u.id, u]));
              return {
                ...s,
                units: ids
                  .map((id) => map.get(id))
                  .filter(Boolean)
                  .map((u, i) => ({ ...u!, position: i })),
              };
            }),
          })),
        );
      }

      try {
        await reorderUnitsFn({ data: { ids } });
        if (quotationId) {
          await queryClient.invalidateQueries({ queryKey });
        }
      } catch {
        toast.error(t("treeConfigurator.errorReorder"));
      }
    },
    [quotationId, queryClient, queryKey, t, reorderUnitsFn, setTree],
  );

  // ── Component mutations ───────────────────────────────────────────────

  const handleAddComponent = useCallback(
    async (unitId: string, kind: string) => {
      const unit = effectiveTree
        .flatMap((p) => p.sections)
        .flatMap((s) => s.units)
        .find((u) => u.id === unitId);
      const pos = unit ? nextPosition(unit.components) : 0;

      const optimistic: ComponentNode = {
        id: `_optimistic_${Date.now()}`,
        unit_id: unitId,
        kind: kind as ComponentNode["kind"],
        catalog_id: null,
        qty: 1,
        unit_of_measure: "pcs",
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
            data: { unitId, kind: kind as any, position: pos },
          });
          await queryClient.invalidateQueries({ queryKey });
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
    ],
  );

  const handleUpdateComponent = useCallback(
    async (id: string, patch: Partial<ComponentNode>) => {
      if (!quotationId) {
        setTree((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
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
    [quotationId, queryClient, queryKey, t, updateComponentFn, setTree],
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
        }
        toast.success(t("treeConfigurator.componentDeleted"));
      } catch {
        toast.error(t("treeConfigurator.errorDelete"));
      }
    },
    [quotationId, queryClient, queryKey, t, deleteComponentFn, setTree],
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
        }
      } catch {
        toast.error(t("treeConfigurator.errorReorder"));
      }
    },
    [quotationId, queryClient, queryKey, t, reorderComponentsFn, setTree],
  );

  // ── Breakdown panel data ─────────────────────────────────────────────

  const breakdownTree = useMemo<BreakdownTree>(() => ({
    products: effectiveTree.map((p) => ({
      id: p.id,
      label: p.label,
      sections: p.sections.map((s) => ({
        id: s.id,
        label: s.label,
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
            area_function_key: null,
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
              onAddUnit={handleAddUnit}
              onUpdateUnit={handleUpdateUnit}
              onDeleteUnit={handleDeleteUnit}
              onReorderUnits={handleReorderUnits}
              onAddComponent={handleAddComponent}
              onUpdateComponent={handleUpdateComponent}
              onDeleteComponent={handleDeleteComponent}
              onReorderComponents={handleReorderComponents}
              tree={effectiveTree}
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
    </div>
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
  onAddUnit: (sectionId: string) => Promise<void>;
  onUpdateUnit: (id: string, patch: Partial<UnitNode>) => Promise<void>;
  onDeleteUnit: (sectionId: string, unitId: string) => Promise<void>;
  onReorderUnits: (sectionId: string, ids: string[]) => Promise<void>;
  onAddComponent: (unitId: string, kind: string) => Promise<void>;
  onUpdateComponent: (id: string, patch: Partial<ComponentNode>) => Promise<void>;
  onDeleteComponent: (unitId: string, componentId: string) => Promise<void>;
  onReorderComponents: (unitId: string, ids: string[]) => Promise<void>;
  tree: TreeData;
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
  onAddUnit,
  onUpdateUnit,
  onDeleteUnit,
  onReorderUnits,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  onReorderComponents,
  tree,
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
              onAddUnit={onAddUnit}
              onUpdateUnit={onUpdateUnit}
              onDeleteUnit={onDeleteUnit}
              onReorderUnits={onReorderUnits}
              onAddComponent={onAddComponent}
              onUpdateComponent={onUpdateComponent}
              onDeleteComponent={onDeleteComponent}
              onReorderComponents={onReorderComponents}
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
  onAddUnit: (sectionId: string) => Promise<void>;
  onUpdateUnit: (id: string, patch: Partial<UnitNode>) => Promise<void>;
  onDeleteUnit: (sectionId: string, unitId: string) => Promise<void>;
  onReorderUnits: (sectionId: string, ids: string[]) => Promise<void>;
  onAddComponent: (unitId: string, kind: string) => Promise<void>;
  onUpdateComponent: (id: string, patch: Partial<ComponentNode>) => Promise<void>;
  onDeleteComponent: (unitId: string, componentId: string) => Promise<void>;
  onReorderComponents: (unitId: string, ids: string[]) => Promise<void>;
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
  onAddUnit,
  onUpdateUnit,
  onDeleteUnit,
  onReorderUnits,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  onReorderComponents,
}: SectionNodeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(section.label ?? "");

  const isEmpty = section.units.length === 0;

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
                onUpdate(section.id, { label: label || null });
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

        <CollapsibleContent className="px-3 pb-3 space-y-2">
          <Separator />

          {section.units.map((unit, uIdx) => (
            <UnitNodeComponent
              key={unit.id}
              unit={unit}
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
}

function UnitNodeComponent({
  unit,
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
}: UnitNodeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState<UnitEditorValue>({
    unitTypeId: unit.unit_type_id,
    widthMm: unit.width_mm,
    heightMm: unit.height_mm,
    depthMm: unit.depth_mm,
    qty: unit.qty,
    finishId: unit.finish_id,
    widthTier: unit.width_tier as WidthTier | null,
    components: unit.components.map((c) => ({
      _bomId: c.id,
      kind: c.kind,
      catalogId: c.catalog_id,
      qty: c.qty,
      unitOfMeasure: c.unit_of_measure,
      areaFunctionKey: null,
      label: c.catalog_id ?? c.kind,
    })),
    overrideFactorKeys: unit.override_factor_keys,
  });

  // Sync localValue when unit prop changes (e.g. after save/invalidation)
  useEffect(() => {
    if (!editing) {
      setLocalValue({
        unitTypeId: unit.unit_type_id,
        widthMm: unit.width_mm,
        heightMm: unit.height_mm,
        depthMm: unit.depth_mm,
        qty: unit.qty,
        finishId: unit.finish_id,
        widthTier: unit.width_tier as WidthTier | null,
        components: unit.components.map((c) => ({
          _bomId: c.id,
          kind: c.kind,
          catalogId: c.catalog_id,
          qty: c.qty,
          unitOfMeasure: c.unit_of_measure,
          areaFunctionKey: null,
          label: c.catalog_id ?? c.kind,
        })),
        overrideFactorKeys: unit.override_factor_keys,
      });
    }
  }, [unit, editing]);

  const handleSave = useCallback(async () => {
    // Sync unit-level fields to tree
    await onUpdate(unit.id, {
      unit_type_id: localValue.unitTypeId,
      width_mm: localValue.widthMm,
      height_mm: localValue.heightMm,
      depth_mm: localValue.depthMm,
      qty: localValue.qty,
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
      widthMm: unit.width_mm,
      heightMm: unit.height_mm,
      depthMm: unit.depth_mm,
      qty: unit.qty,
      finishId: unit.finish_id,
      widthTier: unit.width_tier as WidthTier | null,
      components: unit.components.map((c) => ({
        _bomId: c.id,
        kind: c.kind,
        catalogId: c.catalog_id,
        qty: c.qty,
        unitOfMeasure: c.unit_of_measure,
        areaFunctionKey: null,
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
              {unit.components.map((comp, cIdx) => (
                <ComponentNodeComponent
                  key={comp.id}
                  component={comp}
                  index={cIdx}
                  total={unit.components.length}
                  onUpdate={(patch) => onUpdateComponent(comp.id, patch)}
                  onDelete={() => onDeleteComponent(unit.id, comp.id)}
                  onMoveUp={() => {
                    if (cIdx === 0) return;
                    const ids = unit.components.map((c) => c.id);
                    [ids[cIdx - 1], ids[cIdx]] = [ids[cIdx], ids[cIdx - 1]];
                    onReorderComponents(unit.id, ids);
                  }}
                  onMoveDown={() => {
                    if (cIdx === unit.components.length - 1) return;
                    const ids = unit.components.map((c) => c.id);
                    [ids[cIdx], ids[cIdx + 1]] = [ids[cIdx + 1], ids[cIdx]];
                    onReorderComponents(unit.id, ids);
                  }}
                />
              ))}
              <div className="flex flex-wrap gap-1">
                {COMPONENT_KINDS.map((kind) => (
                  <Button
                    key={kind}
                    size="sm"
                    variant="ghost"
                    onClick={() => onAddComponent(unit.id, kind)}
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
  index: number;
  total: number;
  onUpdate: (patch: Partial<ComponentNode>) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ComponentNodeComponent({
  component,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: ComponentNodeProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(component.qty);

  const kindColors: Record<string, string> = {
    material: "bg-blue-100 text-blue-800",
    hardware: "bg-amber-100 text-amber-800",
    accessory: "bg-green-100 text-green-800",
    manufacturing: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-sm">
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 cursor-grab" />
      <Badge className={`text-xs ${kindColors[component.kind] ?? ""}`} variant="outline">
        {t(`treeConfigurator.kind.${component.kind}`)}
      </Badge>

      {editing ? (
        <>
          <Input
            type="number"
            min={0}
            step={0.001}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="h-7 w-20 text-xs"
          />
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onUpdate({ qty });
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
        </>
      ) : (
        <>
          <span className="text-xs text-muted-foreground">
            {t("treeConfigurator.qty")}: {component.qty} {component.unit_of_measure}
          </span>
          <div className="flex-1" />
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={onMoveUp}
            disabled={index === 0}
          >
            <ArrowUp className="h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={onMoveDown}
            disabled={index === total - 1}
          >
            <ArrowDown className="h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => setEditing(true)}
          >
            {t("common.edit")}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        </>
      )}
    </div>
  );
}
