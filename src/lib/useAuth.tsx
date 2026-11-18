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
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { TenantRole } from "@/lib/tenant-context";
import { bootstrapMyTenant } from "@/lib/bootstrap-tenant.functions";
import { getUserPermissions } from "@/lib/auth.functions";

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
  permissions: string[];
  permissionsLoaded: boolean;
  hasPermission: (slug: string) => boolean;
  hasAnyPermission: (slugs: string[]) => boolean;
  loading: boolean;
  /** True while the bootstrap server-fn is in flight. */
  bootstrapping: boolean;
  /** Last bootstrap error (null until a bootstrap attempt completes/fails). */
  bootstrapError: string | null;
  /** Has `bootstrapMyTenant` been called and finished (success OR failure). */
  bootstrapAttempted: boolean;
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
  permissions: [],
  permissionsLoaded: false,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  loading: true,
  bootstrapping: false,
  bootstrapError: null,
  bootstrapAttempted: false,
  isStaff: false,
  signOut: async () => {},
  refresh: async () => {},
  retryBootstrap: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempted, setBootstrapAttempted] = useState(false);
  const bootstrappedForRef = useRef<string | null>(null);
  const bootstrapTokenRef = useRef(0);

  const bootstrapFn = useServerFn(bootstrapMyTenant);
  const getPermsFn = useServerFn(getUserPermissions);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await getPermsFn();
      if (res && Array.isArray(res.permissions)) {
        setPermissions(res.permissions);
      }
    } catch (e) {
      console.warn("[useAuth] fetchPermissions failed", e);
    } finally {
      setPermissionsLoaded(true);
    }
  }, [getPermsFn]);

  const runBootstrap = useCallback(
    async (uid: string) => {
      const token = ++bootstrapTokenRef.current;
      setBootstrapping(true);
      setBootstrapError(null);
      setBootstrapAttempted(false);
      try {
        const raw = await bootstrapFn({ data: {} });
        if (token !== bootstrapTokenRef.current) return;
        const result: any =
          raw && typeof raw === "object" && "result" in raw
            ? (raw as any).result
            : raw;
        if (!result) {
          setBootstrapError("No response from server");
          setBootstrapAttempted(true);
          return;
        }
        bootstrappedForRef.current = uid;

        const serverMemberships: Membership[] = (result.memberships ?? []).map(
          (m: any) => ({
            tenantId: m.tenantId as string,
            tenantSlug: (m.tenantSlug ?? null) as string | null,
            tenantName: (m.tenantName ?? null) as string | null,
            role: m.role as TenantRole,
          }),
        );
        if (token !== bootstrapTokenRef.current) return;
        setMemberships(serverMemberships);

        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "pelecanon:active-tenant",
            result.tenantId,
          );
        }
        setCurrentTenantId(result.tenantId);
        setBootstrapAttempted(true);
      } catch (e: unknown) {
        if (token !== bootstrapTokenRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[useAuth] bootstrap FAILED", msg, e);
        bootstrappedForRef.current = uid;
        setBootstrapError(msg);
        setBootstrapAttempted(true);
      } finally {
        if (token === bootstrapTokenRef.current) {
          setBootstrapping(false);
        }
      }
    },
    [bootstrapFn],
  );

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
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess?.user) {
        setMemberships([]);
        setCurrentTenantId(null);
        setBootstrapping(false);
        setBootstrapError(null);
        setBootstrapAttempted(false);
        bootstrappedForRef.current = null;
        bootstrapTokenRef.current++;
        return;
      }
      // If the session belongs to the same user and bootstrap has already succeeded, do not reset memberships or flash loading
      if (bootstrappedForRef.current === sess.user.id) {
        return;
      }
      setMemberships([]);
      setCurrentTenantId(null);
      setBootstrapping(false);
      setBootstrapError(null);
      setBootstrapAttempted(false);
      bootstrappedForRef.current = null;
      bootstrapTokenRef.current++;
      void runBootstrap(sess.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    if (memberships.length > 0) return;
    if (bootstrappedForRef.current === user.id) return;
    if (bootstrapping) return;
    if (bootstrapAttempted && !bootstrapError) return;
    void runBootstrap(user.id);
  }, [
    user,
    memberships.length,
    bootstrapping,
    bootstrapAttempted,
    bootstrapError,
    runBootstrap,
  ]);

  async function fetchMemberships(uid: string): Promise<Membership[]> {
    try {
      const { data, error } = await supabase
        .from("tenant_members")
        .select("role, tenant_id")
        .eq("user_id", uid);
      if (error) {
        console.warn("[useAuth] fetchMemberships error", error?.message ?? error);
        return [];
      }
      return (data ?? []).map((m: any) => ({
        tenantId: m.tenant_id as string,
        tenantSlug: null,
        tenantName: null,
        role: m.role as TenantRole,
      }));
    } catch (e: unknown) {
      console.warn("[useAuth] fetchMemberships threw", e);
      return [];
    }
  }

  const currentRole = useMemo(() => {
    const current = memberships.find((m) => m.tenantId === currentTenantId) ?? null;
    return current?.role ?? null;
  }, [memberships, currentTenantId]);

  useEffect(() => {
    if (user && currentTenantId && currentRole) {
      if (currentRole === "owner") {
        setPermissions([]);
        setPermissionsLoaded(true);
      } else {
        setPermissionsLoaded(false);
        void fetchPermissions();
      }
    } else {
      setPermissions([]);
      setPermissionsLoaded(false);
    }
  }, [user, currentTenantId, currentRole, fetchPermissions]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const list = await fetchMemberships(user.id);
    setMemberships(list);
    if (currentTenantId && !list.some((l) => l.tenantId === currentTenantId)) {
      setCurrentTenantId(list[0]?.tenantId ?? null);
    }
    await fetchPermissions();
  }, [user, currentTenantId, fetchPermissions]);

  const retryBootstrap = useCallback(async () => {
    if (!user) return;
    bootstrappedForRef.current = null;
    bootstrapTokenRef.current++;
    setBootstrapError(null);
    setBootstrapAttempted(false);
    await runBootstrap(user.id);
  }, [user, runBootstrap]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("pelecanon:active-tenant");
    }
    setMemberships([]);
    setCurrentTenantId(null);
    setPermissions([]);
    setPermissionsLoaded(false);
    setBootstrapping(false);
    setBootstrapError(null);
    setBootstrapAttempted(false);
    bootstrappedForRef.current = null;
    bootstrapTokenRef.current++;
  }, [queryClient]);

  const hasPermission = useCallback(
    (slug: string) => {
      if (currentRole === "owner") return true;
      return permissions.includes(slug);
    },
    [currentRole, permissions],
  );

  const hasAnyPermission = useCallback(
    (slugs: string[]) => {
      if (currentRole === "owner") return true;
      return slugs.some((s) => permissions.includes(s));
    },
    [currentRole, permissions],
  );

  const value = useMemo<AuthCtx>(() => {
    return {
      user,
      session,
      memberships,
      currentTenantId,
      currentRole,
      permissions,
      permissionsLoaded,
      hasPermission,
      hasAnyPermission,
      loading,
      bootstrapping,
      bootstrapError,
      bootstrapAttempted,
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
    currentRole,
    permissions,
    hasPermission,
    hasAnyPermission,
    loading,
    bootstrapping,
    bootstrapError,
    bootstrapAttempted,
    signOut,
    refresh,
    retryBootstrap,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);