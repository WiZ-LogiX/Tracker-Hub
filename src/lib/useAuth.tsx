import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
  useMemo,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { TenantRole } from "@/lib/tenant-context";

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
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Defer to the next tick so the auth state observes a stable user.
        setTimeout(() => loadMemberships(sess.user.id), 0);
      } else {
        setMemberships([]);
        setCurrentTenantId(null);
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
    // Hydrate the user's tenant memberships. We use a left join on tenants so
    // the UI can render a tenant label without a second round-trip.
    const { data } = await supabase
      .from("tenant_members")
      .select("role, tenant_id, tenants(slug, name)")
      .eq("user_id", uid);
    const list: Membership[] = (data ?? []).map((m: any) => ({
      tenantId: m.tenant_id as string,
      tenantSlug: m.tenants?.slug ?? null,
      tenantName: m.tenants?.name ?? null,
      role: m.role as TenantRole,
    }));
    setMemberships(list);

    // Default to the most recently created membership; expose a setter so
    // Phase 2 can drive a tenant switcher. The middle of the screen reads
    // currentTenantId to scope admin queries.
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem("pelecanon:active-tenant")
      : null;
    const next = stored && list.some((l) => l.tenantId === stored)
      ? stored
      : list[0]?.tenantId ?? null;
    setCurrentTenantId(next);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMemberships([]);
    setCurrentTenantId(null);
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
    };
  }, [user, session, memberships, currentTenantId, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
