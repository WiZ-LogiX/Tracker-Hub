import { db } from "@/db/client.server";
import { tenants, appUsers, tenantMembers, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface WorkshopOnboardingInput {
  workshopName: string;
  ownerName: string;
  username: string;
  password: string;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  commercialRegistry?: string | null;
}

export interface WorkshopOnboardingResult {
  ok: boolean;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userId: string;
  username: string;
}

function generateSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "workshop";
}

/**
 * Self-serve SaaS onboarding transaction for a new manufacturing workshop.
 * Creates an isolated tenant on the Free plan, provisions the owner account with the 'owner' role,
 * and seeds standard commercial product categories.
 */
export async function executeWorkshopOnboarding(
  executor: any = db,
  input: WorkshopOnboardingInput,
): Promise<WorkshopOnboardingResult> {
  const workshopName = input.workshopName?.trim();
  const ownerName = input.ownerName?.trim();
  const rawUsername = input.username?.trim();
  const password = input.password;

  if (!workshopName || workshopName.length < 2) {
    throw new Error("Workshop name must be at least 2 characters long.");
  }
  if (!ownerName || ownerName.length < 2) {
    throw new Error("Owner name must be at least 2 characters long.");
  }
  if (!rawUsername || rawUsername.length < 3) {
    throw new Error("Username must be at least 3 characters long.");
  }
  if (!password || password.length < 5) {
    throw new Error("Password must be at least 5 characters long.");
  }

  const normalizedUsername = rawUsername.toLowerCase();
  if (!/^[a-z0-9._-]+$/i.test(normalizedUsername)) {
    throw new Error("Username may only contain letters, digits, dots, underscores or hyphens.");
  }

  // 1. Verify username uniqueness
  const [existingUser] = await executor
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.username, normalizedUsername))
    .limit(1);

  if (existingUser) {
    throw new Error(`Username '${normalizedUsername}' is already taken. Please choose another username.`);
  }

  // 2. Generate a collision-safe tenant slug
  const baseSlug = generateSlug(workshopName);
  let slug = baseSlug;
  let attempts = 0;
  while (attempts < 10) {
    const [existingSlug] = await executor
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (!existingSlug) break;
    slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    attempts++;
  }
  if (attempts >= 10) {
    slug = `${baseSlug}-${Date.now()}`;
  }

  // 3. Create Supabase Auth user
  const email = `${normalizedUsername}@pelecanon.local`;
  const { data: authRes, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr || !authRes?.user) {
    throw new Error(authErr?.message ?? "Failed to create authentication user.");
  }

  const userId = authRes.user.id;

  // 4. Run database provisioning in a transaction (with auth rollback on failure)
  try {
    const result = await executor.transaction(async (tx: any) => {
      // A. Insert Tenant
      const [newTenant] = await tx
        .insert(tenants)
        .values({
          slug,
          name: workshopName,
          plan: "free",
          status: "active",
          currency: "EGP",
          taxRate: "14",
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          taxNumber: input.taxNumber?.trim() || null,
          commercialRegistry: input.commercialRegistry?.trim() || null,
        })
        .returning();

      // B. Insert App User Profile
      await tx.insert(appUsers).values({
        id: userId,
        tenantId: newTenant.id,
        username: normalizedUsername,
        displayName: ownerName,
        status: "active",
      });

      // C. Insert Tenant Membership as Owner
      await tx.insert(tenantMembers).values({
        tenantId: newTenant.id,
        userId,
        role: "owner",
      });

      // D. Seed 3 Starter Commercial Categories for Immediate Use
      await tx.insert(categories).values([
        {
          tenantId: newTenant.id,
          nameAr: "مطابخ كلاسيك ومودرن",
          nameEn: "Custom Kitchens",
          pricingUnit: "linear_meter",
        },
        {
          tenantId: newTenant.id,
          nameAr: "دريسنج روم ووحدات تخزين",
          nameEn: "Dressing Rooms & Closets",
          pricingUnit: "linear_meter",
        },
        {
          tenantId: newTenant.id,
          nameAr: "أبواب وشبابيك ومصبعات",
          nameEn: "Doors, Openings & Millwork",
          pricingUnit: "item",
        },
      ]);

      return {
        ok: true,
        tenantId: newTenant.id,
        tenantSlug: newTenant.slug,
        tenantName: newTenant.name,
        userId,
        username: normalizedUsername,
      };
    });

    return result;
  } catch (dbErr) {
    // Rollback Supabase Auth user on failure
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch {
      // Non-blocking rollback cleanup
    }
    throw dbErr;
  }
}
