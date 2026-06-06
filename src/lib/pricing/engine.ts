// Configurable pricing engine v2.
// Reads a pricing_rules.formula (JSON DSL) and computes a full breakdown.
// Steps: add (running total), snapshot (label current total), mul_pct (apply a % factor).

export interface EngineSelections {
  basePrice: number;
  materialCost: number;
  finishCost: number;
  veneerCost: number;
  accessoriesCost: number;
  qty: number;
}

export interface FactorMap {
  // key -> percent (e.g. labor: 15, margin: 25, luxury: 10)
  [key: string]: number;
}

export interface FormulaStep {
  op: 'add' | 'snapshot' | 'mul_pct';
  of?: string;        // for add: which selection bucket; for mul_pct: which snapshot/key
  as?: string;        // for snapshot: label
  factor?: string;    // for mul_pct: factor key
  add?: boolean;      // for mul_pct: add result back to running total
}

export interface Formula {
  steps: FormulaStep[];
}

export interface PricingBreakdownV2 {
  inputs: EngineSelections;
  appliedFactors: FactorMap;
  lines: { label: string; amount: number }[];
  snapshots: Record<string, number>;
  unitPrice: number;
  lineTotal: number;
  ruleVersion: number;
}

const SELECTION_KEYS: Record<string, keyof EngineSelections> = {
  base_cost: 'basePrice',
  material_cost: 'materialCost',
  finish_cost: 'finishCost',
  veneer_cost: 'veneerCost',
  accessories_cost: 'accessoriesCost',
};

export function runFormula(
  formula: Formula,
  selections: EngineSelections,
  factors: FactorMap,
  ruleVersion: number,
): PricingBreakdownV2 {
  let running = 0;
  const lines: { label: string; amount: number }[] = [];
  const snapshots: Record<string, number> = {};
  const appliedFactors: FactorMap = {};

  for (const step of formula.steps ?? []) {
    if (step.op === 'add' && step.of) {
      const key = SELECTION_KEYS[step.of];
      if (!key) continue;
      const v = Number(selections[key]) || 0;
      running += v;
      if (v) lines.push({ label: step.of, amount: v });
    } else if (step.op === 'snapshot' && step.as) {
      snapshots[step.as] = running;
    } else if (step.op === 'mul_pct' && step.factor) {
      const pct = Number(factors[step.factor]) || 0;
      const base = step.of && snapshots[step.of] != null ? snapshots[step.of] : running;
      const amount = base * (pct / 100);
      appliedFactors[step.factor] = pct;
      if (amount) lines.push({ label: step.factor, amount });
      if (step.add !== false) running += amount;
    }
  }

  const unitPrice = running;
  return {
    inputs: selections,
    appliedFactors,
    lines,
    snapshots,
    unitPrice,
    lineTotal: unitPrice * (selections.qty || 1),
    ruleVersion,
  };
}

export const DEFAULT_FORMULA: Formula = {
  steps: [
    { op: 'add', of: 'base_cost' },
    { op: 'add', of: 'material_cost' },
    { op: 'add', of: 'finish_cost' },
    { op: 'add', of: 'veneer_cost' },
    { op: 'add', of: 'accessories_cost' },
    { op: 'snapshot', as: 'subtotal_before_overhead' },
    { op: 'mul_pct', factor: 'labor', of: 'subtotal_before_overhead', add: true },
    { op: 'mul_pct', factor: 'wastage', of: 'subtotal_before_overhead', add: true },
    { op: 'mul_pct', factor: 'overhead', of: 'subtotal_before_overhead', add: true },
    { op: 'snapshot', as: 'cost_before_margin' },
    { op: 'mul_pct', factor: 'margin', of: 'cost_before_margin', add: true },
    { op: 'mul_pct', factor: 'luxury', add: true },
    { op: 'mul_pct', factor: 'complexity', add: true },
    { op: 'mul_pct', factor: 'rush', add: true },
  ],
};
