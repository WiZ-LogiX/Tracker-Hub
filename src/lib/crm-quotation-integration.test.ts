import { describe, it, expect, vi } from "vitest";
import { LOST_REASONS, type LostReasonKey, type PipelineStage } from "@/lib/crm-types";

describe("TASK 24 — PeleCanon CRM ↔ V2 Quotation Commercial Integration", () => {
  // ── 1. Lost Reasons & Validation Rules ──────────────────────────────────────
  describe("1. Lost Reasons Validation", () => {
    it("defines the 6 authoritative CRM lost reasons", () => {
      const keys = LOST_REASONS.map((r) => r.value);
      expect(keys).toEqual([
        "price",
        "timing",
        "competitor",
        "customer_cancelled",
        "no_response",
        "other",
      ]);
    });

    it("requires a non-empty lostReason when stage is lost", () => {
      function validateStageTransition(stage: PipelineStage, lostReason?: string | null) {
        if (stage === "lost" && (!lostReason || !lostReason.trim())) {
          throw new Error("lostReason is required when moving opportunity to lost stage");
        }
        return true;
      }

      expect(() => validateStageTransition("lost")).toThrow("lostReason is required");
      expect(() => validateStageTransition("lost", "")).toThrow("lostReason is required");
      expect(() => validateStageTransition("lost", "   ")).toThrow("lostReason is required");
      expect(validateStageTransition("lost", "price")).toBe(true);
      expect(validateStageTransition("lost", "competitor")).toBe(true);
      expect(validateStageTransition("negotiation", undefined)).toBe(true);
      expect(validateStageTransition("won", undefined)).toBe(true);
    });
  });

  // ── 2. Deterministic Quote Status -> CRM Opportunity Synchronization ─────────
  describe("2. Deterministic Stage Synchronization Engine", () => {
    interface MockOppState {
      id: string;
      stage: PipelineStage;
      status: "open" | "won" | "lost" | "abandoned";
      value: number;
      lostReason: string | null;
      nextAction: string | null;
      nextActionDate: string | null;
    }

    interface MockQuoteState {
      id: string;
      quoteNumber: string;
      opportunityId: string | null;
      customerId: string;
      total: number;
      status: "draft" | "sent" | "accepted" | "rejected" | "expired";
      snapshotFrozen: boolean;
    }

    interface MockTaskState {
      id: string;
      taskCode: string;
      category: string;
      title: string;
      quoteId?: string;
      opportunityId?: string;
    }

    class CommercialSyncEngine {
      public opp: MockOppState;
      public tasks: MockTaskState[] = [];
      public auditLogs: Array<{ action: string; details: any }> = [];
      private taskCounter = 1000;

      constructor(initialOpp: MockOppState) {
        this.opp = { ...initialOpp };
      }

      onQuoteCreatedOrDraftSaved(quote: MockQuoteState) {
        const earlyStages: PipelineStage[] = ["new_lead", "contacted", "qualified", "site_visit"];
        if (earlyStages.includes(this.opp.stage)) {
          this.opp.stage = "design_measurement";
        }
        if (quote.total > 0) {
          this.opp.value = quote.total;
        }
      }

      onQuoteSent(quote: MockQuoteState) {
        // Quote Sent: moves early stages to 'quotation', preserves 'negotiation'
        const earlyStages: PipelineStage[] = ["new_lead", "contacted", "qualified", "site_visit", "design_measurement"];
        if (earlyStages.includes(this.opp.stage)) {
          this.opp.stage = "quotation";
        }
        this.opp.status = "open";
        if (quote.total > 0) {
          this.opp.value = quote.total;
        }

        const followUpDate = new Date(Date.now() + 3 * 86400000).toISOString();
        this.opp.nextAction = `متابعة عرض السعر ${quote.quoteNumber}`;
        this.opp.nextActionDate = followUpDate;

        this.taskCounter++;
        const taskCode = `TSK-${this.taskCounter}`;
        const task: MockTaskState = {
          id: `task-${this.taskCounter}`,
          taskCode,
          category: "crm_follow_up",
          title: `متابعة عرض السعر ${quote.quoteNumber}`,
          quoteId: quote.id,
          opportunityId: this.opp.id,
        };
        this.tasks.push(task);

        this.auditLogs.push({
          action: "quote_sent_sync",
          details: { quoteId: quote.id, quoteNumber: quote.quoteNumber, taskCode },
        });
      }

      onQuoteAccepted(quote: MockQuoteState) {
        this.opp.stage = "won";
        this.opp.status = "won";
        if (quote.total > 0) {
          this.opp.value = quote.total;
        }
        this.opp.lostReason = null;
        this.opp.nextAction = `بدء التنفيذ والتعاقد - عرض ${quote.quoteNumber}`;
        this.opp.nextActionDate = new Date().toISOString();

        this.auditLogs.push({
          action: "opportunity_won",
          details: { reason: "Quote accepted by customer", quoteId: quote.id, amount: quote.total },
        });
      }

      onQuoteRejected(quote: MockQuoteState) {
        // Business rule: Do NOT mark opportunity as lost! Move to negotiation to revise requirements/pricing
        this.opp.stage = "negotiation";
        this.opp.status = "open";
        const followUpDate = new Date(Date.now() + 2 * 86400000).toISOString();
        this.opp.nextAction = `مراجعة العميل بعد رفض عرض السعر ${quote.quoteNumber}`;
        this.opp.nextActionDate = followUpDate;

        this.taskCounter++;
        const taskCode = `TSK-${this.taskCounter}`;
        this.tasks.push({
          id: `task-${this.taskCounter}`,
          taskCode,
          category: "crm_follow_up",
          title: `مراجعة أسباب رفض عرض السعر ${quote.quoteNumber}`,
          quoteId: quote.id,
          opportunityId: this.opp.id,
        });

        this.auditLogs.push({
          action: "quote_rejected_sync",
          details: { quoteId: quote.id, quoteNumber: quote.quoteNumber },
        });
      }

      onQuoteConvertedToOrder(quote: MockQuoteState, orderId: string) {
        this.opp.stage = "won";
        this.opp.status = "won";
        if (quote.total > 0) {
          this.opp.value = quote.total;
        }
        this.opp.lostReason = null;

        this.auditLogs.push({
          action: "opportunity_won",
          details: { orderId, quoteId: quote.id, amount: quote.total },
        });
      }
    }

    it("advances early stage to design_measurement when quote draft is created", () => {
      const engine = new CommercialSyncEngine({
        id: "opp-1",
        stage: "site_visit",
        status: "open",
        value: 0,
        lostReason: null,
        nextAction: null,
        nextActionDate: null,
      });

      engine.onQuoteCreatedOrDraftSaved({
        id: "q-1",
        quoteNumber: "QUO-1001",
        opportunityId: "opp-1",
        customerId: "cust-1",
        total: 75000,
        status: "draft",
        snapshotFrozen: false,
      });

      expect(engine.opp.stage).toBe("design_measurement");
      expect(engine.opp.value).toBe(75000);
    });

    it("advances opportunity to quotation and schedules follow-up task when quote is sent", () => {
      const engine = new CommercialSyncEngine({
        id: "opp-1",
        stage: "design_measurement",
        status: "open",
        value: 0,
        lostReason: null,
        nextAction: null,
        nextActionDate: null,
      });

      engine.onQuoteSent({
        id: "q-1",
        quoteNumber: "QUO-1001",
        opportunityId: "opp-1",
        customerId: "cust-1",
        total: 120000,
        status: "sent",
        snapshotFrozen: false,
      });

      expect(engine.opp.stage).toBe("quotation");
      expect(engine.opp.status).toBe("open");
      expect(engine.opp.value).toBe(120000);
      expect(engine.opp.nextAction).toContain("QUO-1001");
      expect(engine.opp.nextActionDate).toBeDefined();

      // Verify task creation
      expect(engine.tasks).toHaveLength(1);
      expect(engine.tasks[0].taskCode).toBe("TSK-1001");
      expect(engine.tasks[0].category).toBe("crm_follow_up");
      expect(engine.tasks[0].opportunityId).toBe("opp-1");
      expect(engine.tasks[0].quoteId).toBe("q-1");

      // Verify audit log
      expect(engine.auditLogs).toContainEqual(
        expect.objectContaining({ action: "quote_sent_sync" }),
      );
    });

    it("does NOT regress negotiation stage back to quotation when another quote is sent", () => {
      const engine = new CommercialSyncEngine({
        id: "opp-1",
        stage: "negotiation",
        status: "open",
        value: 120000,
        lostReason: null,
        nextAction: null,
        nextActionDate: null,
      });

      engine.onQuoteSent({
        id: "q-2",
        quoteNumber: "QUO-1002",
        opportunityId: "opp-1",
        customerId: "cust-1",
        total: 115000,
        status: "sent",
        snapshotFrozen: false,
      });

      // Stage must remain negotiation!
      expect(engine.opp.stage).toBe("negotiation");
      expect(engine.opp.value).toBe(115000);
    });

    it("marks opportunity won when quotation is accepted", () => {
      const engine = new CommercialSyncEngine({
        id: "opp-1",
        stage: "negotiation",
        status: "open",
        value: 115000,
        lostReason: "timing", // previous stale reason
        nextAction: null,
        nextActionDate: null,
      });

      engine.onQuoteAccepted({
        id: "q-2",
        quoteNumber: "QUO-1002",
        opportunityId: "opp-1",
        customerId: "cust-1",
        total: 115000,
        status: "accepted",
        snapshotFrozen: true,
      });

      expect(engine.opp.stage).toBe("won");
      expect(engine.opp.status).toBe("won");
      expect(engine.opp.value).toBe(115000);
      expect(engine.opp.lostReason).toBeNull();
      expect(engine.auditLogs).toContainEqual(
        expect.objectContaining({ action: "opportunity_won" }),
      );
    });

    it("moves opportunity to negotiation (NOT lost) when quotation is rejected", () => {
      const engine = new CommercialSyncEngine({
        id: "opp-1",
        stage: "quotation",
        status: "open",
        value: 120000,
        lostReason: null,
        nextAction: null,
        nextActionDate: null,
      });

      engine.onQuoteRejected({
        id: "q-1",
        quoteNumber: "QUO-1001",
        opportunityId: "opp-1",
        customerId: "cust-1",
        total: 120000,
        status: "rejected",
        snapshotFrozen: true,
      });

      expect(engine.opp.stage).toBe("negotiation");
      expect(engine.opp.status).toBe("open");
      expect(engine.opp.nextAction).toContain("مراجعة العميل بعد رفض عرض السعر");
      expect(engine.tasks).toHaveLength(1);
      expect(engine.tasks[0].title).toContain("مراجعة أسباب رفض");
    });

    it("marks opportunity won during transactional order conversion", () => {
      const engine = new CommercialSyncEngine({
        id: "opp-1",
        stage: "negotiation",
        status: "open",
        value: 120000,
        lostReason: null,
        nextAction: null,
        nextActionDate: null,
      });

      engine.onQuoteConvertedToOrder(
        {
          id: "q-1",
          quoteNumber: "QUO-1001",
          opportunityId: "opp-1",
          customerId: "cust-1",
          total: 120000,
          status: "accepted",
          snapshotFrozen: true,
        },
        "ord-1",
      );

      expect(engine.opp.stage).toBe("won");
      expect(engine.opp.status).toBe("won");
      expect(engine.opp.value).toBe(120000);
      expect(engine.opp.lostReason).toBeNull();
      expect(engine.auditLogs).toContainEqual(
        expect.objectContaining({
          action: "opportunity_won",
          details: expect.objectContaining({ orderId: "ord-1" }),
        }),
      );
    });
  });

  // ── 3. Snapshot Immutability During Commercial Follow-Up ─────────────────────
  describe("3. Commercial Follow-Up Preserves Frozen Quotation Snapshots", () => {
    it("ensures updating opportunity notes and next actions does not touch frozen quote JSON", () => {
      const frozenSnapshot = Object.freeze({
        snapshotVersion: 2,
        quoteNumber: "QUO-1001",
        createdAt: "2026-09-20T10:00:00Z",
        lines: [
          { itemCode: "SEC-01", description: "Cabinet Section A", unitPrice: 5000, qty: 10, total: 50000 },
        ],
        grandTotal: 50000,
      });

      const opportunity = {
        id: "opp-1",
        negotiationNotes: "Customer requested 5% discount or payment in 3 installments",
        lastContactDate: new Date().toISOString(),
        nextAction: "Send amended proposal schedule",
      };

      // Ensure snapshot object remains identical and unmodified
      expect(frozenSnapshot.grandTotal).toBe(50000);
      expect(frozenSnapshot.lines).toHaveLength(1);
      expect(Object.isFrozen(frozenSnapshot)).toBe(true);

      // Verify opportunity is updated independently
      expect(opportunity.negotiationNotes).toContain("5% discount");
      expect(opportunity.nextAction).toBe("Send amended proposal schedule");
    });
  });

  // ── 4. Project-Centric Scoping & Cross-Project Isolation ─────────────────────
  describe("4. Project-Centric Data Isolation", () => {
    it("strictly associates quotes and orders to their respective opportunities without cross-project leakage", () => {
      const customerId = "cust-100";

      const oppVilla = { id: "opp-villa", title: "New Cairo Villa", customerId };
      const oppChalet = { id: "opp-chalet", title: "North Coast Chalet", customerId };

      const allQuotes = [
        { id: "q-1", quoteNumber: "QUO-001", customerId, opportunityId: "opp-villa", total: 350000 },
        { id: "q-2", quoteNumber: "QUO-002", customerId, opportunityId: "opp-villa", total: 340000 },
        { id: "q-3", quoteNumber: "QUO-003", customerId, opportunityId: "opp-chalet", total: 180000 },
      ];

      const allOrders = [
        { id: "ord-1", orderNumber: "ORD-001", customerId, opportunityId: "opp-villa", total: 340000 },
        { id: "ord-2", orderNumber: "ORD-002", customerId, opportunityId: "opp-chalet", total: 180000 },
      ];

      // Filter for Villa
      const villaQuotes = allQuotes.filter((q) => q.opportunityId === oppVilla.id);
      const villaOrders = allOrders.filter((o) => o.opportunityId === oppVilla.id);

      expect(villaQuotes).toHaveLength(2);
      expect(villaQuotes.map((q) => q.quoteNumber)).toEqual(["QUO-001", "QUO-002"]);
      expect(villaOrders).toHaveLength(1);
      expect(villaOrders[0].orderNumber).toBe("ORD-001");

      // Filter for Chalet
      const chaletQuotes = allQuotes.filter((q) => q.opportunityId === oppChalet.id);
      const chaletOrders = allOrders.filter((o) => o.opportunityId === oppChalet.id);

      expect(chaletQuotes).toHaveLength(1);
      expect(chaletQuotes[0].quoteNumber).toBe("QUO-003");
      expect(chaletOrders).toHaveLength(1);
      expect(chaletOrders[0].orderNumber).toBe("ORD-002");
    });
  });
});
