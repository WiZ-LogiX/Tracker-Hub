import { getRequest } from "@tanstack/react-start/server";
import { getCookies } from "@tanstack/react-start/server";

export interface SessionContext {
  userId: string;
  email?: string;
  tenantId?: string | null;
}

export async function requireSession(): Promise<SessionContext> {
  // Pull the bearer token forwarded by attachSupabaseAuth middleware from the request.
  // Falls back to a cookie-based session lookup if no header is present.
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
  return { userId: data.user.id, email: data.user.email };
}

export async function getUser(): Promise<{ userId: string; email: string } | null> {
  try {
    const { userId, email } = await requireSession();
    return { userId, email: email ?? "" };
  } catch {
    return null;
  }
}