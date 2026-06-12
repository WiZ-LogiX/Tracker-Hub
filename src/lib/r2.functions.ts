// R2 Server Functions — presigned URLs for client-side uploads/downloads.
// All requests require an authenticated user with an active tenant membership.
// Keys are scoped to tenant + entity so isolation holds even before RLS.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Database } from "@/integrations/supabase/types";

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

const DownloadUrlInput = z.object({ key: z.string().min(1).max(512) });

const DeleteInput = z.object({ key: z.string().min(1).max(512) });

interface SessionInfo {
  userId: string;
  email?: string | null;
  tenantId: string | null;
}

async function sessionFromRequest(): Promise<SessionInfo> {
  const request = getRequest();
  const headers = request?.headers;
  const auth = headers?.get("authorization") ?? headers?.get("Authorization");
  let token: string | undefined;
  if (auth && auth.startsWith("Bearer ")) token = auth.slice(7);

  if (!token) {
    const cookieHeader = headers?.get("cookie") ?? headers?.get("Cookie") ?? "";
    const m = cookieHeader.match(/(?:^|;\s*)(?:sb-access-token|supabase-auth-token|access_token)=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }

  if (!token) throw new Error("Unauthorized");

  const supabaseAdmin = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new Error(error?.message ?? "Unauthorized");

  const { data: member } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    tenantId: member?.tenant_id ?? null,
  };
}

function requireEnvConfig(): void {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
  const missing = required.filter(k => !process.env[k] && !process.env[k.replace("_NAME", "")]);
  if (missing.length) {
    throw new Error(`Missing R2 env vars: ${missing.join(", ")}`);
  }
}

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucketName = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "pelecanon-assets";
  void bucketName;

  return new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucketName(): string {
  return process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "pelecanon-assets";
}

async function signPutUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getR2Client(), cmd, { expiresIn: 900 });
}

function generateObjectKey(
  tenantId: string,
  entityType: string,
  entityId: string,
  originalFilename: string,
): string {
  const ext = (originalFilename.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const hash = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `${tenantId}/${entityType}/${entityId}/${hash}.${ext}`;
}

function getPublicUrl(key: string): string {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const bucketName = getBucketName();
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl) return `${publicUrl.replace(/\/$/, "")}/${key}`;
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}

export const getR2UploadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadUrlInput.parse(input))
  .handler(async ({ data }) => {
    const session = await sessionFromRequest();
    if (!session.tenantId) throw new Error("Forbidden: no tenant");

    requireEnvConfig();
    const key = generateObjectKey(session.tenantId, data.entityType, data.entityId, data.filename);
    const uploadUrl = await signPutUrl(key, data.contentType);
    return { uploadUrl, key, publicUrl: getPublicUrl(key) };
  });

export const getR2BatchUploadUrls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BatchUploadInput.parse(input))
  .handler(async ({ data }) => {
    const session = await sessionFromRequest();
    if (!session.tenantId) throw new Error("Forbidden: no tenant");
    requireEnvConfig();

    const uploads = await Promise.all(
      data.files.map(async f => {
        if (!session.tenantId) throw new Error("Forbidden: no tenant");
        try {
          const key = generateObjectKey(session.tenantId, data.entityType, data.entityId, f.filename);
          const uploadUrl = await signPutUrl(key, f.contentType);
          return { key, uploadUrl, publicUrl: getPublicUrl(key) };
        } catch (e: any) {
          console.error("[r2.functions] upload-url failed for", f.filename, e?.message);
          throw new Error(`presign failed for ${f.filename}: ${e?.message ?? "unknown"}`);
        }
      }),
    );
    return { uploads };
  });

export const getR2DownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DownloadUrlInput.parse(input))
  .handler(async ({ data }) => {
    const session = await sessionFromRequest();
    if (!session.tenantId) throw new Error("Forbidden: no tenant");
    if (!data.key.startsWith(`${session.tenantId}/`)) {
      throw new Error("Forbidden: key outside tenant");
    }
    requireEnvConfig();
    const cmd = new (await import("@aws-sdk/client-s3")).GetObjectCommand({
      Bucket: getBucketName(),
      Key: data.key,
    });
    const { getSignedUrl: sign } = await import("@aws-sdk/s3-request-presigner");
    const downloadUrl = await sign(getR2Client(), cmd, { expiresIn: 1800 });
    return { downloadUrl };
  });

export const deleteR2Object = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    const session = await sessionFromRequest();
    if (!session.tenantId) throw new Error("Forbidden: no tenant");
    if (!data.key.startsWith(`${session.tenantId}/`)) {
      throw new Error("Forbidden: key outside tenant");
    }
    requireEnvConfig();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await getR2Client().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: data.key }));
    return { deleted: true };
  });