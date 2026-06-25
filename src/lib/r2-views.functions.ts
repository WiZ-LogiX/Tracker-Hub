import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Sprint 0.3: signed-URL endpoint for the photo grid.
 *
 * We deliberately keep the read TTL at 25 minutes (1500s) so it comfortably
 * fits inside the 30-minute TanStack Query stale window the hook uses.
 * R2 itself doesn't care about TTL granularity beyond its max (7 days for
 * presigned GETs) — 25 minutes is just "long enough for a session, short
 * enough that leakage is bounded".
 */
const ViewUrlInput = z.object({
  urls: z.array(z.string().min(1).max(2048)).min(1).max(50),
});

interface SignedView {
  url: string;
  original: string;
}

let _client: S3Client | undefined;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _client;
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "pelecanon-assets";
}

function extractKey(url: string): string | null {
  // Accept either a public-cdn URL or a stored R2 url. Pull the key tail.
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase && url.startsWith(`${publicBase}/`)) {
    return url.slice(publicBase.length + 1);
  }
  const r2Base = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket()}`;
  if (url.startsWith(`${r2Base}/`)) {
    return url.slice(r2Base.length + 1);
  }
  // Might be a bare key already.
  if (!url.startsWith("http")) return url;
  return null;
}

async function resolveTenant(): Promise<string | null> {
  const request = getRequest();
  const headers = request?.headers;
  const auth = headers?.get("authorization") ?? headers?.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
  if (!token) return null;

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );

  const { data } = await supabaseAdmin.auth.getUser(token);
  if (!data?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();

  return typeof member?.tenant_id === "string" ? member.tenant_id : null;
}

export const getR2ViewUrls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ViewUrlInput.parse(input))
  .handler(async ({ data }): Promise<{ views: SignedView[] }> => {
    const tenantId = await resolveTenant();
    if (!tenantId) throw new Error("Unauthorized");

    const out: SignedView[] = [];
    for (const original of data.urls) {
      const key = extractKey(original);
      if (!key) {
        out.push({ url: original, original });
        continue;
      }
      // Defense in depth: never sign a key outside the caller's tenant.
      if (!key.startsWith(`${tenantId}/`)) {
        out.push({ url: original, original });
        continue;
      }
      const signed = await getSignedUrl(
        client(),
        new GetObjectCommand({ Bucket: bucket(), Key: key }),
        { expiresIn: 1500 },
      );
      out.push({ url: signed, original });
    }
    return { views: out };
  });
