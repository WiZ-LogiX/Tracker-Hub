// R2 Server Functions — presigned URLs for client-side uploads/downloads.
// All requests require an authenticated user with an active tenant membership.
// Keys are scoped to tenant + entity so isolation holds even before RLS.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  // Re-import lazily so this module is safe to import in browser for type checks.
  const [
    { getRequest },
    { supabaseAdmin },
  ] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/integrations/supabase/client.server"),
  ]);

  const request = getRequest();
  const headers = request?.headers;
  const auth = headers?.get("authorization") ?? headers?.get("Authorization");
  let token: string | undefined;
  if (auth && auth.startsWith("Bearer ")) token = auth.slice(7);

  // Fallback: signed cookie set by auth-attacher / requireSupabaseAuth.
  if (!token) {
    const cookieHeader = headers?.get("cookie") ?? headers?.get("Cookie") ?? "";
    const m = cookieHeader.match(/(?:^|;\s*)(?:sb-access-token|supabase-auth-token|access_token)=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }

  if (!token) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error(error?.message ?? "Unauthorized");
  }

  // Resolve tenant for the user (first membership).
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

export const getR2UploadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadUrlInput.parse(input))
  .handler(async ({ data }) => {
    const session = await sessionFromRequest();
    if (!session.tenantId) throw new Error("Forbidden: no tenant");

    const [{ getUploadUrl, generateObjectKey, getPublicUrl }] = await Promise.all([
      import("@/lib/r2.server"),
    ]);

    requireEnvConfig();
    const key = generateObjectKey(session.tenantId, data.entityType, data.entityId, data.filename);
    const { uploadUrl } = await getUploadUrl(key, data.contentType);
    return {
      key,
      uploadUrl,
      publicUrl: safeGetPublicUrl(getPublicUrl, key),
    };
  });

export const getR2BatchUploadUrls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BatchUploadInput.parse(input))
  .handler(async ({ data }) => {
    const session = await sessionFromRequest();
    if (!session.tenantId) throw new Error("Forbidden: no tenant");

    const [{ getUploadUrl, generateObjectKey, getPublicUrl }] = await Promise.all([
      import("@/lib/r2.server"),
    ]);
    requireEnvConfig();

    const uploads = await Promise.all(
      data.files.map(async f => {
        try {
          const key = generateObjectKey(session.tenantId as string, data.entityType, data.entityId, f.filename);
          const { uploadUrl } = await getUploadUrl(key, f.contentType);
          return { key, uploadUrl, publicUrl: safeGetPublicUrl(getPublicUrl, key) };
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
    const [{ getDownloadUrl, objectExists }] = await Promise.all([import("@/lib/r2.server")]);
    requireEnvConfig();
    if (!(await objectExists(data.key))) throw new Error("Not found");
    const { downloadUrl } = await getDownloadUrlImpl();
    return { downloadUrl };

    async function getDownloadUrlImpl() {
      const url = await getDownloadUrl(data.key);
      return { downloadUrl: url };
    }
  });

export const deleteR2Object = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data }) => {
    const session = await sessionFromRequest();
    if (!session.tenantId) throw new Error("Forbidden: no tenant");
    if (!data.key.startsWith(`${session.tenantId}/`)) {
      throw new Error("Forbidden: key outside tenant");
    }
    const [{ deleteObject }] = await Promise.all([import("@/lib/r2.server")]);
    requireEnvConfig();
    const ok = await deleteObject(data.key);
    return { deleted: ok };
  });

function safeGetPublicUrl(
  getPublicUrl: (key: string) => string | Promise<string>,
  key: string,
): string {
  try {
    const v = getPublicUrl(key);
    if (typeof v === "string") return v;
    if (v && typeof (v as any).then === "function") {
      // Public URL is sync in our impl, so we never hit this; defensive only.
      return "";
    }
    return "";
  } catch {
    return "";
  }
}