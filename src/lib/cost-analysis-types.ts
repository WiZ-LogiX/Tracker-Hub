export interface ComponentCostItem {
  id: string;
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band" | "veneer" | "finish";
  catalogCode?: string | null;
  name: string;
  qty: number;
  unitOfMeasure: string;
  unitCost: number;
  baseCost: number;
  wastagePct: number;
  wastageCost: number;
  totalCost: number;
}

export interface UnitCostItem {
  id: string;
  name: string;
  qty: number;
  dimensions?: { widthMm: number; heightMm: number; depthMm: number };
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  grossMarginPct: number;
  components: ComponentCostItem[];
}

export interface SectionCostItem {
  id: string;
  name: string;
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  grossMarginPct: number;
  components?: ComponentCostItem[];
  units: UnitCostItem[];
}

export interface ProductCostItem {
  id: string;
  name: string;
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  grossMarginPct: number;
  sections: SectionCostItem[];
}

export interface CostCategorySummary {
  materials: number;
  hardware: number;
  accessories: number;
  finishes: number;
  manufacturing: number;
  wastage: number;
  factors: number;
  other: number;
}

export interface QuotationCostAnalysis {
  quotationId: string;
  quotationNumber: string;
  customerName?: string | null;
  status: string;
  createdAt: string | Date;
  isSnapshot: boolean;
  sellingPriceBeforeVat: number;
  vatAmount: number;
  totalWithVat: number;
  totalManufacturingCost: number;
  grossProfit: number;
  grossMarginPct: number;
  categories: CostCategorySummary;
  products: ProductCostItem[];
}

export interface GlobalCostAnalysisSummary {
  periodDays: number;
  totalQuotesAnalyzed: number;
  totalSellingPrice: number;
  totalManufacturingCost: number;
  totalGrossProfit: number;
  averageGrossMarginPct: number;
  categories: CostCategorySummary;
  topMaterials: { name: string; cost: number; sharePct: number }[];
  topHardware: { name: string; cost: number; sharePct: number }[];
  quotes: {
    id: string;
    quoteNumber: string;
    customerName?: string | null;
    createdAt: string | Date;
    sellingPrice: number;
    manufacturingCost: number;
    grossProfit: number;
    grossMarginPct: number;
    status: string;
  }[];
}

/**
 * Deterministic helper to compute gross profit and gross margin percentage safely.
 */
export function computeProfitAndMargin(
  sellingPriceBeforeVat: number,
  totalManufacturingCost: number,
): { grossProfit: number; grossMarginPct: number } {
  const grossProfit = Math.round((sellingPriceBeforeVat - totalManufacturingCost) * 100) / 100;
  let grossMarginPct = 0;
  if (sellingPriceBeforeVat > 0) {
    grossMarginPct = Math.round((grossProfit / sellingPriceBeforeVat) * 10000) / 100;
  }
  return {
    grossProfit,
    grossMarginPct: isNaN(grossMarginPct) || !isFinite(grossMarginPct) ? 0 : grossMarginPct,
  };
}
