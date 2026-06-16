import { getRequest } from "@tanstack/react-start/server";

export interface SessionContext {
  userId: string;
  email?: string;
  tenantId?: string | null;
}

/**
 * Resolve the request user's id + email + first tenant_id.
 *
 * Used by server functions that need a session but don't already have
 * `requireSupabaseAuth` in their middleware chain. When called from inside
 * a chain that already has it, the `userId` from `context` is enough — this
 * helper resolves the row across the network and is slower than the
 * middleware-bound path.
 */
export async function requireSession(): Promise<SessionContext> {
  const request = getRequest();
  const headers = request?.headers;
  const auth = headers?.get("authorization") ?? headers?.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

  if (!token) {
    throw new Error("Unauthorized: missing bearer token");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("Unauthorized: invalid or expired token");
  }
  const { data: membership } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    userId: data.user.id,
    email: data.user.email,
    tenantId: membership?.tenant_id ?? null,
  };
}

export async function getUser(): Promise<{ userId: string; email: string } | null> {
  try {
    const { userId, email } = await requireSession();
    return { userId, email: email ?? "" };
  } catch {
    return null;
  }
}
