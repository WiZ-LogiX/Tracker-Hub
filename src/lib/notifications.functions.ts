import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

async function loadEntity(entityType: string, entityId: string, tenantId: string) {
  if (entityType === "quote") {
    const { data } = await supabaseAdmin
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
    const { data } = await supabaseAdmin
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
    const { data } = await supabaseAdmin
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

    const entity = await loadEntity(data.entityType, data.entityId, ctx.tenantId);
    if (!entity || !entity.customer) {
      return { status: "skipped", reason: "entity_or_customer_missing" };
    }
    const language = data.language ?? "ar";
    const channel = "whatsapp";

    // Load template (fallback to en)
    let { data: tpl } = await supabaseAdmin
      .from("notification_templates")
      .select("subject, body")
      .eq("event", data.event)
      .eq("channel", channel)
      .eq("language", language)
      .eq("tenant_id", ctx.tenantId)
      .eq("active", true)
      .maybeSingle();
    if (!tpl) {
      const { data: fallback } = await supabaseAdmin
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
    const { data: dlqEntry, error } = await supabaseAdmin
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
      await supabaseAdmin
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

    let q = supabaseAdmin
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
      const r = await supabaseAdmin
        .from("notification_templates")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId)
        .select("*")
        .maybeSingle();
      row = r.data;
      error = r.error;
    } else {
      const r = await supabaseAdmin
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
    const { data: row, error } = await supabaseAdmin
      .from("notification_templates")
      .select("id, tenant_id")
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template not found");

    const { error: delErr } = await supabaseAdmin
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

    let { data: tpl } = await supabaseAdmin
      .from("notification_templates")
      .select("subject, body")
      .eq("event", data.event)
      .eq("channel", data.channel)
      .eq("language", data.language)
      .eq("tenant_id", ctx.tenantId)
      .eq("active", true)
      .maybeSingle();
    if (!tpl) {
      const { data: fallback } = await supabaseAdmin
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
