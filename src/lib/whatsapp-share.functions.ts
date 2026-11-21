import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { requirePermission, type TenantContext } from "@/lib/tenant-context";

export type NotifyPayload = {
  event: string;
  reference: string;
  channels: string[];
  to: { phone?: string | null; email?: string | null };
  subject?: string;
  message: string;
  link?: string;
  locale: string;
  entity: { type: string; id: string };
  extra?: Record<string, string>;
};

export type NotifyResult =
  | { status: "sent"; http: number; attempts: number }
  | { status: "failed"; http?: number; error?: string; attempts: number; reason?: string }
  | { status: "skipped"; reason: string };

/**
 * Builds the canonical public customer-facing tracking URL.
 *
 * Uses NEXT_PUBLIC_SITE_URL or SITE_URL when available (full absolute URL
 * for SMS/WhatsApp delivery). If no host is configured, falls back to a
 * relative path so local development works without env setup.
 */
export function buildTrackingLink(reference: string): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  const baseUrl = envUrl ? envUrl.replace(/\/$/, "") : "";
  const path = `/track?ref=${encodeURIComponent(reference)}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

const SendTrackingInput = z.object({
  orderId: z.string().uuid().optional(),
  orderNumber: z.string().trim().min(1).max(64).optional(),
  language: z.enum(["en", "fr", "ar"]).optional(),
});

export const sendTrackingWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => SendTrackingInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "orders.view");
    const { handleSendTrackingWhatsapp } = await import("./whatsapp-share.server");
    return handleSendTrackingWhatsapp((context as any).supabase, ctx, data);
  });
