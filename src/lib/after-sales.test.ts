import { describe, it, expect } from "vitest";
import { parseWarrantyMonths } from "@/lib/after-sales-types";
import { calculateWarrantyStatus } from "@/lib/after-sales.pure";
import {
  isValidCaseTransition,
  isOpenCaseStatus,
  canPerformCaseAction,
  CASE_STATUS_TRANSITIONS,
  OPEN_CASE_STATUSES,
  CreateServiceCaseInput,
  UpdateServiceCaseStatusInput,
  AssignServiceCaseInput,
  CreateCaseTaskInput,
  CreateCaseRemakeInput,
  CreateRepeatOpportunityInput,
  type ServiceCaseType,
  type ServiceCasePriority,
  type ServiceCaseStatus,
} from "@/lib/after-sales-types";

describe("TASK 27 — PeleCanon After-Sales CRM Comprehensive Test Suite", () => {
  // ── 1. Status Lifecycle & Transition Rules ──────────────────────────────────
  describe("1. Case Status Workflow & Lifecycle Transitions", () => {
    it("defines the authoritative 7-stage case workflow", () => {
      const allStatuses: ServiceCaseStatus[] = [
        "new",
        "under_review",
        "assigned",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ];
      expect(Object.keys(CASE_STATUS_TRANSITIONS)).toHaveLength(7);
      for (const s of allStatuses) {
        expect(CASE_STATUS_TRANSITIONS[s]).toBeDefined();
      }
    });

    it("identifies open case statuses correctly", () => {
      expect(OPEN_CASE_STATUSES).toEqual([
        "new",
        "under_review",
        "assigned",
        "in_progress",
        "waiting_customer",
      ]);
      expect(isOpenCaseStatus("new")).toBe(true);
      expect(isOpenCaseStatus("under_review")).toBe(true);
      expect(isOpenCaseStatus("assigned")).toBe(true);
      expect(isOpenCaseStatus("in_progress")).toBe(true);
      expect(isOpenCaseStatus("waiting_customer")).toBe(true);
      expect(isOpenCaseStatus("resolved")).toBe(false);
      expect(isOpenCaseStatus("closed")).toBe(false);
    });

    it("allows valid transitions through the resolution workflow", () => {
      // Self-transitions
      expect(isValidCaseTransition("new", "new")).toBe(true);
      expect(isValidCaseTransition("in_progress", "in_progress")).toBe(true);

      // Forward workflow
      expect(isValidCaseTransition("new", "under_review")).toBe(true);
      expect(isValidCaseTransition("new", "assigned")).toBe(true);
      expect(isValidCaseTransition("under_review", "in_progress")).toBe(true);
      expect(isValidCaseTransition("in_progress", "waiting_customer")).toBe(true);
      expect(isValidCaseTransition("waiting_customer", "resolved")).toBe(true);
      expect(isValidCaseTransition("resolved", "closed")).toBe(true);

      // Reopening workflow
      expect(isValidCaseTransition("resolved", "in_progress")).toBe(true);
      expect(isValidCaseTransition("closed", "in_progress")).toBe(true);
    });

    it("disallows invalid skipping transitions", () => {
      // Cannot skip directly from new to resolved without review or progress
      expect(isValidCaseTransition("new", "resolved")).toBe(false);
      // Cannot transition from closed to under_review without reopening to in_progress first
      expect(isValidCaseTransition("closed", "under_review")).toBe(false);
      expect(isValidCaseTransition("closed", "resolved")).toBe(false);
    });
  });

  // ── 2. Authoritative RBAC & Permission Matrix ──────────────────────────────
  describe("2. Authoritative RBAC & Security Matrix", () => {
    it("grants owner and admin full access across all after-sales operations", () => {
      const actions = [
        "view",
        "create",
        "transition",
        "assign",
        "create_task",
        "create_remake",
        "create_opportunity",
      ] as const;

      for (const action of actions) {
        expect(canPerformCaseAction("owner", action)).toBe(true);
        expect(canPerformCaseAction("admin", action)).toBe(true);
      }
    });

    it("allows sales rep to manage customer cases, tasks, and repeat deals but denies assignment", () => {
      expect(canPerformCaseAction("sales", "view")).toBe(true);
      expect(canPerformCaseAction("sales", "create")).toBe(true);
      expect(canPerformCaseAction("sales", "transition")).toBe(true);
      expect(canPerformCaseAction("sales", "create_task")).toBe(true);
      expect(canPerformCaseAction("sales", "create_remake")).toBe(true);
      expect(canPerformCaseAction("sales", "create_opportunity")).toBe(true);

      // Sales cannot reassign cases across team members (manager responsibility)
      expect(canPerformCaseAction("sales", "assign")).toBe(false);
    });

    it("restricts worker and viewer to read-only access", () => {
      expect(canPerformCaseAction("worker", "view")).toBe(true);
      expect(canPerformCaseAction("worker", "create")).toBe(false);
      expect(canPerformCaseAction("worker", "transition")).toBe(false);
      expect(canPerformCaseAction("worker", "assign")).toBe(false);
      expect(canPerformCaseAction("worker", "create_task")).toBe(false);
      expect(canPerformCaseAction("worker", "create_remake")).toBe(false);
      expect(canPerformCaseAction("worker", "create_opportunity")).toBe(false);

      expect(canPerformCaseAction("viewer", "view")).toBe(true);
      expect(canPerformCaseAction("viewer", "create")).toBe(false);
    });

    it("rejects unauthorized, null, or undefined roles", () => {
      expect(canPerformCaseAction(null, "view")).toBe(false);
      expect(canPerformCaseAction(undefined, "view")).toBe(false);
      expect(canPerformCaseAction("anonymous", "view")).toBe(false);
    });
  });

  // ── 3. Strict Contractual Warranty Duration Parser ─────────────────────────
  describe("3. Strict Contractual Warranty Duration Parsing (parseWarrantyMonths)", () => {
    it("parses explicit English warranty phrases correctly", () => {
      expect(parseWarrantyMonths("Warranty: 12 months")).toBe(12);
      expect(parseWarrantyMonths("warranty: 24 months for kitchen cabinets")).toBe(24);
      expect(parseWarrantyMonths("Includes 6m warranty on hinges")).toBe(6);
      expect(parseWarrantyMonths("Contract warranty = 36 months")).toBe(36);
      expect(parseWarrantyMonths("12 months warranty included")).toBe(12);
      expect(parseWarrantyMonths("2 years warranty covering wooden panels")).toBe(24);
      expect(parseWarrantyMonths("warranty 1 year")).toBe(12);
      expect(parseWarrantyMonths("warranty: 5 years")).toBe(60);
    });

    it("parses explicit Arabic warranty phrases correctly", () => {
      expect(parseWarrantyMonths("ضمان: 24 شهر ضد عيوب الصناعة")).toBe(24);
      expect(parseWarrantyMonths("يشمل ضمان 12 شهرا على المفصلات")).toBe(12);
      expect(parseWarrantyMonths("ضمان: 12 شهراً")).toBe(12);
      expect(parseWarrantyMonths("ضمان 6 شهور")).toBe(6);
      expect(parseWarrantyMonths("ضمان 3 سنوات على أخشاب الزان")).toBe(36);
      expect(parseWarrantyMonths("ضمان 1 عام")).toBe(12);
      expect(parseWarrantyMonths("ضمان 2 سنين")).toBe(24);
      expect(parseWarrantyMonths("12 شهر ضمان شامل")).toBe(12);
      expect(parseWarrantyMonths("2 سنة ضمان")).toBe(24);
    });

    it("rejects stray years and unrelated text without guessing", () => {
      // Unrelated delivery / year text must NOT be misidentified as warranty duration
      expect(parseWarrantyMonths("تم استلام الطلب في سنة 2026")).toBeNull();
      expect(parseWarrantyMonths("Delivered in year 2026")).toBeNull();
      expect(parseWarrantyMonths("Client requested delivery by 2027-01-15")).toBeNull();
      expect(parseWarrantyMonths("Standard finish color code 2024")).toBeNull();
      expect(parseWarrantyMonths("General project notes with no warranty terms")).toBeNull();
      expect(parseWarrantyMonths("")).toBeNull();
      expect(parseWarrantyMonths(null)).toBeNull();
      expect(parseWarrantyMonths(undefined)).toBeNull();
    });

    it("rejects implausible warranty periods (> 30 years or <= 0)", () => {
      expect(parseWarrantyMonths("warranty: 0 months")).toBeNull();
      expect(parseWarrantyMonths("warranty: 50 years")).toBeNull(); // 600 months > 360 limit
    });
  });

  // ── 4. Authoritative Warranty Diagnostic (calculateWarrantyStatus) ─────────
  describe("4. Authoritative Warranty Diagnostic & Expiration Calculation", () => {
    it("correctly identifies an ACTIVE warranty based on handover date and duration", () => {
      // Handover 1 month ago with 24 months warranty
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const handoverDate = oneMonthAgo.toISOString().slice(0, 10);

      const status = calculateWarrantyStatus(
        {
          id: "ord-1",
          orderNumber: "ORD-101",
          notes: "warranty: 24 months on cabinets",
        },
        {
          id: "del-1",
          deliveryNumber: "DEL-101",
          status: "completed",
          handedOverAt: handoverDate,
        },
      );

      expect(status.isReliable).toBe(true);
      expect(status.isWarrantyActive).toBe(true);
      expect(status.warrantyPeriodMonths).toBe(24);
      expect(status.handoverDate).toBe(handoverDate);
      expect(status.warrantyStatusLabel).toContain("Active Warranty");
      expect(status.warrantyStatusLabelAr).toContain("ضمان ساري");
      expect(status.warrantyExpirationDate).toBeDefined();
    });

    it("correctly identifies an EXPIRED warranty based on historical handover date", () => {
      // Handover 24 months ago with 12 months warranty
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const handoverDate = twoYearsAgo.toISOString().slice(0, 10);

      const status = calculateWarrantyStatus(
        {
          id: "ord-2",
          orderNumber: "ORD-102",
          notes: "ضمان: 12 شهر من تاريخ التركيب",
        },
        {
          id: "del-2",
          deliveryNumber: "DEL-102",
          status: "completed",
          handedOverAt: handoverDate,
        },
      );

      expect(status.isReliable).toBe(true);
      expect(status.isWarrantyActive).toBe(false);
      expect(status.warrantyPeriodMonths).toBe(12);
      expect(status.warrantyStatusLabel).toContain("Expired Warranty");
      expect(status.warrantyStatusLabelAr).toContain("انتهت فترة الضمان");
    });

    it("strictly returns 'Warranty Period Unknown' when contractual duration is missing", () => {
      const status = calculateWarrantyStatus(
        {
          id: "ord-3",
          orderNumber: "ORD-103",
          notes: "Standard kitchen order, no explicit warranty registered",
        },
        {
          id: "del-3",
          deliveryNumber: "DEL-103",
          status: "completed",
          handedOverAt: "2026-01-15",
        },
      );

      // Must NOT guess or invent default period
      expect(status.isReliable).toBe(false);
      expect(status.isWarrantyActive).toBe(false);
      expect(status.warrantyPeriodMonths).toBeNull();
      expect(status.warrantyExpirationDate).toBeNull();
      expect(status.warrantyStatusLabel).toBe("Warranty Period Unknown");
      expect(status.warrantyStatusLabelAr).toBe("فترة الضمان غير محددة");
    });

    it("strictly returns 'Warranty Period Unknown' when handover date is missing", () => {
      const status = calculateWarrantyStatus(
        {
          id: "ord-4",
          orderNumber: "ORD-104",
          notes: "warranty: 24 months",
        },
        null, // No delivery handover record yet
      );

      expect(status.isReliable).toBe(false);
      expect(status.isWarrantyActive).toBe(false);
      expect(status.handoverDate).toBeNull();
      expect(status.warrantyStatusLabel).toBe("Warranty Period Unknown");
      expect(status.warrantyStatusLabelAr).toBe("فترة الضمان غير محددة");
    });

    it("prefers delivery handedOverAt over deliveredAt or contractDate", () => {
      const status = calculateWarrantyStatus(
        {
          id: "ord-5",
          orderNumber: "ORD-105",
          contractDate: "2025-01-01",
          deliveredAt: "2025-06-01",
          notes: "warranty: 12 months",
        },
        {
          id: "del-5",
          deliveryNumber: "DEL-105",
          status: "completed",
          deliveredAt: "2025-06-01",
          handedOverAt: "2025-06-15",
        },
      );

      expect(status.handoverDate).toBe("2025-06-15");
      expect(status.warrantyExpirationDate).toBe("2026-06-15");
    });

    it("falls back to order deliveredAt when delivery record has no handedOverAt", () => {
      const status = calculateWarrantyStatus(
        {
          id: "ord-6",
          orderNumber: "ORD-106",
          contractDate: "2025-01-01",
          deliveredAt: "2025-07-01",
          notes: "warranty: 6 months",
        },
        null,
      );

      expect(status.isReliable).toBe(true);
      expect(status.handoverDate).toBe("2025-07-01");
      expect(status.warrantyExpirationDate).toBe("2026-01-01");
    });
  });

  // ── 5. Operational Task & Remake Integration ───────────────────────────────
  describe("5. Operational Task & Workshop Remake Bridges", () => {
    it("validates operational task creation for a service case", () => {
      const validTaskInput = {
        caseId: "a0000000-0000-0000-0000-000000000001",
        title: "Inspect misaligned cabinet door",
        description: "Customer reported upper left cabinet door rubbing against frame",
        priority: "high" as const,
        dueDate: "2026-10-30",
      };

      const parsed = CreateCaseTaskInput.parse(validTaskInput);
      expect(parsed.caseId).toBe(validTaskInput.caseId);
      expect(parsed.title).toBe(validTaskInput.title);
      expect(parsed.priority).toBe("high");
    });

    it("rejects invalid task input with title too short", () => {
      expect(() => {
        CreateCaseTaskInput.parse({
          caseId: "a0000000-0000-0000-0000-000000000001",
          title: "ab", // Min length 3
        });
      }).toThrow();
    });

    it("validates workshop remake creation for physical re-manufacturing", () => {
      const validRemakeInput = {
        caseId: "a0000000-0000-0000-0000-000000000001",
        reason: "Replace warped MDF panel",
        defectDescription: "Panel warped beyond 4mm tolerance during humidity changes",
        severity: "critical" as const,
      };

      const parsed = CreateCaseRemakeInput.parse(validRemakeInput);
      expect(parsed.caseId).toBe(validRemakeInput.caseId);
      expect(parsed.reason).toBe(validRemakeInput.reason);
      expect(parsed.severity).toBe("critical");
    });
  });

  // ── 6. Repeat Business Opportunity Generation ─────────────────────────────
  describe("6. Repeat Business Opportunity Generation", () => {
    it("validates repeat business deal creation while preserving historical integrity", () => {
      const repeatInput = {
        customerId: "b0000000-0000-0000-0000-000000000001",
        title: "Villa Extension Dressing Room",
        projectType: "residential" as const,
        estimatedValue: 85000,
        source: "existing_customer",
        notes: "Client returned after successful kitchen delivery for new dressing room",
      };

      const parsed = CreateRepeatOpportunityInput.parse(repeatInput);
      expect(parsed.customerId).toBe(repeatInput.customerId);
      expect(parsed.title).toBe(repeatInput.title);
      expect(parsed.source).toBe("existing_customer");
      expect(parsed.estimatedValue).toBe(85000);
    });

    it("defaults repeat business source to existing_customer", () => {
      const minimalInput = {
        customerId: "b0000000-0000-0000-0000-000000000001",
        title: "Secondary Bathroom Vanity",
      };

      const parsed = CreateRepeatOpportunityInput.parse(minimalInput);
      expect(parsed.source).toBe("existing_customer");
      expect(parsed.projectType).toBe("residential");
    });
  });

  // ── 7. Input Validation & Zod Schemas ──────────────────────────────────────
  describe("7. Service Case Input Validation & Schemas", () => {
    it("validates case creation with optional inspection task generation", () => {
      const caseInput = {
        customerId: "c0000000-0000-0000-0000-000000000001",
        orderId: "d0000000-0000-0000-0000-000000000001",
        type: "complaint" as ServiceCaseType,
        priority: "high" as ServiceCasePriority,
        title: "Water seepage near kitchen sink base",
        description: "Moisture detected under base unit sink cutout",
        createInspectionTask: true,
        inspectionTaskTitle: "Inspect plumbing seal and sink base panel",
      };

      const parsed = CreateServiceCaseInput.parse(caseInput);
      expect(parsed.type).toBe("complaint");
      expect(parsed.priority).toBe("high");
      expect(parsed.createInspectionTask).toBe(true);
      expect(parsed.inspectionTaskTitle).toBe("Inspect plumbing seal and sink base panel");
    });

    it("validates status update with resolution notes", () => {
      const updateInput = {
        caseId: "a0000000-0000-0000-0000-000000000001",
        status: "resolved" as const,
        resolution: "Replaced sealant strip and adjusted hinge alignment. Customer signed off.",
      };

      const parsed = UpdateServiceCaseStatusInput.parse(updateInput);
      expect(parsed.status).toBe("resolved");
      expect(parsed.resolution).toContain("Customer signed off");
    });

    it("validates case assignment", () => {
      const assignInput = {
        caseId: "a0000000-0000-0000-0000-000000000001",
        assignedTo: "e0000000-0000-0000-0000-000000000001",
        dueDate: "2026-11-05",
      };

      const parsed = AssignServiceCaseInput.parse(assignInput);
      expect(parsed.assignedTo).toBe("e0000000-0000-0000-0000-000000000001");
      expect(parsed.dueDate).toBe("2026-11-05");
    });
  });
});
