import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  requireRole,
  hasPermission,
  type TenantRole,
  type TenantContext,
  type UserPermissions,
} from "@/lib/tenant-context";

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

    return {
      session: res.session,
      user: res.user,
      profile,
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

    const { data, error } = await supabaseAdmin
      .from("app_users")
      .select("id, tenant_id, username, display_name, avatar_key, status, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
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

    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ status: data.status })
      .eq("id", data.userId)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
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
    const { data, error } = await supabaseAdmin
      .from("permissions")
      .select("slug, label, category")
      .order("category", { ascending: true })
      .order("slug", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

/** Get the permissions for the current user (by role + tenant). */
export const getUserPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;

    const { data, error } = await supabaseAdmin
      .from("role_permissions")
      .select("permission_slug")
      .eq("tenant_id", ctx.tenantId)
      .eq("role", ctx.role);
    if (error) throw new Error(error.message);

    const perms = new Set<string>((data ?? []).map((r: any) => r.permission_slug));
    const result: UserPermissions = { role: ctx.role, permissions: perms };
    return { role: result.role, permissions: [...result.permissions] };
  });

/** List all tenant roles with their labels. */
export const listTenantRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;

    const { data, error } = await supabaseAdmin
      .from("tenant_roles")
      .select("slug, label, description")
      .eq("tenant_id", ctx.tenantId)
      .order("slug", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
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

    const { error } = await supabaseAdmin
      .from("tenant_roles")
      .update({ label: data.label, description: data.description ?? null, updated_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId)
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** List the current permissions for a given role in this tenant. */
export const listRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({ role: RoleSlug }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;

    const { data: rows, error } = await supabaseAdmin
      .from("role_permissions")
      .select("permission_slug")
      .eq("tenant_id", ctx.tenantId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);

    return { role: data.role, permissions: (rows ?? []).map((r) => r.permission_slug) };
  });

const SetRolePermissionsInput = z.object({
  role: RoleSlug,
  permissions: z.array(z.string().min(1).max(64)),
});

/** Replace all permissions for a given role. Owner role permissions cannot be removed. */
export const setRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => SetRolePermissionsInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    // Owner always gets everything — enforce in DB
    const roleToSet = data.role === "owner" ? "owner" : data.role;

    // Delete existing
    const { error: delErr } = await supabaseAdmin
      .from("role_permissions")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("role", roleToSet);
    if (delErr) throw new Error(delErr.message);

    // Insert new (skip empty for owner — owner is always all-permissions via hasPermission bypass)
    if (roleToSet !== "owner" && data.permissions.length > 0) {
      const rows = data.permissions.map((slug) => ({
        tenant_id: ctx.tenantId,
        role: roleToSet,
        permission_slug: slug,
      }));
      const { error: insErr } = await supabaseAdmin
        .from("role_permissions")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

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

    // Prevent creating a role with a built-in slug
    const builtins = ["owner", "admin", "sales", "worker", "viewer"];
    if (builtins.includes(data.slug)) {
      throw new Error(`Cannot create role '${data.slug}': it is a built-in role`);
    }

    const { error } = await supabaseAdmin.from("tenant_roles").insert({
      tenant_id: ctx.tenantId,
      slug: data.slug,
      label: data.label,
      description: data.description ?? null,
    });
    if (error) throw new Error(error.message);
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

    const builtins = ["owner", "admin", "sales", "worker", "viewer"];
    if (builtins.includes(data.slug)) {
      throw new Error(`Cannot delete built-in role '${data.slug}'`);
    }

    // Check if any user has this role
    const { data: members, error: memErr } = await supabaseAdmin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("role", data.slug)
      .limit(1);
    if (memErr) throw new Error(memErr.message);
    if (members && members.length > 0) {
      throw new Error(`Cannot delete role '${data.slug}': ${members.length} user(s) still have this role`);
    }

    // Delete permissions first
    await supabaseAdmin
      .from("role_permissions")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("role", data.slug);

    // Delete the role
    const { error } = await supabaseAdmin
      .from("tenant_roles")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
