import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, profileApi, roleApi, type ProfileRow, type UpdateProfileInput } from "@/integrations/supabase/api";
import type { Session, User } from "@supabase/supabase-js";

export type Role = "admin" | "shipper" | "customer" | null;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: Role;
  profile: ProfileRow | null;
  displayName: string;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = authApi.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setLoading(true);
        setTimeout(() => fetchAccount(s.user.id), 0);
      } else {
        setRole(null);
        setProfile(null);
        setLoading(false);
      }
    });
    authApi.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchAccount(s.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchAccount(uid: string) {
    const [rolesResult, profileResult] = await Promise.all([
      roleApi.getUserRoles(uid),
      profileApi.getProfile(uid),
    ]);

    const roles = rolesResult.data ?? [];
    if (roles.some((item) => item.role === "admin")) setRole("admin");
    else if (roles.some((item) => item.role === "shipper")) setRole("shipper");
    else if (roles.some((item) => item.role === "customer")) setRole("customer");
    else setRole(null);

    setProfile(profileResult.data ?? null);
    setLoading(false);
  }

  const displayName = useMemo(() => {
    const metadataName = typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
    return profile?.display_name?.trim() || metadataName.trim() || user?.email?.split("@")[0] || "Người dùng";
  }, [profile?.display_name, user?.email, user?.user_metadata]);

  const signOut = async () => {
    await authApi.signOut();
  };

  const refreshAccount = async () => {
    if (user) await fetchAccount(user.id);
  };

  const updateProfile = async (input: UpdateProfileInput) => {
    if (!user) return { ok: false, error: "Bạn chưa đăng nhập" };

    const { data, error } = await profileApi.upsertProfile(user.id, input);
    if (error) return { ok: false, error: error.message };

    setProfile(data);
    return { ok: true };
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, displayName, loading, signOut, refreshAccount, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
