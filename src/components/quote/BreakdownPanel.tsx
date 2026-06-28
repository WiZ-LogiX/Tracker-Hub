"use client";

/**
 * BreakdownPanel — live, auditable price breakdown that recomputes
 * as the tree changes. Shows component → unit → section → product →
 * subtotal → discount → VAT → fees/credits → total.
 *
 * Factor overrides per unit write to units.override_factor_keys (jsonb).
 * Debounced recompute; stale state shown while loading.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronDown,
  ChevronRight,
  Calculator,
  RefreshCw,
  AlertCircle,
  Package,
  Layers,
} from "lucide-react";
import { priceQuotationTree } from "@/lib/quote.functions";
import { formatEGP } from "@/lib/pricing";
import { FACTOR_ORDER, VAT_RATE } from "@/lib/pricing/engine-v3";
import type {
  FactorKey,
  QuoteBreakdown,
  QuoteOutput,
  UnitOutput,
  SectionOutput,
  ProductOutput,
} from "@/lib/pricing/engine-v3";
import { log } from "@/lib/log";

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal tree shape the panel accepts — matches QuoteInput.products. */
export interface BreakdownTree {
  products: Array<{
    id: string;
    label?: string | null;
    sections: Array<{
      id: string;
      label?: string | null;
      units: Array<{
        id: string;
        unit_type_id?: string | null;
        width_mm: number;
        height_mm: number;
        depth_mm: number;
        qty: number;
        override_factor_keys?: Record<string, number>;
        components: Array<{
          id: string;
          kind: string;
          catalog_id: string | null;
          qty: number;
          unit_of_measure: string;
          area_function_key?: string | null;
        }>;
      }>;
    }>;
  }>;
}

export interface BreakdownPanelProps {
  tree: BreakdownTree;
  discount?: { amount: number; maxValue?: number | null };
  /** Called when a unit's factor overrides change. */
  onOverrideChange?: (
    unitId: string,
    overrides: Record<string, number>,
  ) => void;
  /** Whether the panel is embedded (no Card wrapper). */
  embedded?: boolean;
}

// ── Debounced value hook ───────────────────────────────────────────────────

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);

  return debounced;
}

// ── Factor label map ───────────────────────────────────────────────────────

const FACTOR_LABEL_KEYS: Record<string, string> = {
  subtotal: "breakdown.factor.subtotal",
  labor: "breakdown.factor.labor",
  overhead: "breakdown.factor.overhead",
  complexity: "breakdown.factor.complexity",
  rush: "breakdown.factor.rush",
  margin: "breakdown.factor.margin",
  luxury: "breakdown.factor.luxury",
};

// ── Unit override editor (inline) ──────────────────────────────────────────

interface UnitOverrideEditorProps {
  unitId: string;
  overrides: Record<string, number>;
  tenantFactors: Array<{ factorKey: string; percent: number }>;
  onChange: (unitId: string, overrides: Record<string, number>) => void;
}

function UnitOverrideEditor({
  unitId,
  overrides,
  tenantFactors,
  onChange,
}: UnitOverrideEditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [localOverrides, setLocalOverrides] = useState({ ...overrides });

  const tenantMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of tenantFactors) m.set(f.factorKey, f.percent);
    return m;
  }, [tenantFactors]);

  const handlePctChange = useCallback(
    (key: string, raw: string) => {
      const num = raw === "" ? NaN : Number(raw);
      if (Number.isNaN(num)) return;
      // Clamp to 0..100
      const clamped = Math.max(0, Math.min(100, num));
      setLocalOverrides((prev) => {
        const next = { ...prev };
        if (clamped === 0) {
          delete next[key];
        } else {
          next[key] = clamped;
        }
        return next;
      });
    },
    [],
  );

  const handleApply = useCallback(() => {
    onChange(unitId, localOverrides);
    setOpen(false);
  }, [unitId, localOverrides, onChange]);

  const activeCount = Object.keys(localOverrides).length;

  // Only show the non-subtotal, non-wastage keys
  const editableKeys = FACTOR_ORDER.filter(
    (k) => k !== "subtotal",
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          data-testid={`override-trigger-${unitId}`}
        >
          <Calculator className="h-3 w-3" />
          {activeCount > 0
            ? t("breakdown.overrideActive", { count: activeCount })
            : t("breakdown.override")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 border rounded-md p-2 bg-muted/20 space-y-2">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          {t("breakdown.factorOverrideHint")}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {editableKeys.map((key) => {
            const tenantPct = tenantMap.get(key) ?? 0;
            const overridePct = localOverrides[key];
            const isOverridden = overridePct !== undefined;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <Label className="text-xs flex-1 truncate" title={t(FACTOR_LABEL_KEYS[key] ?? key)}>
                  {t(FACTOR_LABEL_KEYS[key] ?? key)}
                  <span className="text-muted-foreground ml-1">
                    ({tenantPct}%)
                  </span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={isOverridden ? overridePct : ""}
                  placeholder={String(tenantPct)}
                  onChange={(e) => handlePctChange(key, e.target.value)}
                  className={`h-6 w-16 text-xs ${isOverridden ? "border-primary font-medium" : ""}`}
                  data-testid={`override-input-${unitId}-${key}`}
                />
                {isOverridden && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => {
                      setLocalOverrides((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }}
                    data-testid={`override-clear-${unitId}-${key}`}
                  >
                    ×
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="h-6 text-xs"
            onClick={handleApply}
            data-testid={`override-apply-${unitId}`}
          >
            {t("breakdown.applyOverrides")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs"
            onClick={() => {
              setLocalOverrides({ ...overrides });
              setOpen(false);
            }}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Breakdown sub-components ───────────────────────────────────────────────

function ComponentLine({
  label,
  amount,
  isLast,
}: {
  label: string;
  amount: number;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center justify-between text-xs ${!isLast ? "border-b border-dashed border-border/30" : ""} py-0.5 pl-6`}>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="font-mono tabular-nums whitespace-nowrap">{formatEGP(amount)}</span>
    </div>
  );
}

function UnitBreakdown({
  unit,
  unitLabel,
  tenantFactors,
  onOverrideChange,
}: {
  unit: UnitOutput;
  unitLabel: string;
  tenantFactors: Array<{ factorKey: string; percent: number }>;
  onOverrideChange?: (
    unitId: string,
    overrides: Record<string, number>,
  ) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const factorLines = (unit as any).factorLines as
    | Array<{ factorKey: string; percent: number; amount: number }>
    | undefined;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 w-full text-left group" data-testid={`unit-breakdown-${unit.id}`}>
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <span className="text-xs font-medium truncate flex-1">
            {unitLabel}
          </span>
          <span className="text-xs font-mono tabular-nums">
            {formatEGP(unit.computedUnitPrice)}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 space-y-0.5">
        {/* Components */}
        {unit.components.map((comp, i) => (
          <ComponentLine
            key={comp.id}
            label={t(`treeConfigurator.kind.${comp.kind}`, { defaultValue: comp.kind })}
            amount={comp.computedAmount}
            isLast={i === unit.components.length - 1}
          />
        ))}
        {/* Unit cost subtotal */}
        <div className="flex items-center justify-between text-xs border-t border-border/50 pt-0.5 mt-0.5 pl-6">
          <span className="text-muted-foreground">{t("breakdown.costSubtotal")}</span>
          <span className="font-mono tabular-nums font-medium">{formatEGP(unit.computedUnitCost)}</span>
        </div>
        {/* Factor lines */}
        {factorLines && factorLines.length > 0 && (
          <>
            {factorLines.map((fl) => (
              <div key={fl.factorKey} className="flex items-center justify-between text-xs pl-6">
                <span className="text-muted-foreground">
                  {t(FACTOR_LABEL_KEYS[fl.factorKey] ?? fl.factorKey)}
                  <span className="ml-1">({fl.percent}%)</span>
                </span>
                <span className="font-mono tabular-nums">+{formatEGP(fl.amount)}</span>
              </div>
            ))}
          </>
        )}
        {/* Unit price */}
        <div className="flex items-center justify-between text-xs border-t border-border/50 pt-0.5 pl-6 font-medium">
          <span>{t("breakdown.unitPrice")}</span>
          <span className="font-mono tabular-nums">{formatEGP(unit.computedUnitPrice)}</span>
        </div>
        {/* Override editor */}
        {onOverrideChange && (
          <div className="pl-4 pt-1">
            <UnitOverrideEditor
              unitId={unit.id}
              overrides={(unit as any)._overrides ?? {}}
              tenantFactors={tenantFactors}
              onChange={onOverrideChange}
            />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SectionBreakdown({
  section,
  sectionLabel,
  inputUnits,
  tenantFactors,
  onOverrideChange,
}: {
  section: SectionOutput;
  sectionLabel: string;
  inputUnits: BreakdownTree["products"][number]["sections"][number]["units"];
  tenantFactors: Array<{ factorKey: string; percent: number }>;
  onOverrideChange?: (
    unitId: string,
    overrides: Record<string, number>,
  ) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 w-full text-left" data-testid={`section-breakdown-${section.id}`}>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate flex-1">
            {sectionLabel}
          </span>
          <span className="text-sm font-mono tabular-nums">
            {formatEGP(section.computedPrice)}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 space-y-1.5">
        {section.units.map((unit, idx) => (
          <UnitBreakdown
            key={unit.id}
            unit={unit}
            unitLabel={inputUnits[idx]?.unit_type_id?.slice(0, 8) ?? unit.id.slice(0, 8)}
            tenantFactors={tenantFactors}
            onOverrideChange={onOverrideChange}
          />
        ))}
        <div className="flex items-center justify-between text-xs border-t border-border/50 pt-0.5 pl-2 font-medium">
          <span>{t("breakdown.sectionTotal")}</span>
          <span className="font-mono tabular-nums">{formatEGP(section.computedPrice)}</span>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProductBreakdown({
  product,
  productLabel,
  inputSections,
  tenantFactors,
  onOverrideChange,
}: {
  product: ProductOutput;
  productLabel: string;
  inputSections: BreakdownTree["products"][number]["sections"];
  tenantFactors: Array<{ factorKey: string; percent: number }>;
  onOverrideChange?: (
    unitId: string,
    overrides: Record<string, number>,
  ) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 w-full text-left" data-testid={`product-breakdown-${product.id}`}>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold truncate flex-1">
            {productLabel}
          </span>
          <span className="text-sm font-mono tabular-nums font-semibold">
            {formatEGP(product.computedPrice)}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 space-y-2">
        {product.sections.map((section) => {
          const inputSection = inputSections.find((s) => s.id === section.id);
          return (
            <SectionBreakdown
              key={section.id}
              section={section}
              sectionLabel={inputSection?.label ?? section.id.slice(0, 8)}
              inputUnits={inputSection?.units ?? []}
              tenantFactors={tenantFactors}
              onOverrideChange={onOverrideChange}
            />
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Main BreakdownPanel ────────────────────────────────────────────────────

export function BreakdownPanel({
  tree,
  discount,
  onOverrideChange,
  embedded = false,
}: BreakdownPanelProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<QuoteOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [tenantFactors, setTenantFactors] = useState<
    Array<{ factorKey: string; percent: number }>
  >([]);

  const priceTree = useServerFn(priceQuotationTree);

  // Debounce tree changes by 400ms
  const debouncedTree = useDebounced(tree, 400);
  const debouncedDiscount = useDebounced(discount, 400);

  // Track whether debounced value is stale vs actual
  const isStale = debouncedTree !== tree || debouncedDiscount !== discount;

  // Recompute
  const recompute = useCallback(async () => {
    if (!tree.products.length) {
      setResult(null);
      return;
    }

    setLoading(true);
    setStale(true);

    try {
      const output = await priceTree({
        data: {
          tree: {
            products: debouncedTree.products as any,
            discount: debouncedDiscount,
          },
        },
      });

      // Attach _overrides from the input tree for the override editor
      const overridesMap = new Map<string, Record<string, number>>();
      for (const p of debouncedTree.products) {
        for (const s of p.sections) {
          for (const u of s.units) {
            overridesMap.set(u.id, u.override_factor_keys ?? {});
          }
        }
      }

      // Tag each unit with its current overrides for the UI
      const tagged: QuoteOutput = {
        ...output,
        products: output.products.map((p) => ({
          ...p,
          sections: p.sections.map((s) => ({
            ...s,
            units: s.units.map((u) => ({
              ...u,
              _overrides: overridesMap.get(u.id) ?? {},
            })),
          })),
        })),
      };

      setResult(tagged);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("BreakdownPanel: recompute failed", { error: msg });
      toast.error(t("breakdown.errorRecompute"));
      // Keep last good result visible
    } finally {
      setLoading(false);
      setStale(false);
    }
  }, [debouncedTree, debouncedDiscount, priceTree, t]);

  // Trigger recompute when debounced values change
  useEffect(() => {
    recompute();
  }, [recompute]);

  // Load tenant pricing factors once
  useEffect(() => {
    (async () => {
      try {
        const { listTenantPricingFactors } = await import(
          "@/lib/pricing-levers.functions"
        );
        const factors = await listTenantPricingFactors({ data: {} });
        setTenantFactors(
          (factors ?? []).map((f: any) => ({
            factorKey: f.factor_key,
            percent: f.percent,
          })),
        );
      } catch {
        // Non-critical — override editor will show 0% defaults
      }
    })();
  }, []);

  const handleOverrideChange = useCallback(
    (unitId: string, overrides: Record<string, number>) => {
      onOverrideChange?.(unitId, overrides);
    },
    [onOverrideChange],
  );

  const content = (
    <div className="space-y-3" data-testid="breakdown-panel">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("breakdown.title")}</h3>
        {loading && (
          <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
        {isStale && !loading && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {t("breakdown.stale")}
          </Badge>
        )}
      </div>

      {/* Error state */}
      {error && !result && (
        <div className="flex items-center gap-2 text-destructive text-xs p-2 rounded bg-destructive/10">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!result && !error && (
        <div className="text-xs text-muted-foreground text-center py-4">
          {t("breakdown.empty")}
        </div>
      )}

      {/* Breakdown tree */}
      {result && (
        <>
          <div className="space-y-3">
            {result.products.map((product) => {
              const inputProduct = debouncedTree.products.find(
                (p) => p.id === product.id,
              );
              return (
                <ProductBreakdown
                  key={product.id}
                  product={product}
                  productLabel={inputProduct?.label ?? product.id.slice(0, 8)}
                  inputSections={inputProduct?.sections ?? []}
                  tenantFactors={tenantFactors}
                  onOverrideChange={handleOverrideChange}
                />
              );
            })}
          </div>

          {/* Separator */}
          <div className="border-t border-border/50 pt-2 space-y-1">
            {/* SubTotal */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("breakdown.subTotal")}</span>
              <span className="font-mono tabular-nums font-medium">
                {formatEGP(result.breakdown.subTotal)}
              </span>
            </div>

            {/* Discount */}
            {result.breakdown.discount > 0 && (
              <div className="flex items-center justify-between text-sm text-destructive">
                <span>{t("breakdown.discount")}</span>
                <span className="font-mono tabular-nums">
                  -{formatEGP(result.breakdown.discount)}
                </span>
              </div>
            )}

            {/* VAT */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("breakdown.vat")} ({Math.round(VAT_RATE * 100)}%)
              </span>
              <span className="font-mono tabular-nums">
                {formatEGP(result.breakdown.vatAmount)}
              </span>
            </div>

            {/* Fees / Credits */}
            {result.breakdown.feesCreditsLines.map((fc) => (
              <div
                key={fc.code}
                className={`flex items-center justify-between text-sm ${fc.sign === "minus" ? "text-destructive" : "text-emerald-600"}`}
              >
                <span>{fc.code}</span>
                <span className="font-mono tabular-nums">
                  {fc.sign === "minus" ? "-" : "+"}{formatEGP(fc.amount)}
                </span>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between text-base font-bold border-t border-border pt-1.5 mt-1">
              <span>{t("breakdown.total")}</span>
              <span className="font-mono tabular-nums">
                {formatEGP(result.breakdown.total)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="rounded-lg border bg-card p-4">
      {content}
    </div>
  );
}
