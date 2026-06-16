import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useRef,
  useCallback,
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
  /** True while the bootstrap server-fn is in flight (signed in but no memberships). */
  bootstrapping: boolean;
  /** Latest bootstrap error (null until a bootstrap attempt completes/fails). */
  bootstrapError: string | null;
  isStaff: boolean;
  signOut: () => Promise<void>;
  /** Re-trigger the membership load after an out-of-band mutation. */
  refresh: () => Promise<void>;
  /** Re-attempt the bootstrap server-fn call manually. */
  retryBootstrap: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  memberships: [],
  currentTenantId: null,
  currentRole: null,
  loading: true,
  bootstrapping: false,
  bootstrapError: null,
  isStaff: false,
  signOut: async () => {},
  refresh: async () => {},
  retryBootstrap: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  // Tracks the user id for which we've already attempted to bootstrap, so we
  // don't auto-retry on every render. A manual retry resets this.
  const bootstrappedForRef = useRef<string | null>(null);
  // Identifier for the in-flight bootstrap call. We discard results from any
  // call that started before a sign-out / re-auth.
  const bootstrapTokenRef = useRef(0);

  // `bootstrapMyTenant` as a function-bound RPC reference. The hook can only
  // be called inside the body of a component, so we expose it via the
  // `bootstrapFn` callback created inside AuthProvider.
  const bootstrapFn = useServerFn(bootstrapMyTenant);

  const runBootstrap = useCallback(
    async (uid: string) => {
      if (bootstrappedForRef.current === uid) return;
      // Mark this user id as in-progress so the bridge can re-fire on retry.
      const token = ++bootstrapTokenRef.current;
      setBootstrapping(true);
      setBootstrapError(null);
      try {
        const result = await bootstrapFn({ data: {} });
        if (token !== bootstrapTokenRef.current) return; // stale
        if (!result) {
          setBootstrapError("No response from server");
          return;
        }
        bootstrappedForRef.current = uid;
        if (typeof window !== "undefined") {
          window.localStorage.setItem("pelecanon:active-tenant", result.tenantId);
        }
        // Re-load memberships to pick up the canonical row.
        const list = await fetchMemberships(uid);
        if (token !== bootstrapTokenRef.current) return;
        setMemberships(list);
        setCurrentTenantId(result.tenantId);
      } catch (e: unknown) {
        if (token !== bootstrapTokenRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Mark as "attempted" so the bridge doesn't auto-retry on every render,
        // but DO surface the error so the UI can show a "retry" button.
        bootstrappedForRef.current = uid;
        setBootstrapError(msg);
        console.warn("[useAuth] bootstrap failed", msg);
      } finally {
        if (token === bootstrapTokenRef.current) {
          setBootstrapping(false);
        }
      }
    },
    [bootstrapFn],
  );

  // Initial session load. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          const list = await fetchMemberships(data.session.user.id);
          if (cancelled) return;
          setMemberships(list);
          const stored =
            typeof window !== "undefined"
              ? window.localStorage.getItem("pelecanon:active-tenant")
              : null;
          setCurrentTenantId(
            stored && list.some((l) => l.tenantId === stored)
              ? stored
              : list[0]?.tenantId ?? null,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      // Skip INITIAL_SESSION — getSession above already loaded it. But other
      // changes (sign-in, sign-out, token refresh) still flow through here.
      setSession(sess);
      setUser(sess?.user ?? null);
      setMemberships([]);
      setCurrentTenantId(null);
      setBootstrapping(false);
      setBootstrapError(null);
      bootstrappedForRef.current = null;
      bootstrapTokenRef.current++;
      if (sess?.user) {
        void (async () => {
          const list = await fetchMemberships(sess.user.id);
          setMemberships(list);
          setCurrentTenantId(list[0]?.tenantId ?? null);
        })();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-bootstrap when memberships are empty and the user is known.
  useEffect(() => {
    if (!user) return;
    if (memberships.length > 0) return;
    if (bootstrappedForRef.current === user.id) return;
    if (bootstrapping) return;
    void runBootstrap(user.id);
  }, [user, memberships.length, bootstrapping, runBootstrap]);

  async function fetchMemberships(uid: string): Promise<Membership[]> {
    const { data } = await supabase
      .from("tenant_members")
      .select("role, tenant_id")
      .eq("user_id", uid);
    return (data ?? []).map((m: any) => ({
      tenantId: m.tenant_id as string,
      tenantSlug: null,
      tenantName: null,
      role: m.role as TenantRole,
    }));
  }

  async function refresh() {
    if (!user) return;
    const list = await fetchMemberships(user.id);
    setMemberships(list);
    if (currentTenantId && !list.some((l) => l.tenantId === currentTenantId)) {
      setCurrentTenantId(list[0]?.tenantId ?? null);
    }
  }

  const retryBootstrap = useCallback(async () => {
    if (!user) return;
    // Allow another attempt.
    bootstrappedForRef.current = null;
    bootstrapTokenRef.current++;
    setBootstrapError(null);
    await runBootstrap(user.id);
  }, [user, runBootstrap]);

  async function signOut() {
    await supabase.auth.signOut();
    setMemberships([]);
    setCurrentTenantId(null);
    setBootstrapping(false);
    setBootstrapError(null);
    bootstrappedForRef.current = null;
    bootstrapTokenRef.current++;
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
      bootstrapping,
      bootstrapError,
      isStaff: memberships.some((m) => m.role !== "viewer"),
      signOut,
      refresh,
      retryBootstrap,
    };
  }, [
    user,
    session,
    memberships,
    currentTenantId,
    loading,
    bootstrapping,
    bootstrapError,
    retryBootstrap,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
