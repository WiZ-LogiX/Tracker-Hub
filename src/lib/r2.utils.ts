// Client-safe R2 utilities (no Node.js dependencies, safe for browser import)
import type { R2Config } from "./r2.config";

// Re-export config getter for client use (uses only process.env)
export function getR2ConfigClient(): Pick<R2Config, "bucketName" | "publicUrl" | "accountId"> {
  const accountId = import.meta.env.R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  // Support both R2_BUCKET and R2_BUCKET_NAME for compatibility
  const bucketName = import.meta.env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET ||
                     process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "pelecanon-assets";
  const publicUrl = import.meta.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;

  return { accountId, bucketName, publicUrl };
}

/**
 * Get the public URL for an object (R2 public bucket or custom domain).
 * This is a synchronous helper for generating display URLs.
 * Safe to use in client components.
 */
export function getR2PublicUrl(key: string): string {
  const { bucketName, publicUrl, accountId } = getR2ConfigClient();

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }

  // Default public URL format (requires bucket to be public)
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}

/**
 * Extract R2 object key from a public URL.
 * Useful for deletion operations.
 */
export function extractR2Key(url: string): string | null {
  if (!url) return null;

  const { accountId, bucketName, publicUrl } = getR2ConfigClient();

  // Match default R2 public URL format
  const defaultBase = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/`;
  if (url.startsWith(defaultBase)) {
    return url.slice(defaultBase.length);
  }

  // Match custom domain if configured
  if (publicUrl) {
    const customBase = publicUrl.replace(/\/$/, "") + "/";
    if (url.startsWith(customBase)) {
      return url.slice(customBase.length);
    }
  }

  return null;
}

/**
 * Generate a unique object key for uploads (client-side version).
 * Uses timestamp + random for uniqueness without crypto.
 */
export function generateObjectKeyClient(
  tenantId: string,
  entityType: "production-photos" | "avatars" | "attachments" | "logos",
  entityId: string,
  originalFilename: string,
): string {
  const ext = originalFilename.split(".").pop()?.toLowerCase() || "bin";
  const hash = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `${tenantId}/${entityType}/${entityId}/${hash}.${ext}`;
}