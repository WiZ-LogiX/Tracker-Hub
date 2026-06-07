// Migration tooling: Supabase Storage → Cloudflare R2
// Run this once to migrate existing production_photos to R2
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUploadUrl, getPublicUrl } from "@/lib/r2.server";

const MigrationInput = z.object({
  batchSize: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
  dryRun: z.boolean().default(false),
});

function extractSupabasePath(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/);
  if (m) return decodeURIComponent(m[1]);
  if (!url.startsWith("http")) return url.replace(/^\/+/, "");
  return null;
}

export const migratePhotosToR2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MigrationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify admin role via user_roles table
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    
    const isAdmin = roles?.some((r: any) => r.role === "admin") ?? false;
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const { batchSize, offset, dryRun } = data;
    const results = {
      total: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Get photos that haven't been migrated (still have Supabase Storage URLs)
    const { data: photos, error } = await supabaseAdmin
      .from("production_photos")
      .select("id, photo_url, order_id, tenant_id")
      .ilike("photo_url", "%supabase%")
      .range(offset, offset + batchSize - 1);

    if (error) throw new Error(error.message);
    if (!photos?.length) {
      return { ...results, message: "No more photos to migrate" };
    }

    results.total = photos.length;

    for (const photo of photos) {
      try {
        const supabasePath = extractSupabasePath(photo.photo_url);
        if (!supabasePath) {
          results.skipped++;
          results.errors.push(`Photo ${photo.id}: Could not extract Supabase path`);
          continue;
        }

        // Download from Supabase Storage
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("production-photos")
          .download(supabasePath);

        if (downloadError || !fileData) {
          results.failed++;
          results.errors.push(`Photo ${photo.id}: Download failed - ${downloadError?.message}`);
          continue;
        }

        // Determine content type
        const contentType = fileData.type || "image/jpeg";

        // Generate R2 key preserving tenant/order structure
        const tenantId = photo.tenant_id || "unknown";
        const ext = supabasePath.split(".").pop() || "jpg";
        const hash = crypto.subtle
          ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${Date.now()}-${Math.random()}`))))
              .map(b => b.toString(16).padStart(2, "0"))
              .join("")
              .slice(0, 12)
          : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
        const r2Key = `${tenantId}/production-photos/${photo.order_id}/${hash}.${ext}`;

        if (dryRun) {
          results.migrated++;
          continue;
        }

        // Upload to R2
        const { uploadUrl } = await getUploadUrl(r2Key, contentType);
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: fileData,
          headers: { "Content-Type": contentType },
        });

        if (!uploadRes.ok) {
          results.failed++;
          results.errors.push(`Photo ${photo.id}: R2 upload failed - ${uploadRes.status}`);
          continue;
        }

        // Update database with new R2 public URL
        const newPhotoUrl = getPublicUrl(r2Key);
        const { error: updateError } = await supabaseAdmin
          .from("production_photos")
          .update({ photo_url: newPhotoUrl })
          .eq("id", photo.id);

        if (updateError) {
          results.failed++;
          results.errors.push(`Photo ${photo.id}: DB update failed - ${updateError.message}`);
          continue;
        }

        results.migrated++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Photo ${photo.id}: ${err.message}`);
      }
    }

    return {
      ...results,
      nextOffset: offset + batchSize,
      hasMore: results.total === batchSize,
    };
  });

// Get migration status
export const getMigrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const isAdmin = roles?.some((r: any) => r.role === "admin") ?? false;
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const { count: totalSupabase } = await supabaseAdmin
      .from("production_photos")
      .select("*", { count: "exact", head: true })
      .ilike("photo_url", "%supabase%");

    const { count: totalR2 } = await supabaseAdmin
      .from("production_photos")
      .select("*", { count: "exact", head: true })
      .ilike("photo_url", "%.r2.cloudflarestorage.com%");

    const { count: totalCustom } = await supabaseAdmin
      .from("production_photos")
      .select("*", { count: "exact", head: true })
      .not("photo_url", "ilike", "%supabase%")
      .not("photo_url", "ilike", "%.r2.cloudflarestorage.com%");

    return {
      supabaseStorage: totalSupabase ?? 0,
      r2: totalR2 ?? 0,
      other: totalCustom ?? 0,
      total: (totalSupabase ?? 0) + (totalR2 ?? 0) + (totalCustom ?? 0),
    };
  });