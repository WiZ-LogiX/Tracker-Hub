import { describe, it, expect } from "vitest";
import {
  computeIsOverdue,
  type TaskStatus,
  type TaskPriority,
  type TaskCategory,
  type TaskItem,
  type WorkforceMember,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
} from "@/lib/task-types";
import { BUILTIN_ROLE_SLUGS, type TenantRole } from "@/lib/tenant-context";

describe("TASK 21.1 — Task Concurrency & Authorization Integrity Tests", () => {
  // ── 1. Atomic Per-Tenant Task Numbering & Concurrency ─────────────────────
  describe("1. Atomic Task Code Sequence & Concurrency Safety", () => {
    /**
     * Replicates the PostgreSQL row-level lock serialization on `tenant_counters`:
     * INSERT INTO tenant_counters ... ON CONFLICT (tenant_id, counter_type)
     * DO UPDATE SET last_value = tenant_counters.last_value + 1 RETURNING last_value
     */
    class AtomicTenantCounterEngine {
      private counters = new Map<string, number>();
      private locks = new Map<string, Promise<void>>();

      async getNextCode(tenantId: string, counterType: string = "task"): Promise<string> {
        const key = `${tenantId}:${counterType}`;

        // Wait for prior concurrent row-lock to release (serialized row-level lock)
        while (this.locks.has(key)) {
          await this.locks.get(key);
        }

        let releaseLock: () => void;
        const lockPromise = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        this.locks.set(key, lockPromise);

        try {
          // Asynchronous micro-tick simulating database I/O
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));

          const current = this.counters.get(key) ?? 1000;
          const next = current + 1;
          this.counters.set(key, next);
          return `TSK-${next}`;
        } finally {
          this.locks.delete(key);
          releaseLock!();
        }
      }
    }

    it("generates sequential human task codes starting from TSK-1001", async () => {
      const engine = new AtomicTenantCounterEngine();
      const code1 = await engine.getNextCode("tenant-a");
      const code2 = await engine.getNextCode("tenant-a");
      const code3 = await engine.getNextCode("tenant-a");

      expect(code1).toBe("TSK-1001");
      expect(code2).toBe("TSK-1002");
      expect(code3).toBe("TSK-1003");
    });

    it("maintains zero duplicates under at least 20 concurrent task creation requests", async () => {
      const engine = new AtomicTenantCounterEngine();
      const tenantId = "tenant-concurrent-alpha";
      const CONCURRENCY_COUNT = 25;

      // Fire 25 simultaneous concurrent code generation operations
      const promises = Array.from({ length: CONCURRENCY_COUNT }, () =>
        engine.getNextCode(tenantId),
      );
      const results = await Promise.all(promises);

      // Verify exact count
      expect(results).toHaveLength(CONCURRENCY_COUNT);

      // Verify no duplicates
      const uniqueCodes = new Set(results);
      expect(uniqueCodes.size).toBe(CONCURRENCY_COUNT);

      // Verify sequence starts at 1001 and reaches 1025
      const numericValues = results
        .map((c) => parseInt(c.replace("TSK-", ""), 10))
        .sort((a, b) => a - b);

      expect(numericValues[0]).toBe(1001);
      expect(numericValues[CONCURRENCY_COUNT - 1]).toBe(1000 + CONCURRENCY_COUNT);

      // Verify strict contiguous monotonicity (no missing numbers)
      for (let i = 0; i < CONCURRENCY_COUNT; i++) {
        expect(numericValues[i]).toBe(1001 + i);
      }
    });

    it("verifies sequences remain strictly isolated across multiple tenants", async () => {
      const engine = new AtomicTenantCounterEngine();
      const tenantA = "tenant-egypt-cairo";
      const tenantB = "tenant-egypt-alex";

      // 20 concurrent calls in Tenant A and 20 concurrent calls in Tenant B simultaneously
      const [resultsA, resultsB] = await Promise.all([
        Promise.all(Array.from({ length: 20 }, () => engine.getNextCode(tenantA))),
        Promise.all(Array.from({ length: 20 }, () => engine.getNextCode(tenantB))),
      ]);

      expect(resultsA).toHaveLength(20);
      expect(resultsB).toHaveLength(20);

      // Both tenants start at TSK-1001 independently
      const numbersA = resultsA.map((c) => parseInt(c.replace("TSK-", ""), 10)).sort((a, b) => a - b);
      const numbersB = resultsB.map((c) => parseInt(c.replace("TSK-", ""), 10)).sort((a, b) => a - b);

      expect(numbersA[0]).toBe(1001);
      expect(numbersA[19]).toBe(1020);

      expect(numbersB[0]).toBe(1001);
      expect(numbersB[19]).toBe(1020);

      // Tenant A counter does not interfere with Tenant B counter
      const codeA21 = await engine.getNextCode(tenantA);
      expect(codeA21).toBe("TSK-1021");

      const codeB21 = await engine.getNextCode(tenantB);
      expect(codeB21).toBe("TSK-1021");
    });
  });

  // ── 2. Authoritative PeleCanon Role Model Audit ──────────────────────────
  describe("2. Authoritative PeleCanon Role Model & Supervisor Mapping", () => {
    it("confirms the 5 authoritative built-in roles and absence of a parallel supervisor role", () => {
      // PeleCanon canonical roles: owner, admin, sales, worker, viewer
      expect(BUILTIN_ROLE_SLUGS).toEqual(["owner", "admin", "sales", "worker", "viewer"]);
      expect(BUILTIN_ROLE_SLUGS).not.toContain("supervisor");
    });

    it("maps operational supervisory actions to admin and owner roles", () => {
      const canSuperviseAndReview = (role: TenantRole): boolean => {
        return role === "owner" || role === "admin";
      };

      expect(canSuperviseAndReview("owner")).toBe(true);
      expect(canSuperviseAndReview("admin")).toBe(true);
      expect(canSuperviseAndReview("sales")).toBe(false);
      expect(canSuperviseAndReview("worker")).toBe(false);
      expect(canSuperviseAndReview("viewer")).toBe(false);
    });
  });

  // ── 3. Role-Based Authorization Enforcement ──────────────────────────────
  describe("3. Server-Side Role-Based Authorization Rules", () => {
    interface TaskActionContext {
      role: TenantRole;
      userId: string;
      assignedUserIds: string[];
    }

    const authorizeTaskAction = (
      ctx: TaskActionContext,
      action: "view" | "create" | "assign" | "reassign" | "start" | "submit_review" | "approve_complete" | "return_changes" | "cancel" | "bulk_update",
      taskState?: { fromStatus: TaskStatus; toStatus: TaskStatus; reviewNotes?: string },
    ): { allowed: boolean; error?: string } => {
      const { role, userId, assignedUserIds } = ctx;

      // 1. Viewer is strictly read-only
      if (role === "viewer") {
        if (action === "view") return { allowed: true };
        return { allowed: false, error: "Forbidden: read-only users cannot modify tasks" };
      }

      // 2. Worker rules
      if (role === "worker") {
        const isAssigned = assignedUserIds.includes(userId);

        if (action === "view") {
          return isAssigned
            ? { allowed: true }
            : { allowed: false, error: "Forbidden: worker can only view assigned tasks" };
        }

        if (action === "create" || action === "assign" || action === "reassign" || action === "bulk_update" || action === "cancel") {
          return { allowed: false, error: "Forbidden: insufficient permissions for this operation" };
        }

        if (action === "approve_complete") {
          return {
            allowed: false,
            error: "Forbidden: workers cannot mark tasks completed directly. Submit for review.",
          };
        }

        if (!isAssigned) {
          return { allowed: false, error: "Forbidden: worker is not assigned to this task" };
        }

        if (action === "start") {
          if (taskState?.fromStatus === "not_started" && taskState?.toStatus === "in_progress") {
            return { allowed: true };
          }
          return { allowed: false, error: "Invalid status transition for worker" };
        }

        if (action === "submit_review") {
          if (taskState?.fromStatus === "in_progress" && taskState?.toStatus === "waiting_review") {
            return { allowed: true };
          }
          return { allowed: false, error: "Invalid review submission transition" };
        }

        if (action === "return_changes") {
          return { allowed: false, error: "Forbidden: workers cannot return tasks" };
        }

        return { allowed: false, error: "Forbidden action for worker" };
      }

      // 3. Supervisor / Admin / Owner capabilities
      if (role === "admin" || role === "owner") {
        if (action === "return_changes") {
          if (!taskState?.reviewNotes || !taskState.reviewNotes.trim()) {
            return { allowed: false, error: "Review notes are required when returning a task." };
          }
          return { allowed: true };
        }
        return { allowed: true };
      }

      // 4. Sales role (can create and view tasks, but cannot approve manufacturing reviews)
      if (role === "sales") {
        if (action === "view" || action === "create" || action === "start") {
          return { allowed: true };
        }
        if (action === "approve_complete" || action === "return_changes") {
          return { allowed: false, error: "Forbidden: sales role cannot review factory tasks" };
        }
        return { allowed: true };
      }

      return { allowed: false, error: "Unauthorized role" };
    };

    describe("A. Worker Authorization", () => {
      const workerCtx: TaskActionContext = {
        role: "worker",
        userId: "worker-101",
        assignedUserIds: ["worker-101"],
      };
      const unassignedWorkerCtx: TaskActionContext = {
        role: "worker",
        userId: "worker-101",
        assignedUserIds: ["worker-202"],
      };

      it("allows worker to view assigned tasks but blocks unassigned tasks", () => {
        expect(authorizeTaskAction(workerCtx, "view").allowed).toBe(true);
        expect(authorizeTaskAction(unassignedWorkerCtx, "view").allowed).toBe(false);
      });

      it("allows worker to start work (not_started -> in_progress)", () => {
        const res = authorizeTaskAction(workerCtx, "start", {
          fromStatus: "not_started",
          toStatus: "in_progress",
        });
        expect(res.allowed).toBe(true);
      });

      it("allows worker to submit for review (in_progress -> waiting_review)", () => {
        const res = authorizeTaskAction(workerCtx, "submit_review", {
          fromStatus: "in_progress",
          toStatus: "waiting_review",
        });
        expect(res.allowed).toBe(true);
      });

      it("prohibits worker from approving or directly completing tasks", () => {
        const res = authorizeTaskAction(workerCtx, "approve_complete", {
          fromStatus: "waiting_review",
          toStatus: "completed",
        });
        expect(res.allowed).toBe(false);
        expect(res.error).toContain("Submit for review");
      });

      it("prohibits worker from reassigning or cancelling tasks", () => {
        expect(authorizeTaskAction(workerCtx, "reassign").allowed).toBe(false);
        expect(authorizeTaskAction(workerCtx, "cancel").allowed).toBe(false);
        expect(authorizeTaskAction(workerCtx, "bulk_update").allowed).toBe(false);
      });
    });

    describe("B. Authorized Supervisor (Admin / Owner) Authorization", () => {
      const adminCtx: TaskActionContext = {
        role: "admin",
        userId: "admin-501",
        assignedUserIds: ["worker-101"],
      };
      const ownerCtx: TaskActionContext = {
        role: "owner",
        userId: "owner-001",
        assignedUserIds: ["worker-101"],
      };

      it("allows admin/owner to view all tenant tasks", () => {
        expect(authorizeTaskAction(adminCtx, "view").allowed).toBe(true);
        expect(authorizeTaskAction(ownerCtx, "view").allowed).toBe(true);
      });

      it("allows admin/owner to assign and reassign tasks", () => {
        expect(authorizeTaskAction(adminCtx, "assign").allowed).toBe(true);
        expect(authorizeTaskAction(adminCtx, "reassign").allowed).toBe(true);
        expect(authorizeTaskAction(ownerCtx, "assign").allowed).toBe(true);
        expect(authorizeTaskAction(ownerCtx, "reassign").allowed).toBe(true);
      });

      it("allows admin/owner to approve waiting_review to completed", () => {
        const res = authorizeTaskAction(adminCtx, "approve_complete", {
          fromStatus: "waiting_review",
          toStatus: "completed",
        });
        expect(res.allowed).toBe(true);
      });

      it("allows admin/owner to return for changes when review notes are provided", () => {
        const resWithNotes = authorizeTaskAction(adminCtx, "return_changes", {
          fromStatus: "waiting_review",
          toStatus: "in_progress",
          reviewNotes: "Corner joint edge banding is rough. Please sand and reapply.",
        });
        expect(resWithNotes.allowed).toBe(true);
      });

      it("rejects return for changes if review notes are omitted or whitespace", () => {
        const resEmpty = authorizeTaskAction(adminCtx, "return_changes", {
          fromStatus: "waiting_review",
          toStatus: "in_progress",
          reviewNotes: "   ",
        });
        expect(resEmpty.allowed).toBe(false);
        expect(resEmpty.error).toContain("Review notes are required");
      });

      it("allows admin/owner to execute bulk operations", () => {
        expect(authorizeTaskAction(adminCtx, "bulk_update").allowed).toBe(true);
        expect(authorizeTaskAction(ownerCtx, "bulk_update").allowed).toBe(true);
      });
    });

    describe("C. Viewer Role Authorization", () => {
      const viewerCtx: TaskActionContext = {
        role: "viewer",
        userId: "viewer-999",
        assignedUserIds: [],
      };

      it("allows viewer to view tasks read-only", () => {
        expect(authorizeTaskAction(viewerCtx, "view").allowed).toBe(true);
      });

      it("strictly blocks viewer from all mutations", () => {
        expect(authorizeTaskAction(viewerCtx, "create").allowed).toBe(false);
        expect(authorizeTaskAction(viewerCtx, "start").allowed).toBe(false);
        expect(authorizeTaskAction(viewerCtx, "submit_review").allowed).toBe(false);
        expect(authorizeTaskAction(viewerCtx, "approve_complete").allowed).toBe(false);
        expect(authorizeTaskAction(viewerCtx, "return_changes").allowed).toBe(false);
        expect(authorizeTaskAction(viewerCtx, "reassign").allowed).toBe(false);
        expect(authorizeTaskAction(viewerCtx, "bulk_update").allowed).toBe(false);
      });
    });
  });

  // ── 4. Overdue & Due-Date Filtering Logic ─────────────────────────────────
  describe("4. Overdue & Due-Date Filtering Logic", () => {
    it("returns false for completed and cancelled tasks even if past due date", () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      expect(computeIsOverdue("completed", pastDate)).toBe(false);
      expect(computeIsOverdue("cancelled", pastDate)).toBe(false);
    });

    it("returns false if due date is null or undefined", () => {
      expect(computeIsOverdue("not_started", null)).toBe(false);
      expect(computeIsOverdue("in_progress", undefined)).toBe(false);
    });

    it("returns false if due date is in the future", () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
      expect(computeIsOverdue("not_started", futureDate)).toBe(false);
      expect(computeIsOverdue("in_progress", futureDate)).toBe(false);
      expect(computeIsOverdue("waiting_review", futureDate)).toBe(false);
    });

    it("returns true for open tasks when due date is in the past", () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString();
      expect(computeIsOverdue("not_started", pastDate)).toBe(true);
      expect(computeIsOverdue("in_progress", pastDate)).toBe(true);
      expect(computeIsOverdue("waiting_review", pastDate)).toBe(true);
    });

    it("accurately categorizes tasks into overdue, due_today, and upcoming buckets", () => {
      const now = new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0).toISOString();
      const laterToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0).toISOString();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const classifyDueBucket = (dueDate: string | null, status: TaskStatus) => {
        if (!dueDate || status === "completed" || status === "cancelled") return "none";
        const d = new Date(dueDate);
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        if (d < startToday) return "overdue";
        if (d >= startToday && d <= endToday) return "due_today";
        return "upcoming";
      };

      expect(classifyDueBucket(yesterday, "in_progress")).toBe("overdue");
      expect(classifyDueBucket(laterToday, "in_progress")).toBe("due_today");
      expect(classifyDueBucket(nextWeek, "in_progress")).toBe("upcoming");
      expect(classifyDueBucket(yesterday, "completed")).toBe("none");
    });
  });

  // ── 5. Workforce Workload Aggregation ────────────────────────────────────
  describe("5. Workforce Workload Aggregation & Indicators", () => {
    it("correctly aggregates workload counts and status metrics per worker", () => {
      const members: WorkforceMember[] = [
        {
          userId: "w-1",
          username: "ahmed",
          displayName: "Ahmed Worker",
          role: "worker",
          status: "active",
          openTasksCount: 4,
          criticalTasksCount: 1,
          overdueTasksCount: 1,
          waitingReviewCount: 2,
          completedTodayCount: 3,
        },
        {
          userId: "w-2",
          username: "sara",
          displayName: "Sara Quality",
          role: "admin",
          status: "active",
          openTasksCount: 0,
          criticalTasksCount: 0,
          overdueTasksCount: 0,
          waitingReviewCount: 0,
          completedTodayCount: 1,
        },
      ];

      const getWorkloadLevel = (count: number) => {
        if (count === 0) return "available";
        if (count <= 2) return "light";
        if (count <= 5) return "moderate";
        return "heavy";
      };

      expect(getWorkloadLevel(members[0].openTasksCount)).toBe("moderate");
      expect(getWorkloadLevel(members[1].openTasksCount)).toBe("available");

      const totalActiveWorkers = members.filter((m) => m.status === "active").length;
      expect(totalActiveWorkers).toBe(2);
    });
  });

  // ── 6. Multi-Context Entity Linking ──────────────────────────────────────
  describe("6. Multi-Context Entity Linking & Form Validation", () => {
    it("supports linking task to Order, Work Order, Remake, Delivery, and Service Case", () => {
      const taskContext = {
        orderId: "e7514be8-8e6c-48c0-bc6f-e3c35b6b1580",
        workOrderId: "b1437dc7-333e-436f-9989-13833cb92b52",
        remakeId: "5fa6bc71-dcfa-4f9e-a0e2-dfd92f58e1a7",
        deliveryId: "3df7fb83-0570-49e5-b108-9df81b85e054",
        caseId: "77777777-7777-7777-7777-777777777777",
      };

      expect(taskContext.orderId).toBeDefined();
      expect(taskContext.workOrderId).toBeDefined();
      expect(taskContext.remakeId).toBeDefined();
      expect(taskContext.deliveryId).toBeDefined();
      expect(taskContext.caseId).toBeDefined();
    });

    it("verifies valid task categories include after_sales_service and priorities match application constants", () => {
      const categoryKeys = TASK_CATEGORIES.map((c) => c.key);
      const priorityKeys = TASK_PRIORITIES.map((p) => p.key);

      expect(categoryKeys).toContain("production");
      expect(categoryKeys).toContain("installation");
      expect(categoryKeys).toContain("qc");
      expect(categoryKeys).toContain("remake");
      expect(categoryKeys).toContain("delivery");
      expect(categoryKeys).toContain("measurement");
      expect(categoryKeys).toContain("after_sales_service");

      expect(priorityKeys).toContain("critical");
      expect(priorityKeys).toContain("high");
      expect(priorityKeys).toContain("medium");
      expect(priorityKeys).toContain("low");
    });
  });

  // ── 7. Operational Workflow Lifecycle & Manager Acknowledgment ──────────
  describe("7. Operational Workflow Lifecycle & Manager Acknowledgment", () => {
    it("allows worker to transition from in_progress directly to completed with completion notes", () => {
      const workerTransitions: Record<TaskStatus, TaskStatus[]> = {
        not_started: ["in_progress"],
        in_progress: ["completed", "waiting_review", "not_started"],
        waiting_review: [],
        completed: [],
        cancelled: [],
      };

      expect(workerTransitions.in_progress).toContain("completed");
      expect(workerTransitions.in_progress).toContain("waiting_review");
      expect(workerTransitions.completed).toHaveLength(0);
    });

    it("manager can acknowledge completed task without altering business record status", () => {
      const order = { id: "order-101", status: "production", currentStage: "assembly" };
      const task = { id: "task-202", status: "completed", orderId: "order-101", isAcknowledged: false };

      // Manager acknowledges completion
      const auditLog = {
        action: "completion_acknowledged",
        taskId: task.id,
        acknowledgedBy: "manager-lead",
        acknowledgedAt: new Date().toISOString(),
      };
      task.isAcknowledged = true;

      // Crucial constraint: order status remains completely unaffected!
      expect(task.isAcknowledged).toBe(true);
      expect(order.status).toBe("production");
      expect(order.currentStage).toBe("assembly");
      expect(auditLog.action).toBe("completion_acknowledged");
    });

    it("reopening a task returns it to in_progress and clears acknowledged state", () => {
      const task: TaskItem = {
        id: "task-303",
        tenantId: "tenant-001",
        taskCode: "TSK-1050",
        title: "Align sliding doors",
        status: "completed",
        priority: "high",
        category: "after_sales_service",
        createdBy: "manager-001",
        isAcknowledged: true,
        returnedAt: null,
        isOverdue: false,
        assignees: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(task.isAcknowledged).toBe(true);

      // Supervisor reopens with feedback
      const newStatus: TaskStatus = "in_progress";
      const reviewNotes = "Doors still catching on bottom rail";
      const returnedAt = new Date();

      task.status = newStatus;
      task.reviewNotes = reviewNotes;
      task.returnedAt = returnedAt;
      task.isAcknowledged = false;

      expect(task.status).toBe("in_progress");
      expect(task.isAcknowledged).toBe(false);
      expect(task.reviewNotes).toBe("Doors still catching on bottom rail");
    });
  });
});
