"use client";

/**
 * UnitEditor — inline editing panel for a single unit.
 *
 * Features:
 * - Unit type select (listUnitTypes)
 * - W/H/D mm inputs + qty
 * - Finish picker (catalog_finishes)
 * - Width tier picker (narrow/standard/wide/extra_wide)
 * - BOM autofill on unit_type change → renders component preview
 * - Per-component overrides (swap material, change qty) after autofill
 * - Validation (non-positive dims, missing finish/tier, missing BOM)
 * - i18n + RTL-aware layout
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Check, Plus, Trash2, ArrowUp, ArrowDown, Ruler, Search } from "lucide-react";
import { resolveBomFn, listUnitTypes } from "@/lib/unitTypes.functions";
import { listFinishes } from "@/lib/catalog-v2.functions";
import { formatEGP } from "@/lib/pricing";
import { checkShelfSpan, getMaxSpanMm } from "@/lib/pricing/spanCheck";
import type { ComponentDescriptor } from "@/lib/pricing/bom";
import { CatalogPicker, type CatalogPickerItem, type CatalogPickerKind } from "./CatalogPicker";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

// ── Types ──────────────────────────────────────────────────────────────────

export type WidthTier = "narrow" | "standard" | "wide" | "extra_wide";
export type DimensionUnit = "mm" | "m" | "m2";

export interface UnitEditorComponent {
  /** Temporary id for tracking during autofill. */
  _bomId?: string;
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band" | "veneer" | "finish";
  catalogId: string | null;
  qty: number;
  unitOfMeasure: string;
  areaFunctionKey: string | null;
  label?: string;
}

export interface UnitEditorValue {
  unitTypeId: string | null;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  qty: number;
  dimensionUnit: DimensionUnit;
  finishId: string | null;
  widthTier: WidthTier | null;
  components: UnitEditorComponent[];
  overrideFactorKeys: Record<string, number>;
}

export interface UnitEditorProps {
  value: UnitEditorValue;
  onChange: (value: UnitEditorValue) => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const WIDTH_TIERS: WidthTier[] = ["narrow", "standard", "wide", "extra_wide"];
const DIMENSION_UNITS: DimensionUnit[] = ["mm", "m", "m2"];

/** Convert mm to the display unit */
function mmToUnit(mm: number, unit: DimensionUnit): number {
  if (unit === "m") return mm / 1000;
  if (unit === "m2") return (mm / 1000) * (mm / 1000); // rough area approximation
  return mm;
}

/** Convert from display unit back to mm */
function unitToMm(val: number, unit: DimensionUnit): number {
  if (unit === "m") return Math.round(val * 1000);
  if (unit === "m2") return Math.round(Math.sqrt(val) * 1000);
  return val;
}

let _bomCounter = 0;
function makeBomId(): string {
  return `_bom_${++_bomCounter}_${Date.now()}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function UnitEditor({
  value,
  onChange,
  className,
}: UnitEditorProps) {
  const { t } = useTranslation();

  const [unitTypes, setUnitTypes] = useState<
    Array<{
      id: string;
      code: string;
      labelI18nKey: string;
      nominalWidthMm: number | null;
      nominalHeightMm: number | null;
      nominalDepthMm: number | null;
      unitTypeBom: Array<{
        id: string;
        kind: string;
        catalogRef: string | null;
        areaFunctionKey: string | null;
        defaultQty: string;
        position: number;
      }>;
    }>
  >([]);
  const [finishes, setFinishes] = useState<Array<{ id: string; code: string }>>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingFinishes, setLoadingFinishes] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const prevUnitTypeIdRef = useRef<string | null>(value.unitTypeId);
  const fetchedRef = useRef(false);

  // Fetch unit types on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    setLoadingTypes(true);
    listUnitTypes({ data: {} })
      .then((result) => {
        setUnitTypes(result as any);
      })
      .catch(() => {
        toast.error(t("treeConfigurator.errorLoadUnitTypes"));
      })
      .finally(() => setLoadingTypes(false));

    setLoadingFinishes(true);
    listFinishes({ data: {} })
      .then((result) => {
        const rows = (result as any[]) ?? [];
        setFinishes(rows.filter((r: any) => !r.archived_at).map((r: any) => ({ id: r.id, code: r.code })));
      })
      .catch(() => {
        // Finishes are optional — don't block on failure
      })
      .finally(() => setLoadingFinishes(false));
  }, [t]);

  // Run BOM autofill when unit type changes
  const runBomAutofill = useCallback(
    async (unitTypeId: string | null) => {
      if (!unitTypeId) {
        onChange({ ...value, components: [] });
        return;
      }

      setAutofilling(true);
      try {
        const bom: ComponentDescriptor[] = await resolveBomFn({
          data: { unitTypeId },
        });

        const components: UnitEditorComponent[] = bom.map((desc) => ({
          _bomId: makeBomId(),
          kind: desc.kind as UnitEditorComponent["kind"],
          catalogId: desc.catalogId,
          qty: desc.qty,
          unitOfMeasure: desc.unitOfMeasure,
          areaFunctionKey: desc.areaFunctionKey,
          label: desc.areaFunctionKey ?? desc.catalogId ?? desc.kind,
        }));

        onChange({ ...value, unitTypeId, components });

        // Auto-fill dimensions from nominal if available
        const selectedType = unitTypes.find((ut) => ut.id === unitTypeId);
        if (selectedType) {
          const dims: Partial<UnitEditorValue> = {};
          if (selectedType.nominalWidthMm) dims.widthMm = selectedType.nominalWidthMm;
          if (selectedType.nominalHeightMm) dims.heightMm = selectedType.nominalHeightMm;
          if (selectedType.nominalDepthMm) dims.depthMm = selectedType.nominalDepthMm;

          if (Object.keys(dims).length > 0) {
            onChange({ ...value, unitTypeId, components, ...dims });
          }
        }
      } catch (err) {
        console.error("BOM autofill failed:", err);
        toast.error(t("treeConfigurator.errorBomAutofill"));
      } finally {
        setAutofilling(false);
      }
    },
    [value, onChange, unitTypes, t],
  );

  // Handle unit type change
  const handleUnitTypeChange = useCallback(
    (newTypeId: string) => {
      const id = newTypeId === "__none__" ? null : newTypeId;
      if (id !== prevUnitTypeIdRef.current) {
        prevUnitTypeIdRef.current = id;
        runBomAutofill(id);
      }
    },
    [runBomAutofill],
  );

  // Handle dimension change (converts from display unit to mm)
  const handleDimChange = useCallback(
    (field: "lengthMm" | "widthMm" | "heightMm" | "depthMm" | "qty", val: number) => {
      if (field === "qty") {
        onChange({ ...value, [field]: val });
      } else {
        onChange({ ...value, [field]: unitToMm(val, value.dimensionUnit) });
      }
    },
    [value, onChange],
  );

  // Handle dimension unit change
  const handleDimUnitChange = useCallback(
    (newUnit: DimensionUnit) => {
      onChange({ ...value, dimensionUnit: newUnit });
    },
    [value, onChange],
  );

  // Handle component qty override
  const handleComponentQtyChange = useCallback(
    (compIdx: number, newQty: number) => {
      const newComponents = [...value.components];
      newComponents[compIdx] = { ...newComponents[compIdx], qty: newQty };
      onChange({ ...value, components: newComponents });
    },
    [value, onChange],
  );

  // Remove a component from BOM preview
  const handleRemoveComponent = useCallback(
    (compIdx: number) => {
      const newComponents = value.components.filter((_, i) => i !== compIdx);
      onChange({ ...value, components: newComponents });
    },
    [value, onChange],
  );

  // Catalog picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<CatalogPickerKind>("material");

  const openPicker = useCallback((kind: string) => {
    setPickerKind(kind as CatalogPickerKind);
    setPickerOpen(true);
  }, []);

  const handleCatalogSelect = useCallback(
    (item: CatalogPickerItem | null) => {
      if (!item) return;
      const unitOfMeasure =
        pickerKind === "manufacturing"
          ? "minute"
          : pickerKind === "edge_band"
            ? "m"
            : "pcs";
      const newComp: UnitEditorComponent = {
        _bomId: makeBomId(),
        kind: pickerKind as UnitEditorComponent["kind"],
        catalogId: item.id,
        qty: 1,
        unitOfMeasure,
        areaFunctionKey: null,
        label: item.code,
      };
      onChange({ ...value, components: [...value.components, newComp] });
    },
    [value, onChange, pickerKind],
  );

  // Finish picker state
  const [finishPickerOpen, setFinishPickerOpen] = useState(false);
  const [finishSearch, setFinishSearch] = useState("");

  const filteredFinishes = finishes.filter((f) =>
    finishSearch
      ? f.code.toLowerCase().includes(finishSearch.toLowerCase())
      : true,
  );

  // Move component up/down
  const handleMoveComponent = useCallback(
    (fromIdx: number, direction: "up" | "down") => {
      const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
      if (toIdx < 0 || toIdx >= value.components.length) return;
      const newComponents = [...value.components];
      [newComponents[fromIdx], newComponents[toIdx]] = [
        newComponents[toIdx],
        newComponents[fromIdx],
      ];
      onChange({ ...value, components: newComponents });
    },
    [value, onChange],
  );

  // Validate
  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};

    if (value.lengthMm <= 0) errs.lengthMm = t("unitEditor.errorPositiveDims");
    if (value.widthMm <= 0) errs.widthMm = t("unitEditor.errorPositiveDims");
    if (value.heightMm <= 0) errs.heightMm = t("unitEditor.errorPositiveDims");
    if (value.depthMm <= 0) errs.depthMm = t("unitEditor.errorPositiveDims");
    if (!value.finishId) errs.finishId = t("unitEditor.errorMissingFinish");
    if (!value.widthTier) errs.widthTier = t("unitEditor.errorMissingWidthTier");
    if (!value.unitTypeId) errs.unitTypeId = t("unitEditor.errorMissingUnitType");

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [value, t]);

  // Expose validate via ref-like pattern — parent can check errors state
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      validate();
    }
  }, [value, validate, errors]);

  const selectedUnitType = unitTypes.find((ut) => ut.id === value.unitTypeId);

  // Shelf deflection check — only relevant when shelf component is present
  const hasShelfComponent = value.components.some(
    (c) => c.areaFunctionKey === "shelf" && c.qty > 0,
  );
  const spanMm = value.widthMm; // shelf span = unit width
  const shelfCheck = hasShelfComponent
    ? checkShelfSpan({ spanMm, widthMm: value.depthMm })
    : null;

  return (
    <div className={`space-y-4 ${className ?? ""}`} data-testid="unit-editor">
      {/* ── Row 1: Unit Type + Dimensions ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Unit type */}
        <div className="col-span-2">
          <Label className="text-xs mb-1 block">{t("unitEditor.unitType")}</Label>
          <Select
            value={value.unitTypeId ?? "__none__"}
            onValueChange={handleUnitTypeChange}
            disabled={loadingTypes || autofilling}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue
                placeholder={
                  loadingTypes
                    ? t("unitEditor.loadingTypes")
                    : t("unitEditor.selectUnitType")
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("unitEditor.noUnitType")}</SelectItem>
              {unitTypes.map((ut) => (
                <SelectItem key={ut.id} value={ut.id}>
                  {ut.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.unitTypeId && (
            <p className="text-xs text-destructive mt-1">{errors.unitTypeId}</p>
          )}
        </div>

        {/* Dimension unit */}
        <div>
          <Label className="text-xs mb-1 block">{t("unitEditor.dimensionUnit")}</Label>
          <Select
            value={value.dimensionUnit}
            onValueChange={(v) => handleDimUnitChange(v as DimensionUnit)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIMENSION_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {t(`unitEditor.dimUnit.${u}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Length */}
        <div>
          <Label className="text-xs mb-1 block">{t("treeConfigurator.length")}</Label>
          <Input
            type="number"
            value={mmToUnit(value.lengthMm, value.dimensionUnit)}
            onChange={(e) => handleDimChange("lengthMm", Number(e.target.value))}
            className={`h-8 text-sm ${errors.lengthMm ? "border-destructive" : ""}`}
          />
          {errors.lengthMm && (
            <p className="text-xs text-destructive mt-1">{errors.lengthMm}</p>
          )}
        </div>

        {/* Width */}
        <div>
          <Label className="text-xs mb-1 block">{t("treeConfigurator.width")}</Label>
          <Input
            type="number"
            value={mmToUnit(value.widthMm, value.dimensionUnit)}
            onChange={(e) => handleDimChange("widthMm", Number(e.target.value))}
            className={`h-8 text-sm ${errors.widthMm ? "border-destructive" : ""}`}
          />
          {errors.widthMm && (
            <p className="text-xs text-destructive mt-1">{errors.widthMm}</p>
          )}
        </div>
      </div>

      {/* ── Row 2: Height + Depth + Qty + Finish + Width Tier ───────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Height */}
        <div>
          <Label className="text-xs mb-1 block">{t("treeConfigurator.height")}</Label>
          <Input
            type="number"
            value={mmToUnit(value.heightMm, value.dimensionUnit)}
            onChange={(e) => handleDimChange("heightMm", Number(e.target.value))}
            className={`h-8 text-sm ${errors.heightMm ? "border-destructive" : ""}`}
          />
          {errors.heightMm && (
            <p className="text-xs text-destructive mt-1">{errors.heightMm}</p>
          )}
        </div>

        {/* Depth */}
        <div>
          <Label className="text-xs mb-1 block">{t("treeConfigurator.depth")}</Label>
          <Input
            type="number"
            value={mmToUnit(value.depthMm, value.dimensionUnit)}
            onChange={(e) => handleDimChange("depthMm", Number(e.target.value))}
            className={`h-8 text-sm ${errors.depthMm ? "border-destructive" : ""}`}
          />
          {errors.depthMm && (
            <p className="text-xs text-destructive mt-1">{errors.depthMm}</p>
          )}
        </div>

        {/* Qty */}
        <div>
          <Label className="text-xs mb-1 block">{t("treeConfigurator.qty")}</Label>
          <Input
            type="number"
            min={1}
            value={value.qty}
            onChange={(e) => handleDimChange("qty", Math.max(1, Number(e.target.value)))}
            className="h-8 text-sm"
          />
        </div>

        {/* Finish */}
        <div>
          <Label className="text-xs mb-1 block">{t("unitEditor.finish")}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFinishSearch("");
              setFinishPickerOpen(true);
            }}
            className={`h-8 text-sm w-full justify-start gap-2 ${
              errors.finishId ? "border-destructive" : ""
            } ${!value.finishId ? "text-muted-foreground" : ""}`}
          >
            <Search className="h-3 w-3 shrink-0" />
            {value.finishId
              ? finishes.find((f) => f.id === value.finishId)?.code ?? t("unitEditor.selectFinish")
              : t("unitEditor.selectFinish")}
          </Button>
          {value.finishId && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground mt-1 underline"
              onClick={() => onChange({ ...value, finishId: null })}
            >
              {t("unitEditor.noFinish")}
            </button>
          )}
          {errors.finishId && (
            <p className="text-xs text-destructive mt-1">{errors.finishId}</p>
          )}

          <CommandDialog open={finishPickerOpen} onOpenChange={setFinishPickerOpen}>
            <CommandInput
              placeholder={t("unitEditor.selectFinish")}
              value={finishSearch}
              onValueChange={setFinishSearch}
            />
            <CommandList>
              <CommandEmpty>{t("catalogPicker.empty", { kind: t("unitEditor.finish") })}</CommandEmpty>
              <CommandGroup heading={t("catalogPicker.results", { count: filteredFinishes.length, kind: t("unitEditor.finish") })}>
                <CommandItem
                  key="__none__"
                  value="__none__"
                  onSelect={() => {
                    onChange({ ...value, finishId: null });
                    setFinishPickerOpen(false);
                  }}
                >
                  {t("unitEditor.noFinish")}
                </CommandItem>
                {filteredFinishes.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={f.id}
                    onSelect={() => {
                      onChange({ ...value, finishId: f.id });
                      setFinishPickerOpen(false);
                    }}
                  >
                    {f.code}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </div>

        {/* Width tier */}
        <div>
          <Label className="text-xs mb-1 block">{t("unitEditor.widthTier")}</Label>
          <Select
            value={value.widthTier ?? "__none__"}
            onValueChange={(v) =>
              onChange({
                ...value,
                widthTier: v === "__none__" ? null : (v as WidthTier),
              })
            }
          >
            <SelectTrigger className={`h-8 text-sm ${errors.widthTier ? "border-destructive" : ""}`}>
              <SelectValue placeholder={t("unitEditor.selectWidthTier")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("unitEditor.noWidthTier")}</SelectItem>
              {WIDTH_TIERS.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {t(`unitEditor.tier.${tier}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.widthTier && (
            <p className="text-xs text-destructive mt-1">{errors.widthTier}</p>
          )}
        </div>
      </div>

      {/* ── BOM Preview / Components ─────────────────────────────────── */}
      {value.unitTypeId && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {t("unitEditor.componentPreview")}
              </Label>
              {autofilling && (
                <span className="text-xs text-muted-foreground">
                  {t("unitEditor.autofilling")}
                </span>
              )}
              {value.components.length > 0 && !autofilling && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-500" />
                  {value.components.length} {t("treeConfigurator.components")}
                </span>
              )}
            </div>

            {value.components.length === 0 && !autofilling && (
              <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
                {t("unitEditor.noComponents")}
              </div>
            )}

            {value.components.map((comp, idx) => {
              const kindColor =
                comp.kind === "material"
                  ? "text-blue-600 bg-blue-50"
                  : comp.kind === "hardware"
                    ? "text-amber-600 bg-amber-50"
                    : comp.kind === "accessory"
                      ? "text-green-600 bg-green-50"
                      : "text-purple-600 bg-purple-50";

              return (
                <div
                  key={comp._bomId ?? `${comp.kind}-${idx}`}
                  className="flex items-center gap-2 p-2 rounded bg-muted/20 text-xs"
                >
                  {/* Kind badge */}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${kindColor}`}>
                    {t(`treeConfigurator.kind.${comp.kind}`)}
                  </span>

                  {/* Label */}
                  <span className="flex-1 truncate text-muted-foreground">
                    {comp.label ?? comp.areaFunctionKey ?? comp.catalogId ?? "—"}
                  </span>

                  {/* Qty */}
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={comp.qty}
                    onChange={(e) =>
                      handleComponentQtyChange(idx, Math.max(0, Number(e.target.value)))
                    }
                    className="h-6 w-16 text-[10px] px-1"
                  />

                  {/* UoM */}
                  <span className="text-muted-foreground w-6 text-right">
                    {comp.unitOfMeasure}
                  </span>

                  {/* Move up */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    disabled={idx === 0}
                    onClick={() => handleMoveComponent(idx, "up")}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>

                  {/* Move down */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    disabled={idx === value.components.length - 1}
                    onClick={() => handleMoveComponent(idx, "down")}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>

                  {/* Remove */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 text-destructive"
                    onClick={() => handleRemoveComponent(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}

            {/* Add component via catalog picker buttons */}
            {value.components.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {(["material", "hardware", "accessory", "manufacturing", "edge_band", "veneer", "finish"] as const).map(
                  (kind) => (
                    <Button
                      key={kind}
                      size="sm"
                      variant="ghost"
                      onClick={() => openPicker(kind)}
                      className="gap-1 text-xs"
                    >
                      <Plus className="h-3 w-3" /> {t(`treeConfigurator.kind.${kind}`)}
                    </Button>
                  ),
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Shelf deflection warning ──────────────────────────────── */}
      {shelfCheck && shelfCheck.severity !== "ok" && (
        <div
          className={`flex items-center gap-2 text-xs p-2 rounded ${
            shelfCheck.severity === "fail"
              ? "text-red-700 bg-red-50"
              : "text-amber-700 bg-amber-50"
          }`}
        >
          <Ruler className="h-3 w-3 shrink-0" />
          <span>
            {t(shelfCheck.messageKey, {
              deflection: shelfCheck.deflectionMm,
              max: shelfCheck.maxDeflectionMm,
              span: spanMm,
              maxSpan: getMaxSpanMm(),
            })}
          </span>
        </div>
      )}

      {/* ── Missing BOM warning ──────────────────────────────────────── */}
      {!value.unitTypeId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted/30 rounded">
          <AlertTriangle className="h-3 w-3" />
          {t("unitEditor.selectUnitTypeHint")}
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
  );
}
