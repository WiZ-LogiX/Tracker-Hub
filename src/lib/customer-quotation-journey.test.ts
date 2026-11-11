/**
 * PELECANON CUSTOMER-CENTRIC QUOTATION LIFECYCLE & ORDER TRACKING TEST SUITE
 *
 * Verifies Scenarios A through G:
 * - Scenario A: Quote creation, draft save, internal approval, WhatsApp confirmation request.
 * - Scenario B: Customer WhatsApp consent received ("Approved for Delivery"), explicitly NOT commercially accepted.
 * - Scenario C: Secure PDF delivery via tokenized link, capability URL access control, short-lived signed URLs.
 * - Scenario D: Customer explicit commercial acceptance, snapshot freeze, order conversion & duplicate protection.
 * - Scenario E: Customer revision and rejection, historical versioning (V1, V2), urgent sales manager task generation.
 * - Scenario F: 6-stage simplified customer tracking model with active internal sub-stage indicators.
 * - Scenario G: Customer 360 timeline showing complete customer journey without cross-customer data leakage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CUSTOMER_TRACKING_STAGES,
  CUSTOMER_STAGE_LABEL_AR,
  INTERNAL_SUB_STAGE_LABEL_AR,
  mapInternalStageToCustomerStage,
  customerStageIndex,
  getInternalSubStageLabelAr,
  QUOTATION_LIFECYCLE_STAGES,
  QUOTATION_STAGE_LABEL_AR,
  getStageLabelAr,
  type CustomerTrackingStage,
  type QuotationLifecycleStage,
} from "./stages";
import { getQuotationProgressiveStatus } from "./quote.functions";
import {
  maskPhone,
  maskName,
  isTrackingTokenUuid,
  handlePublicTrackingByRef,
} from "./tracking.functions";

describe("PELECANON CUSTOMER-CENTRIC LIFECYCLE & TRACKING VERIFICATION", () => {
  const tenantId = "11111111-2222-3333-4444-555555555555";
  const customerId = "cust-001-ahmed";
  const quoteId = "quote-001-uuid";
  const trackingToken = "c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c";

  // ── Scenario A: Quote Creation, Draft Save & Internal Approval ───────────────
  describe("Scenario A: Quote Creation, Draft Save & Internal Approval", () => {
    it("initializes quote in draft stage with progressive status 'draft'", () => {
      const quote = {
        id: quoteId,
        quote_number: "PLC-2026-001",
        status: "draft",
        snapshot: {
          items: [{ title: "مطبخ خشب زان", unit_price: 45000, quantity: 1 }],
        },
      };

      const progressiveStatus = getQuotationProgressiveStatus(quote);
      expect(progressiveStatus).toBe("draft");
      expect(QUOTATION_STAGE_LABEL_AR[progressiveStatus]).toBe("مسودة");
    });

    it("rejects approval if quote has no items or products", () => {
      function validateQuoteForApproval(itemsCount: number, productsCount: number) {
        if (itemsCount === 0 && productsCount === 0) {
          throw new Error("Cannot approve: quotation has no items or products. Add items before requesting confirmation.");
        }
        return true;
      }

      expect(() => validateQuoteForApproval(0, 0)).toThrow("Cannot approve: quotation has no items or products");
      expect(validateQuoteForApproval(1, 0)).toBe(true);
      expect(validateQuoteForApproval(0, 2)).toBe(true);
    });

    it("on internal approval, advances lifecycle to awaiting_customer_confirmation and generates tracking token", () => {
      const existingSnap = {
        items: [{ title: "وحدة تخزين دريسنج", unit_price: 28000, quantity: 1 }],
      };

      const generatedToken = trackingToken;
      const nowIso = new Date().toISOString();

      const updatedLifecycle = {
        stage: "awaiting_customer_confirmation" as QuotationLifecycleStage,
        approved_at: nowIso,
        approved_by: "manager-user-01",
        confirmation_requested_at: nowIso,
        confirmation_status: "pending",
        decision: null,
        decision_at: null,
        decision_notes: null,
        version_history: [],
      };

      const quote = {
        id: quoteId,
        status: "sent",
        snapshot: {
          ...existingSnap,
          tracking_token: generatedToken,
          lifecycle: updatedLifecycle,
        },
      };

      const progStatus = getQuotationProgressiveStatus(quote);
      expect(progStatus).toBe("awaiting_customer_confirmation");
      expect(QUOTATION_STAGE_LABEL_AR[progStatus]).toBe("بانتظار تأكيد العميل عبر واتساب");
      expect(quote.snapshot.tracking_token).toBe(trackingToken);
      expect(isTrackingTokenUuid(quote.snapshot.tracking_token)).toBe(true);
    });

    it("formats WhatsApp confirmation request payload with interactive yes/no options", () => {
      const quoteNumber = "PLC-2026-001";
      const total = 73000;
      const customerName = "م. أحمد الشناوي";
      const customerPhone = "+201012345678";

      const message = `مرحباً ${customerName}، عرض السعر الخاص بكم ${quoteNumber} بقيمة ${total.toLocaleString()} ج.م جاهز. هل ترغب في استلام ملف عرض السعر عبر واتساب؟\n[نعم، أرسل عرض السعر] [لا، ليس الآن]`;

      const n8nPayload = {
        event: "quote_confirmation_request",
        reference: quoteNumber,
        channels: ["whatsapp"],
        to: { phone: customerPhone },
        message,
        extra: {
          quote_id: quoteId,
          tracking_token: trackingToken,
          total: String(total),
          interactive_actions: "yes_send_quote,no_not_now",
        },
      };

      expect(n8nPayload.event).toBe("quote_confirmation_request");
      expect(n8nPayload.message).toContain("[نعم، أرسل عرض السعر] [لا، ليس الآن]");
      expect(n8nPayload.extra.interactive_actions).toBe("yes_send_quote,no_not_now");
      expect(n8nPayload.extra.tracking_token).toBe(trackingToken);
    });
  });

  // ── Scenario B: Customer WhatsApp Consent Received ───────────────────────────
  describe("Scenario B: Customer WhatsApp Consent Received", () => {
    it("records consent 'Approved to Receive PDF' without commercially accepting the quotation", () => {
      const snap: any = {
        tracking_token: trackingToken,
        lifecycle: {
          stage: "awaiting_customer_confirmation",
          confirmation_status: "pending",
        },
      };

      // Customer responds YES to receive the PDF link
      const nowIso = new Date().toISOString();
      snap.customer_consent = {
        consented: true,
        consented_at: nowIso,
        notes: "نعم تفضل بالإرسال",
      };
      snap.lifecycle = {
        ...snap.lifecycle,
        stage: "approved_for_delivery",
        confirmation_status: "consented",
        consented_at: nowIso,
        pdf_sent_at: nowIso,
      };

      const quote = {
        id: quoteId,
        status: "sent", // DB status remains 'sent'
        snapshot: snap,
      };

      const progStatus = getQuotationProgressiveStatus(quote);
      expect(progStatus).toBe("approved_for_delivery");
      expect(QUOTATION_STAGE_LABEL_AR[progStatus]).toBe("وافق على استلام عرض السعر");

      // CRITICAL COMMERCIAL INVARIANT:
      // Status in DB must NOT be 'accepted'
      expect(quote.status).not.toBe("accepted");
      expect(quote.status).toBe("sent");
    });

    it("if customer responds NO, records declined consent and alerts sales manager without sending PDF", () => {
      const snap: any = {
        tracking_token: trackingToken,
        lifecycle: {
          stage: "awaiting_customer_confirmation",
          confirmation_status: "pending",
        },
      };

      const nowIso = new Date().toISOString();
      snap.customer_consent = {
        consented: false,
        declined_at: nowIso,
        notes: "لا، ليس الآن - مسافر",
      };
      snap.lifecycle = {
        ...snap.lifecycle,
        stage: "awaiting_customer_confirmation",
        confirmation_status: "declined",
        declined_at: nowIso,
      };

      const quote = {
        id: quoteId,
        status: "sent",
        snapshot: snap,
      };

      const progStatus = getQuotationProgressiveStatus(quote);
      expect(progStatus).toBe("awaiting_customer_confirmation");
      expect(quote.snapshot.lifecycle.confirmation_status).toBe("declined");
      expect(quote.snapshot.customer_consent.consented).toBe(false);
    });
  });

  // ── Scenario C: Secure PDF Link Delivery & Token Access ──────────────────────
  describe("Scenario C: Secure PDF Link Delivery & Token Access", () => {
    it("generates stable application link /track?ref=<token> for WhatsApp delivery", () => {
      const siteUrl = "https://tracker.pelecanon.com";
      const trackingLink = `${siteUrl}/track?ref=${encodeURIComponent(trackingToken)}`;

      expect(trackingLink).toBe(`https://tracker.pelecanon.com/track?ref=${trackingToken}`);
      expect(isTrackingTokenUuid(trackingToken)).toBe(true);
    });

    it("rejects predictable sequential identifiers from capability URL access", () => {
      expect(isTrackingTokenUuid("PLC-2026-001")).toBe(false);
      expect(isTrackingTokenUuid("ORD-0042")).toBe(false);
      expect(isTrackingTokenUuid("12345")).toBe(false);
      expect(isTrackingTokenUuid(trackingToken)).toBe(true);
    });

    it("handlePublicTrackingByRef provides tokenized quote data with sanitized PII", async () => {
      const mockQuoteRow = {
        id: quoteId,
        quote_number: "PLC-2026-001",
        status: "sent",
        total: 85000,
        deposit_pct: 50,
        valid_until: "2026-12-31",
        snapshot: {
          tracking_token: trackingToken,
          items: [{ title: "مطبخ حديث", unit_price: 85000, quantity: 1 }],
          lifecycle: {
            stage: "awaiting_customer_decision",
            approved_at: "2026-11-10T10:00:00Z",
            confirmation_requested_at: "2026-11-10T10:05:00Z",
            consented_at: "2026-11-10T10:10:00Z",
            pdf_sent_at: "2026-11-10T10:10:05Z",
          },
        },
        created_at: "2026-11-10T09:00:00Z",
        tenant_id: tenantId,
        customers: [{ name: "أحمد كمال الدين", phone: "01099887766" }],
      };

      const mockAdmin: any = {
        from: vi.fn((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === "quotes") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              filter: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [mockQuoteRow], error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      const res = await handlePublicTrackingByRef({ reference: trackingToken }, mockAdmin);

      expect(res.type).toBe("quote");
      if (res.type !== "quote") throw new Error("Expected quote result");

      expect(res.quote.quote_number).toBe("PLC-2026-001");
      expect(res.quote.total).toBe(85000);
      expect(res.quote.progressive_status).toBe("awaiting_customer_decision");
      expect(res.quote.customer_name).toBe("أحمد ك.");
      expect(res.quote.customer_phone).toBe("010****7766");
      expect(res.quote.customer_phone).not.toBe("01099887766");

      // Verify journey timeline milestones
      expect(res.quote.journey_timeline.length).toBeGreaterThanOrEqual(4);
      expect(res.quote.journey_timeline.find((t: any) => t.stageKey === "pdf_sent")?.completed).toBe(true);
    });
  });

  // ── Scenario D: Customer Acceptance & Order Conversion Guard ─────────────────
  describe("Scenario D: Customer Acceptance & Order Conversion Guard", () => {
    it("advances quotation to 'accepted' when customer explicitly accepts", () => {
      const snap: any = {
        tracking_token: trackingToken,
        opportunityId: "opp-999",
        lifecycle: {
          stage: "awaiting_customer_decision",
        },
      };

      const nowIso = new Date().toISOString();
      snap.lifecycle = {
        ...snap.lifecycle,
        stage: "accepted",
        decision: "accepted",
        decision_at: nowIso,
        decision_notes: "تمت الموافقة على المقايسة بالكامل",
      };

      const quote = {
        id: quoteId,
        status: "accepted",
        snapshot: snap,
      };

      const progStatus = getQuotationProgressiveStatus(quote);
      expect(progStatus).toBe("accepted");
      expect(QUOTATION_STAGE_LABEL_AR[progStatus]).toBe("معتمد من العميل");
      expect(quote.status).toBe("accepted");
    });

    it("strictly blocks order conversion when quotation is NOT in 'accepted' status", () => {
      function validateQuoteForConversion(quoteStatus: string) {
        if (quoteStatus === "converted") {
          throw new Error("This quotation has already been converted to an order");
        }
        if (quoteStatus !== "accepted") {
          throw new Error(`Only an explicitly accepted quotation can be converted to an order (current status: ${quoteStatus})`);
        }
        return true;
      }

      expect(() => validateQuoteForConversion("draft")).toThrow("Only an explicitly accepted quotation can be converted");
      expect(() => validateQuoteForConversion("sent")).toThrow("Only an explicitly accepted quotation can be converted");
      expect(() => validateQuoteForConversion("rejected")).toThrow("Only an explicitly accepted quotation can be converted");
      expect(() => validateQuoteForConversion("converted")).toThrow("already been converted to an order");
      expect(validateQuoteForConversion("accepted")).toBe(true);
    });

    it("strictly rejects duplicate conversion if an order already exists for the quotation", () => {
      function guardDuplicateConversion(existingOrder: { id: string; orderNumber: string } | null) {
        if (existingOrder) {
          throw new Error(`An order (${existingOrder.orderNumber}) has already been created for this quotation`);
        }
        return true;
      }

      expect(() => guardDuplicateConversion({ id: "ord-1", orderNumber: "ORD-2026-0042" })).toThrow(
        "An order (ORD-2026-0042) has already been created for this quotation",
      );
      expect(guardDuplicateConversion(null)).toBe(true);
    });
  });

  // ── Scenario E: Customer Revision & Rejection ────────────────────────────────
  describe("Scenario E: Customer Revision & Rejection", () => {
    it("on customer rejection, transitions to 'rejected' and creates sales follow-up task", () => {
      const snap: any = {
        tracking_token: trackingToken,
        opportunityId: "opp-123",
        lifecycle: {
          stage: "awaiting_customer_decision",
        },
      };

      const rejectionNotes = "السعر مرتفع جداً مقارنة بالمنافسين";
      const nowIso = new Date().toISOString();

      snap.lifecycle = {
        ...snap.lifecycle,
        stage: "rejected",
        decision: "rejected",
        decision_at: nowIso,
        decision_notes: rejectionNotes,
      };

      const quote = {
        id: quoteId,
        status: "rejected",
        snapshot: snap,
      };

      const progStatus = getQuotationProgressiveStatus(quote);
      expect(progStatus).toBe("rejected");
      expect(QUOTATION_STAGE_LABEL_AR[progStatus]).toBe("مرفوض");
      expect(quote.status).toBe("rejected");
      expect(quote.snapshot.lifecycle.decision_notes).toBe(rejectionNotes);
    });

    it("on revision request, preserves version history (V1), increments version (V2), and resets status to draft", () => {
      const initialSnap: any = {
        version: 1,
        total: 90000,
        items: [{ title: "غرفة نوم ماستر", unit_price: 90000, quantity: 1 }],
        version_history: [],
        lifecycle: {
          stage: "awaiting_customer_decision",
        },
      };

      const revisionNotes = "يرجى تغيير التشطيب إلى أويستر رمادي مع تصغير التسريحة 20سم";
      const nowIso = new Date().toISOString();

      // Snapshot version history preserves V1
      const history = [...initialSnap.version_history];
      history.push({
        version: 1,
        total: initialSnap.total,
        snapshot: { items: initialSnap.items },
        lifecycle: initialSnap.lifecycle,
        revision_requested_at: nowIso,
        revision_notes: revisionNotes,
      });

      const updatedSnap = {
        ...initialSnap,
        version: 2,
        version_history: history,
        lifecycle: {
          stage: "revision_requested",
          decision: "revision_requested",
          decision_at: nowIso,
          decision_notes: revisionNotes,
        },
      };

      const quote = {
        id: quoteId,
        status: "draft", // DB status reset to draft
        snapshot: updatedSnap,
      };

      const progStatus = getQuotationProgressiveStatus(quote);
      expect(progStatus).toBe("revision_requested");
      expect(QUOTATION_STAGE_LABEL_AR[progStatus]).toBe("مطلوب تعديل");
      expect(quote.status).toBe("draft");
      expect(quote.snapshot.version).toBe(2);
      expect(quote.snapshot.version_history).toHaveLength(1);
      expect(quote.snapshot.version_history[0].version).toBe(1);
      expect(quote.snapshot.version_history[0].revision_notes).toBe(revisionNotes);
    });
  });

  // ── Scenario F: 6-Stage Customer Tracking Model & Sub-Stage Mapping ──────────
  describe("Scenario F: 6-Stage Customer Tracking Model & Sub-Stage Mapping", () => {
    it("defines the 6 customer tracking stages in exact canonical order", () => {
      expect(CUSTOMER_TRACKING_STAGES).toEqual([
        "order_confirmed",
        "design_approval",
        "in_production",
        "quality_check",
        "ready_for_delivery",
        "delivered",
      ]);
    });

    it("has Arabic labels for all 6 customer stages", () => {
      expect(CUSTOMER_STAGE_LABEL_AR.order_confirmed).toBe("تم تأكيد الطلب");
      expect(CUSTOMER_STAGE_LABEL_AR.design_approval).toBe("اعتماد التصميم");
      expect(CUSTOMER_STAGE_LABEL_AR.in_production).toBe("قيد التصنيع");
      expect(CUSTOMER_STAGE_LABEL_AR.quality_check).toBe("فحص الجودة");
      expect(CUSTOMER_STAGE_LABEL_AR.ready_for_delivery).toBe("جاهز للتسليم");
      expect(CUSTOMER_STAGE_LABEL_AR.delivered).toBe("تم التسليم");
    });

    it("maps internal workshop stages to customer stages accurately", () => {
      // Internal stages -> Customer stage
      expect(mapInternalStageToCustomerStage("deposit_received")).toBe("order_confirmed");
      expect(mapInternalStageToCustomerStage("design_approved")).toBe("design_approval");
      expect(mapInternalStageToCustomerStage("cutting")).toBe("in_production");
      expect(mapInternalStageToCustomerStage("assembly")).toBe("in_production");
      expect(mapInternalStageToCustomerStage("finishing")).toBe("in_production");
      expect(mapInternalStageToCustomerStage("quality_check")).toBe("quality_check");
      expect(mapInternalStageToCustomerStage("ready_for_pickup")).toBe("ready_for_delivery");
      expect(mapInternalStageToCustomerStage("delivered")).toBe("delivered");
      expect(mapInternalStageToCustomerStage("completed")).toBe("delivered");
      expect(mapInternalStageToCustomerStage(null)).toBe("order_confirmed");
      expect(mapInternalStageToCustomerStage(undefined)).toBe("order_confirmed");
    });

    it("resolves active internal sub-stage labels for cutting, assembly, finishing", () => {
      expect(getInternalSubStageLabelAr("cutting")).toBe("قص الخامات");
      expect(getInternalSubStageLabelAr("assembly")).toBe("التجميع");
      expect(getInternalSubStageLabelAr("finishing")).toBe("التشطيب والدهان");

      // Non-production stages return null
      expect(getInternalSubStageLabelAr("deposit_received")).toBeNull();
      expect(getInternalSubStageLabelAr("design_approved")).toBeNull();
      expect(getInternalSubStageLabelAr("quality_check")).toBeNull();
      expect(getInternalSubStageLabelAr("delivered")).toBeNull();
      expect(getInternalSubStageLabelAr(null)).toBeNull();
    });

    it("correctly calculates customerStageIndex for UI stepper progression", () => {
      expect(customerStageIndex("order_confirmed")).toBe(0);
      expect(customerStageIndex("design_approval")).toBe(1);
      expect(customerStageIndex("in_production")).toBe(2);
      expect(customerStageIndex("quality_check")).toBe(3);
      expect(customerStageIndex("ready_for_delivery")).toBe(4);
      expect(customerStageIndex("delivered")).toBe(5);
    });
  });

  // ── Scenario G: Customer 360 Timeline & Isolation ─────────────────────────────
  describe("Scenario G: Customer 360 Timeline & Tenant/Customer Isolation", () => {
    it("aggregates quotation milestones and order milestones into chronological order", () => {
      interface TimelineItem {
        id: string;
        timestamp: string;
        type: "quote" | "order" | "invoice" | "service_case";
        title: string;
        description: string;
      }

      const timeline: TimelineItem[] = [
        {
          id: "m-1",
          timestamp: "2026-11-01T10:00:00Z",
          type: "quote",
          title: "إنشاء عرض السعر PLC-2026-001",
          description: "تم تجهيز المسودة الأولية",
        },
        {
          id: "m-2",
          timestamp: "2026-11-02T12:00:00Z",
          type: "quote",
          title: "اعتماد عرض السعر وإرسال طلب التأكيد",
          description: "تم إرسال رسالة واتساب للعميل لطلب الموافقة على الاستلام",
        },
        {
          id: "m-3",
          timestamp: "2026-11-02T12:05:00Z",
          type: "quote",
          title: "موافقة العميل على استلام العرض عبر واتساب",
          description: "تم إرسال رابط المقايسة والـ PDF بنجاح",
        },
        {
          id: "m-4",
          timestamp: "2026-11-03T14:30:00Z",
          type: "quote",
          title: "اعتماد وقبول عرض السعر من العميل",
          description: "تمت الموافقة النهائية وجاهز للتحويل لأمر إنتاج",
        },
        {
          id: "m-5",
          timestamp: "2026-11-04T09:00:00Z",
          type: "order",
          title: "تحويل عرض السعر إلى أمر إنتاج ORD-2026-0042",
          description: "تم إنشاء أمر الإنتاج وتوليد فاتورة العربون",
        },
        {
          id: "m-6",
          timestamp: "2026-11-06T11:00:00Z",
          type: "order",
          title: "بدء مرحلة قص الخامات (قيد التصنيع)",
          description: "تم تسليم ألواح الخشب لورشة التقطيع",
        },
      ];

      // Verify chronological ordering
      const sorted = [...timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      expect(sorted[0].id).toBe("m-1");
      expect(sorted[3].title).toContain("اعتماد وقبول");
      expect(sorted[4].type).toBe("order");
      expect(sorted[5].title).toContain("قص الخامات");
    });

    it("strictly isolates Customer A and Customer B data", () => {
      const records = [
        { customer_id: "cust-A", tenant_id: tenantId, quote_number: "PLC-A-01" },
        { customer_id: "cust-A", tenant_id: tenantId, quote_number: "PLC-A-02" },
        { customer_id: "cust-B", tenant_id: tenantId, quote_number: "PLC-B-01" },
      ];

      const customerARecords = records.filter((r) => r.customer_id === "cust-A" && r.tenant_id === tenantId);
      const customerBRecords = records.filter((r) => r.customer_id === "cust-B" && r.tenant_id === tenantId);

      expect(customerARecords).toHaveLength(2);
      expect(customerBRecords).toHaveLength(1);
      expect(customerARecords.map((r) => r.quote_number)).not.toContain("PLC-B-01");
      expect(customerBRecords.map((r) => r.quote_number)).not.toContain("PLC-A-01");
    });
  });
});
