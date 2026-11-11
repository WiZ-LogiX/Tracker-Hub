import type { PipelineStage, OpportunityStatus } from "@/lib/crm-types";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import type { DeliveryHandover } from "@/lib/delivery-types";
import type { RemakeListItem } from "@/lib/remake-types";
import type {
  ProjectCommercialQuote,
  ProjectOrderRecord,
  ProjectLifecycleStage,
  ProjectLifecycleStep,
  ProjectInventoryAllocation,
  ProjectFinancials,
  HealthIndicator,
  HealthSeverity,
} from "@/lib/project-types";

export function deriveProjectLifecycle(
  oppStage: PipelineStage,
  oppStatus: OpportunityStatus,
  quotesList: ProjectCommercialQuote[],
  ordersList: ProjectOrderRecord[],
  workOrdersList: ProductionWorkOrder[],
  deliveriesList: DeliveryHandover[],
): { currentStage: ProjectLifecycleStage; steps: ProjectLifecycleStep[] } {
  const hasAcceptedQuote = quotesList.some((q) => q.status === "accepted");
  const hasSentQuote = quotesList.some((q) => q.status === "sent" || q.status === "accepted");
  const hasOrder = ordersList.length > 0;
  const isOrderDelivered = ordersList.some((o) => o.deliveredAt || o.currentStage === "delivered");
  const isWorkOrderComplete = workOrdersList.length > 0 && workOrdersList.every((w) => w.status === "completed");
  const isWorkOrderInProduction = workOrdersList.some((w) => w.status === "in_progress" || w.status === "ready");
  const isWorkOrderQC = workOrdersList.some((w) => w.status === "qc_pending");
  const hasDelivery = deliveriesList.length > 0;
  const isDeliveryCompleted = deliveriesList.some((d) => d.status === "completed");
  const isDeliveryInstalled = deliveriesList.some((d) => d.status === "installed" || d.status === "handover_pending");
  const isDeliveryDispatched = deliveriesList.some((d) => ["dispatched", "out_for_delivery", "delivered"].includes(d.status));

  // Determine Current Stage
  let currentStage: ProjectLifecycleStage = "lead";

  if (isDeliveryCompleted) {
    currentStage = "warranty";
  } else if (isDeliveryInstalled || deliveriesList.some((d) => d.status === "handover_pending")) {
    currentStage = "handover";
  } else if (deliveriesList.some((d) => d.status === "installation_pending" || d.status === "installed")) {
    currentStage = "installation";
  } else if (isDeliveryDispatched || isOrderDelivered) {
    currentStage = "delivery";
  } else if (isWorkOrderQC) {
    currentStage = "qc";
  } else if (isWorkOrderInProduction || ordersList.some((o) => ["in_production", "cutting", "assembly"].includes(o.currentStage))) {
    currentStage = "production";
  } else if (hasOrder) {
    currentStage = "order";
  } else if (oppStatus === "won" || oppStage === "won" || hasAcceptedQuote) {
    currentStage = "won";
  } else if (hasSentQuote || oppStage === "quotation" || oppStage === "negotiation") {
    currentStage = "quote";
  } else if (oppStage === "design_measurement") {
    currentStage = "design";
  } else if (oppStage === "site_visit") {
    currentStage = "measurement";
  } else if (oppStage === "qualified" || oppStage === "contacted") {
    currentStage = "opportunity";
  } else {
    currentStage = "lead";
  }

  // Define All 13 Stages in Sequence
  const STAGE_ORDER: Array<{ stage: ProjectLifecycleStage; label: string; labelAr: string }> = [
    { stage: "lead", label: "Lead", labelAr: "عميل محتمل" },
    { stage: "opportunity", label: "Opportunity", labelAr: "فرصة تجارية" },
    { stage: "measurement", label: "Measurement", labelAr: "رفع مقاسات ومعاينة" },
    { stage: "design", label: "Design", labelAr: "تصميم وهندسة" },
    { stage: "quote", label: "Quote", labelAr: "عرض أسعار" },
    { stage: "won", label: "Won", labelAr: "تعاقد واعتماد" },
    { stage: "order", label: "Order", labelAr: "أمر تنفيذ" },
    { stage: "production", label: "Production", labelAr: "تصنيع وتشغيل" },
    { stage: "qc", label: "QC", labelAr: "فحص جودة" },
    { stage: "delivery", label: "Delivery", labelAr: "شحن ونقل" },
    { stage: "installation", label: "Installation", labelAr: "تركيب الموقع" },
    { stage: "handover", label: "Handover", labelAr: "تسليم نهائي" },
    { stage: "warranty", label: "Warranty", labelAr: "ضمان وتشغيل" },
  ];

  const currentStageIndex = STAGE_ORDER.findIndex((s) => s.stage === currentStage);

  const steps: ProjectLifecycleStep[] = STAGE_ORDER.map((item, idx) => {
    let status: "completed" | "current" | "pending" = "pending";
    if (idx < currentStageIndex) {
      status = "completed";
    } else if (idx === currentStageIndex) {
      status = "current";
    } else {
      status = "pending";
    }

    return {
      stage: item.stage,
      label: item.label,
      labelAr: item.labelAr,
      status,
    };
  });

  return { currentStage, steps };
}

export function deriveTransparentHealthIndicators(
  commercial: { stage: PipelineStage; status: OpportunityStatus; lostReason?: string | null; quotes: ProjectCommercialQuote[] },
  orders: ProjectOrderRecord[],
  workOrders: ProductionWorkOrder[],
  inventory: ProjectInventoryAllocation[],
  deliveries: DeliveryHandover[],
  financials: ProjectFinancials,
  remakesList: RemakeListItem[],
): HealthIndicator[] {
  const indicators: HealthIndicator[] = [];

  // 1. Commercial Health
  let commSeverity: HealthSeverity = "good";
  let commText = "Quote Accepted";
  let commTextAr = "عرض السعر معتمد";
  let commDetail = "Deal won and contract confirmed";
  let commDetailAr = "تم الفوز بالصفقة وتأكيد التعاقد";

  if (commercial.status === "lost") {
    commSeverity = "critical";
    commText = "Deal Lost";
    commTextAr = "صفقة خاسرة";
    commDetail = commercial.lostReason ? `Lost Reason: ${commercial.lostReason}` : "Deal closed as lost";
    commDetailAr = commercial.lostReason ? `سبب الخسارة: ${commercial.lostReason}` : "تم إغلاق الصفقة كخسارة";
  } else if (commercial.quotes.some((q) => q.status === "accepted")) {
    commSeverity = "good";
    commText = "Quote Accepted";
    commTextAr = "عرض السعر معتمد";
    commDetail = "Customer accepted quotation terms";
    commDetailAr = "وافق العميل على بنود عرض السعر";
  } else if (commercial.stage === "negotiation") {
    commSeverity = "warning";
    commText = "In Negotiation";
    commTextAr = "قيد التفاوض التجاري";
    commDetail = "Commercial review and pricing discussion in progress";
    commDetailAr = "مراجعة العرض والتفاوض جاري مع العميل";
  } else if (commercial.quotes.some((q) => q.status === "sent")) {
    commSeverity = "warning";
    commText = "Quote Sent — Awaiting Reply";
    commTextAr = "عرض مرسل — بانتظار الرد";
    commDetail = "Quotation delivered to client, follow-up active";
    commDetailAr = "تم إرسال عرض الأسعار وجاري المتابعة";
  } else if (commercial.quotes.length > 0) {
    commSeverity = "neutral";
    commText = "Quote in Draft";
    commTextAr = "عرض السعر مسودة";
    commDetail = "Quotation being prepared";
    commDetailAr = "جاري إعداد وتسعير المقايسة";
  } else {
    commSeverity = "neutral";
    commText = "Discovery & Design";
    commTextAr = "المعاينة والتصميم الهندسي";
    commDetail = "Initial requirements and dimensions being finalized";
    commDetailAr = "جاري رفع المقاسات وتحديد المتطلبات";
  }

  indicators.push({
    dimension: "commercial",
    title: "Commercial Status",
    titleAr: "المسار التجاري",
    statusText: commText,
    statusTextAr: commTextAr,
    severity: commSeverity,
    detail: commDetail,
    detailAr: commDetailAr,
  });

  // 2. Production Health
  let prodSeverity: HealthSeverity = "neutral";
  let prodText = "Not Scheduled";
  let prodTextAr = "لم يبدأ التشغيل بعد";
  let prodDetail = "Awaiting manufacturing release";
  let prodDetailAr = "بانتظار إطلاق أمر التشغيل";

  const activeWorkOrders = workOrders.filter((w) => w.status !== "cancelled");
  if (activeWorkOrders.length > 0) {
    const completedCount = activeWorkOrders.filter((w) => w.status === "completed").length;
    if (completedCount === activeWorkOrders.length) {
      prodSeverity = "good";
      prodText = "Production Completed";
      prodTextAr = "اكتمل التصنيع بالكامل";
      prodDetail = `All ${activeWorkOrders.length} work orders finished`;
      prodDetailAr = `تم إنهاء جميع أوامر التشغيل (${activeWorkOrders.length})`;
    } else if (activeWorkOrders.some((w) => w.status === "qc_pending")) {
      prodSeverity = "warning";
      prodText = "QC Inspection Pending";
      prodTextAr = "بانتظار فحص الجودة";
      prodDetail = "Fabrication complete, awaiting final QC inspection";
      prodDetailAr = "تم التصنيع وبانتظار اعتماد الجودة";
    } else if (activeWorkOrders.some((w) => w.status === "in_progress")) {
      prodSeverity = "good";
      prodText = "In Fabrication";
      prodTextAr = "جاري التصنيع والتشغيل";
      prodDetail = `${completedCount} of ${activeWorkOrders.length} work orders complete`;
      prodDetailAr = `تم إنجاز ${completedCount} من أصل ${activeWorkOrders.length} أوامر عمل`;
    } else {
      prodSeverity = "neutral";
      prodText = "Work Orders Ready";
      prodTextAr = "أوامر العمل جاهزة للبدء";
      prodDetail = "Scheduled for workshop execution";
      prodDetailAr = "مجدولة لبدء التشغيل في الورشة";
    }
  } else if (orders.length > 0) {
    const mainOrder = orders[0];
    if (mainOrder.currentStage === "completed") {
      prodSeverity = "good";
      prodText = "Production Completed";
      prodTextAr = "اكتملت مرحلة التصنيع";
      prodDetail = "Order ready for dispatch";
      prodDetailAr = "الطلب جاهز للشحن والتوريد";
    } else if (["in_production", "cutting", "assembly"].includes(mainOrder.currentStage)) {
      prodSeverity = "good";
      prodText = "Order in Production";
      prodTextAr = "الطلب قيد التنفيذ";
      prodDetail = `Current factory stage: ${mainOrder.currentStage}`;
      prodDetailAr = `المرحلة الحالية: ${mainOrder.currentStage}`;
    } else {
      prodSeverity = "neutral";
      prodText = "Order Booked";
      prodTextAr = "تم حجز أمر التنفيذ";
      prodDetail = "Production scheduling in preparation";
      prodDetailAr = "جاري جدولة التصنيع";
    }
  }

  indicators.push({
    dimension: "production",
    title: "Production Status",
    titleAr: "التصنيع والتشغيل",
    statusText: prodText,
    statusTextAr: prodTextAr,
    severity: prodSeverity,
    detail: prodDetail,
    detailAr: prodDetailAr,
  });

  // 3. Inventory Health
  let invSeverity: HealthSeverity = "neutral";
  let invText = "BOM in Quotation";
  let invTextAr = "حساب الكميات بالمقايسة";
  let invDetail = "Materials will be reserved upon production booking";
  let invDetailAr = "يتم حجز الخامات فور اعتماد أمر التشغيل";

  if (inventory.length > 0) {
    const consumed = inventory.filter((i) => i.status === "consumed").length;
    const reserved = inventory.filter((i) => i.status === "reserved").length;
    if (consumed === inventory.length) {
      invSeverity = "good";
      invText = "Materials Fully Consumed";
      invTextAr = "تم صرف الخامات بالكامل";
      invDetail = `All ${inventory.length} allocated items issued to shopfloor`;
      invDetailAr = `تم صرف جميع البنود (${inventory.length}) للورشة`;
    } else if (reserved > 0) {
      invSeverity = "good";
      invText = "Materials Reserved & Ready";
      invTextAr = "الخامات محجوزة ومتاحة";
      invDetail = `${reserved} items reserved in warehouse`;
      invDetailAr = `تم تأكيد حجز ${reserved} بند في المستودع`;
    }
  } else if (orders.length > 0) {
    invSeverity = "warning";
    invText = "Awaiting Stock Reservation";
    invTextAr = "بانتظار حجز الخامات";
    invDetail = "Order created but material reservation not completed";
    invDetailAr = "الطلب قائم وبانتظار تأكيد حجز قطاعات الألومنيوم والإكسسوارات";
  }

  indicators.push({
    dimension: "inventory",
    title: "Inventory Readiness",
    titleAr: "جاهزية الخامات والمخزون",
    statusText: invText,
    statusTextAr: invTextAr,
    severity: invSeverity,
    detail: invDetail,
    detailAr: invDetailAr,
  });

  // 4. Quality Health
  let qualSeverity: HealthSeverity = "good";
  let qualText = "Zero Quality Defects";
  let qualTextAr = "الجودة ممتازة (0 ملاحظات)";
  let qualDetail = "No active remake or rework requests";
  let qualDetailAr = "لا توجد طلبات إعادة تصنيع أو عيوب";

  const activeRemakes = remakesList.filter((r) => r.status !== "resolved" && r.status !== "rejected" && r.status !== "cancelled");
  if (activeRemakes.length > 0) {
    qualSeverity = "critical";
    qualText = `${activeRemakes.length} Remake Request Active`;
    qualTextAr = `${activeRemakes.length} طلب إعادة تصنيع نشط`;
    qualDetail = `Immediate quality attention required: ${activeRemakes[0].reason}`;
    qualDetailAr = `تتطلب تدخلاً هندسياً: ${activeRemakes[0].reason}`;
  } else if (remakesList.length > 0) {
    qualSeverity = "good";
    qualText = "Previous Remakes Resolved";
    qualTextAr = "تم حل ملاحظات الجودة السابقة";
    qualDetail = `${remakesList.length} past remake cases resolved cleanly`;
    qualDetailAr = `تم علاج وإغلاق ${remakesList.length} ملاحظات سابقة بنجاح`;
  }

  indicators.push({
    dimension: "quality",
    title: "Quality & QC",
    titleAr: "مراقبة الجودة والعيوب",
    statusText: qualText,
    statusTextAr: qualTextAr,
    severity: qualSeverity,
    detail: qualDetail,
    detailAr: qualDetailAr,
  });

  // 5. Delivery Health
  let delSeverity: HealthSeverity = "neutral";
  let delText = "Pending Production";
  let delTextAr = "بانتظار اكتمال التصنيع";
  let delDetail = "Delivery will be scheduled post-fabrication";
  let delDetailAr = "تحدد مواعيد الشحن فور انتهاء مرحلة التصنيع";

  if (deliveries.length > 0) {
    const mainDel = deliveries[0];
    if (deliveries.some((d) => d.status === "delivery_failed") || mainDel.status === "delivery_failed") {
      delSeverity = "critical";
      delText = "Delivery Issues";
      delTextAr = "مشاكل في التوريد";
      delDetail = "Delivery attempt failed or site issues reported";
      delDetailAr = "فشلت محاولة التوريد أو توجد معوقات بالموقع";
    } else if (mainDel.status === "completed") {
      delSeverity = "good";
      delText = "Handover Signed & Completed";
      delTextAr = "تم التسليم وتوقيع محضر الاستلام";
      delDetail = "Client accepted installation and handover";
      delDetailAr = "تم توقيع محضر التسليم بدون ملاحظات";
    } else if (mainDel.status === "installed") {
      delSeverity = "good";
      delText = "Installation Completed";
      delTextAr = "اكتمل التركيب بالموقع";
      delDetail = "Awaiting formal customer handover signoff";
      delDetailAr = "بانتظار توقيع محضر الاستلام النهائي";
    } else if (mainDel.status === "installation_pending") {
      delSeverity = "warning";
      delText = "Installation in Progress";
      delTextAr = "جاري التركيب في الموقع";
      delDetail = "Site team currently installing components";
      delDetailAr = "فريق التركيبات متواجد حالياً بالموقع";
    } else if (["dispatched", "out_for_delivery"].includes(mainDel.status)) {
      delSeverity = "warning";
      delText = "Out for Delivery";
      delTextAr = "جاري التوريد والنقل";
      delDetail = "Vehicles dispatched to job site";
      delDetailAr = "شاحنة التوريد في الطريق لموقع المشروع";
    } else if (mainDel.status === "ready_for_dispatch") {
      delSeverity = "neutral";
      delText = "Ready for Dispatch";
      delTextAr = "جاهز للشحن والنقل";
      delDetail = "Logistics scheduled for transport";
      delDetailAr = "تم تجهيز الشحنة بانتظار تحرك الشاحنة";
    }
  } else if (orders.some((o) => o.deliveredAt)) {
    delSeverity = "good";
    delText = "Delivered to Customer";
    delTextAr = "تم التوريد للعميل";
    delDetail = "Order marked as delivered";
    delDetailAr = "تم تسجيل الاستلام للعميل";
  }

  indicators.push({
    dimension: "delivery",
    title: "Delivery & Installation",
    titleAr: "الشحن والتركيب",
    statusText: delText,
    statusTextAr: delTextAr,
    severity: delSeverity,
    detail: delDetail,
    detailAr: delDetailAr,
  });

  // 6. Financial Health
  let finSeverity: HealthSeverity = "good";
  let finText = "Financially Clear";
  let finTextAr = "الحساب منتظم";
  let finDetail = "No outstanding balance";
  let finDetailAr = "لا يوجد رصيد متبقي مستحق";

  if (financials.totalInvoiced > 0) {
    if (financials.outstandingBalance <= 0) {
      finSeverity = "good";
      finText = "Fully Collected";
      finTextAr = "مسدد بالكامل (100%)";
      finDetail = `All invoiced amounts (EGP ${financials.totalInvoiced.toLocaleString()}) collected`;
      finDetailAr = `تم تحصيل كامل القيمة المفوترة بنجاح`;
    } else if (financials.totalCollected > 0) {
      const pct = Math.round((financials.totalCollected / financials.totalInvoiced) * 100);
      finSeverity = "warning";
      finText = `Partially Paid (${pct}%) — EGP ${financials.outstandingBalance.toLocaleString()} Due`;
      finTextAr = `مسدد جزئياً (${pct}%) — متبقي ${financials.outstandingBalance.toLocaleString()} ج.م.`;
      finDetail = `Outstanding balance: EGP ${financials.outstandingBalance.toLocaleString()}`;
      finDetailAr = `الرصيد المتبقي: ${financials.outstandingBalance.toLocaleString()} ج.م.`;
    } else {
      finSeverity = "critical";
      finText = "Payment Overdue / Uncollected";
      finTextAr = "مستحق السداد بالكامل";
      finDetail = `EGP ${financials.outstandingBalance.toLocaleString()} pending collection`;
      finDetailAr = `مبلغ ${financials.outstandingBalance.toLocaleString()} ج.م. بانتظار التحصيل`;
    }
  } else if (financials.totalProjectValue > 0) {
    finSeverity = "neutral";
    finText = "Commercial Value Committed";
    finTextAr = "قيمة تعاقدية تقديرية";
    finDetail = `EGP ${financials.totalProjectValue.toLocaleString()} estimated value`;
    finDetailAr = `إجمالي القيمة المقدرة: ${financials.totalProjectValue.toLocaleString()} ج.م.`;
  }

  indicators.push({
    dimension: "financial",
    title: "Financial Ledger",
    titleAr: "الموقف المالي والتحصيل",
    statusText: finText,
    statusTextAr: finTextAr,
    severity: finSeverity,
    detail: finDetail,
    detailAr: finDetailAr,
  });

  return indicators;
}
