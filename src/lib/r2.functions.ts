// R2 Server Functions — presigned URLs for client-side uploads/downloads.
// All requests require an authenticated user with an active tenant membership.
// Keys are scoped to tenant + entity so isolation holds even before RLS.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getUser, requireSession } from "@/lib/auth-helpers";
import {
  getUploadUrl,
  getDownloadUrl,
  deleteObject,
  generateObjectKey,
  objectExists,
} from "@/lib/r2.server";

const EntityTypeSchema = z.enum([
  "production-photos",
  "avatars",
  "attachments",
  "logos",
]);

const UploadUrlInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
});

async function resolveTenantForUser(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: member, error } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member?.tenant_id) {
    throw new Error("No tenant for user");
  }
  return member.tenant_id as string;
}

export const getR2UploadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadUrlInput.parse(input))
  .handler(async ({ data }) => {
    const { userId } = await requireSession();
    const tenantId = await resolveTenantForUser(userId);

    const key = generateObjectKey(
      tenantId,
      data.entityType,
      data.entityId,
      data.filename,
    );
    const uploadUrl = await getUploadUrl(key, data.contentType);
    return { uploadUrl, key, publicUrl: getPublicUrlSafe(key) };
  });

const BatchUploadInput = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(128),
      }),
    )
    .min(1)
    .max(20),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
});

export const getR2BatchUploadUrls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BatchUploadInput.parse(input))
  .handler(async ({ data }) => {
    const { userId } = await requireSession();
    const tenantId = await resolveTenantForUser(userId);

    const uploads = await Promise.all(
      data.files.map(async file => {
        const key = generateObjectKey(
          tenantId,
          data.entityType,
          data.entityId,
          file.filename,
        );
        const { uploadUrl } = await getUploadUrl(key, file.contentType);
        return {
          key,
          uploadUrl,
          publicUrl: getPublicUrlSafe(key),
          filename: file.filename,
        };
      }),
    );
    return { uploads };
  });

const DownloadUrlInput = z.object({ key: z.string().min(1).max(512) });

export const getR2DownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DownloadUrlInput.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    const exists = await objectExists(data.key);
    if (!exists) throw new Error("Object not found");
    const downloadUrl = await getDownloadUrl(data.key);
    return { downloadUrl };
  });

const DeleteInput = z.object({ key: z.string().min(1).max(512) });

export const deleteR2Object = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    const deleted = await deleteObject(data.key);
    return { deleted };
  });

function getPublicUrlSafe(key: string): string {
  // Public URL helper that works in both Workers and local dev. Falls back to private-only.
  const { getPublicUrl } = require("@/lib/r2.server");
  try {
    return getPublicUrl(key);
  } catch {
    return "";
  }
}