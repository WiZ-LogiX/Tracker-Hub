import { db } from "@/db/client.server";
import { notificationLog, appUsers } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { InAppNotification } from "./notifications.functions";

/**
 * List in-app notifications for the currently authenticated employee.
 * Returns recent notifications along with the unread count.
 */
export async function listInAppNotificationsServer(
  data: { unreadOnly?: boolean; limit?: number },
  tenantId: string,
  userId: string,
): Promise<{ notifications: InAppNotification[]; unreadCount: number }> {
  const conditions = [
    eq(notificationLog.tenantId, tenantId),
    eq(notificationLog.recipient, userId),
    eq(notificationLog.channel, "in_app"),
  ];

  if (data.unreadOnly) {
    conditions.push(eq(notificationLog.status, "unread"));
  }

  try {
    // 1. Fetch recent notifications
    const rows = await db
      .select({
        id: notificationLog.id,
        entityType: notificationLog.entityType,
        entityId: notificationLog.entityId,
        reference: notificationLog.reference,
        event: notificationLog.event,
        channel: notificationLog.channel,
        recipient: notificationLog.recipient,
        status: notificationLog.status,
        payload: notificationLog.payload,
        createdAt: notificationLog.createdAt,
      })
      .from(notificationLog)
      .where(and(...conditions))
      .orderBy(desc(notificationLog.createdAt))
      .limit(data.limit ?? 20);

    // 2. Fetch unread count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.tenantId, tenantId),
          eq(notificationLog.recipient, userId),
          eq(notificationLog.channel, "in_app"),
          eq(notificationLog.status, "unread"),
        ),
      );

    return {
      notifications: rows as InAppNotification[],
      unreadCount: countResult?.count ?? 0,
    };
  } catch (err: any) {
    if (
      err?.code === "42P01" ||
      err?.message?.includes('relation "notification_log" does not exist')
    ) {
      return { notifications: [], unreadCount: 0 };
    }
    throw err;
  }
}

/**
 * Mark a single in-app notification as read.
 */
export async function markNotificationReadServer(
  notificationId: string,
  tenantId: string,
  userId: string,
): Promise<{ success: boolean; notificationId?: string }> {
  try {
    await db
      .update(notificationLog)
      .set({ status: "read" })
      .where(
        and(
          eq(notificationLog.id, notificationId),
          eq(notificationLog.tenantId, tenantId),
          eq(notificationLog.recipient, userId),
        ),
      );

    return { success: true, notificationId };
  } catch (err) {
    console.error("Failed to mark notification read", err);
    return { success: false };
  }
}

/**
 * Mark all in-app notifications for current user as read.
 */
export async function markAllNotificationsReadServer(
  tenantId: string,
  userId: string,
): Promise<{ success: boolean }> {
  try {
    await db
      .update(notificationLog)
      .set({ status: "read" })
      .where(
        and(
          eq(notificationLog.tenantId, tenantId),
          eq(notificationLog.recipient, userId),
          eq(notificationLog.channel, "in_app"),
          eq(notificationLog.status, "unread"),
        ),
      );

    return { success: true };
  } catch (err) {
    console.error("Failed to mark all notifications read", err);
    return { success: false };
  }
}

/**
 * General helper to dispatch task lifecycle notifications (assigned, reassigned, completed, reopened)
 * into notification_log with deep linking.
 */
export async function sendTaskLifecycleNotification(
  database: typeof db = db,
  opts: {
    tenantId: string;
    taskId: string;
    taskCode: string;
    title: string;
    priority: string;
    event: "task_assigned" | "task_reassigned" | "task_completed" | "task_reopened";
    recipientIds: string[];
    actorId: string;
    note?: string | null;
    dueDate?: string | Date | null;
  },
): Promise<void> {
  const uniqueRecipients = Array.from(new Set(opts.recipientIds.filter(Boolean)));
  if (uniqueRecipients.length === 0) {
    return;
  }

  try {
    // Lookup actor display name
    const [actorUser] = await database
      .select({ displayName: appUsers.displayName, username: appUsers.username })
      .from(appUsers)
      .where(eq(appUsers.id, opts.actorId))
      .limit(1);

    const actorName = actorUser?.displayName || actorUser?.username || "Manager";
    const dueDateIso = opts.dueDate ? new Date(opts.dueDate).toISOString() : null;
    const deepLink = `/admin/tasks?taskId=${opts.taskId}`;

    const valuesToInsert = uniqueRecipients.map((recipientId) => ({
      tenantId: opts.tenantId,
      entityType: "task",
      entityId: opts.taskId,
      reference: opts.taskCode,
      event: opts.event,
      channel: "in_app",
      recipient: recipientId,
      status: "unread",
      payload: {
        taskId: opts.taskId,
        taskCode: opts.taskCode,
        title: opts.title,
        priority: opts.priority,
        dueDate: dueDateIso,
        event: opts.event,
        note: opts.note || null,
        assignedBy: actorName,
        assignedById: opts.actorId,
        actorName,
        deepLink,
      },
      createdAt: new Date(),
    }));

    await database.insert(notificationLog).values(valuesToInsert);
  } catch (err) {
    console.error("Failed to dispatch task lifecycle notification", err);
  }
}

/**
 * Helper to dispatch task assignment notifications to specific assignees.
 * Inserts structured records into notification_log with deep links.
 */
export async function sendTaskAssignmentNotifications(
  database: typeof db = db,
  opts: {
    tenantId: string;
    taskId: string;
    taskCode: string;
    title: string;
    priority: string;
    dueDate?: string | Date | null;
    actorId: string;
    assigneeIds: string[];
    event?: "task_assigned" | "task_reassigned" | "task_completed" | "task_reopened";
  },
): Promise<void> {
  return sendTaskLifecycleNotification(database, {
    tenantId: opts.tenantId,
    taskId: opts.taskId,
    taskCode: opts.taskCode,
    title: opts.title,
    priority: opts.priority,
    dueDate: opts.dueDate,
    actorId: opts.actorId,
    recipientIds: opts.assigneeIds,
    event: opts.event || "task_assigned",
  });
}
