// Centralized pricing engine — single source of truth.
// All formula logic lives here, NOT scattered across components.

export interface PricingInputs {
  basePrice: number;        // product base
  dimensionValue: number;   // linear meters, m², or units
  qty: number;
  materialPricePerUnit: number;
  finishPctModifier: number; // e.g. 12 means +12%
  finishFixedModifier: number;
  accessoriesTotal: number;
  laborPct: number;
  wastagePct: number;
  overheadPct: number;
  marginPct: number;
}

export interface PricingBreakdown {
  baseCost: number;
  materialCost: number;
  finishCost: number;
  accessoriesCost: number;
  subtotalBeforeOverhead: number;
  laborAmount: number;
  wastageAmount: number;
  overheadAmount: number;
  marginAmount: number;
  unitPrice: number;
  lineTotal: number;
}

export function calculateLine(i: PricingInputs): PricingBreakdown {
  const baseCost = i.basePrice;
  const materialCost = i.materialPricePerUnit * i.dimensionValue;
  const subtotalRaw = baseCost + materialCost;
  const finishCost = subtotalRaw * (i.finishPctModifier / 100) + i.finishFixedModifier;
  const accessoriesCost = i.accessoriesTotal;

  const subtotalBeforeOverhead = baseCost + materialCost + finishCost + accessoriesCost;

  const laborAmount = subtotalBeforeOverhead * (i.laborPct / 100);
  const wastageAmount = subtotalBeforeOverhead * (i.wastagePct / 100);
  const overheadAmount = subtotalBeforeOverhead * (i.overheadPct / 100);

  const costBeforeMargin = subtotalBeforeOverhead + laborAmount + wastageAmount + overheadAmount;
  const marginAmount = costBeforeMargin * (i.marginPct / 100);

  const unitPrice = costBeforeMargin + marginAmount;
  const lineTotal = unitPrice * i.qty;

  return {
    baseCost,
    materialCost,
    finishCost,
    accessoriesCost,
    subtotalBeforeOverhead,
    laborAmount,
    wastageAmount,
    overheadAmount,
    marginAmount,
    unitPrice,
    lineTotal,
  };
}

export interface QuoteTotalsInput {
  itemsLineTotalSum: number;
  discountType?: 'percentage' | 'fixed' | null;
  discountValue?: number;
  discountMaxValue?: number | null;
  vatPct?: number; // default 14
}

export interface QuoteTotals {
  subtotal: number;
  discountAmount: number;
  vatBase: number;
  vatAmount: number;
  total: number;
}

export function calculateQuoteTotals(i: QuoteTotalsInput): QuoteTotals {
  const subtotal = i.itemsLineTotalSum;
  const vatPct = i.vatPct ?? 14;

  let discountAmount = 0;
  if (i.discountType && i.discountValue) {
    if (i.discountType === 'percentage') {
      discountAmount = subtotal * (i.discountValue / 100);
    } else {
      discountAmount = i.discountValue;
    }
    if (i.discountMaxValue != null) {
      discountAmount = Math.min(discountAmount, i.discountMaxValue);
    }
    discountAmount = Math.min(discountAmount, subtotal);
  }

  const vatBase = subtotal - discountAmount;
  const vatAmount = vatBase * (vatPct / 100);
  const total = vatBase + vatAmount;

  return { subtotal, discountAmount, vatBase, vatAmount, total };
}

export function formatEGP(n: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(n || 0);
}
