// R2 Server Functions — presigned URLs for client-side uploads/downloads.
// All requests require an authenticated user with an active tenant membership.
// Keys are scoped to tenant + entity so isolation holds even before RLS.
//
// IMPORTANT (R2 + browser PUT compatibility):
// AWS SDK v3 ≥ 3.733 streams the request body to compute a *flow* checksum
// (x-amz-checksum-crc32) and embeds it in the signed URL query string.
// At sign-time the body is missing → checksum defaults to AAAAAA== (CRC32 of
// 0 bytes). When the browser PUTs the real bytes, R2 re-validates the CRC
// against the bytes it received and rejects with HTTP 400 + "InvalidChecksum".
// Browser surfaces that as a generic "Failed to fetch".
//
// Fix: instantiate the client with `requestChecksumCalculation: "WHEN_REQUIRED"`
// and `responseChecksumValidation: "WHEN_REQUIRED"` so the SDK never injects
// pre-computed checksum query params into the signed URL.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const EntityTypeSchema = z.enum(["production-photos", "avatars", "attachments", "logos"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const UploadUrlInput = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  entityType: EntityTypeSchema,
  entityId: z.string().min(1).max(255),
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
  entityId: z.string().min(1).max(255),
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
    const m = cookieHeader.match(
      /(?:^|;\s*)(?:sb-access-token|supabase-auth-token|access_token)=([^;]+)/,
    );
    if (m) token = decodeURIComponent(m[1]);
  }

  if (!token) throw new Error("Unauthorized");

  const supabaseAdmin = createClient(
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
    tenantId: typeof member?.tenant_id === "string" ? member.tenant_id : null,
  };
}

/**
 * Sprint 0: R2_PUBLIC_URL is now required at boot. The S3-API URL pattern
 * (`https://<account>.r2.cloudflarestorage.com/...`) is NOT publicly readable
 * without explicit bucket-level public access granted out-of-band; we refuse
 * to silently fall back to it.
 */
function requireEnvConfig(): void {
  const required = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_URL",
  ];
  const missing = required.filter(
    (k) => !process.env[k] && !(k === "R2_BUCKET" && process.env.R2_BUCKET_NAME),
  );
  if (missing.length) {
    throw new Error(
      `Missing required R2 env vars: ${missing.join(", ")}. ` +
        `R2_PUBLIC_URL must point at the public bucket or custom CDN domain.`,
    );
  }
}

let _client: S3Client | undefined;
function getR2Client(): S3Client {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

  _client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _client;
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
  const ext =
    (originalFilename.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const hash = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `${tenantId}/${entityType}/${entityId}/${hash}.${ext}`;
}

function getPublicUrl(key: string): string {
  // Sprint 0: R2_PUBLIC_URL is always set after requireEnvConfig().
  return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
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
      data.files.map(async (f) => {
        if (!session.tenantId) throw new Error("Forbidden: no tenant");
        try {
          const key = generateObjectKey(
            session.tenantId,
            data.entityType,
            data.entityId,
            f.filename,
          );
          const uploadUrl = await signPutUrl(key, f.contentType);
          return { key, uploadUrl, publicUrl: getPublicUrl(key) };
        } catch (e: unknown) {
          const message = errorMessage(e);
          console.error("[r2.functions] upload-url failed for", f.filename, message);
          throw new Error(`presign failed for ${f.filename}: ${message}`);
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

    const cmd = new GetObjectCommand({
      Bucket: getBucketName(),
      Key: data.key,
    });
    const downloadUrl = await getSignedUrl(getR2Client(), cmd, { expiresIn: 1800 });
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

    await getR2Client().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: data.key }));
    return { deleted: true };
  });
