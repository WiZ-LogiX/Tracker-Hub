import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq, desc, asc, inArray, sql, or } from "drizzle-orm";
import { db } from "@/db/client.server";
import {
  opportunities,
  customers,
  quotes,
  orders,
  tasks,
  taskAssignees,
  productionWorkOrders,
  deliveryHandovers,
  remakes,
  invoices,
  invoicePayments,
  stockReservations,
  stockItems,
  attachments,
  auditLog,
  appUsers,
  tenantMembers,
} from "@/db/schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import type { TenantContext } from "@/lib/tenant-context";
import type {
  ProjectWorkspaceData,
  ProjectHeaderData,
  ProjectListItem,
  ProjectLifecycleStage,
  ProjectLifecycleStep,
  HealthIndicator,
  HealthSeverity,
  ProjectCommercialQuote,
  ProjectOrderRecord,
  ProjectInventoryAllocation,
  ProjectInvoiceRecord,
  ProjectFinancials,
} from "@/lib/project-types";
import type { PipelineStage, OpportunityStatus } from "@/lib/crm-types";
import type { TaskItem } from "@/lib/task-types";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import type { DeliveryHandover } from "@/lib/delivery-types";
import type { RemakeListItem } from "@/lib/remake-types";
import type { CustomerActivityItem, CustomerPaymentRecord } from "@/lib/customer-types";

// ── Validation Schemas ────────────────────────────────────────────────────────

const GetProjectWorkspaceInput = z.object({
  projectId: z.string().uuid(),
});

const ListProjectsInput = z.object({
  searchTerm: z.string().optional(),
  stageFilter: z.string().optional(),
  projectTypeFilter: z.string().optional(),
  salesOwnerFilter: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(25),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

import {
  deriveProjectLifecycle,
  deriveTransparentHealthIndicators,
} from "@/lib/project.pure";

export {
  deriveProjectLifecycle,
  deriveTransparentHealthIndicators,
};

// ── Server Functions ──────────────────────────────────────────────────────────

/**
 * Fetch Unified Project / Job Workspace Data
 */
export const getProjectWorkspaceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => GetProjectWorkspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    const projectId = data.projectId;

    // 1. Fetch Opportunity Anchor
    // Check if projectId matches an opportunity ID, or fallback to find opportunity by order ID
    let opp: any = null;
    try {
      const [oppRow] = await db
        .select({
          id: opportunities.id,
          opportunityNumber: opportunities.opportunityNumber,
          customerId: opportunities.customerId,
          leadId: opportunities.leadId,
          title: opportunities.title,
          projectType: opportunities.projectType,
          value: opportunities.value,
          salesOwner: opportunities.salesOwner,
          stage: opportunities.stage,
          source: opportunities.source,
          expectedCloseDate: opportunities.expectedCloseDate,
          nextAction: opportunities.nextAction,
          nextActionDate: opportunities.nextActionDate,
          status: opportunities.status,
          lostReason: opportunities.lostReason,
          createdAt: opportunities.createdAt,
          updatedAt: opportunities.updatedAt,
        })
        .from(opportunities)
        .where(and(eq(opportunities.id, projectId), eq(opportunities.tenantId, tenantId)))
        .limit(1);
      opp = oppRow;
    } catch (err: any) {
      if (err?.code !== "42P01" && err?.code !== "42703" && !err?.message?.includes("does not exist")) {
        throw err;
      }
    }

    // If not found by opportunity ID, try finding linked order
    let fallbackOrder: any = null;
    if (!opp) {
      const [ord] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, projectId), eq(orders.tenantId, tenantId)))
        .limit(1);

      if (ord) {
        fallbackOrder = ord;
        if (ord.quoteId) {
          const [q] = await db
            .select()
            .from(quotes)
            .where(and(eq(quotes.id, ord.quoteId), eq(quotes.tenantId, tenantId)))
            .limit(1);

          const quoteOppId = (q?.snapshot as any)?.opportunityId as string | undefined;
          if (quoteOppId) {
            const [matchedOpp] = await db
              .select({
                id: opportunities.id,
                opportunityNumber: opportunities.opportunityNumber,
                customerId: opportunities.customerId,
                leadId: opportunities.leadId,
                title: opportunities.title,
                projectType: opportunities.projectType,
                value: opportunities.value,
                salesOwner: opportunities.salesOwner,
                stage: opportunities.stage,
                source: opportunities.source,
                expectedCloseDate: opportunities.expectedCloseDate,
                nextAction: opportunities.nextAction,
                nextActionDate: opportunities.nextActionDate,
                status: opportunities.status,
                lostReason: opportunities.lostReason,
                createdAt: opportunities.createdAt,
                updatedAt: opportunities.updatedAt,
              })
              .from(opportunities)
              .where(and(eq(opportunities.id, quoteOppId), eq(opportunities.tenantId, tenantId)))
              .limit(1);

            if (matchedOpp) {
              opp = matchedOpp;
            }
          }
        }

        // If still no opp, create a synthetic wrapper around the order
        if (!opp) {
          opp = {
            id: ord.id,
            opportunityNumber: `PRJ-${ord.orderNumber.replace(/^ORD-/, "")}`,
            customerId: ord.customerId,
            leadId: null,
            title: `مشروع أمر التنفيذ ${ord.orderNumber}`,
            projectType: "residential",
            value: ord.total,
            salesOwner: null,
            stage: "won",
            source: "direct",
            expectedCloseDate: ord.expectedDelivery ? (typeof ord.expectedDelivery === "string" ? ord.expectedDelivery : new Date(ord.expectedDelivery).toISOString().slice(0, 10)) : null,
            nextAction: null,
            nextActionDate: null,
            status: "won",
            lostReason: null,
            createdAt: ord.createdAt,
            updatedAt: ord.createdAt,
          };
        }
      }
    }

    if (!opp) {
      throw new Error("Project not found");
    }

    // 2. Fetch Customer Details
    const [cust] = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
      })
      .from(customers)
      .where(and(eq(customers.id, opp.customerId), eq(customers.tenantId, tenantId)))
      .limit(1);

    if (!cust) {
      throw new Error("Customer for project not found");
    }

    // 3. Fetch Sales Owner Name
    let salesOwnerName: string | null = null;
    if (opp.salesOwner) {
      const [ownerUser] = await db
        .select({
          displayName: appUsers.displayName,
          username: appUsers.username,
        })
        .from(appUsers)
        .where(eq(appUsers.id, opp.salesOwner))
        .limit(1);

      if (ownerUser) {
        salesOwnerName = ownerUser.displayName || ownerUser.username;
      }
    }

    // 4. Fetch Quotes linked to this opportunity
    const quoteRows = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        total: quotes.total,
        subtotal: quotes.subtotal,
        status: quotes.status,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(and(sql`(${quotes.snapshot}->>'opportunityId') = ${opp.id}`, eq(quotes.tenantId, tenantId)))
      .orderBy(desc(quotes.createdAt))
      .limit(100);

    const quoteIdList = quoteRows.map((q) => q.id);

    const projectQuotes: ProjectCommercialQuote[] = quoteRows.map((q, idx) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      total: Number(q.total || 0),
      subtotal: Number(q.subtotal || 0),
      status: q.status as any,
      createdAt: q.createdAt.toISOString(),
      updatedAt: null,
      isMainQuote: idx === 0 || q.status === "accepted",
    }));

    // 5. Fetch Orders linked to these quotes or directly
    const orderQueryConditions = [eq(orders.tenantId, tenantId)];
    if (quoteIdList.length > 0) {
      orderQueryConditions.push(inArray(orders.quoteId, quoteIdList));
    } else if (fallbackOrder) {
      orderQueryConditions.push(eq(orders.id, fallbackOrder.id));
    } else {
      orderQueryConditions.push(eq(orders.customerId, opp.customerId));
    }

    const orderRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        quoteId: orders.quoteId,
        invoiceId: orders.invoiceId,
        total: orders.total,
        deposit: orders.deposit,
        currentStage: orders.currentStage,
        contractDate: orders.contractDate,
        expectedDelivery: orders.expectedDelivery,
        deliveredAt: orders.deliveredAt,
        notes: orders.notes,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(...orderQueryConditions))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    const orderIdList = orderRows.map((o) => o.id);

    // Map quote numbers to orders
    const quoteNumberMap = new Map(quoteRows.map((q) => [q.id, q.quoteNumber]));

    // Fetch payments to compute paid amount per order
    let paymentRows: any[] = [];
    let invoiceRows: any[] = [];

    const orderInvoiceIds = orderRows.map((o) => o.invoiceId).filter(Boolean) as string[];
    const invoiceOrList = [];
    if (quoteIdList.length > 0) {
      invoiceOrList.push(inArray(invoices.quoteId, quoteIdList));
    }
    if (orderInvoiceIds.length > 0) {
      invoiceOrList.push(inArray(invoices.id, orderInvoiceIds));
    }

    if (invoiceOrList.length > 0) {
      invoiceRows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          quoteId: invoices.quoteId,
          total: invoices.total,
          depositAmount: invoices.depositAmount,
          paidAmount: invoices.paidAmount,
          issuedAt: invoices.issuedAt,
          paidAt: invoices.paidAt,
        })
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), or(...invoiceOrList)!))
        .limit(100);

      const invoiceIdList = invoiceRows.map((i) => i.id);

      if (invoiceIdList.length > 0) {
        paymentRows = await db
          .select({
            id: invoicePayments.id,
            invoiceId: invoicePayments.invoiceId,
            paymentNumber: invoicePayments.paymentNumber,
            amount: invoicePayments.amount,
            paymentMethod: invoicePayments.paymentMethod,
            referenceNumber: invoicePayments.referenceNumber,
            notes: invoicePayments.notes,
            paidAt: invoicePayments.paidAt,
          })
          .from(invoicePayments)
          .where(and(eq(invoicePayments.tenantId, tenantId), inArray(invoicePayments.invoiceId, invoiceIdList)))
          .orderBy(desc(invoicePayments.paidAt))
          .limit(200);
      }
    }

    const invoicePaymentMap = new Map<string, number>();
    for (const p of paymentRows) {
      invoicePaymentMap.set(p.invoiceId, (invoicePaymentMap.get(p.invoiceId) || 0) + Number(p.amount || 0));
    }

    const orderPaidMap = new Map<string, number>();
    for (const o of orderRows) {
      const linkedInvoice = invoiceRows.find((inv) => inv.id === o.invoiceId || (o.quoteId && inv.quoteId === o.quoteId));
      if (linkedInvoice) {
        const invPaid = Math.max(Number(linkedInvoice.paidAmount || 0), invoicePaymentMap.get(linkedInvoice.id) || 0);
        orderPaidMap.set(o.id, invPaid);
      }
    }

    const projectOrders: ProjectOrderRecord[] = orderRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      quoteId: o.quoteId,
      quoteNumber: o.quoteId ? quoteNumberMap.get(o.quoteId) || null : null,
      total: Number(o.total || 0),
      deposit: Number(o.deposit || 0),
      paidAmount: orderPaidMap.get(o.id) || Number(o.deposit || 0),
      currentStage: o.currentStage,
      contractDate: typeof o.contractDate === "string" ? o.contractDate : new Date(o.contractDate).toISOString().slice(0, 10),
      expectedDelivery: o.expectedDelivery ? (typeof o.expectedDelivery === "string" ? o.expectedDelivery : new Date(o.expectedDelivery).toISOString().slice(0, 10)) : null,
      deliveredAt: o.deliveredAt?.toISOString() || null,
      notes: o.notes,
      createdAt: o.createdAt.toISOString(),
    }));

    // 6. Fetch Production Work Orders
    let workOrderRows: any[] = [];
    if (orderIdList.length > 0) {
      workOrderRows = await db
        .select({
          id: productionWorkOrders.id,
          workOrderNumber: productionWorkOrders.workOrderNumber,
          orderId: productionWorkOrders.orderId,
          remakeId: productionWorkOrders.remakeId,
          status: productionWorkOrders.status,
          priority: productionWorkOrders.priority,
          notes: productionWorkOrders.notes,
          scheduledDate: productionWorkOrders.scheduledDate,
          startedAt: productionWorkOrders.startedAt,
          completedAt: productionWorkOrders.completedAt,
          createdAt: productionWorkOrders.createdAt,
        })
        .from(productionWorkOrders)
        .where(and(eq(productionWorkOrders.tenantId, tenantId), inArray(productionWorkOrders.orderId, orderIdList)))
        .orderBy(desc(productionWorkOrders.createdAt))
        .limit(100);
    }

    const projectWorkOrders: ProductionWorkOrder[] = workOrderRows.map((w) => {
      const parentOrder = projectOrders.find((o) => o.id === w.orderId);
      return {
        id: w.id,
        tenantId,
        workOrderNumber: w.workOrderNumber,
        orderId: w.orderId,
        orderNumber: parentOrder?.orderNumber || "—",
        customerId: cust.id,
        customerName: cust.name,
        customerPhone: cust.phone,
        remakeId: w.remakeId,
        remakeNumber: null,
        status: w.status as any,
        priority: w.priority as any,
        currentStage: parentOrder?.currentStage || "assembly",
        materialReadiness: "READY" as const,
        notes: w.notes,
        scheduledDate: w.scheduledDate ? (typeof w.scheduledDate === "string" ? w.scheduledDate : new Date(w.scheduledDate).toISOString().slice(0, 10)) : null,
        startedAt: w.startedAt?.toISOString() || null,
        completedAt: w.completedAt?.toISOString() || null,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.createdAt.toISOString(),
      };
    });

    // 7. Fetch Tasks linked to opportunity, quotes, or orders
    let taskRows: any[] = [];
    try {
      const taskConditions = [eq(tasks.tenantId, tenantId)];
      const taskOrFilters = [];
      if (opp?.id) {
        taskOrFilters.push(eq(tasks.opportunityId, opp.id));
      }
      if (quoteIdList.length > 0) {
        taskOrFilters.push(inArray(tasks.quoteId, quoteIdList));
      }
      if (orderIdList.length > 0) {
        taskOrFilters.push(inArray(tasks.orderId, orderIdList));
      }
      if (taskOrFilters.length > 0) {
        taskConditions.push(or(...taskOrFilters)!);
      } else {
        taskConditions.push(eq(tasks.customerId, cust.id));
      }

      taskRows = await db
        .select({
          id: tasks.id,
          taskCode: tasks.taskCode,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          category: tasks.category,
          dueDate: tasks.dueDate,
          completedAt: tasks.completedAt,
          createdBy: tasks.createdBy,
          customerId: tasks.customerId,
          quoteId: tasks.quoteId,
          orderId: tasks.orderId,
          productionStage: tasks.productionStage,
          workOrderId: tasks.workOrderId,
          remakeId: tasks.remakeId,
          deliveryId: tasks.deliveryId,
          opportunityId: tasks.opportunityId,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(and(...taskConditions))
        .orderBy(desc(tasks.createdAt))
        .limit(200);
    } catch (err: any) {
      if (err?.code === "42703" || err?.message?.includes("does not exist")) {
        const baseConditions = [eq(tasks.tenantId, tenantId)];
        const baseOrFilters = [];
        if (quoteIdList.length > 0) baseOrFilters.push(inArray(tasks.quoteId, quoteIdList));
        if (orderIdList.length > 0) baseOrFilters.push(inArray(tasks.orderId, orderIdList));
        if (baseOrFilters.length > 0) baseConditions.push(or(...baseOrFilters)!);
        else baseConditions.push(eq(tasks.customerId, cust.id));

        const baseRows = await db
          .select({
            id: tasks.id,
            taskCode: tasks.taskCode,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            priority: tasks.priority,
            category: tasks.category,
            dueDate: tasks.dueDate,
            completedAt: tasks.completedAt,
            createdBy: tasks.createdBy,
            customerId: tasks.customerId,
            quoteId: tasks.quoteId,
            orderId: tasks.orderId,
            productionStage: tasks.productionStage,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
          })
          .from(tasks)
          .where(and(...baseConditions))
          .orderBy(desc(tasks.createdAt))
          .limit(200);

        taskRows = baseRows.map((r) => ({
          ...r,
          workOrderId: null,
          remakeId: null,
          deliveryId: null,
          opportunityId: null,
        }));
      } else if (err?.code !== "42P01") {
        throw err;
      }
    }

    const now = new Date();
    const projectTasks: TaskItem[] = taskRows.map((t) => {
      const isOverdue =
        t.status !== "completed" && t.status !== "cancelled" && t.dueDate
          ? new Date(t.dueDate) < now
          : false;
      return {
        id: t.id,
        tenantId,
        taskCode: t.taskCode,
        title: t.title,
        description: t.description,
        status: t.status as any,
        priority: t.priority as any,
        category: t.category,
        dueDate: t.dueDate?.toISOString() || null,
        completedAt: t.completedAt?.toISOString() || null,
        createdBy: t.createdBy,
        customerId: t.customerId,
        quoteId: t.quoteId,
        orderId: t.orderId,
        productionStage: t.productionStage,
        workOrderId: t.workOrderId,
        remakeId: t.remakeId,
        deliveryId: t.deliveryId,
        opportunityId: t.opportunityId,
        isOverdue,
        assignees: [],
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    // 8. Fetch Delivery Handovers
    let deliveryRows: any[] = [];
    if (orderIdList.length > 0) {
      deliveryRows = await db
        .select({
          id: deliveryHandovers.id,
          deliveryNumber: deliveryHandovers.deliveryNumber,
          orderId: deliveryHandovers.orderId,
          status: deliveryHandovers.status,
          scheduledDate: deliveryHandovers.scheduledDate,
          dispatchedAt: deliveryHandovers.dispatchedAt,
          deliveredAt: deliveryHandovers.deliveredAt,
          deliveryAddress: deliveryHandovers.deliveryAddress,
          recipientName: deliveryHandovers.recipientName,
          recipientPhone: deliveryHandovers.recipientPhone,
          installationRequired: deliveryHandovers.installationRequired,
          installedAt: deliveryHandovers.installedAt,
          installerName: deliveryHandovers.installerName,
          installerNotes: deliveryHandovers.installerNotes,
          handedOverAt: deliveryHandovers.handedOverAt,
          signerName: deliveryHandovers.signerName,
          customerNotes: deliveryHandovers.customerNotes,
          handoverNotes: deliveryHandovers.handoverNotes,
          createdAt: deliveryHandovers.createdAt,
          updatedAt: deliveryHandovers.updatedAt,
        })
        .from(deliveryHandovers)
        .where(and(eq(deliveryHandovers.tenantId, tenantId), inArray(deliveryHandovers.orderId, orderIdList)))
        .orderBy(desc(deliveryHandovers.createdAt))
        .limit(50);
    }

    const projectDeliveries: DeliveryHandover[] = deliveryRows.map((d) => {
      const parentOrder = projectOrders.find((o) => o.id === d.orderId);
      return {
        id: d.id,
        tenantId,
        deliveryNumber: d.deliveryNumber,
        orderId: d.orderId,
        orderNumber: parentOrder?.orderNumber || "—",
        customerId: cust.id,
        customerName: cust.name,
        customerPhone: cust.phone || "",
        status: d.status as any,
        deliveryAddress: d.deliveryAddress || cust.address || "—",
        recipientName: d.recipientName || cust.name,
        recipientPhone: d.recipientPhone || cust.phone,
        scheduledDate: d.scheduledDate ? (typeof d.scheduledDate === "string" ? d.scheduledDate : new Date(d.scheduledDate).toISOString().slice(0, 10)) : null,
        dispatchedAt: d.dispatchedAt?.toISOString() || null,
        deliveredAt: d.deliveredAt?.toISOString() || null,
        installationRequired: d.installationRequired ?? false,
        installedAt: d.installedAt?.toISOString() || null,
        installerName: d.installerName,
        installerNotes: d.installerNotes,
        handedOverAt: d.handedOverAt?.toISOString() || null,
        signerName: d.signerName,
        customerNotes: d.customerNotes,
        handoverNotes: d.handoverNotes,
        signatureDataUrl: null,
        createdBy: null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt ? d.updatedAt.toISOString() : d.createdAt.toISOString(),
      };
    });

    // 9. Fetch Remakes / Quality Cases
    let remakeRows: any[] = [];
    if (orderIdList.length > 0) {
      remakeRows = await db
        .select({
          id: remakes.id,
          remakeNumber: remakes.remakeNumber,
          orderId: remakes.orderId,
          type: remakes.type,
          severity: remakes.severity,
          status: remakes.status,
          reason: remakes.reason,
          defectDescription: remakes.defectDescription,
          resolution: remakes.resolution,
          assignedTo: remakes.assignedTo,
          dueDate: remakes.dueDate,
          resolvedAt: remakes.resolvedAt,
          createdAt: remakes.createdAt,
          updatedAt: remakes.updatedAt,
        })
        .from(remakes)
        .where(and(eq(remakes.tenantId, tenantId), inArray(remakes.orderId, orderIdList)))
        .orderBy(desc(remakes.createdAt))
        .limit(50);
    }

    const projectRemakes: RemakeListItem[] = remakeRows.map((r) => {
      const parentOrder = projectOrders.find((o) => o.id === r.orderId);
      return {
        id: r.id,
        remakeNumber: r.remakeNumber,
        orderId: r.orderId,
        orderNumber: parentOrder?.orderNumber || "—",
        customerId: cust.id,
        customerName: cust.name,
        customerPhone: cust.phone,
        type: r.type as any,
        severity: r.severity as any,
        status: r.status as any,
        reason: r.reason,
        defectDescription: r.defectDescription,
        resolution: r.resolution,
        assignedTo: r.assignedTo,
        assignedToName: null,
        dueDate: r.dueDate?.toISOString() || null,
        resolvedAt: r.resolvedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    // 10. Fetch Stock Reservations / Material Allocation
    let stockAllocations: ProjectInventoryAllocation[] = [];
    if (orderIdList.length > 0) {
      const reservationRows = await db
        .select({
          id: stockReservations.id,
          stockItemId: stockReservations.stockItemId,
          quantity: stockReservations.quantity,
          status: stockReservations.status,
          createdAt: stockReservations.createdAt,
          sku: stockItems.sku,
          name: stockItems.name,
          unit: stockItems.unit,
        })
        .from(stockReservations)
        .innerJoin(stockItems, eq(stockReservations.stockItemId, stockItems.id))
        .where(and(eq(stockReservations.tenantId, tenantId), inArray(stockReservations.orderId, orderIdList)))
        .limit(100);

      stockAllocations = reservationRows.map((s) => ({
        id: s.id,
        stockItemId: s.stockItemId,
        sku: s.sku,
        name: s.name,
        unit: s.unit,
        reservedQuantity: Number(s.quantity || 0),
        status: s.status as any,
        createdAt: s.createdAt.toISOString(),
      }));
    }

    // 11. Fetch Attachments (Opportunity, Quotes, Orders)
    const entityIdsForAttachments = [opp.id, ...quoteIdList, ...orderIdList];
    const attachmentRows = await db
      .select({
        id: attachments.id,
        tenantId: attachments.tenantId,
        entityType: attachments.entityType,
        entityId: attachments.entityId,
        fileName: attachments.fileName,
        storageKey: attachments.storageKey,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
        uploadedBy: attachments.uploadedBy,
        caption: attachments.caption,
        isPublic: attachments.isPublic,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(and(eq(attachments.tenantId, tenantId), inArray(attachments.entityId, entityIdsForAttachments)))
      .orderBy(desc(attachments.createdAt))
      .limit(100);

    const projectDocuments = attachmentRows.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }));

    // 12. Build Financials
    const totalInvoiced = projectOrders.reduce((sum, o) => sum + o.total, 0);
    const totalCollected = projectOrders.reduce((sum, o) => sum + o.paidAmount, 0);
    const projectTotalVal =
      Number(opp.value || 0) ||
      projectQuotes[0]?.total ||
      totalInvoiced ||
      0;
    const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);

    const invoiceRecords: ProjectInvoiceRecord[] = invoiceRows.map((inv) => {
      const parentOrder = orderRows.find((o) => o.invoiceId === inv.id || (o.quoteId && o.quoteId === inv.quoteId));
      const paid = Math.max(Number(inv.paidAmount || 0), invoicePaymentMap.get(inv.id) || 0);
      const total = Number(inv.total || 0);
      const balanceDue = Math.max(0, total - paid);
      const status: "draft" | "issued" | "partially_paid" | "paid" | "void" =
        paid >= total ? "paid" : paid > 0 ? "partially_paid" : "issued";

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        orderId: parentOrder?.id || null,
        orderNumber: parentOrder?.orderNumber || null,
        total,
        paidAmount: paid,
        balanceDue,
        status,
        issueDate: inv.issuedAt.toISOString().slice(0, 10),
        dueDate: null,
      };
    });

    const paymentRecords: CustomerPaymentRecord[] = paymentRows.map((p) => {
      const parentInv = invoiceRecords.find((i) => i.id === p.invoiceId);
      return {
        id: p.id,
        invoiceId: p.invoiceId,
        invoiceNumber: parentInv?.invoiceNumber || "—",
        paymentNumber: p.paymentNumber,
        amount: Number(p.amount || 0),
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber,
        notes: p.notes,
        paidAt: p.paidAt.toISOString(),
      };
    });

    const projectFinancials: ProjectFinancials = {
      totalProjectValue: role === "worker" ? 0 : projectTotalVal,
      totalInvoiced: role === "worker" ? 0 : totalInvoiced,
      totalCollected: role === "worker" ? 0 : totalCollected,
      outstandingBalance: role === "worker" ? 0 : outstandingBalance,
      invoices: role === "worker" ? [] : invoiceRecords,
      payments: role === "worker" ? [] : paymentRecords,
    };

    // 13. Derive Lifecycle and Transparent Health
    const { currentStage, steps: lifecycleSteps } = deriveProjectLifecycle(
      opp.stage as PipelineStage,
      opp.status as OpportunityStatus,
      projectQuotes,
      projectOrders,
      projectWorkOrders,
      projectDeliveries,
    );

    const healthIndicators = deriveTransparentHealthIndicators(
      {
        stage: opp.stage as PipelineStage,
        status: opp.status as OpportunityStatus,
        lostReason: opp.lostReason,
        quotes: projectQuotes,
      },
      projectOrders,
      projectWorkOrders,
      stockAllocations,
      projectDeliveries,
      projectFinancials,
      projectRemakes,
    );

    // 14. Build Unified Chronological Activity Timeline
    const timelineItems: CustomerActivityItem[] = [];

    // Add Lead / Opp Creation Event
    timelineItems.push({
      id: `opp-init-${opp.id}`,
      entityType: "opportunity",
      entityId: opp.id,
      action: "project_created",
      title: "إنشاء المشروع والفرصة البيعية",
      description: `بدء المشروع برقم ${opp.opportunityNumber} وتعيين ${salesOwnerName || "مسؤول تجاري"}`,
      timestamp: opp.createdAt.toISOString(),
    });

    // Add Quotes Events
    for (const q of projectQuotes) {
      timelineItems.push({
        id: `quote-${q.id}`,
        entityType: "quote",
        entityId: q.id,
        action: `quote_${q.status}`,
        title: `عرض أسعار ${q.quoteNumber}`,
        description: `الحالة: ${q.status} بقيمة ${q.total.toLocaleString()} ج.م.`,
        timestamp: q.createdAt,
      });
    }

    // Add Orders Events
    for (const o of projectOrders) {
      timelineItems.push({
        id: `order-${o.id}`,
        entityType: "order",
        entityId: o.id,
        action: "order_booked",
        title: `أمر التنفيذ ${o.orderNumber}`,
        description: `المرحلة: ${o.currentStage} — عربون: ${o.deposit.toLocaleString()} ج.م.`,
        timestamp: o.createdAt,
      });
    }

    // Add Work Order Events
    for (const w of projectWorkOrders) {
      timelineItems.push({
        id: `wo-${w.id}`,
        entityType: "order",
        entityId: w.id,
        action: `work_order_${w.status}`,
        title: `أمر تشغيل الورشة ${w.workOrderNumber}`,
        description: `حالة التصنيع: ${w.status} — الأولوية: ${w.priority}`,
        timestamp: w.createdAt,
      });
    }

    // Add Remakes
    for (const r of projectRemakes) {
      timelineItems.push({
        id: `remake-${r.id}`,
        entityType: "remake",
        entityId: r.id,
        action: "remake_reported",
        title: `طلب إعادة تصنيع ${r.remakeNumber}`,
        description: `${r.reason} (${r.type}) — الحالة: ${r.status}`,
        timestamp: r.createdAt,
      });
    }

    // Add Deliveries
    for (const d of projectDeliveries) {
      timelineItems.push({
        id: `delivery-${d.id}`,
        entityType: "delivery",
        entityId: d.id,
        action: `delivery_${d.status}`,
        title: `شحنة التوريد ${d.deliveryNumber}`,
        description: `المستلم: ${d.recipientName} — الحالة: ${d.status}`,
        timestamp: d.createdAt,
      });
    }

    // Add Payments
    for (const p of paymentRecords) {
      timelineItems.push({
        id: `pay-${p.id}`,
        entityType: "payment",
        entityId: p.id,
        action: "payment_recorded",
        title: `سداد دفعة ${p.paymentNumber}`,
        description: `تحصيل مبلغ ${p.amount.toLocaleString()} ج.م. (${p.paymentMethod})`,
        timestamp: p.paidAt,
      });
    }

    // Add Tasks
    for (const t of projectTasks) {
      timelineItems.push({
        id: `task-${t.id}`,
        entityType: "task",
        entityId: t.id,
        action: `task_${t.status}`,
        title: `مهمة ${t.taskCode}: ${t.title}`,
        description: `الحالة: ${t.status} — الفئة: ${t.category}`,
        timestamp: t.createdAt,
      });
    }

    timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 15. Header Data
    const mainQuote = projectQuotes.find((q) => q.isMainQuote) || projectQuotes[0] || null;
    const mainOrder = projectOrders[0] || null;

    const STAGE_LABELS: Record<ProjectLifecycleStage, { en: string; ar: string }> = {
      lead: { en: "Lead", ar: "عميل محتمل" },
      opportunity: { en: "Opportunity", ar: "فرصة تجارية" },
      measurement: { en: "Measurement", ar: "رفع مقاسات" },
      design: { en: "Design & Engineering", ar: "تصميم وهندسة" },
      quote: { en: "Quotation", ar: "عرض أسعار" },
      won: { en: "Deal Won", ar: "تعاقد واعتماد" },
      order: { en: "Order Booked", ar: "أمر تنفيذ" },
      production: { en: "In Production", ar: "قيد التصنيع" },
      qc: { en: "QC Inspection", ar: "فحص الجودة" },
      delivery: { en: "Delivery & Logistics", ar: "شحن وتوريد" },
      installation: { en: "Site Installation", ar: "تركيب الموقع" },
      handover: { en: "Customer Handover", ar: "تسليم نهائي" },
      warranty: { en: "Warranty & Support", ar: "ضمان وتشغيل" },
    };

    const headerData: ProjectHeaderData = {
      projectId: opp.id,
      projectNumber: opp.opportunityNumber,
      projectName: opp.title,
      projectType: opp.projectType || "residential",
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerEmail: cust.email,
      customerAddress: cust.address,
      primarySite: cust.address || "الموقع الرئيسي للمشروع",
      salesOwnerId: opp.salesOwner,
      salesOwnerName,
      currentStage,
      stageLabel: STAGE_LABELS[currentStage]?.en || currentStage,
      stageLabelAr: STAGE_LABELS[currentStage]?.ar || currentStage,
      status: opp.status as any,
      totalValue: role === "worker" ? 0 : projectTotalVal,
      invoicedAmount: role === "worker" ? 0 : totalInvoiced,
      paidAmount: role === "worker" ? 0 : totalCollected,
      outstandingBalance: role === "worker" ? 0 : outstandingBalance,
      mainQuote: mainQuote
        ? {
            id: mainQuote.id,
            quoteNumber: mainQuote.quoteNumber,
            total: role === "worker" ? 0 : mainQuote.total,
            status: mainQuote.status,
          }
        : null,
      mainOrder: mainOrder
        ? {
            id: mainOrder.id,
            orderNumber: mainOrder.orderNumber,
            total: role === "worker" ? 0 : mainOrder.total,
            currentStage: mainOrder.currentStage,
          }
        : null,
      health: healthIndicators,
      lifecycle: lifecycleSteps,
    };

    const workspaceData: ProjectWorkspaceData = {
      header: headerData,
      commercial: {
        opportunityId: opp.id,
        opportunityNumber: opp.opportunityNumber,
        title: opp.title,
        projectType: opp.projectType || "residential",
        value: role === "worker" ? 0 : Number(opp.value || 0),
        stage: opp.stage as PipelineStage,
        status: opp.status as OpportunityStatus,
        lostReason: opp.lostReason,
        nextAction: opp.nextAction,
        nextActionDate: opp.nextActionDate?.toISOString() || null,
        quotes: role === "worker" ? [] : projectQuotes,
      },
      orders: role === "worker" ? [] : projectOrders,
      production: {
        workOrders: projectWorkOrders,
        activeStage: projectOrders[0]?.currentStage || null,
        completionPercentage:
          projectWorkOrders.length > 0
            ? Math.round(
                (projectWorkOrders.filter((w) => w.status === "completed").length / projectWorkOrders.length) * 100,
              )
            : projectOrders.some((o) => o.currentStage === "completed")
              ? 100
              : 0,
      },
      tasks: projectTasks,
      inventory: {
        allocations: stockAllocations,
        readiness: stockAllocations.length > 0 ? "READY" : "NOT_RESERVED",
      },
      delivery: {
        handovers: projectDeliveries,
        currentDeliveryStatus: projectDeliveries[0]?.status || (projectOrders.some((o) => o.deliveredAt) ? "delivered" : null),
      },
      financials: projectFinancials,
      quality: {
        remakes: projectRemakes,
        qcCount: projectWorkOrders.filter((w) => w.status === "qc_pending" || w.status === "completed").length,
        defectsCount: projectRemakes.length,
      },
      documents: projectDocuments,
      timeline: timelineItems,
      currentUserRole: role,
    };

    return workspaceData;
  });

/**
 * List Customer Projects (Search, Stage Filter, Metrics)
 */
export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ListProjectsInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    const page = data?.page || 1;
    const pageSize = data?.pageSize || 25;
    const offset = (page - 1) * pageSize;

    // Fetch all opportunities with joined customer (or fallback to orders if opportunities table not yet migrated)
    let rows: any[] = [];
    try {
      const oppQuery = db
        .select({
          id: opportunities.id,
          opportunityNumber: opportunities.opportunityNumber,
          title: opportunities.title,
          projectType: opportunities.projectType,
          value: opportunities.value,
          stage: opportunities.stage,
          status: opportunities.status,
          salesOwner: opportunities.salesOwner,
          customerId: customers.id,
          customerName: customers.name,
          customerPhone: customers.phone,
          createdAt: opportunities.createdAt,
          updatedAt: opportunities.updatedAt,
        })
        .from(opportunities)
        .innerJoin(customers, eq(opportunities.customerId, customers.id))
        .where(eq(opportunities.tenantId, tenantId))
        .orderBy(desc(opportunities.createdAt));

      rows = await oppQuery.limit(500);
    } catch (err: any) {
      if (err?.code === "42P01" || err?.code === "42703" || err?.message?.includes("does not exist")) {
        const orderRows = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            total: orders.total,
            currentStage: orders.currentStage,
            customerId: customers.id,
            customerName: customers.name,
            customerPhone: customers.phone,
            createdAt: orders.createdAt,
            updatedAt: orders.createdAt,
          })
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .where(eq(orders.tenantId, tenantId))
          .orderBy(desc(orders.createdAt))
          .limit(500);

        rows = orderRows.map((o) => ({
          id: o.id,
          opportunityNumber: `PRJ-${o.orderNumber.replace(/^ORD-/, "")}`,
          title: `مشروع أمر التنفيذ ${o.orderNumber}`,
          projectType: "residential",
          value: o.total,
          stage: o.currentStage === "completed" ? "warranty" : "order",
          status: "won",
          salesOwner: null,
          customerId: o.customerId,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        }));
      } else {
        throw err;
      }
    }

    // Filter in-memory for flexible multi-field search
    let filtered = rows;
    if (data?.searchTerm) {
      const q = data.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.opportunityNumber.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          (r.customerPhone && r.customerPhone.includes(q)),
      );
    }
    if (data?.stageFilter && data.stageFilter !== "all") {
      filtered = filtered.filter((r) => r.stage === data.stageFilter);
    }
    if (data?.projectTypeFilter && data.projectTypeFilter !== "all") {
      filtered = filtered.filter((r) => r.projectType === data.projectTypeFilter);
    }

    const totalCount = filtered.length;
    const paginated = filtered.slice(offset, offset + pageSize);

    // User lookup for sales owners
    const userRows = await db
      .select({ id: appUsers.id, displayName: appUsers.displayName, username: appUsers.username })
      .from(appUsers)
      .where(eq(appUsers.tenantId, tenantId))
      .limit(200);

    const userMap = new Map(userRows.map((u) => [u.id, u.displayName || u.username]));

    const projectItems: ProjectListItem[] = paginated.map((r) => {
      const stage = r.stage as ProjectLifecycleStage;
      return {
        id: r.id,
        projectNumber: r.opportunityNumber,
        name: r.title,
        projectType: r.projectType || "residential",
        customerId: r.customerId,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        salesOwnerName: r.salesOwner ? userMap.get(r.salesOwner) || null : null,
        stage: (["won", "quotation", "negotiation", "site_visit", "design_measurement"].includes(r.stage) ? r.stage : "opportunity") as any,
        stageLabel: r.stage,
        stageLabelAr: r.stage,
        status: r.status as any,
        totalValue: role === "worker" ? 0 : Number(r.value || 0),
        outstandingBalance: 0,
        commercialStatus: r.stage,
        productionStatus: r.status === "won" ? "Ready" : "Pending",
        deliveryStatus: "Pending",
        healthSeverity: r.status === "lost" ? "critical" : r.status === "won" ? "good" : "neutral",
        quotesCount: 0,
        ordersCount: 0,
        openTasksCount: 0,
        activeRemakesCount: 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return {
      rows: projectItems,
      totalCount,
      page,
      pageSize,
    };
  });
