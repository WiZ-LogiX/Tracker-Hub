import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
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
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import type {
  ExecutiveDashboardData,
  AttentionItem,
  RecentActivityEvent,
} from "@/lib/dashboard-types";

const DashboardInput = z.object({}).optional().default({});

export const getExecutiveDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => DashboardInput.parse(input ?? {}))
  .handler(async ({ context }): Promise<ExecutiveDashboardData> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Executive Dashboard");
    const { tenantId } = ctx;

    try {
      // 1. Invoices & Financials
      const invoiceRows = await db
        .select({
          total: invoices.total,
          paidAmount: invoices.paidAmount,
        })
        .from(invoices)
        .where(eq(invoices.tenantId, tenantId));

      let totalInvoiced = 0;
      let totalCollected = 0;
      let unpaidInvoicesCount = 0;

      for (const inv of invoiceRows) {
        const tot = Number(inv.total || 0);
        const paid = Number(inv.paidAmount || 0);
        totalInvoiced += tot;
        totalCollected += paid;
        if (tot > paid) {
          unpaidInvoicesCount++;
        }
      }

      const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);
      const collectionRate =
        totalInvoiced > 0
          ? Math.min(100, (totalCollected / totalInvoiced) * 100)
          : 0;

      // 2. Commercial Quotes
      const quotesRows = await db
        .select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
          status: quotes.status,
          total: quotes.total,
          createdAt: quotes.createdAt,
          customerId: quotes.customerId,
        })
        .from(quotes)
        .where(eq(quotes.tenantId, tenantId))
        .orderBy(desc(quotes.createdAt));

      let totalPipelineValue = 0;
      const quotesByStatus = {
        draft: 0,
        sent: 0,
        accepted: 0,
        converted: 0,
        rejected: 0,
      };

      for (const q of quotesRows) {
        totalPipelineValue += Number(q.total || 0);
        const st = q.status as keyof typeof quotesByStatus;
        if (quotesByStatus[st] !== undefined) {
          quotesByStatus[st]++;
        }
      }

      const acceptedOrConverted =
        quotesByStatus.accepted + quotesByStatus.converted;
      const conversionRate =
        quotesRows.length > 0
          ? (acceptedOrConverted / quotesRows.length) * 100
          : 0;

      // Resolve customer names for recent 5 quotes
      const recentQuotesRaw = quotesRows.slice(0, 5);
      const customerIdsToFetch = [
        ...new Set(recentQuotesRaw.map((q) => q.customerId).filter(Boolean)),
      ] as string[];

      let customerMap: Record<string, string> = {};
      if (customerIdsToFetch.length > 0) {
        const custRows = await db
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              inArray(customers.id, customerIdsToFetch),
            ),
          );
        for (const c of custRows) {
          customerMap[c.id] = c.name;
        }
      }

      const recentQuotes = recentQuotesRaw.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        customerName: (q.customerId && customerMap[q.customerId]) || "—",
        status: q.status,
        total: Number(q.total || 0),
        createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : "",
      }));

      // 3. Orders & Production
      const ordersRows = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          currentStage: orders.currentStage,
          total: orders.total,
          expectedDelivery: orders.expectedDelivery,
          trackingToken: sql<string | null>`NULL`.as("tracking_token"),
          customerId: orders.customerId,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.tenantId, tenantId))
        .orderBy(desc(orders.createdAt));

      const ordersByStage: Record<string, number> = {};
      let activeInProduction = 0;

      for (const ord of ordersRows) {
        const st = ord.currentStage || "cutting";
        ordersByStage[st] = (ordersByStage[st] || 0) + 1;
        if (st !== "delivered" && st !== "completed") {
          activeInProduction++;
        }
      }

      // Find bottleneck stage
      let maxStage = "";
      let maxCount = 0;
      for (const [st, cnt] of Object.entries(ordersByStage)) {
        if (st !== "delivered" && st !== "completed" && cnt > maxCount) {
          maxCount = cnt;
          maxStage = st;
        }
      }
      const bottleneckStage = maxStage ? { stage: maxStage, count: maxCount } : null;

      // Resolve customer names for active orders
      const activeOrdersRaw = ordersRows
        .filter((o) => o.currentStage !== "delivered" && o.currentStage !== "completed")
        .slice(0, 5);

      const activeCustIds = [
        ...new Set(activeOrdersRaw.map((o) => o.customerId).filter(Boolean)),
      ] as string[];

      if (activeCustIds.length > 0) {
        const missingIds = activeCustIds.filter((id) => !customerMap[id]);
        if (missingIds.length > 0) {
          const custRows = await db
            .select({ id: customers.id, name: customers.name })
            .from(customers)
            .where(
              and(
                eq(customers.tenantId, tenantId),
                inArray(customers.id, missingIds),
              ),
            );
          for (const c of custRows) {
            customerMap[c.id] = c.name;
          }
        }
      }

      const activeOrders = activeOrdersRaw.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: (o.customerId && customerMap[o.customerId]) || "—",
        currentStage: o.currentStage || "cutting",
        total: Number(o.total || 0),
        expectedDelivery: o.expectedDelivery || null,
        trackingToken: o.trackingToken || null,
      }));

      // 4. Work Orders
      const workOrderRows = await db
        .select({
          status: productionWorkOrders.status,
        })
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.tenantId, tenantId));

      let woReady = 0;
      let woInProgress = 0;
      let woQcPending = 0;
      let woCompleted = 0;

      for (const wo of workOrderRows) {
        if (wo.status === "ready") woReady++;
        if (wo.status === "in_progress") woInProgress++;
        if (wo.status === "qc_pending") woQcPending++;
        if (wo.status === "completed") woCompleted++;
      }

      // 5. Inventory & Stock
      const stockRows = await db
        .select({
          id: stockItems.id,
          sku: stockItems.sku,
          name: stockItems.name,
          physicalQuantity: stockItems.physicalQuantity,
          reservedQuantity: stockItems.reservedQuantity,
        })
        .from(stockItems)
        .where(eq(stockItems.tenantId, tenantId));

      const lowStockItems: Array<{
        id: string;
        materialCode: string;
        physicalQuantity: number;
        reservedQuantity: number;
        availableQuantity: number;
      }> = [];

      for (const item of stockRows) {
        const phys = Number(item.physicalQuantity || 0);
        const res = Number(item.reservedQuantity || 0);
        const avail = phys - res;
        if (avail < 5) {
          lowStockItems.push({
            id: item.id,
            materialCode: item.sku || item.name,
            physicalQuantity: phys,
            reservedQuantity: res,
            availableQuantity: avail,
          });
        }
      }

      // 6. Quality & Remakes
      const remakeRows = await db
        .select({
          id: remakes.id,
          remakeNumber: remakes.remakeNumber,
          status: remakes.status,
          severity: remakes.severity,
          reason: remakes.reason,
          defectDescription: remakes.defectDescription,
        })
        .from(remakes)
        .where(eq(remakes.tenantId, tenantId));

      let openRemakesCount = 0;
      let criticalRemakesCount = 0;
      let inProgressRemakesCount = 0;
      let qcPendingCount = 0;

      const criticalRemakeItems: typeof remakeRows = [];

      for (const r of remakeRows) {
        if (r.status !== "resolved" && r.status !== "rejected") {
          openRemakesCount++;
          if (r.status === "in_progress") inProgressRemakesCount++;
          if (r.status === "qc_pending") qcPendingCount++;
          if (r.severity === "critical" || r.severity === "high") {
            criticalRemakesCount++;
            criticalRemakeItems.push(r);
          }
        }
      }

      // QC Inspections failed count
      const [failedQcRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(qcInspections)
        .where(
          and(
            eq(qcInspections.tenantId, tenantId),
            eq(qcInspections.passed, false),
          ),
        );
      const failedQcCount = Number(failedQcRow?.count || 0);

      // 7. Deliveries & Handover
      const deliveryRows = await db
        .select({
          id: deliveryHandovers.id,
          deliveryNumber: deliveryHandovers.deliveryNumber,
          status: deliveryHandovers.status,
          installationRequired: deliveryHandovers.installationRequired,
          scheduledDate: deliveryHandovers.scheduledDate,
        })
        .from(deliveryHandovers)
        .where(eq(deliveryHandovers.tenantId, tenantId));

      let delReady = 0;
      let delDispatched = 0;
      let delOut = 0;
      let delInstPending = 0;
      let delHandoverPending = 0;
      let delCompleted = 0;

      const pendingDeliveriesList: typeof deliveryRows = [];

      for (const d of deliveryRows) {
        if (d.status === "ready_for_dispatch") {
          delReady++;
          pendingDeliveriesList.push(d);
        }
        if (d.status === "dispatched") delDispatched++;
        if (d.status === "out_for_delivery") delOut++;
        if (d.status === "installation_pending") {
          delInstPending++;
          pendingDeliveriesList.push(d);
        }
        if (d.status === "handover_pending") {
          delHandoverPending++;
          pendingDeliveriesList.push(d);
        }
        if (d.status === "completed") delCompleted++;
      }

      // 8. Tasks Summary
      const taskRows = await db
        .select({
          id: tasks.id,
          taskCode: tasks.taskCode,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(eq(tasks.tenantId, tenantId));

      const todayStr = new Date().toISOString().slice(0, 10);
      let openTasks = 0;
      let inProgressTasks = 0;
      let waitingReviewTasks = 0;
      let criticalTasks = 0;
      let overdueTasks = 0;

      const overdueTaskList: typeof taskRows = [];

      for (const t of taskRows) {
        if (t.status !== "completed" && t.status !== "cancelled") {
          openTasks++;
          if (t.status === "in_progress") inProgressTasks++;
          if (t.status === "waiting_review") waitingReviewTasks++;
          if (t.priority === "critical" || t.priority === "high") criticalTasks++;
          if (t.dueDate) {
            const dueStr = new Date(t.dueDate).toISOString().slice(0, 10);
            if (dueStr < todayStr) {
              overdueTasks++;
              overdueTaskList.push(t);
            }
          }
        }
      }

      // 9. Customers Count
      const [custCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customers)
        .where(eq(customers.tenantId, tenantId));
      const customerCount = Number(custCountRow?.count || 0);

      // 10. Synthesize Attention Items (Needs Attention)
      const attentionItems: AttentionItem[] = [];

      // Critical Remakes
      for (const cr of criticalRemakeItems.slice(0, 3)) {
        attentionItems.push({
          id: `att-rmk-${cr.id}`,
          category: "quality",
          title: `إعادة تصنيع حرجة: ${cr.remakeNumber}`,
          description: cr.defectDescription || cr.reason || "مشكلة جودة تستدعي التدخل",
          severity: "critical",
          link: "/admin/remakes",
        });
      }

      // Low stock / shortages
      for (const ls of lowStockItems.slice(0, 3)) {
        attentionItems.push({
          id: `att-stock-${ls.id}`,
          category: "inventory",
          title: `نقص خامات في المخزن: ${ls.materialCode}`,
          description: `المتبقي المتاح: ${ls.availableQuantity} (محجوز: ${ls.reservedQuantity})`,
          severity: ls.availableQuantity <= 0 ? "critical" : "warning",
          link: "/admin/inventory",
        });
      }

      // Overdue Tasks
      for (const ot of overdueTaskList.slice(0, 2)) {
        attentionItems.push({
          id: `att-task-${ot.id}`,
          category: "task",
          title: `مهمة متأخرة: ${ot.taskCode}`,
          description: ot.title,
          severity: "warning",
          link: "/admin/tasks",
        });
      }

      // Deliveries needing action
      for (const pd of pendingDeliveriesList.slice(0, 2)) {
        attentionItems.push({
          id: `att-del-${pd.id}`,
          category: "delivery",
          title: `شحنة بانتظار الإجراء: ${pd.deliveryNumber}`,
          description: `الحالة: ${pd.status.replace(/_/g, " ")}${pd.scheduledDate ? ` • الموعد: ${pd.scheduledDate}` : ""}`,
          severity: "info",
          link: "/admin/deliveries",
        });
      }

      // 11. Recent Activity Feed
      const auditRows = await db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          createdAt: auditLog.createdAt,
          details: auditLog.details,
        })
        .from(auditLog)
        .where(eq(auditLog.tenantId, tenantId))
        .orderBy(desc(auditLog.createdAt))
        .limit(8);

      const recentActivities: RecentActivityEvent[] = auditRows.map((a) => {
        let desc = `${a.action.replace(/_/g, " ")} (${a.entityType})`;
        if (a.details && typeof a.details === "object") {
          const d = a.details as any;
          if (d.order_number) desc = `أمر الإنتاج ${d.order_number}: ${a.action.replace(/_/g, " ")}`;
          else if (d.quote_number) desc = `المقايسة ${d.quote_number}: ${a.action.replace(/_/g, " ")}`;
          else if (d.remake_number) desc = `إعادة التصنيع ${d.remake_number}: ${a.action.replace(/_/g, " ")}`;
          else if (d.delivery_number) desc = `الشحنة ${d.delivery_number}: ${a.action.replace(/_/g, " ")}`;
          else if (d.task_code) desc = `المهمة ${d.task_code}: ${a.action.replace(/_/g, " ")}`;
        }

        return {
          id: a.id,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId || "",
          description: desc,
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
          totalQuotes: quotesRows.length,
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
            total: workOrderRows.length,
            ready: woReady,
            inProgress: woInProgress,
            qcPending: woQcPending,
            completed: woCompleted,
          },
          activeOrders,
        },
        inventory: {
          totalStockItems: stockRows.length,
          lowStockItemsCount: lowStockItems.length,
          lowStockItems: lowStockItems.slice(0, 5),
        },
        quality: {
          openRemakesCount,
          criticalRemakesCount,
          inProgressRemakesCount,
          qcPendingCount,
          failedQcCount,
        },
        deliveries: {
          totalDeliveries: deliveryRows.length,
          readyForDispatch: delReady,
          dispatched: delDispatched,
          outForDelivery: delOut,
          installationPending: delInstPending,
          handoverPending: delHandoverPending,
          completed: delCompleted,
        },
        tasks: {
          totalTasks: taskRows.length,
          openTasks,
          inProgressTasks,
          waitingReviewTasks,
          criticalTasks,
          overdueTasks,
        },
        customerCount,
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
  });
