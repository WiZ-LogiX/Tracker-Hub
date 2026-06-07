// Cloudflare R2 client (server-only).
// Uses S3-compatible API via @aws-sdk/client-s3.
// Never import this from client code.
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  getSignedUrl as getSignedUrlS3,
  S3RequestPresigner,
} from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || "pelecanon-assets";
  const publicUrl = process.env.R2_PUBLIC_URL; // Optional: custom domain for public access

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 environment variables. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    endpoint,
    region: "auto",
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    bucketName,
    publicUrl,
  };
}

let _r2Client: S3Client | undefined;

function getR2Client(): S3Client {
  if (!_r2Client) {
    const { endpoint, region, credentials } = getR2Config();
    _r2Client = new S3Client({
      endpoint,
      region,
      credentials,
    });
  }
  return _r2Client;
}

/**
 * Generate a presigned PUT URL for direct browser-to-R2 upload.
 * @param key - Object key (path) in the bucket
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration in seconds (default: 15 minutes)
 * @returns Presigned URL and the object key
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<{ uploadUrl: string; key: string }> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrlS3(client, command, { expiresIn });
  return { uploadUrl, key };
}

/**
 * Generate a presigned GET URL for private object access.
 * @param key - Object key in the bucket
 * @param expiresIn - URL expiration in seconds (default: 30 minutes)
 * @returns Presigned download URL
 */
export async function getDownloadUrl(
  key: string,
  expiresIn = 1800,
): Promise<string> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  const command = new HeadObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  // Check if object exists first
  try {
    await client.send(command);
  } catch {
    throw new Error(`Object not found: ${key}`);
  }

  const getCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  // Use a proper GET command for download
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const downloadCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrlS3(client, downloadCommand, { expiresIn });
}

/**
 * Delete an object from R2.
 * @param key - Object key in the bucket
 * @returns true if deleted, false if not found
 */
export async function deleteObject(key: string): Promise<boolean> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    return true;
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Generate a unique object key for uploads.
 * Uses tenant/order context for organization.
 */
export function generateObjectKey(
  tenantId: string,
  entityType: "production-photos" | "avatars" | "attachments" | "logos",
  entityId: string,
  originalFilename: string,
): string {
  const ext = originalFilename.split(".").pop()?.toLowerCase() || "bin";
  const hash = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  return `${tenantId}/${entityType}/${entityId}/${hash}.${ext}`;
}

/**
 * Get the public URL for an object (if bucket has public access or custom domain).
 * For private buckets, use getDownloadUrl instead.
 */
export function getPublicUrl(key: string): string {
  const { bucketName, publicUrl } = getR2Config();

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }

  // Default public URL format (requires bucket to be public)
  const { R2_ACCOUNT_ID } = process.env;
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}

/**
 * Check if an object exists in R2.
 */
export async function objectExists(key: string): Promise<boolean> {
  const { bucketName } = getR2Config();
  const client = getR2Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    return true;
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Get the public URL for an object (R2 public bucket or custom domain).
 * This is a synchronous helper for generating display URLs.
 */
export function getR2PublicUrl(key: string): string {
  const { bucketName, publicUrl } = getR2Config();

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }

  // Default public URL format (requires bucket to be public)
  const { R2_ACCOUNT_ID } = process.env;
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}