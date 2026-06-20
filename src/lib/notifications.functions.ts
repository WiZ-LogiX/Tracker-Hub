import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/tenant-context";

const Input = z.object({
  event: z.enum(["quote_sent", "order_opened", "stage_changed", "delivery_scheduled", "delivered"]),
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
    // Only allow owner, admin, sales to send test notifications
    if (!["owner", "admin", "sales"].includes(ctx.role)) {
      throw new Error("Forbidden: insufficient role");
    }

    const webhook = process.env.N8N_NOTIFY_WEBHOOK_URL;
    const payload = {
      event: "test",
      reference: "TEST",
      channels: ["whatsapp"],
      to: { phone: data.phone },
      message: data.message,
      locale: "en",
      entity: { type: "test", id: null },
    };
    if (!webhook) {
      await supabaseAdmin.from("notification_log").insert({
        entity_type: "test",
        entity_id: null,
        reference: "TEST",
        event: "test",
        channel: "whatsapp",
        recipient: data.phone,
        status: "skipped",
        payload: payload,
        tenant_id: ctx.tenantId, // Add tenant_id
        error: "N8N_NOTIFY_WEBHOOK_URL not configured",
      });
      return { status: "skipped", reason: "no_webhook" };
    }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.N8N_WEBHOOK_TOKEN) headers["X-Webhook-Token"] = process.env.N8N_WEBHOOK_TOKEN;
      const res = await fetch(webhook, { method: "POST", headers, body: JSON.stringify(payload) });
      const respText = await res.text();
      const status = res.ok ? "sent" : "failed";
      await supabaseAdmin.from("notification_log").insert({
        entity_type: "test",
        entity_id: null,
        reference: "TEST",
        event: "test",
        channel: "whatsapp",
        recipient: data.phone,
        status,
        payload: payload,
        tenant_id: ctx.tenantId, // Add tenant_id
        response: { status: res.status, body: respText.slice(0, 2000) },
        error: res.ok ? null : `HTTP ${res.status}`,
      });
      return { status, http: res.status };
    } catch (err: any) {
      await supabaseAdmin.from("notification_log").insert({
        entity_type: "test",
        entity_id: null,
        reference: "TEST",
        event: "test",
        channel: "whatsapp",
        recipient: data.phone,
        status: "failed",
        payload: payload as any,
        tenant_id: ctx.tenantId,
        error: String(err?.message ?? err),
      });
      return { status: "failed", error: String(err?.message ?? err) };
    }
  });

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

async function loadEntity(entityType: string, entityId: string, tenantId: string) {
  if (entityType === "quote") {
    const { data } = await supabaseAdmin
      .from("quotes")
      .select("id, quote_number, total, customer_id, customers(name, phone, email), tenant_id")
      .eq("id", entityId)
      .maybeSingle();
    if (!data || data.tenant_id !== tenantId) return null;
    return {
      reference: data.quote_number,
      customer: data.customers as any,
      data: { total: String(data.total) },
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
    if (!data || data.tenant_id !== tenantId) return null;
    return {
      reference: data.order_number,
      customer: data.customers as any,
      data: {
        stage: String(data.current_stage),
        date: data.expected_delivery ? new Date(data.expected_delivery).toLocaleDateString() : "",
      },
    };
  }
  if (entityType === "invoice") {
    const { data } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, total, customer_id, customers(name, phone, email), tenant_id")
      .eq("id", entityId)
      .maybeSingle();
    if (!data || data.tenant_id !== tenantId) return null;
    return {
      reference: data.invoice_number,
      customer: data.customers as any,
      data: { total: String(data.total) },
    };
  }
  return null;
}

export const sendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    // Only allow owner, admin, sales to send notifications
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
      .eq("active", true)
      .maybeSingle();
    if (!tpl) {
      const { data: fallback } = await supabaseAdmin
        .from("notification_templates")
        .select("subject, body")
        .eq("event", data.event)
        .eq("channel", channel)
        .eq("language", "en")
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
    if (data.extra) for (const [k, v] of Object.entries(data.extra)) vars[k] = v;
    const subject = render(tpl.subject ?? "", vars);
    const body = render(tpl.body, vars);
    const recipient = entity.customer.phone ?? "";

    const payload = {
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

    const webhook = process.env.N8N_NOTIFY_WEBHOOK_URL;
    if (!webhook) {
      await supabaseAdmin.from("notification_log").insert({
        entity_type: data.entityType,
        entity_id: data.entityId,
        reference: entity.reference,
        event: data.event,
        channel,
        recipient,
        status: "skipped",
        payload: payload as any,
        tenant_id: ctx.tenantId,
        error: "N8N_NOTIFY_WEBHOOK_URL not configured",
      });
      return { status: "skipped", reason: "no_webhook" };
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.N8N_WEBHOOK_TOKEN) headers["X-Webhook-Token"] = process.env.N8N_WEBHOOK_TOKEN;
      const res = await fetch(webhook, { method: "POST", headers, body: JSON.stringify(payload) });
      const respText = await res.text();
      const status = res.ok ? "sent" : "failed";
      await supabaseAdmin.from("notification_log").insert({
        entity_type: data.entityType,
        entity_id: data.entityId,
        reference: entity.reference,
        event: data.event,
        channel,
        recipient,
        status,
        payload: payload as any,
        tenant_id: ctx.tenantId,
        response: { status: res.status, body: respText.slice(0, 2000) } as any,
        error: res.ok ? null : `HTTP ${res.status}`,
      });
      return { status, http: res.status };
    } catch (err: any) {
      await supabaseAdmin.from("notification_log").insert({
        entity_type: data.entityType,
        entity_id: data.entityId,
        reference: entity.reference,
        event: data.event,
        channel,
        recipient,
        status: "failed",
        payload: payload as any,
        tenant_id: ctx.tenantId,
        error: String(err?.message ?? err),
      });
      return { status: "failed", error: String(err?.message ?? err) };
    }
  });
