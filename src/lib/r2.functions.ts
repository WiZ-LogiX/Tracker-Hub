// R2 Server Functions — presigned URLs for client-side uploads/downloads
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getUploadUrl,
  getDownloadUrl,
  deleteObject,
  generateObjectKey,
} from "@/lib/r2.server";

const UploadUrlInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  entityType: z.enum(["production-photos", "avatars", "attachments", "logos"]),
  entityId: z.string().uuid(),
});

export const getR2UploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UploadUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve tenant_id from user
    const { data: member } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!member?.tenant_id) {
      throw new Error("No tenant for user");
    }

    const key = generateObjectKey(
      member.tenant_id,
      data.entityType,
      data.entityId,
      data.filename,
    );

    const { uploadUrl } = await getUploadUrl(key, data.contentType);

    return { uploadUrl, key };
  });

const DownloadUrlInput = z.object({
  key: z.string().min(1).max(512),
});

export const getR2DownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DownloadUrlInput.parse(input))
  .handler(async ({ data }) => {
    const url = await getDownloadUrl(data.key);
    return { downloadUrl: url };
  });

const DeleteInput = z.object({
  key: z.string().min(1).max(512),
});

export const deleteR2Object = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    const deleted = await deleteObject(data.key);
    return { deleted };
  });

// Batch upload URLs for multiple files
const BatchUploadInput = z.object({
  files: z.array(
    z.object({
      filename: z.string().min(1).max(255),
      contentType: z.string().min(1).max(128),
    }),
  ).min(1).max(20),
  entityType: z.enum(["production-photos", "avatars", "attachments", "logos"]),
  entityId: z.string().uuid(),
});

export const getR2BatchUploadUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!member?.tenant_id) {
      throw new Error("No tenant for user");
    }

    const results = await Promise.all(
      data.files.map(async (file) => {
        const key = generateObjectKey(
          member.tenant_id,
          data.entityType,
          data.entityId,
          file.filename,
        );
        const { uploadUrl } = await getUploadUrl(key, file.contentType);
        return { key, uploadUrl, filename: file.filename };
      }),
    );

    return { uploads: results };
  });