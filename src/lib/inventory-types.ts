import type { PaginatedResult } from "@/lib/customer-types";

export type StockItemType = "material" | "hardware";

export type ReservationStatus = "reserved" | "consumed" | "released" | "cancelled";

export type MaterialReadiness = "READY" | "PARTIAL" | "BLOCKED";

export interface StockItem {
  id: string;
  tenantId: string;
  catalogItemId: string;
  itemType: StockItemType;
  category?: string;
  sku: string;
  name: string;
  unit: string;
  physicalQuantity: number;
  reservedQuantity: number;
  freeQuantity: number;
  minReorderLevel: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface StockReservationItem {
  id: string;
  tenantId: string;
  stockItemId: string;
  orderId: string;
  remakeId?: string | null;
  quantity: number;
  unit: string;
  status: ReservationStatus;
  sku: string;
  name: string;
  createdAt: string | Date;
  releasedAt?: string | Date | null;
  consumedAt?: string | Date | null;
}

export interface StockAdjustmentRecord {
  id: string;
  tenantId: string;
  stockItemId: string;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string | Date;
}

export interface OrderMaterialRequirementItem {
  catalogItemId: string;
  itemType: StockItemType;
  sku: string;
  name: string;
  unit: string;
  requiredQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
  freeQuantity: number;
  reservedForThisOrder: number;
  shortage: number;
  status: "available" | "reserved" | "shortage";
}

export interface OrderMaterialReadinessSummary {
  orderId: string;
  orderNumber: string;
  readiness: MaterialReadiness;
  totalRequiredItems: number;
  fullyAvailableItems: number;
  reservedItems: number;
  shortageItems: number;
  requirements: OrderMaterialRequirementItem[];
}

export interface StockKpis {
  totalItems: number;
  materialsCount: number;
  hardwareCount: number;
  lowStockCount: number;
  totalReservedUnits: number;
  materialsLowStockCount?: number;
  hardwareLowStockCount?: number;
  materialsTotalStock?: number;
  hardwareTotalStock?: number;
  materialsReservedUnits?: number;
  hardwareReservedUnits?: number;
}

export interface PaginatedStockResult extends PaginatedResult<StockItem> {
  kpis: StockKpis;
}

export interface StockItemDetails {
  item: StockItem;
  costPrice?: number;
  adjustments: StockAdjustmentRecord[];
  reservations: StockReservationItem[];
}

export interface InventoryCategoryDef {
  key: string;
  labelEn: string;
  labelAr: string;
  labelFr: string;
  itemType: StockItemType;
}

export const MATERIAL_CATEGORIES: InventoryCategoryDef[] = [
  { key: "all", labelEn: "All Materials", labelAr: "كافة الخامات", labelFr: "Tous les matériaux", itemType: "material" },
  { key: "mdf", labelEn: "MDF & HDF", labelAr: "إم دي إف وألواح مضغوطة", labelFr: "MDF & HDF", itemType: "material" },
  { key: "plywood", labelEn: "Plywood & Counter", labelAr: "أبلكاج وخشب كونتر", labelFr: "Contreplaqué & Blockboard", itemType: "material" },
  { key: "solid_wood", labelEn: "Solid Wood", labelAr: "خشب طبيعي", labelFr: "Bois massif", itemType: "material" },
  { key: "laminates", labelEn: "Laminates & HPL", labelAr: "فينير وفورميكا / HPL", labelFr: "Stratifiés & HPL", itemType: "material" },
  { key: "glass_metal", labelEn: "Glass & Metal Profiles", labelAr: "زجاج وقطاعات معدنية", labelFr: "Verre & Profilés", itemType: "material" },
  { key: "other", labelEn: "Other Materials", labelAr: "خامات أخرى", labelFr: "Autres matériaux", itemType: "material" },
];

export const HARDWARE_CATEGORIES: InventoryCategoryDef[] = [
  { key: "all", labelEn: "All Hardware", labelAr: "كافة الإكسسوارات", labelFr: "Toute la quincaillerie", itemType: "hardware" },
  { key: "hinges", labelEn: "Hinges & Pivots", labelAr: "مفصلات", labelFr: "Charnières & Pivots", itemType: "hardware" },
  { key: "handles", labelEn: "Handles & Knobs", labelAr: "مقابض وأوكر", labelFr: "Poignées & Boutons", itemType: "hardware" },
  { key: "runners", labelEn: "Drawer Runners & Slides", labelAr: "سكك ومجاري أدراج", labelFr: "Coulisses & Tiroirs", itemType: "hardware" },
  { key: "fasteners", labelEn: "Fasteners & Screws", labelAr: "مسامير وتثبيتات", labelFr: "Visserie & Fixations", itemType: "hardware" },
  { key: "locks", labelEn: "Locks & Latches", labelAr: "كوالين وأقفال", labelFr: "Serrures & Verrous", itemType: "hardware" },
  { key: "brackets", labelEn: "Brackets & Supports", labelAr: "زوايا ودعامات", labelFr: "Équerres & Supports", itemType: "hardware" },
  { key: "other", labelEn: "Other Hardware", labelAr: "إكسسوارات أخرى", labelFr: "Autres accessoires", itemType: "hardware" },
];

export function inferItemCategory(
  itemType: StockItemType,
  name: string = "",
  sku: string = "",
): string {
  const text = `${sku} ${name}`.toLowerCase();
  if (itemType === "material") {
    if (/mdf|hdf|fiberboard|مضغوط|ام دي اف|إم دي إف/.test(text)) return "mdf";
    if (/ply|counter|blockboard|ابلكاج|أبلكاج|كونتر|بلايوود/.test(text)) return "plywood";
    if (/oak|beech|ash|pine|walnut|wood|زان|ارو|أرو|سويد|موسكي|طبيعي/.test(text)) return "solid_wood";
    if (/hpl|laminate|veneer|melamine|فورميكا|قشرة|ميلامين/.test(text)) return "laminates";
    if (/glass|profile|metal|alu|steel|iron|قطاع|الومنيوم|ألومنيوم|زجاج|حديد/.test(text)) return "glass_metal";
    return "other";
  } else {
    if (/hinge|pivot|مفصل|مفصلات/.test(text)) return "hinges";
    if (/handle|knob|pull|مقبض|مقابض|اوكر|أوكر/.test(text)) return "handles";
    if (/runner|slide|rail|مجرى|مجارى|سكة|ادراج|أدراج/.test(text)) return "runners";
    if (/screw|bolt|nut|anchor|fastener|مسمار|مسامير|خابور|صامولة/.test(text)) return "fasteners";
    if (/lock|latch|catch|كالون|قفل|ترباس/.test(text)) return "locks";
    if (/bracket|support|leg|corner|زاوية|حامل|رجل|كابولي/.test(text)) return "brackets";
    return "other";
  }
}

export function getCategoryLabel(
  categoryKey: string,
  itemType: StockItemType,
  lang: string = "en",
): string {
  const list = itemType === "material" ? MATERIAL_CATEGORIES : HARDWARE_CATEGORIES;
  const found = list.find((c) => c.key === categoryKey);
  if (!found) return categoryKey;
  if (lang === "ar") return found.labelAr;
  if (lang === "fr") return found.labelFr;
  return found.labelEn;
}
