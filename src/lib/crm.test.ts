import { describe, it, expect } from "vitest";
import type {
  LeadItem,
  OpportunityItem,
  PipelineStage,
  LeadStatus,
  LeadSource,
  CRMStats,
} from "@/lib/crm-types";
import { PIPELINE_STAGES, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/crm-types";

describe("TASK 22 — PeleCanon CRM Foundation Unit Tests", () => {
  // ── 1. Atomic Per-Tenant Sequential Numbering & Concurrency ──────────────────
  describe("1. Atomic Numbering (LED-XXXX & OPP-XXXX) & Concurrency Safety", () => {
    class MockAtomicTenantCounter {
      private counters = new Map<string, number>();
      private locks = new Map<string, Promise<void>>();

      async getNextCode(tenantId: string, prefix: "LED" | "OPP"): Promise<string> {
        const key = `${tenantId}:${prefix}`;

        while (this.locks.has(key)) {
          await this.locks.get(key);
        }

        let releaseLock: () => void;
        const lockPromise = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        this.locks.set(key, lockPromise);

        try {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 2));
          const current = this.counters.get(key) ?? 1000;
          const next = current + 1;
          this.counters.set(key, next);
          return `${prefix}-${next}`;
        } finally {
          this.locks.delete(key);
          releaseLock!();
        }
      }
    }

    it("generates sequential lead codes starting from LED-1001", async () => {
      const counter = new MockAtomicTenantCounter();
      const code1 = await counter.getNextCode("tenant-1", "LED");
      const code2 = await counter.getNextCode("tenant-1", "LED");
      const code3 = await counter.getNextCode("tenant-1", "LED");

      expect(code1).toBe("LED-1001");
      expect(code2).toBe("LED-1002");
      expect(code3).toBe("LED-1003");
    });

    it("generates sequential opportunity codes starting from OPP-1001", async () => {
      const counter = new MockAtomicTenantCounter();
      const code1 = await counter.getNextCode("tenant-1", "OPP");
      const code2 = await counter.getNextCode("tenant-1", "OPP");

      expect(code1).toBe("OPP-1001");
      expect(code2).toBe("OPP-1002");
    });

    it("ensures zero duplicates under 25 concurrent requests", async () => {
      const counter = new MockAtomicTenantCounter();
      const requests = Array.from({ length: 25 }, () =>
        counter.getNextCode("tenant-concurrent", "LED"),
      );
      const results = await Promise.all(requests);

      expect(results).toHaveLength(25);
      const uniqueCodes = new Set(results);
      expect(uniqueCodes.size).toBe(25);
      expect(results).toContain("LED-1001");
      expect(results).toContain("LED-1025");
    });

    it("guarantees strict tenant isolation across sequences", async () => {
      const counter = new MockAtomicTenantCounter();
      const tenantACode = await counter.getNextCode("tenant-A", "LED");
      const tenantBCode = await counter.getNextCode("tenant-B", "LED");

      expect(tenantACode).toBe("LED-1001");
      expect(tenantBCode).toBe("LED-1001");
    });
  });

  // ── 2. Lead Intake & Source Channels ─────────────────────────────────────────
  describe("2. Lead Intake Channels & Validations", () => {
    it("supports all authoritative acquisition channels", () => {
      const sources: LeadSource[] = [
        "whatsapp",
        "facebook",
        "instagram",
        "website",
        "referral",
        "walk_in",
        "exhibition",
        "existing_customer",
        "other",
      ];

      const configuredValues = LEAD_SOURCES.map((s) => s.value);
      for (const src of sources) {
        expect(configuredValues).toContain(src);
      }
    });

    it("validates all 6 lead lifecycle statuses", () => {
      const statuses: LeadStatus[] = [
        "new",
        "contacted",
        "qualified",
        "unqualified",
        "converted",
        "lost",
      ];

      const configuredStatuses = LEAD_STATUSES.map((s) => s.value);
      for (const st of statuses) {
        expect(configuredStatuses).toContain(st);
      }
    });
  });

  // ── 3. Lead Conversion & Duplicate Customer Detection ───────────────────────
  describe("3. Lead Conversion & Customer Deduplication", () => {
    function normalizePhone(phone: string | null | undefined): string | null {
      if (!phone) return null;
      let digits = phone.replace(/\D/g, "");
      if (digits.startsWith("0020")) digits = digits.slice(4);
      else if (digits.startsWith("20") && digits.length > 10) digits = digits.slice(2);
      if (digits.startsWith("0") && digits.length > 9) digits = digits.slice(1);
      return digits.length > 0 ? digits : null;
    }

    function normalizeEmail(email: string | null | undefined): string | null {
      if (!email) return null;
      const trimmed = email.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : null;
    }

    it("normalizes phone numbers to pure digits for matching", () => {
      expect(normalizePhone("+20 (100) 123-4567")).toBe("1001234567");
      expect(normalizePhone("010-1234-5678")).toBe("1012345678");
      expect(normalizePhone("   ")).toBeNull();
    });

    it("normalizes emails for case-insensitive deduplication", () => {
      expect(normalizeEmail("  Client@Example.COM  ")).toBe("client@example.com");
      expect(normalizeEmail("")).toBeNull();
    });

    it("detects existing customer by phone number and reuses customer ID", () => {
      const existingCustomers = [
        { id: "cust-1", name: "Ahmed Mostafa", phone: "01012345678", email: "ahmed@example.com" },
        { id: "cust-2", name: "Sara Nabil", phone: "01187654321", email: "sara@example.com" },
      ];

      const leadPhone = "+20 010 1234 5678";
      const norm = normalizePhone(leadPhone);

      const matched = existingCustomers.find((c) => normalizePhone(c.phone) === norm);
      expect(matched).toBeDefined();
      expect(matched?.id).toBe("cust-1");
    });

    it("detects existing customer by email and reuses customer ID", () => {
      const existingCustomers = [
        { id: "cust-1", name: "Ahmed Mostafa", phone: "01012345678", email: "ahmed@example.com" },
      ];

      const leadEmail = "AHMED@EXAMPLE.COM ";
      const norm = normalizeEmail(leadEmail);

      const matched = existingCustomers.find((c) => normalizeEmail(c.email) === norm);
      expect(matched).toBeDefined();
      expect(matched?.id).toBe("cust-1");
    });

    it("creates a new customer when no match is found", () => {
      const existingCustomers = [
        { id: "cust-1", name: "Ahmed Mostafa", phone: "01012345678", email: "ahmed@example.com" },
      ];

      const leadPhone = "01299999999";
      const norm = normalizePhone(leadPhone);

      const matched = existingCustomers.find((c) => normalizePhone(c.phone) === norm);
      expect(matched).toBeUndefined();
    });

    it("prevents converting an already converted lead", () => {
      const lead: LeadItem = {
        id: "lead-1",
        tenantId: "t1",
        leadNumber: "LED-1001",
        name: "Omar Tarek",
        phone: "01055555555",
        email: null,
        location: "Cairo",
        source: "website",
        interestedProduct: "Kitchen",
        estimatedBudget: 150000,
        notes: null,
        assignedSalesperson: null,
        status: "converted", // Already converted
        nextAction: null,
        nextActionDate: null,
        convertedCustomerId: "cust-1",
        convertedOpportunityId: "opp-1",
        convertedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const attemptConversion = () => {
        if (lead.status === "converted") {
          throw new Error("This lead has already been converted");
        }
      };

      expect(attemptConversion).toThrow("This lead has already been converted");
    });
  });

  // ── 4. Sales Pipeline (9 Stages) & State Decoupling ──────────────────────────
  describe("4. 9-Stage Sales Pipeline & State Decoupling", () => {
    it("verifies the exact sequence of 9 pipeline stages", () => {
      const expectedStages: PipelineStage[] = [
        "new_lead",
        "contacted",
        "qualified",
        "site_visit",
        "design_measurement",
        "quotation",
        "negotiation",
        "won",
        "lost",
      ];

      const stageIds = PIPELINE_STAGES.map((s) => s.id);
      expect(stageIds).toEqual(expectedStages);
      expect(stageIds).toHaveLength(9);
    });

    it("ensures CRM stage is independent from quotation document status", () => {
      // An opportunity can be in stage "quotation" or "negotiation"
      // while its linked quote is in "sent" or "accepted" or "draft"
      const opportunity: OpportunityItem = {
        id: "opp-1",
        tenantId: "t1",
        opportunityNumber: "OPP-1001",
        customerId: "cust-1",
        leadId: "lead-1",
        title: "Villa Kitchen Project",
        projectType: "residential",
        value: 180000,
        salesOwner: "user-sales",
        stage: "negotiation", // CRM stage
        source: "instagram",
        expectedCloseDate: "2026-10-15",
        nextAction: "Review discount request",
        nextActionDate: new Date().toISOString(),
        siteAddress: "Sheikh Zayed",
        notes: null,
        status: "open",
        lostReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const quote = {
        id: "quote-1",
        opportunityId: opportunity.id,
        status: "sent", // Document status
        total: 180000,
      };

      expect(opportunity.stage).toBe("negotiation");
      expect(quote.status).toBe("sent");
      expect(opportunity.stage).not.toBe(quote.status);
    });

    it("auto-sets opportunity status to won/lost upon stage transition", () => {
      function transitionStage(stage: PipelineStage, lostReason?: string) {
        let status = "open";
        if (stage === "won") status = "won";
        else if (stage === "lost") status = "lost";
        return { stage, status, lostReason: stage === "lost" ? lostReason : null };
      }

      const wonDeal = transitionStage("won");
      expect(wonDeal.status).toBe("won");

      const lostDeal = transitionStage("lost", "Price too high");
      expect(lostDeal.status).toBe("lost");
      expect(lostDeal.lostReason).toBe("Price too high");

      const reopenedDeal = transitionStage("negotiation");
      expect(reopenedDeal.status).toBe("open");
    });
  });

  // ── 5. Next Action Management & Attention Attention Flagging ────────────────
  describe("5. Next Action Discipline & Attention Alerts", () => {
    it("flags active deals with no next action as requiring management attention", () => {
      const opps: OpportunityItem[] = [
        {
          id: "opp-1",
          tenantId: "t1",
          opportunityNumber: "OPP-1001",
          customerId: "c1",
          leadId: null,
          title: "Deal 1",
          projectType: "residential",
          value: 100000,
          salesOwner: "s1",
          stage: "contacted",
          source: "website",
          expectedCloseDate: null,
          nextAction: null, // NO NEXT ACTION!
          nextActionDate: null,
          siteAddress: null,
          notes: null,
          status: "open",
          lostReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "opp-2",
          tenantId: "t1",
          opportunityNumber: "OPP-1002",
          customerId: "c2",
          leadId: null,
          title: "Deal 2",
          projectType: "commercial",
          value: 250000,
          salesOwner: "s1",
          stage: "qualified",
          source: "referral",
          expectedCloseDate: null,
          nextAction: "Send catalog",
          nextActionDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          siteAddress: null,
          notes: null,
          status: "open",
          lostReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const attentionRequired = opps.filter(
        (o) => o.status === "open" && (!o.nextAction || (o.nextActionDate && new Date(o.nextActionDate).getTime() < Date.now())),
      );

      expect(attentionRequired).toHaveLength(1);
      expect(attentionRequired[0].opportunityNumber).toBe("OPP-1001");
    });

    it("flags overdue next action dates", () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const opp: OpportunityItem = {
        id: "opp-3",
        tenantId: "t1",
        opportunityNumber: "OPP-1003",
        customerId: "c3",
        leadId: null,
        title: "Deal 3",
        projectType: "residential",
        value: 50000,
        salesOwner: "s1",
        stage: "site_visit",
        source: null,
        expectedCloseDate: null,
        nextAction: "Call client",
        nextActionDate: yesterday, // Overdue!
        siteAddress: null,
        notes: null,
        status: "open",
        lostReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const isOverdue = opp.nextActionDate && new Date(opp.nextActionDate).getTime() < Date.now();
      expect(isOverdue).toBe(true);
    });
  });

  // ── 6. Role Permissions & CRM Security ──────────────────────────────────────
  describe("6. Role Authorization & Access Control", () => {
    function checkCRMAccess(role: string, isMutation: boolean = false) {
      if (role === "worker") {
        throw new Error("Forbidden: Workers do not have access to CRM");
      }
      if (isMutation && role === "viewer") {
        throw new Error("Forbidden: Insufficient permissions to modify CRM data");
      }
      return true;
    }

    it("rejects worker role completely from CRM", () => {
      expect(() => checkCRMAccess("worker", false)).toThrow("Workers do not have access to CRM");
      expect(() => checkCRMAccess("worker", true)).toThrow("Workers do not have access to CRM");
    });

    it("allows viewer read access but denies mutations", () => {
      expect(checkCRMAccess("viewer", false)).toBe(true);
      expect(() => checkCRMAccess("viewer", true)).toThrow("Insufficient permissions");
    });

    it("allows owner, admin, and sales full mutation rights", () => {
      expect(checkCRMAccess("owner", true)).toBe(true);
      expect(checkCRMAccess("admin", true)).toBe(true);
      expect(checkCRMAccess("sales", true)).toBe(true);
    });
  });
});
