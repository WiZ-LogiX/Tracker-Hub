// Pricing engine — pure functions, no side effects, fully testable.
// Used by quotation server functions and client-side preview.

export type MaterialInput = {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  unit: string;
  price_per_unit: number;
  wastage_pct?: number | null;
  wastage_rules?: Array<{
    wastage_pct: number;
    min_dimension?: number | null;
    max_dimension?: number | null;
  }>;
};

export type QuoteItemInput = {
  material_id: string;
  quantity: number;
  width?: number;
  height?: number;
  length?: number;
  area_m2?: number;
  custom_price?: number;
};

/**
 * Calculate the applicable wastage percentage for a material based on dimensions.
 * Priority:
 * 1. Dimension-specific rule from wastage_rules table (exact match on range)
 * 2. Default rule from wastage_rules table (no min/max)
 * 3. Fallback to material.wastage_pct column
 * 4. 0
 */
export function getApplicableWastage(
  material: MaterialInput,
  dimension?: number
): number {
  // Try dimension-specific rules first
  if (dimension != null && material.wastage_rules?.length) {
    // Find matching rule where dimension falls within range
    const matchingRules = material.wastage_rules.filter((rule) => {
      const min = rule.min_dimension ?? -Infinity;
      const max = rule.max_dimension ?? Infinity;
      return dimension >= min && dimension <= max;
    });

    if (matchingRules.length > 0) {
      // Return the most specific rule (smallest range)
      const bestRule = matchingRules.sort((a, b) => {
        const aRange = (a.max_dimension ?? Infinity) - (a.min_dimension ?? -Infinity);
        const bRange = (b.max_dimension ?? Infinity) - (b.min_dimension ?? -Infinity);
        return aRange - bRange;
      })[0];
      return bestRule.wastage_pct;
    }
  }

  // Try default rule (no dimension constraints)
  if (material.wastage_rules?.length) {
    const defaultRule = material.wastage_rules.find(
      (r) => r.min_dimension == null && r.max_dimension == null
    );
    if (defaultRule) return defaultRule.wastage_pct;
  }

  // Fallback to material column
  if (material.wastage_pct != null && material.wastage_pct > 0) {
    return material.wastage_pct;
  }

  return 0;
}

/**
 * Calculate total area for a quote item
 */
export function calculateArea(item: QuoteItemInput): number {
  if (item.area_m2 != null && item.area_m2 > 0) {
    return item.area_m2;
  }
  // Calculate from dimensions (width * height in meters)
  // Assuming width/height are in cm, convert to m²
  if (item.width && item.height) {
    return (item.width / 100) * (item.height / 100);
  }
  // Fallback: if length provided, assume 1m width
  if (item.length) {
    return (item.length / 100) * 1;
  }
  return 0;
}

/**
 * Calculate material cost for a quote item including wastage
 */
export function calculateMaterialCost(
  material: MaterialInput,
  item: QuoteItemInput
): { baseCost: number; wastageCost: number; totalCost: number; wastagePct: number; area: number } {
  const area = calculateArea(item);
  const quantity = item.quantity || 1;
  const unitPrice = item.custom_price ?? material.price_per_unit;
  
  // Determine dimension for wastage lookup (use largest dimension)
  const dimension = Math.max(item.width ?? 0, item.height ?? 0, item.length ?? 0) || undefined;
  const wastagePct = getApplicableWastage(material, dimension);
  
  const baseCost = area * quantity * unitPrice;
  const wastageCost = baseCost * (wastagePct / 100);
  const totalCost = baseCost + wastageCost;

  return {
    baseCost,
    wastageCost,
    totalCost,
    wastagePct,
    area,
  };
}

/**
 * Calculate labor cost (placeholder - extend as needed)
 */
export function calculateLaborCost(
  _material: MaterialInput,
  item: QuoteItemInput,
  laborRatePerM2: number = 0
): number {
  const area = calculateArea(item);
  const quantity = item.quantity || 1;
  return area * quantity * laborRatePerM2;
}

/**
 * Calculate total quote cost
 */
export function calculateQuoteTotal(
  materials: MaterialInput[],
  items: QuoteItemInput[],
  laborRatePerM2: number = 0,
  overheadPct: number = 0,
  profitMarginPct: number = 0
): {
  items: Array<{
    material: MaterialInput;
    item: QuoteItemInput;
    baseCost: number;
    wastageCost: number;
    laborCost: number;
    totalCost: number;
    wastagePct: number;
    area: number;
  }>;
  subtotal: number;
  overhead: number;
  profit: number;
  grandTotal: number;
} {
  const calculatedItems = items.map((item) => {
    const material = materials.find((m) => m.id === item.material_id);
    if (!material) throw new Error(`Material not found: ${item.material_id}`);
    
    const { baseCost, wastageCost, totalCost: materialTotal, wastagePct, area } = 
      calculateMaterialCost(material, item);
    const laborCost = calculateLaborCost(material, item, laborRatePerM2);
    
    return {
      material,
      item,
      baseCost,
      wastageCost,
      laborCost,
      totalCost: materialTotal + laborCost,
      wastagePct,
      area,
    };
  });

  const subtotal = calculatedItems.reduce((sum, i) => sum + i.totalCost, 0);
  const overhead = subtotal * (overheadPct / 100);
  const profit = (subtotal + overhead) * (profitMarginPct / 100);
  const grandTotal = subtotal + overhead + profit;

  return { items: calculatedItems, subtotal, overhead, profit, grandTotal };
}

/**
 * Format EGP currency
 */
export function formatEGP(amount: number): string {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}