import type { CutListItem } from "@/lib/work-order-types";

export function extractCutListFromTree(
  tree: any[],
  workOrderNumber: string,
  orderNumber: string,
): CutListItem[] {
  const cutList: CutListItem[] = [];
  let itemIdx = 1;

  for (const prod of tree || []) {
    const productName = prod.name || prod.productName || "Product";
    for (const sec of prod.sections || []) {
      const sectionName = sec.name || sec.sectionName || "Section";
      for (const unit of sec.units || []) {
        const unitName = unit.name || unit.unitName || "Unit";
        const uQty = Number(unit.qty || 1);

        for (const comp of unit.components || []) {
          const kind = comp.kind;
          // Cut list items are raw board/material components
          if (kind === "material") {
            const compQty = Number(comp.qty || 1) * uQty;
            const lengthMm = Number(comp.lengthMm || comp.heightMm || comp.length || 0);
            const widthMm = Number(comp.widthMm || comp.width || 0);
            const thicknessMm = Number(comp.thicknessMm || comp.thickness || 18);

            cutList.push({
              id: `cut-${itemIdx++}`,
              workOrderNumber,
              orderNumber,
              productName,
              sectionName,
              unitName,
              componentName: comp.name || comp.label || comp.componentName || "Panel",
              materialSku: comp.catalogCode || comp.sku || `MAT-${(comp.catalogId || "").slice(0, 6)}`,
              materialName: comp.materialName || comp.labelI18nKey || comp.name || "Raw Board",
              lengthMm,
              widthMm,
              thicknessMm,
              quantity: Math.round(compQty * 100) / 100,
              unitOfMeasure: comp.unitOfMeasure || "sheet",
              grainDirection: comp.grainDirection || "along_length",
              notes: comp.notes || undefined,
            });
          }
        }
      }
    }
  }

  return cutList;
}
