import type { PaginatedResult } from "@/lib/customer-types";
import type { MaterialReadiness } from "@/lib/inventory-types";
import type { TaskItem } from "@/lib/task-types";

export type WorkOrderStatus =
  | "draft"
  | "ready"
  | "in_progress"
  | "qc_pending"
  | "completed"
  | "cancelled";

export type WorkOrderPriority = "low" | "medium" | "high" | "critical";

export interface ProductionWorkOrder {
  id: string;
  tenantId: string;
  workOrderNumber: string;
  orderId: string;
  orderNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  remakeId?: string | null;
  remakeNumber?: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  currentStage: string;
  materialReadiness: MaterialReadiness;
  notes?: string | null;
  scheduledDate?: string | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdBy?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CutListItem {
  id: string;
  workOrderNumber: string;
  orderNumber: string;
  productName: string;
  sectionName: string;
  unitName: string;
  componentName: string;
  materialSku: string;
  materialName: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  quantity: number;
  unitOfMeasure: string;
  grainDirection?: string;
  notes?: string;
}

export interface WorkOrderOperationItem {
  id: string;
  operationCode: string;
  name: string;
  stage: string;
  quantity: number;
  unit: string;
  unitName: string;
}

export interface WorkOrderDetailData {
  workOrder: ProductionWorkOrder;
  tree: any[];
  cutList: CutListItem[];
  operations: WorkOrderOperationItem[];
  reservedMaterials: {
    stockItemId: string;
    sku: string;
    name: string;
    unit: string;
    reservedQuantity: number;
    status: string;
  }[];
  materialReadiness: MaterialReadiness;
  qcInspections: any[];
  linkedTasks: TaskItem[];
}

export interface WorkOrderKpis {
  totalWorkOrders: number;
  readyCount: number;
  inProgressCount: number;
  qcPendingCount: number;
  completedCount: number;
}

export interface PaginatedWorkOrderResult extends PaginatedResult<ProductionWorkOrder> {
  kpis: WorkOrderKpis;
}
