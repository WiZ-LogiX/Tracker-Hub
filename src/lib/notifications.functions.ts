import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import { notificationLog, appUsers } from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import type { TenantContext } from "@/lib/tenant-context";
import { log } from "@/lib/log";
import { deliverToN8n, type NotifyPayload } from "@/lib/whatsapp-share.functions";
import { getStageLabelAr } from "@/lib/stages";
import { templateRender } from "@/lib/template-render";

const Input = z.object({
  event: z.enum(["quote_created", "quote_sent", "order_opened", "stage_changed", "delivery_scheduled", "delivered"]),
  entityType: z.enum(["quote", "order", "invoice"]),
  entityId: z.string().uuid(),
  extra: z.record(z.string(), z.string()).optional(),
  language: z.enum(["en", "fr", "ar"]).optional(),
});

const TestInput = z.object({
  phone: z.string().trim().min(4).max(32),
  message: z.string().trim().min(1).max(1000),
});

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => TestInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin", "sales"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    const payload: NotifyPayload = {
      event: "test",
      reference: "TEST",
      channels: ["whatsapp"],
      to: { phone: data.phone },
      message: data.message,
      locale: "en",
      entity: { type: "test", id: "" },
    };

    return deliverToN8n(ctx, payload);
  });

async function loadEntity(entityType: string, entityId: string, tenantId: string, client: any) {
  if (entityType === "quote") {
    const { data } = await client
      .from("quotes")
      .select("id, quote_number, total, customer_id, customers(name, phone, email), tenant_id")
      .eq("id", entityId)
      .maybeSingle();
    if (!data || (data as any).tenant_id !== tenantId) return null;
    return {
      reference: (data as any).quote_number,
      customer: (data as any).customers as any,
      data: { total: String((data as any).total) },
    };
  }
  if (entityType === "order") {
    const { data } = await client
      .from("orders")
      .select(
        "id, order_number, current_stage, expected_delivery, customer_id, customers(name, phone, email), tenant_id",
      )
      .eq("id", entityId)
      .maybeSingle();
    if (!data || (data as any).tenant_id !== tenantId) return null;
    return {
      reference: (data as any).order_number,
      customer: (data as any).customers as any,
      data: {
        stage: getStageLabelAr(String((data as any).current_stage)),
        date: (data as any).expected_delivery
          ? new Date((data as any).expected_delivery).toLocaleDateString()
          : "",
      },
    };
  }
  if (entityType === "invoice") {
    const { data } = await client
      .from("invoices")
      .select("id, invoice_number, total, customer_id, customers(name, phone, email), tenant_id")
      .eq("id", entityId)
      .maybeSingle();
    if (!data || (data as any).tenant_id !== tenantId) return null;
    return {
      reference: (data as any).invoice_number,
      customer: (data as any).customers as any,
      data: { total: String((data as any).total) },
    };
  }
  return null;
}

export const sendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin", "sales"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    const client = (context as any).supabase;
    const entity = await loadEntity(data.entityType, data.entityId, ctx.tenantId, client);
    if (!entity || !entity.customer) {
      return { status: "skipped", reason: "entity_or_customer_missing" };
    }
    const language = data.language ?? "ar";
    const channel = "whatsapp";

    // Load template (fallback to en)
    let { data: tpl } = await client
      .from("notification_templates")
      .select("subject, body")
      .eq("event", data.event)
      .eq("channel", channel)
      .eq("language", language)
      .eq("tenant_id", ctx.tenantId)
      .eq("active", true)
      .maybeSingle();
    if (!tpl) {
      const { data: fallback } = await client
        .from("notification_templates")
        .select("subject, body")
        .eq("event", data.event)
        .eq("channel", channel)
        .eq("language", "en")
        .eq("tenant_id", ctx.tenantId)
        .eq("active", true)
        .maybeSingle();
      tpl = fallback;
    }
    if (!tpl) return { status: "skipped", reason: "no_template" };

    const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
    const link = siteUrl
      ? `${siteUrl}/track?ref=${encodeURIComponent(entity.reference)}`
      : `/track?ref=${encodeURIComponent(entity.reference)}`;
    const vars: Record<string, string> = {
      customer_name: entity.customer.name ?? "",
      reference: entity.reference,
      link,
    };
    for (const [k, v] of Object.entries(entity.data)) if (v != null) vars[k] = String(v);
    if (data.extra) {
      for (const [k, v] of Object.entries(data.extra)) vars[`extra.${k}`] = v;
      if (data.extra.stage) vars["stage"] = getStageLabelAr(data.extra.stage);
    }
    const subject = templateRender((tpl as any).subject ?? "", vars);
    const body = templateRender((tpl as any).body, vars);

    const payload: NotifyPayload = {
      event: data.event,
      reference: entity.reference,
      channels: [channel],
      to: { phone: entity.customer.phone, email: entity.customer.email },
      subject,
      message: body,
      link,
      locale: language,
      entity: { type: data.entityType, id: data.entityId },
    };

    return deliverToN8n(ctx, payload);
  });

const ReplayInput = z.object({
  dlqId: z.string().uuid(),
});

export const replayFromDLQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ReplayInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    // Fetch DLQ entry
    const { data: dlqEntry, error } = await (context as any).supabase
      .from("notification_dlq")
      .select("*")
      .eq("id", data.dlqId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (error || !dlqEntry) {
      throw new Error("DLQ entry not found or access denied");
    }

    if ((dlqEntry as any).replayedAt) {
      return { status: "skipped", reason: "already_replayed" };
    }

    const payload: NotifyPayload = (dlqEntry as any).payload;

    // Replay without re-inserting into DLQ on failure
    const result = await deliverToN8n(ctx, payload, { dlqOnFail: false });

    // On success, mark as replayed
    if (result.status === "sent") {
      await (context as any).supabase
        .from("notification_dlq")
        .update({ replayedAt: new Date().toISOString() })
        .eq("id", data.dlqId);

      log.info("DLQ replay success", { fn: "replayFromDLQ", dlqId: data.dlqId, http: result.http });
    }

    return result;
  });

/* ───────────────────────── Template editor API ────────────────────────── */

const ALLOWED_EVENTS = [
  "quote_created",
  "quote_sent",
  "order_opened",
  "stage_changed",
  "delivery_scheduled",
  "delivered",
] as const;
const ALLOWED_CHANNELS = ["whatsapp", "email", "sms"] as const;
const ALLOWED_LANGUAGES = ["ar", "en", "fr"] as const;

export type NotificationEvent = (typeof ALLOWED_EVENTS)[number];
export type NotificationChannel = (typeof ALLOWED_CHANNELS)[number];
export type NotificationLanguage = (typeof ALLOWED_LANGUAGES)[number];

const ListTemplatesInput = z.object({
  channel: z.enum(ALLOWED_CHANNELS).optional(),
  language: z.enum(ALLOWED_LANGUAGES).optional(),
});

/**
 * Shape used by the Notifications admin screen. One row per
 * (event, channel, language, tenant) tuple.
 */
export interface NotificationTemplateRow {
  id: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  language: NotificationLanguage;
  subject: string | null;
  body: string;
  active: boolean;
  tenantId: string;
  createdAt: string;
}

/**
 * List every notification template owned by the current tenant.
 * Optionally filter by channel + language. Returned in `created_at desc`
 * order so recently-edited templates surface first.
 */
export const listNotificationTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ListTemplatesInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    let q = (context as any).supabase
      .from("notification_templates")
      .select("id, event, channel, language, subject, body, active, tenant_id, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.language) q = q.eq("language", data.language);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      items: (rows ?? []).map((r: any): NotificationTemplateRow => ({
        id: r.id,
        event: r.event,
        channel: r.channel,
        language: r.language,
        subject: r.subject ?? null,
        body: r.body,
        active: !!r.active,
        tenantId: r.tenant_id,
        createdAt: r.created_at,
      })),
    };
  });

const UpsertTemplateInput = z.object({
  id: z.string().uuid().optional(),
  event: z.enum(ALLOWED_EVENTS),
  channel: z.enum(ALLOWED_CHANNELS),
  language: z.enum(ALLOWED_LANGUAGES),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(4000),
  active: z.boolean().optional(),
});

/**
 * Create or update a notification template. The (event, channel, language,
 * tenant) tuple is unique — passing `id` updates that row, omitting `id`
 * inserts. Returns the saved row.
 */
export const upsertNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpsertTemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    const payload = {
      tenant_id: ctx.tenantId,
      event: data.event,
      channel: data.channel,
      language: data.language,
      subject: data.subject?.trim() ? data.subject.trim() : null,
      body: data.body,
      active: data.active ?? true,
    };

    let row: any = null;
    let error: any = null;

    if (data.id) {
      const r = await (context as any).supabase
        .from("notification_templates")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId)
        .select("*")
        .maybeSingle();
      row = r.data;
      error = r.error;
    } else {
      const r = await (context as any).supabase
        .from("notification_templates")
        .insert(payload)
        .select("*")
        .maybeSingle();
      row = r.data;
      error = r.error;
    }
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template not saved");

    return {
      item: {
        id: row.id,
        event: row.event,
        channel: row.channel,
        language: row.language,
        subject: row.subject ?? null,
        body: row.body,
        active: !!row.active,
        tenantId: row.tenant_id,
        createdAt: row.created_at,
      } satisfies NotificationTemplateRow,
    };
  });

const DeleteTemplateInput = z.object({ id: z.string().uuid() });

/**
 * Delete a notification template. Tenant-scoped: refuses to touch rows
 * belonging to a different tenant even if a stolen id arrives.
 */
export const deleteNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DeleteTemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }
    const { data: row, error } = await (context as any).supabase
      .from("notification_templates")
      .select("id, tenant_id")
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template not found");

    const { error: delErr } = await (context as any).supabase
      .from("notification_templates")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (delErr) throw new Error(delErr.message);
    return { deleted: true };
  });

const PreviewTemplateInput = z.object({
  event: z.enum(ALLOWED_EVENTS),
  channel: z.enum(ALLOWED_CHANNELS),
  language: z.enum(ALLOWED_LANGUAGES),
  reference: z.string().trim().min(1).max(64),
  customer_name: z.string().trim().min(1).max(200),
  stage: z.string().trim().optional(),
  date: z.string().trim().optional(),
  total: z.string().trim().optional(),
  extra: z.record(z.string(), z.string()).optional(),
});

/**
 * Render a draft template with the same token-substitution rules used by
 * `sendNotification`. Lets the editor show "what n8n will actually emit"
 * without firing a real test message.
 */
export const previewNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => PreviewTemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (!["owner", "admin"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    let { data: tpl } = await (context as any).supabase
      .from("notification_templates")
      .select("subject, body")
      .eq("event", data.event)
      .eq("channel", data.channel)
      .eq("language", data.language)
      .eq("tenant_id", ctx.tenantId)
      .eq("active", true)
      .maybeSingle();
    if (!tpl) {
      const { data: fallback } = await (context as any).supabase
        .from("notification_templates")
        .select("subject, body")
        .eq("event", data.event)
        .eq("channel", data.channel)
        .eq("language", "en")
        .eq("tenant_id", ctx.tenantId)
        .eq("active", true)
        .maybeSingle();
      tpl = fallback;
    }

    const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
    const link = siteUrl
      ? `${siteUrl}/track?ref=${encodeURIComponent(data.reference)}`
      : `/track?ref=${encodeURIComponent(data.reference)}`;

    const vars: Record<string, string> = {
      customer_name: data.customer_name,
      reference: data.reference,
      link,
    };
    if (data.stage) vars["stage"] = data.stage;
    if (data.date) vars["date"] = data.date;
    if (data.total) vars["total"] = data.total;
    if (data.extra) {
      for (const [k, v] of Object.entries(data.extra)) vars[`extra.${k}`] = v;
      if (data.extra.stage) vars["stage"] = getStageLabelAr(data.extra.stage);
    }

    const subject = tpl?.subject ? templateRender((tpl as any).subject, vars) : "";
    const body = tpl?.body
      ? templateRender((tpl as any).body, vars)
      : "(no template yet for this event / channel / language)";

    return {
      found: !!tpl,
      subject,
      body,
      vars,
    };
  });

// ── In-App Notifications & Task Assignment Notifications ────────────────────

export interface InAppNotification {
  id: string;
  entityType: string;
  entityId: string | null;
  reference: string | null;
  event: string;
  channel: string;
  recipient: string | null;
  status: string;
  payload: {
    taskId?: string;
    taskCode?: string;
    title?: string;
    priority?: string;
    dueDate?: string | null;
    assignedBy?: string;
    assignedById?: string;
    deepLink?: string;
    [key: string]: any;
  };
  createdAt: string | Date;
}

const ListInAppNotificationsInput = z
  .object({
    unreadOnly: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(100).optional().default(20),
  })
  .optional()
  .default({});

const MarkReadInput = z.object({
  notificationId: z.string().uuid(),
});

/**
 * List in-app notifications for the currently authenticated employee.
 * Returns recent notifications along with the unread count.
 */
export const listInAppNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListInAppNotificationsInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId } = ctx;

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
        .limit(data.limit);

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
      if (err?.code === "42P01" || err?.message?.includes("relation \"notification_log\" does not exist")) {
        return { notifications: [], unreadCount: 0 };
      }
      throw err;
    }
  });

/**
 * Mark a single in-app notification as read.
 */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => MarkReadInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId } = ctx;

    try {
      await db
        .update(notificationLog)
        .set({ status: "read" })
        .where(
          and(
            eq(notificationLog.id, data.notificationId),
            eq(notificationLog.tenantId, tenantId),
            eq(notificationLog.recipient, userId),
          ),
        );

      return { success: true, notificationId: data.notificationId };
    } catch (err) {
      console.error("Failed to mark notification read", err);
      return { success: false };
    }
  });

/**
 * Mark all in-app notifications for current user as read.
 */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId } = ctx;

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
  });

/**
 * Helper to dispatch task assignment notifications to specific assignees.
 * Inserts structured records into notification_log with deep links.
 */
export async function sendTaskAssignmentNotifications(
  database: typeof db,
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

/**
 * General helper to dispatch task lifecycle notifications (assigned, reassigned, completed, reopened)
 * into notification_log with deep linking.
 */
export async function sendTaskLifecycleNotification(
  database: typeof db,
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
