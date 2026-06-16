import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useRef,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { TenantRole } from "@/lib/tenant-context";
import { bootstrapMyTenant } from "@/lib/bootstrap-tenant.functions";

interface Membership {
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  role: TenantRole;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  memberships: Membership[];
  currentTenantId: string | null;
  currentRole: TenantRole | null;
  loading: boolean;
  isStaff: boolean;
  signOut: () => Promise<void>;
  /** Re-trigger the membership load after an out-of-band mutation. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  memberships: [],
  currentTenantId: null,
  currentRole: null,
  loading: true,
  isStaff: false,
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the user id for which we've already attempted to bootstrap.
  const bootstrappedForRef = useRef<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setMemberships([]);
      setCurrentTenantId(null);
      bootstrappedForRef.current = null;
      if (sess?.user) {
        setTimeout(() => loadMemberships(sess.user.id), 0);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadMemberships(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadMemberships(uid: string) {
    const list = await fetchMemberships(uid);
    setMemberships(list);

    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem("pelecanon:active-tenant")
      : null;
    const next = stored && list.some((l) => l.tenantId === stored)
      ? stored
      : list[0]?.tenantId ?? null;
    setCurrentTenantId(next);
  }

  async function fetchMemberships(uid: string): Promise<Membership[]> {
    const { data } = await supabase
      .from("tenant_members")
      .select("role, tenant_id, tenants(slug, name)")
      .eq("user_id", uid);
    return (data ?? []).map((m: any) => ({
      tenantId: m.tenant_id as string,
      tenantSlug: m.tenants?.slug ?? null,
      tenantName: m.tenants?.name ?? null,
      role: m.role as TenantRole,
    }));
  }

  /** Called by TenantBootstrapBridge once `bootstrapMyTenant` returns. */
  function applyBootstrap(uid: string, resultTenantId: string) {
    bootstrappedForRef.current = uid;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("pelecanon:active-tenant", resultTenantId);
    }
    void loadMemberships(uid);
  }

  async function refresh() {
    if (!user) return;
    await loadMemberships(user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMemberships([]);
    setCurrentTenantId(null);
    bootstrappedForRef.current = null;
  }

  const value = useMemo<AuthCtx>(() => {
    const current = memberships.find((m) => m.tenantId === currentTenantId) ?? null;
    return {
      user,
      session,
      memberships,
      currentTenantId,
      currentRole: current?.role ?? null,
      loading,
      isStaff: memberships.some((m) => m.role !== "viewer"),
      signOut,
      refresh,
    };
  }, [user, session, memberships, currentTenantId, loading]);

  return (
    <Ctx.Provider value={value}>
      <TenantBootstrapBridge
        userId={user?.id ?? null}
        bootstrapPending={!loading && !!user && memberships.length === 0}
        bootstrappedFor={bootstrappedForRef.current}
        onResult={applyBootstrap}
      />
      {children}
    </Ctx.Provider>
  );
}

/**
 * Side-effect child component that owns the bootstrap server-fn call.
 * Lives inside the Provider so it can report its result back. Renders
 * nothing — it only runs effects.
 */
function TenantBootstrapBridge({
  userId,
  bootstrapPending,
  bootstrappedFor,
  onResult,
}: {
  userId: string | null;
  bootstrapPending: boolean;
  bootstrappedFor: string | null;
  onResult: (uid: string, tenantId: string) => void;
}) {
  const bootstrapFn = useServerFn(bootstrapMyTenant);
  const ranRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bootstrapPending || !userId) return;
    // Avoid re-running for the same user id.
    if (ranRef.current === userId) return;
    if (bootstrappedFor === userId) return;
    ranRef.current = userId;

    let cancelled = false;
    (async () => {
      try {
        const result = await bootstrapFn({ data: {} });
        if (cancelled || !result) return;
        onResult(userId, result.tenantId);
      } catch (e) {
        // Silent: the user will just see the "no team" UI rather than a
        // permission-denied 500. The postflight SQL catches the
        // configuration drift if it persists.
        console.warn("[TenantBootstrapBridge] bootstrap failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapPending, userId, bootstrappedFor, bootstrapFn, onResult]);

  return null;
}

export const useAuth = () => useContext(Ctx);
