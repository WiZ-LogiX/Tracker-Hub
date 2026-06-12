import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";

interface R2Config {
  endpoint: string;
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  bucketName: string;
  publicUrl: string | undefined;
  accountId: string;
}

function getConfig(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName =
    process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "pelecanon-assets";
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).",
    );
  }
  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    bucketName,
    publicUrl,
    accountId,
  };
}

let _client: S3Client | undefined;
function client(): S3Client {
  if (!_client) {
    const { endpoint, region, credentials } = getConfig();
    _client = new S3Client({
      endpoint,
      region,
      credentials,
      // Required so the SDK omits signing payload that's not the final hash
      // (browser-side presigned PUTs hit R2 directly and R2 didn't get pre-calculated checksums).
      requestHandler: undefined,
    });
  }
  return _client;
}

export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<{ uploadUrl: string; key: string }> {
  const cmd = new PutObjectCommand({
    Bucket: getConfig().bucketName,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client(), cmd, { expiresIn });
  return { uploadUrl, key };
}

export async function getDownloadUrl(key: string, expiresIn = 1800): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: getConfig().bucketName,
    Key: key,
  });
  return getSignedUrl(client(), cmd, { expiresIn });
}

export async function deleteObject(key: string): Promise<boolean> {
  try {
    await client().send(
      new DeleteObjectCommand({ Bucket: getConfig().bucketName, Key: key }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(
      new HeadObjectCommand({ Bucket: getConfig().bucketName, Key: key }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Generate a unique object key: `tenantId/entityType/entityId/hash.ext`.
 * The leading tenantId is the primary isolation boundary — never bypass it.
 */
export function generateObjectKey(
  tenantId: string,
  entityType: "production-photos" | "avatars" | "attachments" | "logos",
  entityId: string,
  originalFilename: string,
): string {
  if (!tenantId) throw new Error("tenantId is required for object key generation");
  const ext = (originalFilename.split(".").pop() || "bin").toLowerCase();
  const hash = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}-${originalFilename}`)
    .digest("hex")
    .slice(0, 12);
  return `${tenantId}/${entityType}/${entityId}/${hash}.${ext}`;
}

export function getPublicUrl(key: string): string {
  const { bucketName, publicUrl, accountId } = getConfig();
  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}