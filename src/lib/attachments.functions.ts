import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDownloadUrl, getPublicUrl } from "@/lib/r2.server";
import { getR2PublicUrl } from "@/lib/r2.utils";

const EntityType = z.enum(["order", "quote", "invoice", "customer", "task", "opportunity", "project", "service_case"]);

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

async function resolveTenantAndRole(userId: string): Promise<{ tenantId: string; role: string }> {
  const { data, error } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.tenant_id) {
    throw new Error("Forbidden: no tenant membership for caller");
  }

  const { data: profile } = await supabaseAdmin
    .from("app_users")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (profile && profile.status === "disabled") {
    throw new Error("Forbidden: User account is disabled");
  }

  return { tenantId: data.tenant_id, role: data.role || "viewer" };
}

async function verifyWorkerTaskAssignment(taskId: string, userId: string, tenantId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("task_assignees")
    .select("id")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) {
    throw new Error("Forbidden: You can only access attachments for tasks assigned to you");
  }
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
  downloadUrl?: string;
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
    const { tenantId, role } = await resolveTenantAndRole(context.userId);
    if (role === "worker") {
      if (data.entityType !== "task") {
        throw new Error("Forbidden: Task Workers can only access task attachments");
      }
      await verifyWorkerTaskAssignment(data.entityId, context.userId, tenantId);
    }

    const { data: rows, error } = await supabaseAdmin
      .from("attachments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const items = await Promise.all(
      (rows ?? []).map(async (r) => {
        const item = shape(r);
        try {
          item.downloadUrl = await getDownloadUrl(r.storage_key, SignedUrlTtl);
        } catch {
          // graceful fallback
        }
        return item;
      }),
    );
    return { items };
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
    const { tenantId, role } = await resolveTenantAndRole(context.userId);
    if (role === "worker") {
      if (data.entityType !== "task") {
        throw new Error("Forbidden: Task Workers can only upload task attachments");
      }
      if (data.isPublic) {
        throw new Error("Forbidden: Task Workers cannot set customer visibility");
      }
      await verifyWorkerTaskAssignment(data.entityId, context.userId, tenantId);
    }

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
    const { tenantId, role } = await resolveTenantAndRole(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("attachments")
      .select("id, tenant_id, storage_key, entity_type, entity_id, uploaded_by")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    if (role === "worker") {
      if (row.entity_type !== "task") {
        throw new Error("Forbidden: Task Workers can only delete task attachments");
      }
      if (row.uploaded_by !== context.userId) {
        throw new Error("Forbidden: Task Workers can only delete attachments uploaded by themselves");
      }
      await verifyWorkerTaskAssignment(row.entity_id, context.userId, tenantId);
    }

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
    const { tenantId, role } = await resolveTenantAndRole(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("attachments")
      .select("id, storage_key, is_public, tenant_id, entity_type, entity_id")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    if (role === "worker") {
      if (row.entity_type !== "task") {
        throw new Error("Forbidden: Task Workers can only access task attachments");
      }
      await verifyWorkerTaskAssignment(row.entity_id, context.userId, tenantId);
    }

    const url = await getDownloadUrl(row.storage_key, SignedUrlTtl);
    return { url, expiresInSec: SignedUrlTtl };
  });

const UpdateVisibilityInput = z.object({
  id: z.string().uuid(),
  isPublic: z.boolean(),
});

/**
 * Promote or demote an attachment's customer visibility status.
 * Restricted to authenticated staff with verified tenant membership.
 * Defaults all files to internal (is_public=false); only staff can set true.
 */
export const updateAttachmentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateVisibilityInput.parse(d))
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await resolveTenantAndRole(context.userId);
    if (role === "worker") {
      throw new Error("Forbidden: Task Workers cannot modify customer visibility");
    }

    const { data: row, error } = await supabaseAdmin
      .from("attachments")
      .update({ is_public: data.isPublic })
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) throw new Error("Attachment not found or access denied");

    return { item: shape(row) };
  });

const BulkUpdateVisibilityInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  isPublic: z.boolean(),
});

/**
 * Bulk update customer visibility for multiple attachments within caller tenant.
 */
export const bulkUpdateAttachmentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BulkUpdateVisibilityInput.parse(d))
  .handler(async ({ data, context }) => {
    const { tenantId, role } = await resolveTenantAndRole(context.userId);
    if (role === "worker") {
      throw new Error("Forbidden: Task Workers cannot modify customer visibility");
    }

    const { error } = await supabaseAdmin
      .from("attachments")
      .update({ is_public: data.isPublic })
      .in("id", data.ids)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);
    return { count: data.ids.length, isPublic: data.isPublic };
  });

async function fetchR2Delete(key: string) {
  // Lazy import to keep this server-side only and avoid bundling AWS SDK
  // into the public/client path.
  const { deleteObject } = await import("@/lib/r2.server");
  await deleteObject(key);
}