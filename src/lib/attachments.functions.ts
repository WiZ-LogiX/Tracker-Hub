import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDownloadUrl, getPublicUrl } from "@/lib/r2.server";
import { getR2PublicUrl } from "@/lib/r2.utils";

const EntityType = z.enum(["order", "quote", "invoice", "customer"]);

const ListInput = z.object({
  entityType: EntityType,
  entityId: z.string().uuid(),
});

const RegisterInput = z.object({
  entityType: EntityType,
  entityId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  storageKey: z.string().min(1).max(512),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative(),
  caption: z.string().max(500).optional().nullable(),
  isPublic: z.boolean().optional(),
});

const DeleteInput = z.object({ id: z.string().uuid() });

const SignInput = z.object({ id: z.string().uuid() });

const SignedUrlTtl = 60 * 25;

async function resolveTenantId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.tenant_id) {
    throw new Error("Forbidden: no tenant membership for caller");
  }
  return data.tenant_id;
}

export interface AttachmentRow {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  fileName: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  caption: string | null;
  isPublic: boolean;
  createdAt: string;
}

function shape(r: any): AttachmentRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    fileName: r.file_name,
    storageKey: r.storage_key,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes ?? 0),
    uploadedBy: r.uploaded_by ?? null,
    caption: r.caption ?? null,
    isPublic: !!r.is_public,
    createdAt: r.created_at,
  };
}

/**
 * List attachments for one (entityType, entityId). Tenant-scoped via the
 * session user's first tenant — the RLS policy is the real boundary, but
 * we also pre-filter by tenant to keep response sizes small.
 */
export const listAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("attachments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []).map(shape) };
  });

/**
 * Register a file_upload in the DB after the browser has finished the
 * direct-to-R2 PUT. The presigned upload URL itself comes from
 * getR2BatchUploadUrls (attachments is a valid entityType there).
 */
export const registerAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RegisterInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.userId);

    const { data: row, error } = await supabaseAdmin
      .from("attachments")
      .insert({
        tenant_id: tenantId,
        entity_type: data.entityType,
        entity_id: data.entityId,
        file_name: data.fileName,
        storage_key: data.storageKey,
        content_type: data.contentType,
        size_bytes: data.sizeBytes,
        uploaded_by: context.userId,
        caption: data.caption ?? null,
        is_public: !!data.isPublic,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return { item: shape(row) };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("attachments")
      .select("id, tenant_id, storage_key")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    const { error: delErr } = await supabaseAdmin
      .from("attachments")
      .delete()
      .eq("id", row.id);
    if (delErr) throw new Error(delErr.message);

    try {
      await fetchR2Delete(row.storage_key);
    } catch (e: any) {
      console.warn(
        "[attachments] r2 delete skipped",
        row.storage_key,
        e?.message ?? e,
      );
    }
    return { deleted: true };
  });

/**
 * Return a signed (or public, if `is_public`) URL for one attachment.
 * Useful in the admin UI when you want to open a private attachment via
 * a presigned link rather than embedding the public CDN URL.
 */
export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SignInput.parse(d))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("attachments")
      .select("id, storage_key, is_public, tenant_id")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    if (row.is_public) {
      return { url: getR2PublicUrl(row.storage_key) };
    }
    const url = await getDownloadUrl(row.storage_key, SignedUrlTtl);
    return { url, expiresInSec: SignedUrlTtl };
  });

async function fetchR2Delete(key: string) {
  // Lazy import to keep this server-side only and avoid bundling AWS SDK
  // into the public/client path.
  const { deleteObject } = await import("@/lib/r2.server");
  await deleteObject(key);
}