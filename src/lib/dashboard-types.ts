export interface FinancialOverview {
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  collectionRate: number;
  unpaidInvoicesCount: number;
}

export interface CommercialPipeline {
  totalQuotes: number;
  totalPipelineValue: number;
  conversionRate: number;
  byStatus: {
    draft: number;
    sent: number;
    accepted: number;
    converted: number;
    rejected: number;
  };
  recentQuotes: Array<{
    id: string;
    quoteNumber: string;
    customerName: string;
    status: string;
    total: number;
    createdAt: string;
  }>;
}

export interface FactoryOperations {
  activeInProduction: number;
  ordersByStage: Record<string, number>;
  bottleneckStage: { stage: string; count: number } | null;
  workOrders: {
    total: number;
    ready: number;
    inProgress: number;
    qcPending: number;
    completed: number;
  };
  activeOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    currentStage: string;
    total: number;
    expectedDelivery: string | null;
    trackingToken: string | null;
  }>;
}

export interface InventoryHealth {
  totalStockItems: number;
  lowStockItemsCount: number;
  lowStockItems: Array<{
    id: string;
    materialCode: string;
    physicalQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }>;
}

export interface QualityRemakeHealth {
  openRemakesCount: number;
  criticalRemakesCount: number;
  inProgressRemakesCount: number;
  qcPendingCount: number;
  failedQcCount: number;
}

export interface DeliveryInstallationHealth {
  totalDeliveries: number;
  readyForDispatch: number;
  dispatched: number;
  outForDelivery: number;
  installationPending: number;
  handoverPending: number;
  completed: number;
}

export interface TaskOperationsSummary {
  totalTasks: number;
  openTasks: number;
  inProgressTasks: number;
  waitingReviewTasks: number;
  criticalTasks: number;
  overdueTasks: number;
}

export interface AttentionItem {
  id: string;
  category: "quality" | "inventory" | "delivery" | "task" | "finance" | "order";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  link: string;
  createdAt?: string;
}

export interface RecentActivityEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  createdAt: string;
}

export interface ExecutiveDashboardData {
  financial: FinancialOverview;
  commercial: CommercialPipeline;
  factory: FactoryOperations;
  inventory: InventoryHealth;
  quality: QualityRemakeHealth;
  deliveries: DeliveryInstallationHealth;
  tasks: TaskOperationsSummary;
  customerCount: number;
  attentionItems: AttentionItem[];
  recentActivities: RecentActivityEvent[];
}
