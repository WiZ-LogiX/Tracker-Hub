import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  quotes,
  quoteSnapshots,
  orders,
  customers,
  quotationProducts,
  sections,
  units,
  components,
  catalogMaterials,
  catalogHardware,
  catalogAccessories,
  catalogManufacturingOps,
  catalogFinishes,
  catalogVeneers,
  catalogEdgeBands,
  tenantPricingFactors,
  tenantWastageRules,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import type { TenantContext } from "@/lib/tenant-context";
import {
  computeProfitAndMargin,
  type QuotationCostAnalysis,
  type GlobalCostAnalysisSummary,
  type ProductCostItem,
  type SectionCostItem,
  type UnitCostItem,
  type ComponentCostItem,
  type CostCategorySummary,
} from "@/lib/cost-analysis-types";
import { priceQuote, type CatalogLookup, type WastageRule } from "@/lib/pricing/engine-v3";
import type { PricingFactor } from "@/lib/pricing/factors";
import {
  componentAmount,
  componentAmountDetails,
  type CatalogEntityLike,
  type WastageLookup,
} from "@/lib/pricing/componentAmount";

// ── Validation Schemas ──────────────────────────────────────────────────────

const GetQuoteCostInput = z.object({
  quoteId: z.string().uuid(),
});

const GetOrderCostInput = z.object({
  orderId: z.string().uuid(),
});

const GetGlobalCostInput = z
  .object({
    days: z.string().optional().default("90"),
  })
  .optional()
  .default({});

// ── Helper: Build Catalog Lookup from DB ────────────────────────────────────

async function buildCatalogLookup(tenantId: string): Promise<CatalogLookup> {
  const [
    materials,
    hardware,
    accessories,
    ops,
    factors,
    wastage,
    finishes,
    veneers,
    edgeBands,
  ] = await Promise.all([
    db.select().from(catalogMaterials).where(eq(catalogMaterials.tenantId, tenantId)),
    db.select().from(catalogHardware).where(eq(catalogHardware.tenantId, tenantId)),
    db.select().from(catalogAccessories).where(eq(catalogAccessories.tenantId, tenantId)),
    db.select().from(catalogManufacturingOps).where(eq(catalogManufacturingOps.tenantId, tenantId)),
    db.select().from(tenantPricingFactors).where(eq(tenantPricingFactors.tenantId, tenantId)),
    db.select().from(tenantWastageRules).where(eq(tenantWastageRules.tenantId, tenantId)),
    db.select().from(catalogFinishes).where(eq(catalogFinishes.tenantId, tenantId)),
    db.select().from(catalogVeneers).where(eq(catalogVeneers.tenantId, tenantId)),
    db.select().from(catalogEdgeBands).where(eq(catalogEdgeBands.tenantId, tenantId)),
  ]);

  const matMap: Record<string, any> = {};
  for (const m of materials) {
    matMap[m.id] = {
      id: m.id,
      pricingUnit: m.pricingUnit,
      pricePerUnit: Number(m.pricePerUnit || 0),
      defaultWastagePct: Number(m.defaultWastagePct || 0),
    };
  }

  const hwMap: Record<string, any> = {};
  for (const h of hardware) {
    const code = String(h.code || "").toLowerCase();
    const pricingUnit = code.includes("set") || code.includes("runner") ? "set" : code.includes("pair") ? "pair" : "piece";
    hwMap[h.id] = {
      id: h.id,
      pricePerPiece: Number(h.pricePerPiece || 0),
      pricingUnit,
    };
  }

  const accMap: Record<string, any> = {};
  for (const a of accessories) {
    const code = String(a.code || "").toLowerCase();
    const pricingUnit = code.includes("set") ? "set" : code.includes("pair") ? "pair" : "piece";
    accMap[a.id] = {
      id: a.id,
      pricePerPiece: Number(a.pricePerPiece || 0),
      pricingUnit,
    };
  }

  const opMap: Record<string, any> = {};
  for (const o of ops) {
    opMap[o.id] = {
      id: o.id,
      rateUnit: o.rateUnit,
      rate: Number(o.rate || 0),
    };
  }

  const venMap: Record<string, any> = {};
  for (const v of veneers) {
    venMap[v.id] = {
      id: v.id,
      pricingUnit: "m2",
      pricePerUnit: Number(v.pricePerM2 || 0),
      defaultWastagePct: 0,
    };
  }

  const finMap: Record<string, any> = {};
  for (const f of finishes) {
    finMap[f.id] = {
      id: f.id,
      pricingUnit: "m2",
      pricePerUnit: Number(f.pricePerUnit || 0),
      defaultWastagePct: 0,
    };
  }

  const ebMap: Record<string, any> = {};
  for (const eb of edgeBands) {
    ebMap[eb.id] = {
      id: eb.id,
      pricingUnit: "m",
      pricePerUnit: Number(eb.pricePerUnit || 0),
      defaultWastagePct: 0,
    };
  }

  const pricingFactorsList: PricingFactor[] = factors.map((f) => ({
    factorKey: f.factorKey as any,
    percent: Number(f.percent || 0),
  }));

  const wastageRulesList: WastageRule[] = wastage.map((w) => ({
    scope: w.scope,
    ref: w.ref ?? "",
    pct: Number(w.pct || 0),
  }));

  return {
    materials: matMap,
    hardware: hwMap,
    accessories: accMap,
    manufacturingOps: opMap,
    veneers: venMap,
    finishes: finMap,
    edgeBands: ebMap,
    pricingFactors: pricingFactorsList,
    wastageRules: wastageRulesList,
    feesCredits: [],
  };
}

// ── Helper: Evaluate Single Component Cost ─────────────────────────────────

function evaluateComponentCost(
  c: any,
  dims: { w: number; h: number; d: number },
  catalogLookup: CatalogLookup,
  wastageLookup: WastageLookup,
  multiplier: number,
  categories: CostCategorySummary,
  isSectionComponent: boolean = false,
): ComponentCostItem {
  const kind = (c.kind || "material").toLowerCase();
  const cQty = Number(c.qty || 1);
  let name = c.name || c.catalogCode || c.code || c.kind || "Component";

  let entity: CatalogEntityLike | null = null;
  if (kind === "material") {
    const mat = c.catalogId ? catalogLookup.materials[c.catalogId] : null;
    if (mat) {
      entity = {
        pricingUnit: mat.pricingUnit,
        pricePerUnit: mat.pricePerUnit,
        defaultWastagePct: mat.defaultWastagePct,
        coefficient: mat.coefficient,
        boardPrice: mat.boardPrice,
      };
      if (mat.name) name = mat.name;
    }
  } else if (kind === "edge_band") {
    const eb = c.catalogId ? catalogLookup.edgeBands[c.catalogId] : null;
    if (eb) {
      entity = {
        pricingUnit: eb.pricingUnit,
        pricePerUnit: eb.pricePerUnit,
        defaultWastagePct: eb.defaultWastagePct,
      };
      if (eb.name) name = eb.name;
    }
  } else if (kind === "veneer") {
    const ven = c.catalogId ? catalogLookup.veneers[c.catalogId] : null;
    if (ven) {
      entity = {
        pricingUnit: ven.pricingUnit,
        pricePerUnit: ven.pricePerUnit,
        defaultWastagePct: ven.defaultWastagePct,
      };
      if (ven.name) name = ven.name;
    }
  } else if (kind === "finish") {
    const fin = c.catalogId ? catalogLookup.finishes[c.catalogId] : null;
    if (fin) {
      entity = {
        pricingUnit: fin.pricingUnit,
        pricePerUnit: fin.pricePerUnit,
        defaultWastagePct: fin.defaultWastagePct,
      };
      if (fin.name) name = fin.name;
    }
  } else if (kind === "hardware") {
    const hw = c.catalogId ? catalogLookup.hardware[c.catalogId] : null;
    if (hw) {
      entity = { pricePerPiece: hw.pricePerPiece, pricingUnit: hw.pricingUnit };
    }
  } else if (kind === "accessory") {
    const acc = c.catalogId ? catalogLookup.accessories[c.catalogId] : null;
    if (acc) {
      entity = { pricePerPiece: acc.pricePerPiece, pricingUnit: "piece" };
    }
  } else if (kind === "manufacturing") {
    const op = c.catalogId ? catalogLookup.manufacturingOps[c.catalogId] : null;
    if (op) {
      entity = { rateUnit: op.rateUnit, rate: op.rate };
    }
  }

  let effectiveAreaKey = c.areaFunctionKey;
  if (!effectiveAreaKey) {
    if (isSectionComponent) {
      effectiveAreaKey = "direct";
    } else {
      effectiveAreaKey =
        kind === "edge_band"
          ? "edge_band"
          : (kind === "material" && (c.unitOfMeasure === "m2" || c.unitOfMeasure === "m")) ||
            kind === "veneer" ||
            kind === "finish"
          ? "door_panel"
          : null;
    }
  }

  let compCost = 0;
  let baseCost = 0;
  let wastageCost = 0;
  let wastagePct = 0;
  let unitPrice = 0;

  if (entity) {
    const requiresDims =
      effectiveAreaKey &&
      effectiveAreaKey !== "direct" &&
      (kind === "material" ||
        kind === "edge_band" ||
        kind === "veneer" ||
        kind === "finish" ||
        kind === "manufacturing");

    if (requiresDims && (dims.w <= 0 || dims.h <= 0)) {
      compCost = 0;
      baseCost = 0;
      wastageCost = 0;
      wastagePct = 0;
      unitPrice = 0;
    } else {
      try {
        const details = componentAmountDetails(
          {
            kind: kind as any,
            catalogId: c.catalogId,
            qty: cQty,
            unitOfMeasure: c.unitOfMeasure || "piece",
            areaFunctionKey: effectiveAreaKey,
          },
          entity,
          dims,
          wastageLookup,
        );
        compCost = details.amount;
        baseCost = details.baseCost;
        wastageCost = details.wastageCost;
        wastagePct = details.wastagePct;
        unitPrice = details.unitPrice;
      } catch {
        compCost = 0;
        baseCost = 0;
        wastageCost = 0;
        wastagePct = 0;
        unitPrice = 0;
      }
    }
  } else {
    compCost = Number(c.computedAmount || c.totalCost || c.unitCost || 0) * cQty;
    baseCost = compCost;
    unitPrice = Number(c.unitCost || 0);
  }

  // Accumulate into category summaries
  if (kind === "material" || kind === "edge_band") {
    categories.materials += baseCost * multiplier;
  } else if (kind === "hardware") {
    categories.hardware += baseCost * multiplier;
  } else if (kind === "accessory") {
    categories.accessories += baseCost * multiplier;
  } else if (kind === "finish" || kind === "veneer") {
    categories.finishes += baseCost * multiplier;
  } else if (kind === "manufacturing") {
    categories.manufacturing += baseCost * multiplier;
  } else {
    categories.other += baseCost * multiplier;
  }

  categories.wastage += wastageCost * multiplier;

  return {
    id: c.id,
    kind: kind as any,
    catalogCode: c.catalogCode || c.code || null,
    name: c.name || c.label || name,
    qty: cQty,
    unitOfMeasure: c.unitOfMeasure || "piece",
    unitCost: unitPrice,
    baseCost: Math.round(baseCost * 100) / 100,
    wastagePct,
    wastageCost: Math.round(wastageCost * 100) / 100,
    totalCost: Math.round(compCost * 100) / 100,
  };
}

// ── Helper: Process Hierarchy and Compute Category Costs ───────────────────

function processHierarchyCosts(
  tree: any[],
  catalogLookup: CatalogLookup,
): {
  products: ProductCostItem[];
  categories: CostCategorySummary;
  totalManufacturingCost: number;
} {
  const categories: CostCategorySummary = {
    materials: 0,
    hardware: 0,
    accessories: 0,
    finishes: 0,
    manufacturing: 0,
    wastage: 0,
    factors: 0,
    other: 0,
  };

  const wastageMap = new Map<string, { pct: number }>();
  for (const r of catalogLookup.wastageRules) {
    wastageMap.set(`${r.scope}:${r.ref}`, { pct: r.pct });
  }

  const wastageLookup: WastageLookup = (scope, ref) => {
    const mat = wastageMap.get(`material:${ref}`);
    if (mat) return mat;
    return wastageMap.get(`material_type:${ref}`) ?? null;
  };

  const products: ProductCostItem[] = (tree || []).map((p: any) => {
    let productCost = 0;
    let productPrice = 0;

    const sections: SectionCostItem[] = (p.sections || []).map((s: any) => {
      let sectionCost = 0;
      let sectionPrice = 0;

      // Calculate aggregated section dimensions from child units:
      // w = sum(w_i * q_i), h = max(h_i), d = max(d_i)
      let sectionW = 0;
      let sectionH = 0;
      let sectionD = 0;
      let totalUnitQty = 0;

      for (const u of s.units || []) {
        const uQty = Number(u.qty || 1);
        totalUnitQty += uQty;
        const uw = Number(u.widthMm || u.width_mm || 0);
        const uh = Number(u.heightMm || u.height_mm || 0);
        const ud = Number(u.depthMm || u.depth_mm || 0);
        sectionW += uw * uQty;
        if (uh > sectionH) sectionH = uh;
        if (ud > sectionD) sectionD = ud;
      }

      const sectionDims = { w: sectionW, h: sectionH, d: sectionD };

      // Process section-level components if present
      const sectionComponentsList: ComponentCostItem[] = (s.components || []).map((c: any) => {
        const isPerUnit = c.multiplicationMode === "per_unit" || c.multiplication_mode === "per_unit";
        const sectionMult = isPerUnit ? Math.max(1, totalUnitQty) : 1;
        return evaluateComponentCost(
          c,
          sectionDims,
          catalogLookup,
          wastageLookup,
          sectionMult,
          categories,
          true,
        );
      });

      const sectionCompCost = sectionComponentsList.reduce((sum, c) => sum + c.totalCost, 0);
      sectionCost += sectionCompCost;
      sectionPrice += sectionCompCost * 1.3;

      const unitsList: UnitCostItem[] = (s.units || []).map((u: any) => {
        let unitCost = 0;
        const uQty = Number(u.qty || 1);

        const componentsList: ComponentCostItem[] = (u.components || []).map((c: any) => {
          const compItem = evaluateComponentCost(
            c,
            {
              w: Number(u.widthMm || u.width_mm || 0),
              h: Number(u.heightMm || u.height_mm || 0),
              d: Number(u.depthMm || u.depth_mm || 0),
            },
            catalogLookup,
            wastageLookup,
            uQty,
            categories,
          );
          unitCost += compItem.totalCost;
          return compItem;
        });

        const totalUnitCost = unitCost * uQty;
        const singleUnitPrice = Number(u.computedUnitPrice || u.sellingPrice || (totalUnitCost / uQty) * 1.3);
        const unitSellingPrice = Number(u.computedTotalPrice || singleUnitPrice * uQty);
        const { grossProfit, grossMarginPct } = computeProfitAndMargin(unitSellingPrice, totalUnitCost);

        sectionCost += totalUnitCost;
        sectionPrice += unitSellingPrice;

        return {
          id: u.id,
          name: u.name || u.label || "Unit",
          qty: uQty,
          dimensions: {
            widthMm: Number(u.widthMm || u.width_mm || 0),
            heightMm: Number(u.heightMm || u.height_mm || 0),
            depthMm: Number(u.depthMm || u.depth_mm || 0),
          },
          totalCost: Math.round(totalUnitCost * 100) / 100,
          sellingPrice: Math.round(unitSellingPrice * 100) / 100,
          grossProfit,
          grossMarginPct,
          components: componentsList,
        };
      });

      const { grossProfit, grossMarginPct } = computeProfitAndMargin(sectionPrice, sectionCost);
      productCost += sectionCost;
      productPrice += sectionPrice;

      return {
        id: s.id,
        name: s.name || s.label || "Section",
        totalCost: Math.round(sectionCost * 100) / 100,
        sellingPrice: Math.round(sectionPrice * 100) / 100,
        grossProfit,
        grossMarginPct,
        components: sectionComponentsList,
        units: unitsList,
      };
    });

    const { grossProfit, grossMarginPct } = computeProfitAndMargin(productPrice, productCost);

    return {
      id: p.id,
      name: p.name || p.label || p.productTypeCode || "Product",
      totalCost: Math.round(productCost * 100) / 100,
      sellingPrice: Math.round(productPrice * 100) / 100,
      grossProfit,
      grossMarginPct,
      sections,
    };
  });

  const totalManufacturingCost =
    categories.materials +
    categories.hardware +
    categories.accessories +
    categories.finishes +
    categories.manufacturing +
    categories.wastage +
    categories.other;

  return {
    products,
    categories: {
      materials: Math.round(categories.materials * 100) / 100,
      hardware: Math.round(categories.hardware * 100) / 100,
      accessories: Math.round(categories.accessories * 100) / 100,
      finishes: Math.round(categories.finishes * 100) / 100,
      manufacturing: Math.round(categories.manufacturing * 100) / 100,
      wastage: Math.round(categories.wastage * 100) / 100,
      factors: Math.round(categories.factors * 100) / 100,
      other: Math.round(categories.other * 100) / 100,
    },
    totalManufacturingCost: Math.round(totalManufacturingCost * 100) / 100,
  };
}

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * Get detailed V2 Cost Analysis and margin breakdown for a single quotation.
 * Uses immutable snapshot when available (for sent/accepted quotes) or live hierarchy for drafts.
 */
export const getQuotationCostAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetQuoteCostInput.parse(input))
  .handler(async ({ data, context }): Promise<QuotationCostAnalysis> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    // Server-side security check: workers cannot view sensitive cost/margins
    if (role === "worker") {
      throw new Error("Forbidden: insufficient permissions to view margin and cost data");
    }

    // 1. Fetch quote row
    const [quoteRow] = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        subtotal: quotes.subtotal,
        discountAmount: quotes.discountAmount,
        vatAmount: quotes.vatAmount,
        total: quotes.total,
        snapshot: quotes.snapshot,
        createdAt: quotes.createdAt,
        customerId: quotes.customerId,
        customerName: customers.name,
      })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .where(and(eq(quotes.id, data.quoteId), eq(quotes.tenantId, tenantId)))
      .limit(1);

    if (!quoteRow) {
      throw new Error("Quotation not found or access denied");
    }

    const catalogLookup = await buildCatalogLookup(tenantId);
    const snap = quoteRow.snapshot as any;
    let isSnapshot = false;
    let rawTree: any[] = [];

    // Check if quote has frozen snapshot in quotes.snapshot
    if (snap && snap.tree && Array.isArray(snap.tree) && snap.tree.length > 0) {
      rawTree = snap.tree;
      isSnapshot = true;
    } else {
      // Check quote_snapshots table
      const [snapshotRow] = await db
        .select()
        .from(quoteSnapshots)
        .where(
          and(
            eq(quoteSnapshots.quotationId, quoteRow.id),
            eq(quoteSnapshots.tenantId, tenantId),
          ),
        )
        .orderBy(desc(quoteSnapshots.createdAt))
        .limit(1);

      if (snapshotRow && (snapshotRow.treeJson as any)?.length > 0) {
        rawTree = snapshotRow.treeJson as any[];
        isSnapshot = true;
      }
    }

    // If still no snapshot, load live V2 hierarchy from database
    if (!isSnapshot) {
      const prods = await db
        .select()
        .from(quotationProducts)
        .where(
          and(
            eq(quotationProducts.quotationId, quoteRow.id),
            eq(quotationProducts.tenantId, tenantId),
          ),
        )
        .orderBy(quotationProducts.position);

      const prodIds = prods.map((p) => p.id);
      let secs: any[] = [];
      if (prodIds.length > 0) {
        secs = await db
          .select()
          .from(sections)
          .where(and(eq(sections.tenantId, tenantId), inArray(sections.quotationProductId, prodIds)))
          .orderBy(sections.position);
      }

      const secIds = secs.map((s) => s.id);
      let uRows: any[] = [];
      if (secIds.length > 0) {
        uRows = await db
          .select()
          .from(units)
          .where(and(eq(units.tenantId, tenantId), inArray(units.sectionId, secIds)))
          .orderBy(units.position);
      }

      const uIds = uRows.map((u) => u.id);
      let compRows: any[] = [];
      if (uIds.length > 0) {
        compRows = await db
          .select()
          .from(components)
          .where(and(eq(components.tenantId, tenantId), inArray(components.unitId, uIds)))
          .orderBy(components.position);
      }

      const compsByUnit: Record<string, any[]> = {};
      for (const c of compRows) {
        (compsByUnit[c.unitId] ||= []).push({
          id: c.id,
          kind: c.kind,
          catalogId: c.catalogId,
          qty: Number(c.qty || 1),
          unitOfMeasure: c.unitOfMeasure,
          areaFunctionKey: c.areaFunctionKey,
        });
      }

      const unitsBySec: Record<string, any[]> = {};
      for (const u of uRows) {
        (unitsBySec[u.sectionId] ||= []).push({
          id: u.id,
          widthMm: Number(u.widthMm || 0),
          heightMm: Number(u.heightMm || 0),
          depthMm: Number(u.depthMm || 0),
          qty: Number(u.qty || 1),
          components: compsByUnit[u.id] || [],
        });
      }

      const secsByProd: Record<string, any[]> = {};
      for (const s of secs) {
        (secsByProd[s.quotationProductId] ||= []).push({
          id: s.id,
          label: s.label,
          materialId: s.materialId,
          finishId: s.finishId,
          veneerId: s.veneerId,
          units: unitsBySec[s.id] || [],
        });
      }

      rawTree = prods.map((p) => ({
        id: p.id,
        label: p.label,
        productTypeCode: p.productTypeCode,
        sections: secsByProd[p.id] || [],
      }));
    }

    // Process costs across the hierarchy
    const processed = processHierarchyCosts(rawTree, catalogLookup);

    // Selling price before VAT is subtotal minus discount
    const sellingPriceBeforeVat = Math.max(
      0,
      Number(quoteRow.subtotal || 0) - Number(quoteRow.discountAmount || 0),
    );
    const vatAmount = Number(quoteRow.vatAmount || 0);
    const totalWithVat = Number(quoteRow.total || 0);

    const { grossProfit, grossMarginPct } = computeProfitAndMargin(
      sellingPriceBeforeVat,
      processed.totalManufacturingCost,
    );

    return {
      quotationId: quoteRow.id,
      quotationNumber: quoteRow.quoteNumber,
      customerName: quoteRow.customerName || null,
      status: quoteRow.status,
      createdAt: quoteRow.createdAt,
      isSnapshot,
      sellingPriceBeforeVat,
      vatAmount,
      totalWithVat,
      totalManufacturingCost: processed.totalManufacturingCost,
      grossProfit,
      grossMarginPct,
      categories: processed.categories,
      products: processed.products,
    };
  });

/**
 * Get Cost Analysis for an Order via its linked quotation snapshot.
 */
export const getOrderCostAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetOrderCostInput.parse(input))
  .handler(async ({ data, context }): Promise<QuotationCostAnalysis> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId } = ctx;

    const [orderRow] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        quoteId: orders.quoteId,
      })
      .from(orders)
      .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!orderRow || !orderRow.quoteId) {
      throw new Error("Order not found or has no linked quotation");
    }

    return getQuotationCostAnalysis({ data: { quoteId: orderRow.quoteId } });
  });

/**
 * Get global manufacturing cost analysis summary across all tenant quotations.
 */
export const getGlobalCostAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetGlobalCostInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<GlobalCostAnalysisSummary> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role === "worker") {
      throw new Error("Forbidden: insufficient permissions to view cost analysis");
    }

    const daysNum = Number(data.days || 90);
    const conditions = [eq(quotes.tenantId, tenantId)];

    if (daysNum > 0) {
      const since = new Date(Date.now() - daysNum * 86400_000);
      conditions.push(sql`${quotes.createdAt} >= ${since}`);
    }

    const quoteRows = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        subtotal: quotes.subtotal,
        total: quotes.total,
        createdAt: quotes.createdAt,
        customerName: customers.name,
      })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(quotes.createdAt))
      .limit(200);

    let totalSellingPrice = 0;
    let totalManufacturingCost = 0;
    const categories: CostCategorySummary = {
      materials: 0,
      hardware: 0,
      accessories: 0,
      finishes: 0,
      manufacturing: 0,
      wastage: 0,
      factors: 0,
      other: 0,
    };

    const quoteSummaries = [];

    // Analyze individual quotes
    for (const q of quoteRows) {
      try {
        const analysis = await getQuotationCostAnalysis({ data: { quoteId: q.id } });
        totalSellingPrice += analysis.sellingPriceBeforeVat;
        totalManufacturingCost += analysis.totalManufacturingCost;

        categories.materials += analysis.categories.materials;
        categories.hardware += analysis.categories.hardware;
        categories.accessories += analysis.categories.accessories;
        categories.finishes += analysis.categories.finishes;
        categories.manufacturing += analysis.categories.manufacturing;
        categories.wastage += analysis.categories.wastage;
        categories.other += analysis.categories.other;

        quoteSummaries.push({
          id: q.id,
          quoteNumber: q.quoteNumber,
          customerName: q.customerName || null,
          createdAt: q.createdAt,
          sellingPrice: analysis.sellingPriceBeforeVat,
          manufacturingCost: analysis.totalManufacturingCost,
          grossProfit: analysis.grossProfit,
          grossMarginPct: analysis.grossMarginPct,
          status: q.status,
        });
      } catch {
        // Skip unpriceable draft quotes gracefully
      }
    }

    const { grossProfit: totalGrossProfit, grossMarginPct: averageGrossMarginPct } =
      computeProfitAndMargin(totalSellingPrice, totalManufacturingCost);

    const totalCat = totalManufacturingCost > 0 ? totalManufacturingCost : 1;

    return {
      periodDays: daysNum,
      totalQuotesAnalyzed: quoteSummaries.length,
      totalSellingPrice: Math.round(totalSellingPrice * 100) / 100,
      totalManufacturingCost: Math.round(totalManufacturingCost * 100) / 100,
      totalGrossProfit,
      averageGrossMarginPct,
      categories: {
        materials: Math.round(categories.materials * 100) / 100,
        hardware: Math.round(categories.hardware * 100) / 100,
        accessories: Math.round(categories.accessories * 100) / 100,
        finishes: Math.round(categories.finishes * 100) / 100,
        manufacturing: Math.round(categories.manufacturing * 100) / 100,
        wastage: Math.round(categories.wastage * 100) / 100,
        factors: Math.round(categories.factors * 100) / 100,
        other: Math.round(categories.other * 100) / 100,
      },
      topMaterials: [
        {
          name: "الألواح والخامات الرئيسية (Main Materials)",
          cost: Math.round(categories.materials * 100) / 100,
          sharePct: Math.round((categories.materials / totalCat) * 1000) / 10,
        },
        {
          name: "التشطيب والقشرة (Finishes & Veneer)",
          cost: Math.round(categories.finishes * 100) / 100,
          sharePct: Math.round((categories.finishes / totalCat) * 1000) / 10,
        },
        {
          name: "الهدر الصناعي (Manufacturing Wastage)",
          cost: Math.round(categories.wastage * 100) / 100,
          sharePct: Math.round((categories.wastage / totalCat) * 1000) / 10,
        },
      ],
      topHardware: [
        {
          name: "المفصلات والميكانيزمات (Hardware & Hinges)",
          cost: Math.round(categories.hardware * 100) / 100,
          sharePct: Math.round((categories.hardware / totalCat) * 1000) / 10,
        },
        {
          name: "المقابض والإكسسوارات (Handles & Accessories)",
          cost: Math.round(categories.accessories * 100) / 100,
          sharePct: Math.round((categories.accessories / totalCat) * 1000) / 10,
        },
        {
          name: "عمليات التصنيع والقص (Manufacturing Ops)",
          cost: Math.round(categories.manufacturing * 100) / 100,
          sharePct: Math.round((categories.manufacturing / totalCat) * 1000) / 10,
        },
      ],
      quotes: quoteSummaries,
    };
  });
