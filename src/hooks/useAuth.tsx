import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authApi, roleApi } from "@/integrations/supabase/api";
import type { Session, User } from "@supabase/supabase-js";

type Role = "admin" | "shipper" | null;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: Role;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = authApi.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchRole(s.user.id), 0);
      } else {
        setRole(null);
        setLoading(false);
      }
    });
    authApi.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchRole(s.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(uid: string) {
    const { data } = await roleApi.getUserRoles(uid);
    if (data?.some((r) => r.role === "admin")) setRole("admin");
    else if (data?.some((r) => r.role === "shipper")) setRole("shipper");
    else setRole(null);
    setLoading(false);
  }

  const signOut = async () => {
    await authApi.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
