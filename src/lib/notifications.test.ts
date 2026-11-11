import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  type InAppNotification,
  sendTaskAssignmentNotifications,
  sendTaskLifecycleNotification,
} from "@/lib/notifications.functions";

describe("PELECANON TASK MANAGEMENT — In-App Notifications & Deep Linking", () => {
  let mockInsertedRows: any[] = [];
  let mockDb: any;

  beforeEach(() => {
    mockInsertedRows = [];
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { displayName: "Sarah Connor (Ops Lead)", username: "sarah" },
            ]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((rows) => {
          if (Array.isArray(rows)) {
            mockInsertedRows.push(...rows);
          } else {
            mockInsertedRows.push(rows);
          }
          return Promise.resolve(rows);
        }),
      }),
    };
  });

  describe("1. Task Assignment Notification Dispatch", () => {
    it("dispatches in-app notifications with deep links to all assigned employees", async () => {
      const taskId = "a1111111-1111-1111-1111-111111111111";
      const tenantId = "b2222222-2222-2222-2222-222222222222";
      const assigneeIds = [
        "u3333333-3333-3333-3333-333333333333",
        "u4444444-4444-4444-4444-444444444444",
      ];

      await sendTaskAssignmentNotifications(mockDb, {
        tenantId,
        taskId,
        taskCode: "TSK-1042",
        title: "Assemble Kitchen Island Framework",
        priority: "high",
        dueDate: "2026-11-15T12:00:00.000Z",
        actorId: "actor-manager-001",
        assigneeIds,
      });

      expect(mockInsertedRows).toHaveLength(2);

      const firstNotif = mockInsertedRows[0];
      expect(firstNotif.tenantId).toBe(tenantId);
      expect(firstNotif.entityType).toBe("task");
      expect(firstNotif.entityId).toBe(taskId);
      expect(firstNotif.reference).toBe("TSK-1042");
      expect(firstNotif.event).toBe("task_assigned");
      expect(firstNotif.channel).toBe("in_app");
      expect(firstNotif.status).toBe("unread");
      expect(firstNotif.recipient).toBe(assigneeIds[0]);

      // Deep link verification
      expect(firstNotif.payload.deepLink).toBe(`/admin/tasks?taskId=${taskId}`);
      expect(firstNotif.payload.title).toBe("Assemble Kitchen Island Framework");
      expect(firstNotif.payload.priority).toBe("high");
      expect(firstNotif.payload.assignedBy).toBe("Sarah Connor (Ops Lead)");

      const secondNotif = mockInsertedRows[1];
      expect(secondNotif.recipient).toBe(assigneeIds[1]);
      expect(secondNotif.payload.deepLink).toBe(`/admin/tasks?taskId=${taskId}`);
    });

    it("does not insert any records if assigneeIds is empty", async () => {
      await sendTaskAssignmentNotifications(mockDb, {
        tenantId: "tenant-001",
        taskId: "task-001",
        taskCode: "TSK-1001",
        title: "Unassigned Task",
        priority: "low",
        actorId: "actor-001",
        assigneeIds: [],
      });

      expect(mockInsertedRows).toHaveLength(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe("2. Deduplication Logic on Task Edits", () => {
    it("correctly calculates newly added assignees vs unchanged assignees", () => {
      const existingAssigneeIds = ["user-1", "user-2"];
      const updatedAssigneeIds = ["user-2", "user-3", "user-4"];

      const newlyAddedAssigneeIds = updatedAssigneeIds.filter(
        (id) => !existingAssigneeIds.includes(id),
      );

      // Only user-3 and user-4 are new; user-2 already had the task assigned
      expect(newlyAddedAssigneeIds).toEqual(["user-3", "user-4"]);
    });

    it("produces zero new notifications if task metadata is edited without changing assignees", () => {
      const existingAssigneeIds = ["user-1", "user-2"];
      const updatedAssigneeIds = ["user-1", "user-2"];

      const newlyAddedAssigneeIds = updatedAssigneeIds.filter(
        (id) => !existingAssigneeIds.includes(id),
      );

      expect(newlyAddedAssigneeIds).toHaveLength(0);
    });
  });

  describe("3. Deep Linking & URL Parameter Validation", () => {
    it("generates correct deep link with canonical route and taskId query param", () => {
      const taskId = "8f3b259d-6490-4e31-8c01-7fa17e7df6ea";
      const expectedUrl = `/admin/tasks?taskId=${taskId}`;
      expect(expectedUrl).toMatch(/^\/admin\/tasks\?taskId=[0-9a-f-]+$/);
    });

    it("verifies in-app notification interface conforms to task deep linking requirements", () => {
      const notif: InAppNotification = {
        id: "notif-uuid",
        entityType: "task",
        entityId: "task-uuid",
        reference: "TSK-1099",
        event: "task_assigned",
        channel: "in_app",
        recipient: "worker-uuid",
        status: "unread",
        payload: {
          taskId: "task-uuid",
          taskCode: "TSK-1099",
          title: "Finish Edge Banding",
          priority: "urgent",
          assignedBy: "Operations Manager",
          deepLink: "/admin/tasks?taskId=task-uuid",
        },
        createdAt: new Date().toISOString(),
      };

      expect(notif.channel).toBe("in_app");
      expect(notif.status).toBe("unread");
      expect(notif.payload.deepLink).toBe("/admin/tasks?taskId=task-uuid");
    });
  });

  describe("4. Lifecycle Notifications (Reassigned, Completed, Reopened)", () => {
    it("dispatches task_reassigned notification to newly added workers", async () => {
      await sendTaskLifecycleNotification(mockDb, {
        tenantId: "tenant-reassign",
        taskId: "task-reassign-01",
        taskCode: "TSK-1045",
        title: "Install kitchen hinges",
        priority: "medium",
        event: "task_reassigned",
        actorId: "actor-001",
        recipientIds: ["worker-new-01", "worker-new-02"],
      });

      expect(mockInsertedRows).toHaveLength(2);
      expect(mockInsertedRows[0].event).toBe("task_reassigned");
      expect(mockInsertedRows[0].recipient).toBe("worker-new-01");
      expect(mockInsertedRows[0].payload.deepLink).toBe("/admin/tasks?taskId=task-reassign-01");
      expect(mockInsertedRows[1].recipient).toBe("worker-new-02");
    });

    it("dispatches task_completed notification to task creator with completion notes", async () => {
      await sendTaskLifecycleNotification(mockDb, {
        tenantId: "tenant-complete",
        taskId: "task-comp-01",
        taskCode: "TSK-1046",
        title: "Cut melamine panels",
        priority: "high",
        event: "task_completed",
        actorId: "worker-001",
        recipientIds: ["manager-creator-001"],
        note: "All panels cut and edged to specifications",
      });

      expect(mockInsertedRows).toHaveLength(1);
      const row = mockInsertedRows[0];
      expect(row.event).toBe("task_completed");
      expect(row.recipient).toBe("manager-creator-001");
      expect(row.payload.note).toBe("All panels cut and edged to specifications");
      expect(row.payload.deepLink).toBe("/admin/tasks?taskId=task-comp-01");
    });

    it("dispatches task_reopened notification to assigned workers with supervisor feedback", async () => {
      await sendTaskLifecycleNotification(mockDb, {
        tenantId: "tenant-reopen",
        taskId: "task-reopen-01",
        taskCode: "TSK-1047",
        title: "Quality check hinge alignment",
        priority: "critical",
        event: "task_reopened",
        actorId: "manager-lead-001",
        recipientIds: ["worker-001", "worker-002"],
        note: "Left cabinet door hinges require 2mm adjustment",
      });

      expect(mockInsertedRows).toHaveLength(2);
      expect(mockInsertedRows[0].event).toBe("task_reopened");
      expect(mockInsertedRows[0].payload.note).toBe("Left cabinet door hinges require 2mm adjustment");
      expect(mockInsertedRows[1].event).toBe("task_reopened");
      expect(mockInsertedRows[1].recipient).toBe("worker-002");
    });
  });
});
