import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  requireRole,
  requirePermission,
  hasPermission,
  resolveEffectivePermissions,
  invalidateRolePermissionsCache,
  BUILTIN_ROLE_SLUGS,
  ALL_PERMISSION_SLUGS,
  APPLICATION_SECTIONS,
  SPECIAL_ACCESS_ITEMS,
  type TenantRole,
  type TenantContext,
  type UserPermissions,
} from "@/lib/tenant-context";
import { db } from "@/db/client.server";
import { appUsers, tenantMembers, permissions, rolePermissions, tenantRoles } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Auth server functions for username-based login.
 *
 * Why a synthetic email? Supabase Auth stores a unique email per auth.users
 * row and signs JWTs with that identity claim. RLS on every business table
 * currently keys off `auth.uid()`. The cleanest way to swap email login
 * for username login without a multi-week edge-function rewrite is to
 * treat `<username>@pelecanon.local` as the canonical email shape — the
 * user never sees it. Internally we call this the "proxy email".
 *
 * The split:
 *   - `login`, `logout`, `getCurrentUser`  → user-facing, hit the auth API.
 *   - `listUsers`, `createUser`, ...        → admin-only, drive auth.admin
 *     and read/write public.app_users.
 */

function makeAuthClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const Username = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9._-]+$/i, "Username may only contain letters, digits, dot, underscore or hyphen");

const Password = z.string().min(5).max(128);

function proxyEmailFor(username: string): string {
  return `${username.toLowerCase()}@pelecanon.local`;
}

// ---------------- Public / auth flows ----------------

export const login = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        username: Username,
        password: Password,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = makeAuthClient();
    const { data: res, error } = await supabase.auth.signInWithPassword({
      email: proxyEmailFor(data.username),
      password: data.password,
    });
    if (error || !res?.session) {
      throw new Error(error?.message ?? "Invalid credentials");
    }

    // Check the account is active in our app_users table.
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("app_users")
      .select("id, status, tenant_id, username, display_name, avatar_key")
      .eq("id", res.user.id)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile) throw new Error("Account not provisioned yet");
    if (profile.status !== "active") throw new Error("Account is disabled");

    const { data: member } = await supabaseAdmin
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", profile.tenant_id)
      .eq("user_id", res.user.id)
      .maybeSingle();

    const role = member?.role ?? "viewer";

    return {
      session: res.session,
      user: res.user,
      profile: {
        ...profile,
        role,
      },
      role,
    };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = makeAuthClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  return { ok: true };
});

/**
 * Returns the currently-authenticated user (resolved by the bearer token via
 * requireSupabaseAuth middleware) plus their app_users profile.
 */
export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile } = await supabaseAdmin
      .from("app_users")
      .select("id, status, tenant_id, username, display_name, avatar_key")
      .eq("id", userId)
      .maybeSingle();

    return { userId, profile: profile ?? null };
  });

/**
 * Idempotent: ensures the default tenant exists AND that an `admin` user
 * exists with the role `owner`. Runs only if no admin user is currently
 * active. We never return a password — admins issue those via
 * resetPassword after.
 */
export const ensureBootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  // 1. Ensure default tenant.
  let tenantId: string;
  const { data: existingTenant } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("slug", "pelecanon")
    .maybeSingle();
  if (existingTenant) {
    tenantId = existingTenant.id;
  } else {
    const { data: t, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({ slug: "pelecanon", name: "PeleCanon" })
      .select("id")
      .single();
    if (tErr || !t) throw new Error(tErr?.message ?? "Failed to create tenant");
    tenantId = t.id;
  }

  // 2. Look for an existing app_users with username = admin.
  const { data: existingProf } = await supabaseAdmin
    .from("app_users")
    .select("id, status")
    .eq("username", "admin")
    .maybeSingle();

  if (existingProf) {
    return { ok: true, created: false, tenantId, adminUserId: existingProf.id };
  }

  // 3. Create the auth user with synthetic email.
  const email = proxyEmailFor("admin");
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "admin",
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    throw new Error(createErr?.message ?? "Failed to create admin user");
  }
  const userId = created.user.id;

  // 4. Insert app_users profile row.
  const { error: profileErr } = await supabaseAdmin.from("app_users").insert({
    id: userId,
    tenant_id: tenantId,
    username: "admin",
    display_name: "Admin",
    status: "active",
  });
  if (profileErr) throw new Error(profileErr.message);

  // 5. Insert tenant_members role.
  const { error: memberErr } = await supabaseAdmin.from("tenant_members").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "owner" as TenantRole,
  });
  if (memberErr && !/duplicate key/i.test(memberErr.message)) {
    throw new Error(memberErr.message);
  }

  return { ok: true, created: true, tenantId, adminUserId: userId };
});

// ---------------- Admin user-management flows ----------------

const RoleSlug = z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i, "Role slug may only contain letters, digits, underscore or hyphen");

const CreateUserInput = z.object({
  username: Username,
  displayName: z.string().min(1).max(128),
  password: Password,
  role: RoleSlug.default("viewer"),
});

async function assertSameTenant(callerTenantId: string, targetUserId: string) {
  const { data: target, error } = await supabaseAdmin
    .from("app_users")
    .select("tenant_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!target || target.tenant_id !== callerTenantId) {
    throw new Error("Forbidden: user does not belong to your tenant");
  }
}

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    const [userRows, memberRows] = await Promise.all([
      db
        .select({
          id: appUsers.id,
          tenant_id: appUsers.tenantId,
          username: appUsers.username,
          display_name: appUsers.displayName,
          avatar_key: appUsers.avatarKey,
          status: appUsers.status,
          created_at: appUsers.createdAt,
        })
        .from(appUsers)
        .where(eq(appUsers.tenantId, ctx.tenantId))
        .orderBy(appUsers.createdAt),
      db
        .select({
          user_id: tenantMembers.userId,
          role: tenantMembers.role,
        })
        .from(tenantMembers)
        .where(eq(tenantMembers.tenantId, ctx.tenantId)),
    ]);

    const memberRoleMap = new Map<string, string>();
    memberRows.forEach((m) => {
      memberRoleMap.set(m.user_id, m.role);
    });

    const items = userRows.map((u) => ({
      ...u,
      created_at: u.created_at ? (typeof u.created_at === "string" ? u.created_at : u.created_at.toISOString()) : new Date().toISOString(),
      role: memberRoleMap.get(u.id) || "viewer",
    }));

    return { items };
  });

const UpdateUserInput = z.object({
  userId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(128).optional(),
  role: RoleSlug.optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const updateAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpdateUserInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);
    await assertSameTenant(ctx.tenantId, data.userId);

    // Safeguard: do not allow demoting or disabling the last active Owner
    if (data.role || data.status === "disabled") {
      const { data: currentMember } = await supabaseAdmin
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", data.userId)
        .maybeSingle();

      if (currentMember?.role === "owner" && (data.role !== "owner" || data.status === "disabled")) {
        const { count, error: countErr } = await supabaseAdmin
          .from("tenant_members")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", ctx.tenantId)
          .eq("role", "owner");
        if (countErr) throw new Error(countErr.message);
        if ((count ?? 0) <= 1) {
          throw new Error("Cannot demote or disable the last Owner recovery account");
        }
      }
    }

    // 1. Update role in tenant_members if provided
    if (data.role) {
      await db
        .insert(tenantMembers)
        .values({
          tenantId: ctx.tenantId,
          userId: data.userId,
          role: data.role as TenantRole,
        })
        .onConflictDoUpdate({
          target: [tenantMembers.tenantId, tenantMembers.userId],
          set: { role: data.role as TenantRole },
        });
      invalidateRolePermissionsCache(ctx.tenantId, data.role);
    }

    // 2. Update display_name or status in app_users if provided
    const userUpdates: Record<string, any> = {};
    if (data.displayName !== undefined) userUpdates.displayName = data.displayName;
    if (data.status !== undefined) userUpdates.status = data.status;

    if (Object.keys(userUpdates).length > 0) {
      await db
        .update(appUsers)
        .set({ ...userUpdates, updatedAt: new Date() })
        .where(and(eq(appUsers.tenantId, ctx.tenantId), eq(appUsers.id, data.userId)));
    }

    return { ok: true };
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => CreateUserInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    const email = proxyEmailFor(data.username);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message ?? "Failed to create user");
    }
    const userId = created.user.id;

    const { error: profErr } = await supabaseAdmin.from("app_users").insert({
      id: userId,
      tenant_id: ctx.tenantId,
      username: data.username,
      display_name: data.displayName,
      status: "active",
    });
    if (profErr) throw new Error(profErr.message);

    const { error: tmErr } = await supabaseAdmin.from("tenant_members").insert({
      tenant_id: ctx.tenantId,
      user_id: userId,
      role: data.role,
    });
    if (tmErr) throw new Error(tmErr.message);
    invalidateRolePermissionsCache(ctx.tenantId, data.role);

    return { userId };
  });

const StatusInput = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "disabled"]),
});

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);
    await assertSameTenant(ctx.tenantId, data.userId);

    // Safeguard: do not allow disabling the last active Owner
    if (data.status === "disabled") {
      const { data: currentMember } = await supabaseAdmin
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", ctx.tenantId)
        .eq("user_id", data.userId)
        .maybeSingle();

      if (currentMember?.role === "owner") {
        const { count } = await supabaseAdmin
          .from("tenant_members")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", ctx.tenantId)
          .eq("role", "owner");
        if ((count ?? 0) <= 1) {
          throw new Error("Cannot disable the last Owner recovery account");
        }
      }
    }

    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ status: data.status })
      .eq("id", data.userId)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ban_duration: data.status === "disabled" ? "876000h" : "none",
      });
    } catch (banErr: any) {
      console.warn("[setUserStatus] auth ban sync warning:", banErr?.message);
    }
    return { ok: true };
  });

const ResetInput = z.object({
  userId: z.string().uuid(),
  newPassword: Password,
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ResetInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);
    await assertSameTenant(ctx.tenantId, data.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AvatarInput = z.object({
  userId: z.string().uuid(),
  avatarKey: z.string().min(1).max(512).nullable(),
});

export const updateUserAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => AvatarInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    // Users can update their own avatar; admins can update any tenant member.
    if (ctx.userId !== data.userId) {
      requireRole(ctx, ["owner", "admin"]);
    }
    await assertSameTenant(ctx.tenantId, data.userId);

    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ avatar_key: data.avatarKey })
      .eq("id", data.userId)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Permission / role management ----------------

/** List all permissions from the catalog. */
export const listPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const items = await db
      .select({
        slug: permissions.slug,
        label: permissions.label,
        category: permissions.category,
      })
      .from(permissions)
      .orderBy(permissions.category, permissions.slug);
    return { items };
  });

/** Get the permissions for the current user (by role + tenant). */
export const getUserPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const perms = await resolveEffectivePermissions(ctx.tenantId, ctx.role);
    return { role: ctx.role, permissions: [...perms] };
  });

/** List all tenant roles with their labels. */
export const listTenantRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;

    const items = await db
      .select({
        slug: tenantRoles.slug,
        label: tenantRoles.label,
        description: tenantRoles.description,
      })
      .from(tenantRoles)
      .where(eq(tenantRoles.tenantId, ctx.tenantId))
      .orderBy(tenantRoles.slug);
    return { items };
  });

const UpdateRoleLabelInput = z.object({
  slug: RoleSlug,
  label: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
});

/** Update a role's display label/description. */
export const updateTenantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpdateRoleLabelInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    await db
      .update(tenantRoles)
      .set({
        label: data.label,
        description: data.description ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(tenantRoles.tenantId, ctx.tenantId), eq(tenantRoles.slug, data.slug)));

    invalidateRolePermissionsCache(ctx.tenantId, data.slug);
    return { ok: true };
  });

/** List the current permissions for a given role in this tenant. */
export const listRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({ role: RoleSlug }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const perms = await resolveEffectivePermissions(ctx.tenantId, data.role);
    return { role: data.role, permissions: [...perms] };
  });

const SetRolePermissionsInput = z.object({
  role: RoleSlug,
  permissions: z.array(z.string().min(1).max(64)),
});

/** Replace all permissions for a given role atomically. Owner role cannot be modified. */
export const setRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => SetRolePermissionsInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    // Owner always gets everything — cannot be modified or reduced
    if (data.role === "owner") {
      throw new Error("Owner role permissions are unconditional and cannot be modified");
    }

    // Verify target role belongs to tenant or is a built-in role
    const isBuiltin = (BUILTIN_ROLE_SLUGS as readonly string[]).includes(data.role);
    const [roleRow] = await db
      .select({ slug: tenantRoles.slug })
      .from(tenantRoles)
      .where(and(eq(tenantRoles.tenantId, ctx.tenantId), eq(tenantRoles.slug, data.role)))
      .limit(1);

    if (!roleRow && !isBuiltin) {
      throw new Error(`Role '${data.role}' does not exist in this tenant`);
    }

    // Validate permission slugs exist in catalog
    const allSet = new Set<string>(ALL_PERMISSION_SLUGS);
    for (const slug of data.permissions) {
      if (!allSet.has(slug)) {
        throw new Error(`Invalid permission slug '${slug}'`);
      }
    }

    // Atomic update using PostgreSQL transaction
    await db.transaction(async (tx) => {
      // Ensure the role is recorded as initialized in tenant_roles
      const roleLabels: Record<string, string> = {
        admin: "مدير النظام (Administrator)",
        sales: "مشرف عمليات (Manager)",
        worker: "فني مهام (Task Worker)",
        viewer: "مشاهد (Viewer)",
      };

      await tx
        .insert(tenantRoles)
        .values({
          tenantId: ctx.tenantId,
          slug: data.role,
          label: roleLabels[data.role] || data.role,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [tenantRoles.tenantId, tenantRoles.slug],
          set: { updatedAt: new Date() },
        });

      await tx
        .delete(rolePermissions)
        .where(and(eq(rolePermissions.tenantId, ctx.tenantId), eq(rolePermissions.role, data.role)));

      if (data.permissions.length > 0) {
        const rows = data.permissions.map((slug) => ({
          tenantId: ctx.tenantId,
          role: data.role,
          permissionSlug: slug,
        }));
        await tx.insert(rolePermissions).values(rows);
      }
    });

    invalidateRolePermissionsCache(ctx.tenantId, data.role);
    return { ok: true };
  });

const CreateRoleInput = z.object({
  slug: RoleSlug,
  label: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
});

/** Create a new custom role for this tenant. Built-in slugs cannot be re-created. */
export const createTenantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => CreateRoleInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    const builtins = BUILTIN_ROLE_SLUGS as readonly string[];
    if (builtins.includes(data.slug)) {
      throw new Error(`Cannot create role '${data.slug}': it is a built-in role`);
    }

    await db.insert(tenantRoles).values({
      tenantId: ctx.tenantId,
      slug: data.slug,
      label: data.label,
      description: data.description ?? null,
    });

    invalidateRolePermissionsCache(ctx.tenantId, data.slug);
    return { ok: true };
  });

const DeleteRoleInput = z.object({
  slug: RoleSlug,
});

/** Delete a custom role. Built-in roles and roles with assigned users cannot be deleted. */
export const deleteTenantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DeleteRoleInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    const builtins = BUILTIN_ROLE_SLUGS as readonly string[];
    if (builtins.includes(data.slug)) {
      throw new Error(`Cannot delete built-in role '${data.slug}'`);
    }

    // Check if any user has this role
    const [assignedMember] = await db
      .select({ userId: tenantMembers.userId })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, ctx.tenantId), eq(tenantMembers.role, data.slug)))
      .limit(1);

    if (assignedMember) {
      throw new Error(`Cannot delete role '${data.slug}': users still have this role`);
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(rolePermissions)
        .where(and(eq(rolePermissions.tenantId, ctx.tenantId), eq(rolePermissions.role, data.slug)));

      await tx
        .delete(tenantRoles)
        .where(and(eq(tenantRoles.tenantId, ctx.tenantId), eq(tenantRoles.slug, data.slug)));
    });

    invalidateRolePermissionsCache(ctx.tenantId, data.slug);
    return { ok: true };
  });

/**
 * Returns dynamic, computed summaries for all roles in the tenant.
 * Used by the Predefined Profiles cards and Custom Roles table to guarantee
 * 100% backend synchronization without static claims.
 */
export const getRoleSummaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;

    // 1. Fetch tenant custom roles
    const customRoles = await db
      .select({
        slug: tenantRoles.slug,
        label: tenantRoles.label,
        description: tenantRoles.description,
      })
      .from(tenantRoles)
      .where(eq(tenantRoles.tenantId, ctx.tenantId))
      .orderBy(tenantRoles.slug);

    // 2. Fetch user counts per role in this tenant
    const members = await db
      .select({ role: tenantMembers.role })
      .from(tenantMembers)
      .where(eq(tenantMembers.tenantId, ctx.tenantId));

    const userCountMap = new Map<string, number>();
    for (const m of members ?? []) {
      userCountMap.set(m.role, (userCountMap.get(m.role) ?? 0) + 1);
    }

    // 3. Define the standard built-in roles metadata
    const builtinDefs: { slug: string; label: string; description: string }[] = [
      {
        slug: "admin",
        label: "مدير النظام (Administrator)",
        description: "صلاحيات إدارية وتشغيلية شاملة وفق التكوين المعتمد",
      },
      {
        slug: "sales",
        label: "مشرف عمليات (Manager)",
        description: "إدارة العمليات والإنتاج والمبيعات والتسليم",
      },
      {
        slug: "worker",
        label: "فني مهام (Task Worker)",
        description: "متابعة وتنفيذ المهام المسندة والتحديث الميداني",
      },
      {
        slug: "viewer",
        label: "مشاهد (Viewer)",
        description: "صلاحية العرض والاطلاع فقط دون أي تعديل",
      },
      {
        slug: "owner",
        label: "المالك (Owner)",
        description: "المالك الرئيسي للنظام بصلاحيات غير مقيدة",
      },
    ];

    // Combine custom and built-ins without duplicating built-ins
    const builtinSlugs = new Set(builtinDefs.map((b) => b.slug));
    const allRoles: { slug: string; label: string; description: string; isBuiltin: boolean }[] = [
      ...builtinDefs.map((b) => ({ ...b, isBuiltin: true })),
      ...customRoles
        .filter((c) => !builtinSlugs.has(c.slug))
        .map((c) => ({
          slug: c.slug,
          label: c.label,
          description: c.description || "",
          isBuiltin: false,
        })),
    ];

    // 4. Resolve effective permissions and analyze access levels for each role
    const items = await Promise.all(
      allRoles.map(async (r) => {
        const perms = await resolveEffectivePermissions(ctx.tenantId, r.slug);

        let noneCount = 0;
        let viewCount = 0;
        let workCount = 0;
        let manageCount = 0;
        const accessibleNames: string[] = [];

        for (const sec of APPLICATION_SECTIONS) {
          const hasView = sec.viewPerms.every((p) => perms.has(p));
          const hasWork = sec.workPerms.every((p) => perms.has(p));
          const hasManage = sec.managePerms.every((p) => perms.has(p));

          if (hasManage) {
            manageCount++;
            accessibleNames.push(sec.defaultTitle);
          } else if (hasWork) {
            workCount++;
            accessibleNames.push(sec.defaultTitle);
          } else if (hasView) {
            viewCount++;
            accessibleNames.push(sec.defaultTitle);
          } else {
            noneCount++;
          }
        }

        let specialCount = 0;
        for (const sp of SPECIAL_ACCESS_ITEMS) {
          if (perms.has(sp.slug)) {
            specialCount++;
          }
        }

        return {
          slug: r.slug,
          label: r.label,
          description: r.description,
          isBuiltin: r.isBuiltin,
          assignedUserCount: userCountMap.get(r.slug) ?? 0,
          accessibleSectionCount: APPLICATION_SECTIONS.length - noneCount,
          accessibleSectionNames: accessibleNames.slice(0, 8),
          accessLevelCounts: {
            none: noneCount,
            view: viewCount,
            work: workCount,
            manage: manageCount,
            special: specialCount,
          },
          permissions: [...perms],
        };
      }),
    );

    return { items };
  });
