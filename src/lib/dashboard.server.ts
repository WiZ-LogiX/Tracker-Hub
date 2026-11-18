import { db } from "@/db/client.server";
import {
  invoices,
  quotes,
  orders,
  customers,
  productionWorkOrders,
  stockItems,
  remakes,
  qcInspections,
  deliveryHandovers,
  tasks,
  auditLog,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import type {
  ExecutiveDashboardData,
  AttentionItem,
  RecentActivityEvent,
} from "@/lib/dashboard-types";

/**
 * Pure data-fetching function executing all metrics aggregations
 * directly in PostgreSQL concurrently via Promise.all.
 */
export async function fetchExecutiveDashboardData(tenantId: string): Promise<ExecutiveDashboardData> {
  try {
    const invoiceAggPromise = db
      .select({
        totalInvoiced: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
        totalCollected: sql<string>`COALESCE(SUM(${invoices.paidAmount}), 0)`,
        unpaidCount: sql<number>`COUNT(CASE WHEN ${invoices.total} > ${invoices.paidAmount} THEN 1 END)::int`,
      })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId));

    const quotesAggPromise = db
      .select({
        totalQuotes: sql<number>`COUNT(*)::int`,
        totalPipelineValue: sql<string>`COALESCE(SUM(${quotes.total}), 0)`,
        draft: sql<number>`COUNT(CASE WHEN ${quotes.status} = 'draft' THEN 1 END)::int`,
        sent: sql<number>`COUNT(CASE WHEN ${quotes.status} = 'sent' THEN 1 END)::int`,
        accepted: sql<number>`COUNT(CASE WHEN ${quotes.status} = 'accepted' THEN 1 END)::int`,
        converted: sql<number>`COUNT(CASE WHEN ${quotes.status} = 'converted' THEN 1 END)::int`,
        rejected: sql<number>`COUNT(CASE WHEN ${quotes.status} = 'rejected' THEN 1 END)::int`,
      })
      .from(quotes)
      .where(eq(quotes.tenantId, tenantId));

    const recentQuotesPromise = db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerName: customers.name,
        status: quotes.status,
        total: quotes.total,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .where(eq(quotes.tenantId, tenantId))
      .orderBy(desc(quotes.createdAt))
      .limit(5);

    const ordersByStagePromise = db
      .select({
        stage: orders.currentStage,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .groupBy(orders.currentStage);

    const activeOrdersPromise = db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: customers.name,
        currentStage: orders.currentStage,
        total: orders.total,
        expectedDelivery: orders.expectedDelivery,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(
        and(
          eq(orders.tenantId, tenantId),
          sql`${orders.currentStage} NOT IN ('delivered', 'completed')`,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(5);

    const workOrdersAggPromise = db
      .select({
        total: sql<number>`COUNT(*)::int`,
        ready: sql<number>`COUNT(CASE WHEN ${productionWorkOrders.status} = 'ready' THEN 1 END)::int`,
        inProgress: sql<number>`COUNT(CASE WHEN ${productionWorkOrders.status} = 'in_progress' THEN 1 END)::int`,
        qcPending: sql<number>`COUNT(CASE WHEN ${productionWorkOrders.status} = 'qc_pending' THEN 1 END)::int`,
        completed: sql<number>`COUNT(CASE WHEN ${productionWorkOrders.status} = 'completed' THEN 1 END)::int`,
      })
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.tenantId, tenantId));

    const stockAggPromise = db
      .select({
        totalCount: sql<number>`COUNT(*)::int`,
        lowCount: sql<number>`COUNT(CASE WHEN (${stockItems.physicalQuantity} - ${stockItems.reservedQuantity}) < 5 THEN 1 END)::int`,
      })
      .from(stockItems)
      .where(eq(stockItems.tenantId, tenantId));

    const lowStockItemsPromise = db
      .select({
        id: stockItems.id,
        materialCode: sql<string>`COALESCE(${stockItems.sku}, ${stockItems.name})`,
        physicalQuantity: stockItems.physicalQuantity,
        reservedQuantity: stockItems.reservedQuantity,
        availableQuantity: sql<number>`(${stockItems.physicalQuantity} - ${stockItems.reservedQuantity})`,
      })
      .from(stockItems)
      .where(
        and(
          eq(stockItems.tenantId, tenantId),
          sql`(${stockItems.physicalQuantity} - ${stockItems.reservedQuantity}) < 5`,
        ),
      )
      .limit(5);

    const remakesAggPromise = db
      .select({
        openCount: sql<number>`COUNT(CASE WHEN ${remakes.status} NOT IN ('resolved', 'rejected') THEN 1 END)::int`,
        criticalCount: sql<number>`COUNT(CASE WHEN ${remakes.status} NOT IN ('resolved', 'rejected') AND ${remakes.severity} IN ('critical', 'high') THEN 1 END)::int`,
        inProgressCount: sql<number>`COUNT(CASE WHEN ${remakes.status} = 'in_progress' THEN 1 END)::int`,
        qcPendingCount: sql<number>`COUNT(CASE WHEN ${remakes.status} = 'qc_pending' THEN 1 END)::int`,
      })
      .from(remakes)
      .where(eq(remakes.tenantId, tenantId));

    const criticalRemakesPromise = db
      .select({
        id: remakes.id,
        remakeNumber: remakes.remakeNumber,
        defectDescription: remakes.defectDescription,
        reason: remakes.reason,
      })
      .from(remakes)
      .where(
        and(
          eq(remakes.tenantId, tenantId),
          sql`${remakes.status} NOT IN ('resolved', 'rejected')`,
          sql`${remakes.severity} IN ('critical', 'high')`,
        ),
      )
      .limit(3);

    const failedQcPromise = db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(qcInspections)
      .where(and(eq(qcInspections.tenantId, tenantId), eq(qcInspections.passed, false)));

    const deliveriesAggPromise = db
      .select({
        total: sql<number>`COUNT(*)::int`,
        ready: sql<number>`COUNT(CASE WHEN ${deliveryHandovers.status} = 'ready_for_dispatch' THEN 1 END)::int`,
        dispatched: sql<number>`COUNT(CASE WHEN ${deliveryHandovers.status} = 'dispatched' THEN 1 END)::int`,
        outForDelivery: sql<number>`COUNT(CASE WHEN ${deliveryHandovers.status} = 'out_for_delivery' THEN 1 END)::int`,
        installationPending: sql<number>`COUNT(CASE WHEN ${deliveryHandovers.status} = 'installation_pending' THEN 1 END)::int`,
        handoverPending: sql<number>`COUNT(CASE WHEN ${deliveryHandovers.status} = 'handover_pending' THEN 1 END)::int`,
        completed: sql<number>`COUNT(CASE WHEN ${deliveryHandovers.status} = 'completed' THEN 1 END)::int`,
      })
      .from(deliveryHandovers)
      .where(eq(deliveryHandovers.tenantId, tenantId));

    const pendingDeliveriesPromise = db
      .select({
        id: deliveryHandovers.id,
        deliveryNumber: deliveryHandovers.deliveryNumber,
        status: deliveryHandovers.status,
        scheduledDate: deliveryHandovers.scheduledDate,
      })
      .from(deliveryHandovers)
      .where(
        and(
          eq(deliveryHandovers.tenantId, tenantId),
          sql`${deliveryHandovers.status} IN ('ready_for_dispatch', 'installation_pending', 'handover_pending')`,
        ),
      )
      .limit(3);

    const tasksAggPromise = db
      .select({
        total: sql<number>`COUNT(*)::int`,
        open: sql<number>`COUNT(CASE WHEN ${tasks.status} NOT IN ('completed', 'cancelled') THEN 1 END)::int`,
        inProgress: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'in_progress' THEN 1 END)::int`,
        waitingReview: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'waiting_review' THEN 1 END)::int`,
        critical: sql<number>`COUNT(CASE WHEN ${tasks.status} NOT IN ('completed', 'cancelled') AND ${tasks.priority} IN ('critical', 'high') THEN 1 END)::int`,
        overdue: sql<number>`COUNT(CASE WHEN ${tasks.status} NOT IN ('completed', 'cancelled') AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < CURRENT_DATE THEN 1 END)::int`,
      })
      .from(tasks)
      .where(eq(tasks.tenantId, tenantId));

    const overdueTasksPromise = db
      .select({
        id: tasks.id,
        taskCode: tasks.taskCode,
        title: tasks.title,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          sql`${tasks.status} NOT IN ('completed', 'cancelled')`,
          sql`${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < CURRENT_DATE`,
        ),
      )
      .limit(2);

    const custCountPromise = db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(customers)
      .where(eq(customers.tenantId, tenantId));

    const auditPromise = db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        details: auditLog.details,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(8);

    // Concurrently await all 17 queries in parallel
    const [
      [invAgg],
      [qAgg],
      recentQuotesRows,
      orderStageRows,
      activeOrdersRows,
      [woAgg],
      [stkAgg],
      lowStockRows,
      [rmkAgg],
      criticalRemakeRows,
      [failedQcRow],
      [delAgg],
      pendingDelRows,
      [tskAgg],
      overdueTaskRows,
      [custRow],
      auditRows,
    ] = await Promise.all([
      invoiceAggPromise,
      quotesAggPromise,
      recentQuotesPromise,
      ordersByStagePromise,
      activeOrdersPromise,
      workOrdersAggPromise,
      stockAggPromise,
      lowStockItemsPromise,
      remakesAggPromise,
      criticalRemakesPromise,
      failedQcPromise,
      deliveriesAggPromise,
      pendingDeliveriesPromise,
      tasksAggPromise,
      overdueTasksPromise,
      custCountPromise,
      auditPromise,
    ]);

    // 1. Financial totals
    const totalInvoiced = Number(invAgg?.totalInvoiced || 0);
    const totalCollected = Number(invAgg?.totalCollected || 0);
    const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);
    const collectionRate =
      totalInvoiced > 0
        ? Math.min(100, (totalCollected / totalInvoiced) * 100)
        : 0;
    const unpaidInvoicesCount = Number(invAgg?.unpaidCount || 0);

    // 2. Commercial Quotes
    const totalQuotes = Number(qAgg?.totalQuotes || 0);
    const totalPipelineValue = Number(qAgg?.totalPipelineValue || 0);
    const quotesByStatus = {
      draft: Number(qAgg?.draft || 0),
      sent: Number(qAgg?.sent || 0),
      accepted: Number(qAgg?.accepted || 0),
      converted: Number(qAgg?.converted || 0),
      rejected: Number(qAgg?.rejected || 0),
    };
    const acceptedOrConverted = quotesByStatus.accepted + quotesByStatus.converted;
    const conversionRate = totalQuotes > 0 ? (acceptedOrConverted / totalQuotes) * 100 : 0;

    const recentQuotes = recentQuotesRows.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      customerName: q.customerName || "—",
      status: q.status,
      total: Number(q.total || 0),
      createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : "",
    }));

    // 3. Orders & Production
    const ordersByStage: Record<string, number> = {};
    let activeInProduction = 0;
    let maxStage = "";
    let maxCount = 0;

    for (const row of orderStageRows) {
      const st = row.stage || "cutting";
      const cnt = Number(row.count || 0);
      ordersByStage[st] = cnt;
      if (st !== "delivered" && st !== "completed") {
        activeInProduction += cnt;
        if (cnt > maxCount) {
          maxCount = cnt;
          maxStage = st;
        }
      }
    }
    const bottleneckStage = maxStage ? { stage: maxStage, count: maxCount } : null;

    const activeOrders = activeOrdersRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName || "—",
      currentStage: o.currentStage || "cutting",
      total: Number(o.total || 0),
      expectedDelivery: o.expectedDelivery || null,
      trackingToken: null,
    }));

    // 4. Attention Items Synthesis
    const attentionItems: AttentionItem[] = [];

    for (const cr of criticalRemakeRows) {
      attentionItems.push({
        id: `att-rmk-${cr.id}`,
        category: "quality",
        title: `إعادة تصنيع حرجة: ${cr.remakeNumber}`,
        description: cr.defectDescription || cr.reason || "مشكلة جودة تستدعي التدخل",
        severity: "critical",
        link: "/admin/remakes",
      });
    }

    for (const ls of lowStockRows.slice(0, 3)) {
      const avail = Number(ls.availableQuantity || 0);
      attentionItems.push({
        id: `att-stock-${ls.id}`,
        category: "inventory",
        title: `نقص خامات في المخزن: ${ls.materialCode}`,
        description: `المتبقي المتاح: ${avail} (محجوز: ${ls.reservedQuantity})`,
        severity: avail <= 0 ? "critical" : "warning",
        link: "/admin/inventory",
      });
    }

    for (const ot of overdueTaskRows) {
      attentionItems.push({
        id: `att-task-${ot.id}`,
        category: "task",
        title: `مهمة متأخرة: ${ot.taskCode}`,
        description: ot.title,
        severity: "warning",
        link: "/admin/tasks",
      });
    }

    for (const pd of pendingDelRows.slice(0, 2)) {
      attentionItems.push({
        id: `att-del-${pd.id}`,
        category: "delivery",
        title: `شحنة بانتظار الإجراء: ${pd.deliveryNumber}`,
        description: `الحالة: ${pd.status.replace(/_/g, " ")}${pd.scheduledDate ? ` • الموعد: ${pd.scheduledDate}` : ""}`,
        severity: "info",
        link: "/admin/deliveries",
      });
    }

    // 5. Recent Activity Feed
    const recentActivities: RecentActivityEvent[] = auditRows.map((a) => {
      let descStr = `${a.action.replace(/_/g, " ")} (${a.entityType})`;
      if (a.details && typeof a.details === "object") {
        const d = a.details as any;
        if (d.order_number) descStr = `أمر الإنتاج ${d.order_number}: ${a.action.replace(/_/g, " ")}`;
        else if (d.quote_number) descStr = `المقايسة ${d.quote_number}: ${a.action.replace(/_/g, " ")}`;
        else if (d.remake_number) descStr = `إعادة التصنيع ${d.remake_number}: ${a.action.replace(/_/g, " ")}`;
        else if (d.delivery_number) descStr = `الشحنة ${d.delivery_number}: ${a.action.replace(/_/g, " ")}`;
        else if (d.task_code) descStr = `المهمة ${d.task_code}: ${a.action.replace(/_/g, " ")}`;
      }

      return {
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId || "",
        description: descStr,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : "",
      };
    });

    return {
      financial: {
        totalInvoiced,
        totalCollected,
        outstandingBalance,
        collectionRate,
        unpaidInvoicesCount,
      },
      commercial: {
        totalQuotes,
        totalPipelineValue,
        conversionRate,
        byStatus: quotesByStatus,
        recentQuotes,
      },
      factory: {
        activeInProduction,
        ordersByStage,
        bottleneckStage,
        workOrders: {
          total: Number(woAgg?.total || 0),
          ready: Number(woAgg?.ready || 0),
          inProgress: Number(woAgg?.inProgress || 0),
          qcPending: Number(woAgg?.qcPending || 0),
          completed: Number(woAgg?.completed || 0),
        },
        activeOrders,
      },
      inventory: {
        totalStockItems: Number(stkAgg?.totalCount || 0),
        lowStockItemsCount: Number(stkAgg?.lowCount || 0),
        lowStockItems: lowStockRows.map((item) => ({
          id: item.id,
          materialCode: item.materialCode,
          physicalQuantity: Number(item.physicalQuantity || 0),
          reservedQuantity: Number(item.reservedQuantity || 0),
          availableQuantity: Number(item.availableQuantity || 0),
        })),
      },
      quality: {
        openRemakesCount: Number(rmkAgg?.openCount || 0),
        criticalRemakesCount: Number(rmkAgg?.criticalCount || 0),
        inProgressRemakesCount: Number(rmkAgg?.inProgressCount || 0),
        qcPendingCount: Number(rmkAgg?.qcPendingCount || 0),
        failedQcCount: Number(failedQcRow?.count || 0),
      },
      deliveries: {
        totalDeliveries: Number(delAgg?.total || 0),
        readyForDispatch: Number(delAgg?.ready || 0),
        dispatched: Number(delAgg?.dispatched || 0),
        outForDelivery: Number(delAgg?.outForDelivery || 0),
        installationPending: Number(delAgg?.installationPending || 0),
        handoverPending: Number(delAgg?.handoverPending || 0),
        completed: Number(delAgg?.completed || 0),
      },
      tasks: {
        totalTasks: Number(tskAgg?.total || 0),
        openTasks: Number(tskAgg?.open || 0),
        inProgressTasks: Number(tskAgg?.inProgress || 0),
        waitingReviewTasks: Number(tskAgg?.waitingReview || 0),
        criticalTasks: Number(tskAgg?.critical || 0),
        overdueTasks: Number(tskAgg?.overdue || 0),
      },
      customerCount: Number(custRow?.count || 0),
      attentionItems: attentionItems.slice(0, 8),
      recentActivities,
    };
  } catch (err) {
    console.error("[getExecutiveDashboard] Error aggregating metrics:", err);
    return {
      financial: {
        totalInvoiced: 0,
        totalCollected: 0,
        outstandingBalance: 0,
        collectionRate: 0,
        unpaidInvoicesCount: 0,
      },
      commercial: {
        totalQuotes: 0,
        totalPipelineValue: 0,
        conversionRate: 0,
        byStatus: { draft: 0, sent: 0, accepted: 0, converted: 0, rejected: 0 },
        recentQuotes: [],
      },
      factory: {
        activeInProduction: 0,
        ordersByStage: {},
        bottleneckStage: null,
        workOrders: { total: 0, ready: 0, inProgress: 0, qcPending: 0, completed: 0 },
        activeOrders: [],
      },
      inventory: {
        totalStockItems: 0,
        lowStockItemsCount: 0,
        lowStockItems: [],
      },
      quality: {
        openRemakesCount: 0,
        criticalRemakesCount: 0,
        inProgressRemakesCount: 0,
        qcPendingCount: 0,
        failedQcCount: 0,
      },
      deliveries: {
        totalDeliveries: 0,
        readyForDispatch: 0,
        dispatched: 0,
        outForDelivery: 0,
        installationPending: 0,
        handoverPending: 0,
        completed: 0,
      },
      tasks: {
        totalTasks: 0,
        openTasks: 0,
        inProgressTasks: 0,
        waitingReviewTasks: 0,
        criticalTasks: 0,
        overdueTasks: 0,
      },
      customerCount: 0,
      attentionItems: [],
      recentActivities: [],
    };
  }
}
