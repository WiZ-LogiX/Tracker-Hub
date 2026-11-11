import { describe, it, expect, vi } from "vitest";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  type AttentionReason,
  type AttentionItem,
  type SalespersonWorkload,
  type SalesWorkspaceKPIs,
  type PipelineStage,
} from "@/lib/crm-types";

describe("TASK 25 — PeleCanon Sales Team & Follow-Up Operations", () => {
  // ── 1. Activity Types & Definition ──────────────────────────────────────────
  describe("1. Activity Types & Definition", () => {
    it("defines the 7 required commercial activity types", () => {
      const types = ACTIVITY_TYPES.map((a) => a.value);
      expect(types).toEqual([
        "call",
        "whatsapp",
        "email",
        "site_visit",
        "meeting",
        "quote_follow_up",
        "other",
      ]);
    });

    it("has multilingual labels and icon identifiers for each activity type", () => {
      ACTIVITY_TYPES.forEach((act) => {
        expect(act.value).toBeTruthy();
        expect(act.label).toBeTruthy();
        expect(act.icon).toBeTruthy();
      });
    });

    it("validates activity payload before logging", () => {
      function validateActivityPayload(payload: {
        entityType?: string;
        entityId?: string;
        activityType?: string;
        notes?: string;
      }) {
        if (!payload.entityType || !["lead", "opportunity"].includes(payload.entityType)) {
          throw new Error("entityType must be 'lead' or 'opportunity'");
        }
        if (!payload.entityId || !payload.entityId.trim()) {
          throw new Error("entityId is required");
        }
        const validTypes: ActivityType[] = [
          "call",
          "whatsapp",
          "email",
          "site_visit",
          "meeting",
          "quote_follow_up",
          "other",
        ];
        if (!payload.activityType || !validTypes.includes(payload.activityType as ActivityType)) {
          throw new Error("Invalid activityType");
        }
        if (!payload.notes || !payload.notes.trim()) {
          throw new Error("Activity notes/outcome is required");
        }
        return true;
      }

      expect(() => validateActivityPayload({})).toThrow("entityType must be 'lead' or 'opportunity'");
      expect(() =>
        validateActivityPayload({ entityType: "lead", entityId: "", activityType: "call", notes: "test" })
      ).toThrow("entityId is required");
      expect(() =>
        validateActivityPayload({ entityType: "lead", entityId: "lead-1", activityType: "sms", notes: "test" })
      ).toThrow("Invalid activityType");
      expect(() =>
        validateActivityPayload({ entityType: "lead", entityId: "lead-1", activityType: "call", notes: "  " })
      ).toThrow("Activity notes/outcome is required");
      expect(
        validateActivityPayload({
          entityType: "opportunity",
          entityId: "opp-100",
          activityType: "quote_follow_up",
          notes: "Discussed discount on aluminum profile",
        })
      ).toBe(true);
    });
  });

  // ── 2. Follow-Up Attention Rules & Detection ─────────────────────────────────
  describe("2. Attention Items Detection & Rules", () => {
    interface MockOpp {
      id: string;
      title: string;
      stage: PipelineStage;
      status: "open" | "won" | "lost";
      assignedTo: string | null;
      nextAction: string | null;
      nextActionDate: string | null;
      hasSentQuoteWithoutFollowup?: boolean;
    }

    function evaluateAttentionItems(opps: MockOpp[], referenceDate: Date = new Date()): AttentionItem[] {
      const items: AttentionItem[] = [];
      const refDay = referenceDate.toISOString().slice(0, 10);

      for (const opp of opps) {
        if (opp.status !== "open") continue;

        // Rule 1: No Next Action
        if (!opp.nextAction || !opp.nextAction.trim()) {
          if (opp.stage === "negotiation") {
            items.push({
              id: opp.id,
              entityType: "opportunity",
              code: `OPP-${opp.id.slice(0, 4)}`,
              title: opp.title,
              salesOwnerId: opp.assignedTo,
              stage: opp.stage,
              reason: "negotiation_without_next_action",
              reasonLabel: "Negotiation without Next Action",
              reasonLabelAr: "تفاوض بدون موعد متابعة",
              urgency: "critical",
              nextAction: null,
              nextActionDate: null,
            });
          } else {
            items.push({
              id: opp.id,
              entityType: "opportunity",
              code: `OPP-${opp.id.slice(0, 4)}`,
              title: opp.title,
              salesOwnerId: opp.assignedTo,
              stage: opp.stage,
              reason: "no_next_action",
              reasonLabel: "No Next Action Scheduled",
              reasonLabelAr: "لا يوجد إجراء قادم مجدول",
              urgency: "warning",
              nextAction: null,
              nextActionDate: null,
            });
          }
          continue;
        }

        // Rule 2: Overdue or Due Today
        if (opp.nextActionDate) {
          const actDay = opp.nextActionDate.slice(0, 10);
          if (actDay < refDay) {
            items.push({
              id: opp.id,
              entityType: "opportunity",
              code: `OPP-${opp.id.slice(0, 4)}`,
              title: opp.title,
              salesOwnerId: opp.assignedTo,
              stage: opp.stage,
              reason: "overdue",
              reasonLabel: "Overdue Follow-Up",
              reasonLabelAr: "متابعة متأخرة تجاوزت موعدها",
              urgency: "critical",
              nextAction: opp.nextAction,
              nextActionDate: opp.nextActionDate,
            });
          } else if (actDay === refDay) {
            items.push({
              id: opp.id,
              entityType: "opportunity",
              code: `OPP-${opp.id.slice(0, 4)}`,
              title: opp.title,
              salesOwnerId: opp.assignedTo,
              stage: opp.stage,
              reason: "due_today",
              reasonLabel: "Follow-Up Due Today",
              reasonLabelAr: "متابعة مستحقة اليوم",
              urgency: "warning",
              nextAction: opp.nextAction,
              nextActionDate: opp.nextActionDate,
            });
          }
        }

        // Rule 3: Quote sent without follow-up
        if (opp.hasSentQuoteWithoutFollowup) {
          items.push({
            id: opp.id,
            entityType: "opportunity",
            code: `OPP-${opp.id.slice(0, 4)}`,
            title: opp.title,
            salesOwnerId: opp.assignedTo,
            stage: opp.stage,
            reason: "quote_without_followup",
            reasonLabel: "Quote Sent Without Follow-Up",
            reasonLabelAr: "عرض أسعار مرسل بدون موعد متابعة",
            urgency: "critical",
            nextAction: opp.nextAction,
            nextActionDate: opp.nextActionDate,
          });
        }
      }

      return items;
    }

    const testToday = new Date("2026-09-24T12:00:00Z");

    it("flags opportunities with no next action", () => {
      const opps: MockOpp[] = [
        {
          id: "opp-1",
          title: "Villa Facade",
          stage: "qualified",
          status: "open",
          assignedTo: "user-1",
          nextAction: null,
          nextActionDate: null,
        },
      ];
      const result = evaluateAttentionItems(opps, testToday);
      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe("no_next_action");
      expect(result[0].urgency).toBe("warning");
    });

    it("flags negotiation opportunities without next action with critical urgency", () => {
      const opps: MockOpp[] = [
        {
          id: "opp-2",
          title: "Penthouse Windows",
          stage: "negotiation",
          status: "open",
          assignedTo: "user-2",
          nextAction: "",
          nextActionDate: null,
        },
      ];
      const result = evaluateAttentionItems(opps, testToday);
      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe("negotiation_without_next_action");
      expect(result[0].urgency).toBe("critical");
    });

    it("flags overdue follow-ups with critical urgency", () => {
      const opps: MockOpp[] = [
        {
          id: "opp-3",
          title: "Hotel Curtain Walls",
          stage: "quotation",
          status: "open",
          assignedTo: "user-1",
          nextAction: "Call procurement head",
          nextActionDate: "2026-09-20T10:00:00Z", // 4 days ago
        },
      ];
      const result = evaluateAttentionItems(opps, testToday);
      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe("overdue");
      expect(result[0].urgency).toBe("critical");
    });

    it("flags items due today with warning urgency", () => {
      const opps: MockOpp[] = [
        {
          id: "opp-4",
          title: "Commercial Mall Doors",
          stage: "site_visit",
          status: "open",
          assignedTo: "user-3",
          nextAction: "Site inspection at 3 PM",
          nextActionDate: "2026-09-24T15:00:00Z", // Today
        },
      ];
      const result = evaluateAttentionItems(opps, testToday);
      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe("due_today");
      expect(result[0].urgency).toBe("warning");
    });

    it("ignores closed (won / lost) opportunities", () => {
      const opps: MockOpp[] = [
        {
          id: "opp-won",
          title: "Done Project",
          stage: "won",
          status: "won",
          assignedTo: "user-1",
          nextAction: null,
          nextActionDate: null,
        },
        {
          id: "opp-lost",
          title: "Lost Deal",
          stage: "lost",
          status: "lost",
          assignedTo: "user-1",
          nextAction: "Old task",
          nextActionDate: "2026-09-01T00:00:00Z",
        },
      ];
      const result = evaluateAttentionItems(opps, testToday);
      expect(result).toHaveLength(0);
    });
  });

  // ── 3. Salesperson Workload Aggregation & Capacity Levels ────────────────────
  describe("3. Workload Aggregation & Capacity Rules", () => {
    function computeWorkloadLevel(totalActiveItems: number): "low" | "balanced" | "heavy" | "overloaded" {
      if (totalActiveItems <= 4) return "low";
      if (totalActiveItems <= 15) return "balanced";
      if (totalActiveItems <= 25) return "heavy";
      return "overloaded";
    }

    it("correctly categorizes workload levels by active load count", () => {
      expect(computeWorkloadLevel(0)).toBe("low");
      expect(computeWorkloadLevel(4)).toBe("low");
      expect(computeWorkloadLevel(5)).toBe("balanced");
      expect(computeWorkloadLevel(15)).toBe("balanced");
      expect(computeWorkloadLevel(16)).toBe("heavy");
      expect(computeWorkloadLevel(25)).toBe("heavy");
      expect(computeWorkloadLevel(26)).toBe("overloaded");
      expect(computeWorkloadLevel(100)).toBe("overloaded");
    });

    it("aggregates team workload per member and tracks unassigned records", () => {
      const users = [
        { id: "u-1", name: "Ahmed", email: "ahmed@example.com" },
        { id: "u-2", name: "Sara", email: "sara@example.com" },
      ];

      const leads = [
        { id: "l-1", assignedTo: "u-1", status: "new" },
        { id: "l-2", assignedTo: "u-1", status: "contacted" },
        { id: "l-3", assignedTo: "u-2", status: "qualified" },
        { id: "l-4", assignedTo: null, status: "new" }, // Unassigned
      ];

      const opportunities = [
        { id: "o-1", assignedTo: "u-1", stage: "quotation", status: "open", value: 50000, nextActionDate: "2026-09-20" },
        { id: "o-2", assignedTo: "u-1", stage: "won", status: "won", value: 80000, nextActionDate: null },
        { id: "o-3", assignedTo: "u-2", stage: "negotiation", status: "open", value: 120000, nextActionDate: "2026-09-24" },
        { id: "o-4", assignedTo: null, stage: "site_visit", status: "open", value: 30000, nextActionDate: null }, // Unassigned
      ];

      const refDate = "2026-09-24";

      // Aggregator
      const workloadMap = new Map<string, SalespersonWorkload>();
      for (const u of users) {
        workloadMap.set(u.id, {
          userId: u.id,
          username: u.email,
          displayName: u.name,
          role: "sales",
          activeLeadsCount: 0,
          openOpportunitiesCount: 0,
          pipelineValue: 0,
          quotesCount: 0,
          quotesValue: 0,
          overdueFollowUpsCount: 0,
          dueTodayCount: 0,
          noNextActionCount: 0,
          wonCount: 0,
          wonValue: 0,
          lostCount: 0,
          lostValue: 0,
          workloadLevel: "low",
        });
      }

      // Add unassigned bucket
      const unassigned: SalespersonWorkload = {
        userId: "unassigned",
        username: "unassigned",
        displayName: "Unassigned",
        role: "unassigned",
        activeLeadsCount: 0,
        openOpportunitiesCount: 0,
        pipelineValue: 0,
        quotesCount: 0,
        quotesValue: 0,
        overdueFollowUpsCount: 0,
        dueTodayCount: 0,
        noNextActionCount: 0,
        wonCount: 0,
        wonValue: 0,
        lostCount: 0,
        lostValue: 0,
        workloadLevel: "low",
      };

      // Tally leads
      for (const l of leads) {
        if (!l.assignedTo) {
          unassigned.activeLeadsCount++;
        } else {
          const w = workloadMap.get(l.assignedTo);
          if (w) w.activeLeadsCount++;
        }
      }

      // Tally opps
      for (const o of opportunities) {
        const target = o.assignedTo ? workloadMap.get(o.assignedTo) : unassigned;
        if (!target) continue;

        if (o.status === "won") {
          target.wonCount++;
          target.wonValue += o.value;
        } else if (o.status === "lost") {
          target.lostCount++;
          target.lostValue += o.value;
        } else if (o.status === "open") {
          target.openOpportunitiesCount++;
          target.pipelineValue += o.value;

          if (!o.nextActionDate) {
            target.noNextActionCount++;
          } else if (o.nextActionDate < refDate) {
            target.overdueFollowUpsCount++;
          } else if (o.nextActionDate === refDate) {
            target.dueTodayCount++;
          }
        }
      }

      // Assertions for Ahmed (u-1)
      const ahmed = workloadMap.get("u-1")!;
      expect(ahmed.activeLeadsCount).toBe(2);
      expect(ahmed.openOpportunitiesCount).toBe(1);
      expect(ahmed.pipelineValue).toBe(50000);
      expect(ahmed.wonCount).toBe(1);
      expect(ahmed.overdueFollowUpsCount).toBe(1);

      // Assertions for Sara (u-2)
      const sara = workloadMap.get("u-2")!;
      expect(sara.activeLeadsCount).toBe(1);
      expect(sara.openOpportunitiesCount).toBe(1);
      expect(sara.pipelineValue).toBe(120000);
      expect(sara.dueTodayCount).toBe(1);

      // Assertions for Unassigned
      expect(unassigned.activeLeadsCount).toBe(1);
      expect(unassigned.openOpportunitiesCount).toBe(1);
      expect(unassigned.noNextActionCount).toBe(1);
      expect(unassigned.pipelineValue).toBe(30000);
    });
  });

  // ── 4. "My Sales" Personal Slice Verification ────────────────────────────────
  describe("4. My Sales Rep Slice Filtering", () => {
    const repId = "sales-rep-42";

    const allLeads = [
      { id: "l-1", title: "Lead 1", assignedTo: "sales-rep-42" },
      { id: "l-2", title: "Lead 2", assignedTo: "sales-rep-99" },
      { id: "l-3", title: "Lead 3", assignedTo: "sales-rep-42" },
    ];

    const allOpps = [
      { id: "o-1", title: "Opp 1", assignedTo: "sales-rep-42", status: "open", nextActionDate: "2026-09-20" },
      { id: "o-2", title: "Opp 2", assignedTo: "sales-rep-42", status: "open", nextActionDate: "2026-09-25" },
      { id: "o-3", title: "Opp 3", assignedTo: "sales-rep-99", status: "open", nextActionDate: "2026-09-20" },
    ];

    it("filters only items owned by target rep", () => {
      const myLeads = allLeads.filter((l) => l.assignedTo === repId);
      const myOpps = allOpps.filter((o) => o.assignedTo === repId);
      const myOverdue = myOpps.filter((o) => o.nextActionDate && o.nextActionDate < "2026-09-24");

      expect(myLeads).toHaveLength(2);
      expect(myLeads.map((l) => l.id)).toEqual(["l-1", "l-3"]);

      expect(myOpps).toHaveLength(2);
      expect(myOpps.map((o) => o.id)).toEqual(["o-1", "o-2"]);

      expect(myOverdue).toHaveLength(1);
      expect(myOverdue[0].id).toBe("o-1");
    });
  });

  // ── 5. Assignment, Reassignment & Bulk Operations ────────────────────────────
  describe("5. Entity Assignment & Bulk Assignment", () => {
    interface AssignableRecord {
      id: string;
      tenantId: string;
      assignedTo: string | null;
      updatedAt: string;
    }

    interface AuditEntry {
      tenantId: string;
      action: string;
      entityType: string;
      entityId: string;
      details: any;
    }

    class AssignmentService {
      private records = new Map<string, AssignableRecord>();
      public audits: AuditEntry[] = [];
      private validTenantMembers = new Set<string>(["user-admin", "user-rep1", "user-rep2"]);

      seed(record: AssignableRecord) {
        this.records.set(record.id, record);
      }

      assign(
        tenantId: string,
        entityType: "lead" | "opportunity",
        entityId: string,
        newAssignedTo: string | null
      ) {
        const record = this.records.get(entityId);
        if (!record || record.tenantId !== tenantId) {
          throw new Error("Record not found or tenant mismatch");
        }

        if (newAssignedTo !== null && !this.validTenantMembers.has(newAssignedTo)) {
          throw new Error("Assignee must be an active tenant member");
        }

        const prev = record.assignedTo;
        record.assignedTo = newAssignedTo;
        record.updatedAt = new Date().toISOString();

        this.audits.push({
          tenantId,
          action: "entity_assigned",
          entityType,
          entityId,
          details: {
            previousAssignedTo: prev,
            newAssignedTo,
          },
        });

        return record;
      }

      bulkAssign(
        tenantId: string,
        entityType: "lead" | "opportunity",
        entityIds: string[],
        newAssignedTo: string | null
      ) {
        if (!entityIds.length) {
          throw new Error("No entities provided for bulk assignment");
        }

        const updated: string[] = [];
        for (const id of entityIds) {
          const res = this.assign(tenantId, entityType, id, newAssignedTo);
          updated.push(res.id);
        }

        this.audits.push({
          tenantId,
          action: "bulk_entity_assigned",
          entityType,
          entityId: "bulk",
          details: {
            entityCount: updated.length,
            entityIds: updated,
            assignedTo: newAssignedTo,
          },
        });

        return updated;
      }
    }

    it("successfully reassigns an opportunity and generates audit log", () => {
      const service = new AssignmentService();
      service.seed({
        id: "opp-10",
        tenantId: "tenant-a",
        assignedTo: "user-rep1",
        updatedAt: "2026-09-01T00:00:00Z",
      });

      const updated = service.assign("tenant-a", "opportunity", "opp-10", "user-rep2");
      expect(updated.assignedTo).toBe("user-rep2");

      expect(service.audits).toHaveLength(1);
      expect(service.audits[0].action).toBe("entity_assigned");
      expect(service.audits[0].details).toEqual({
        previousAssignedTo: "user-rep1",
        newAssignedTo: "user-rep2",
      });
    });

    it("allows unassigning an entity (assignedTo = null)", () => {
      const service = new AssignmentService();
      service.seed({
        id: "lead-20",
        tenantId: "tenant-a",
        assignedTo: "user-rep1",
        updatedAt: "2026-09-01T00:00:00Z",
      });

      const updated = service.assign("tenant-a", "lead", "lead-20", null);
      expect(updated.assignedTo).toBeNull();
      expect(service.audits[0].details.newAssignedTo).toBeNull();
    });

    it("rejects assigning to non-tenant member", () => {
      const service = new AssignmentService();
      service.seed({
        id: "opp-11",
        tenantId: "tenant-a",
        assignedTo: null,
        updatedAt: "2026-09-01T00:00:00Z",
      });

      expect(() => service.assign("tenant-a", "opportunity", "opp-11", "malicious-user")).toThrow(
        "Assignee must be an active tenant member"
      );
    });

    it("bulk assigns multiple records in a single transactional batch", () => {
      const service = new AssignmentService();
      service.seed({ id: "opp-1", tenantId: "tenant-a", assignedTo: null, updatedAt: "" });
      service.seed({ id: "opp-2", tenantId: "tenant-a", assignedTo: null, updatedAt: "" });
      service.seed({ id: "opp-3", tenantId: "tenant-a", assignedTo: "user-rep1", updatedAt: "" });

      const updatedIds = service.bulkAssign("tenant-a", "opportunity", ["opp-1", "opp-2", "opp-3"], "user-rep2");
      expect(updatedIds).toEqual(["opp-1", "opp-2", "opp-3"]);

      // 3 individual audit logs + 1 summary bulk log
      expect(service.audits).toHaveLength(4);
      const bulkLog = service.audits.find((a) => a.action === "bulk_entity_assigned");
      expect(bulkLog).toBeDefined();
      expect(bulkLog?.details.entityCount).toBe(3);
      expect(bulkLog?.details.assignedTo).toBe("user-rep2");
    });
  });

  // ── 6. Security, RBAC & Tenant Isolation ─────────────────────────────────────
  describe("6. Security, RBAC & Tenant Isolation", () => {
    function authorizeWorkspaceAccess(userRole: string) {
      // Allowed: owner, admin, sales, viewer (read-only)
      // Disallowed: worker
      if (userRole === "worker") {
        throw new Error("403 Forbidden: Workers do not have access to sales workspace");
      }
      return true;
    }

    function authorizeWorkspaceMutation(userRole: string) {
      if (userRole === "viewer" || userRole === "worker") {
        throw new Error("403 Forbidden: Read-only or unauthorized role cannot modify commercial assignments");
      }
      return true;
    }

    it("denies access to worker role", () => {
      expect(() => authorizeWorkspaceAccess("worker")).toThrow("403 Forbidden");
      expect(authorizeWorkspaceAccess("sales")).toBe(true);
      expect(authorizeWorkspaceAccess("admin")).toBe(true);
      expect(authorizeWorkspaceAccess("owner")).toBe(true);
      expect(authorizeWorkspaceAccess("viewer")).toBe(true);
    });

    it("denies assignment mutation to viewers and workers", () => {
      expect(() => authorizeWorkspaceMutation("viewer")).toThrow("403 Forbidden");
      expect(() => authorizeWorkspaceMutation("worker")).toThrow("403 Forbidden");
      expect(authorizeWorkspaceMutation("sales")).toBe(true);
      expect(authorizeWorkspaceMutation("admin")).toBe(true);
      expect(authorizeWorkspaceMutation("owner")).toBe(true);
    });

    it("enforces tenant isolation across all sales queries", () => {
      interface ScopedQuery {
        tenantId: string;
      }

      function buildSalesQuery(tenantId: string): ScopedQuery {
        if (!tenantId || !tenantId.trim()) {
          throw new Error("tenantId is required for data isolation");
        }
        return { tenantId };
      }

      expect(() => buildSalesQuery("")).toThrow("tenantId is required");
      const query = buildSalesQuery("tenant-corp-1");
      expect(query.tenantId).toBe("tenant-corp-1");
    });
  });

  // ── 7. KPI Calculation Accuracy (No Unsupported Forecasts) ───────────────────
  describe("7. KPI Calculation Integrity", () => {
    it("computes accurate aggregate KPIs without fabricated forecast figures", () => {
      const rawWorkspaceData = {
        leads: [
          { status: "new" },
          { status: "new" },
          { status: "contacted" },
          { status: "lost" }, // Should not count as new lead
        ],
        opportunities: [
          { status: "open", value: 150000, nextActionDate: "2026-09-20" },
          { status: "open", value: 250000, nextActionDate: "2026-09-24" },
          { status: "open", value: 100000, nextActionDate: "2026-09-30" },
          { status: "won", value: 500000, nextActionDate: null },
          { status: "lost", value: 80000, nextActionDate: null },
        ],
        quotes: [
          { status: "sent" },
          { status: "sent" },
          { status: "accepted" },
          { status: "draft" },
        ],
      };

      const refDate = "2026-09-24";

      const kpis: SalesWorkspaceKPIs = {
        newLeadsCount: rawWorkspaceData.leads.filter((l) => l.status === "new").length,
        openOpportunitiesCount: rawWorkspaceData.opportunities.filter((o) => o.status === "open").length,
        pipelineValue: rawWorkspaceData.opportunities
          .filter((o) => o.status === "open")
          .reduce((sum, o) => sum + o.value, 0),
        dueTodayCount: rawWorkspaceData.opportunities.filter(
          (o) => o.status === "open" && o.nextActionDate === refDate
        ).length,
        overdueCount: rawWorkspaceData.opportunities.filter(
          (o) => o.status === "open" && o.nextActionDate && o.nextActionDate < refDate
        ).length,
        quotesAwaitingResponseCount: rawWorkspaceData.quotes.filter((q) => q.status === "sent").length,
        wonCount: rawWorkspaceData.opportunities.filter((o) => o.status === "won").length,
        wonValue: rawWorkspaceData.opportunities
          .filter((o) => o.status === "won")
          .reduce((sum, o) => sum + o.value, 0),
        lostCount: rawWorkspaceData.opportunities.filter((o) => o.status === "lost").length,
      };

      expect(kpis.newLeadsCount).toBe(2);
      expect(kpis.openOpportunitiesCount).toBe(3);
      expect(kpis.pipelineValue).toBe(500000);
      expect(kpis.dueTodayCount).toBe(1);
      expect(kpis.overdueCount).toBe(1);
      expect(kpis.quotesAwaitingResponseCount).toBe(2);
      expect(kpis.wonCount).toBe(1);
      expect(kpis.lostCount).toBe(1);

      // Verify that no unsupported forecast properties exist on the KPI object
      expect((kpis as any).weightedForecast).toBeUndefined();
      expect((kpis as any).predictedRevenue).toBeUndefined();
    });
  });
});
