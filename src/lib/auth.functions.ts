import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const Username = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9._-]+$/i, "Username may only contain letters, digits, dot, underscore or hyphen");

const Password = z.string().min(6).max(128);

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
 * Returns the currently-authenticated user (read from bearer cookie/header)
 * plus their app_users profile. Used by the client to bootstrap /me
 * information without an extra auth.admin.getUserById call.
 */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    const headers = request?.headers;
    const auth = headers?.get("authorization") ?? headers?.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) return { user: null, profile: null };

    const supabaseAdmin_ = supabaseAdmin;
    const { data: userData, error: uErr } = await supabaseAdmin_.auth.getUser(token);
    if (uErr || !userData?.user) return { user: null, profile: null };

    const { data: profile } = await supabaseAdmin_
      .from("app_users")
      .select("id, status, tenant_id, username, display_name, avatar_key")
      .eq("id", userData.user.id)
      .maybeSingle();

    return { user: userData.user, profile: profile ?? null };
  },
);

/**
 * Idempotent: ensures the default tenant exists AND that an `admin` user
 * exists with the role `owner`. Runs only if no admin user is currently
 * active. We never return a password — admins issue those via
 * resetPassword after.
 */
export const ensureBootstrapAdmin = createServerFn({ method: "POST" }).handler(
  async () => {
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
      role: "owner" as any,
    });
    if (memberErr && !/duplicate key/i.test(memberErr.message)) {
      throw new Error(memberErr.message);
    }

    return { ok: true, created: true, tenantId, adminUserId: userId };
  },
);

// ---------------- Admin user-management flows ----------------

const CreateUserInput = z.object({
  username: Username,
  displayName: z.string().min(1).max(128),
  password: Password,
  role: z.enum(["owner", "admin", "sales", "worker", "viewer"]).default("viewer"),
});

export const listAppUsers = createServerFn({ method: "GET" }).handler(async () => {
  // Service-role client bypasses RLS; admin gating happens in the page
  // before this fn is called.
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, tenant_id, username, display_name, avatar_key, status, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
});

export const createAppUser = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateUserInput.parse(d))
  .handler(async ({ data }) => {
    // Find the caller's tenant via their membership.
    const request = getRequest();
    const headers = request?.headers;
    const auth = headers?.get("authorization") ?? headers?.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) throw new Error("Unauthorized");

    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) throw new Error("Unauthorized");

    // Caller must be owner or admin in some tenant.
    const { data: tm } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", caller.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!tm || !["owner", "admin"].includes(tm.role)) {
      throw new Error("Forbidden: admin required");
    }
    const tenantId = tm.tenant_id;

    // Create auth user. Use generated email.
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

    // Profile row.
    const { error: profErr } = await supabaseAdmin.from("app_users").insert({
      id: userId,
      tenant_id: tenantId,
      username: data.username,
      display_name: data.displayName,
      status: "active",
    });
    if (profErr) throw new Error(profErr.message);

    // Tenant role.
    const { error: tmErr } = await supabaseAdmin.from("tenant_members").insert({
      tenant_id: tenantId,
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
  .inputValidator((d) => StatusInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ResetInput = z.object({
  userId: z.string().uuid(),
  newPassword: Password,
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => ResetInput.parse(d))
  .handler(async ({ data }) => {
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
  .inputValidator((d) => AvatarInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ avatar_key: data.avatarKey })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });