import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase, Profile, UserRole } from "./supabase";

const isBrowser = typeof window !== "undefined";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  devRole: UserRole | null;
  setDevRole: (role: UserRole | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const MOCK_DEV_PROFILES: Record<UserRole, Profile> = {
  athlete: {
    id: "dev-athlete-id",
    role: "athlete",
    full_name: "Aarav Sharma (Demo Athlete)",
    email: "athlete@boxos.in",
    phone: null,
    avatar_url: null,
    is_active: true,
    academy_id: "acad-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    academy_code_verified: true,
  },
  coach: {
    id: "dev-coach-id",
    role: "coach",
    full_name: "Coach Ravi (Demo Coach)",
    email: "coach@boxos.in",
    phone: null,
    avatar_url: null,
    is_active: true,
    academy_id: "acad-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  admin: {
    id: "dev-admin-id",
    role: "admin",
    full_name: "Admin Vikram (Demo Admin)",
    email: "admin@boxos.in",
    phone: null,
    avatar_url: null,
    is_active: true,
    academy_id: "acad-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  superadmin: {
    id: "dev-superadmin-id",
    role: "superadmin",
    full_name: "Superadmin (Demo Superadmin)",
    email: "superadmin@boxos.in",
    phone: null,
    avatar_url: null,
    academy_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  external_judge: {
    id: "dev-judge-id",
    role: "external_judge",
    full_name: "Judge Arun Kumar (Demo Judge)",
    email: "judge@boxos.in",
    phone: null,
    avatar_url: null,
    academy_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

// ── Provider ───────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [devRole, setDevRoleState] = useState<UserRole | null>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("boxos_dev_role") as UserRole) || null;
    }
    return null;
  });

  const setDevRole = (r: UserRole | null) => {
    setDevRoleState(r);
    if (typeof window !== "undefined") {
      if (r) localStorage.setItem("boxos_dev_role", r);
      else localStorage.removeItem("boxos_dev_role");
    }
  };

  async function fetchProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        console.error("fetchProfile error:", error.message);
      }
      if (data) return data as Profile;

      // Fallback: auto-create missing profile row if logged in user has no row
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user;
      if (u) {
        const deadline = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
        const { data: newP } = await supabase
          .from("profiles")
          .upsert({
            id: userId,
            role: "athlete",
            full_name: u.user_metadata?.full_name || "Athlete",
            email: u.email || null,
            is_active: true,
            academy_code_verified: false,
            academy_code_deadline: deadline,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" })
          .select("*")
          .maybeSingle();
        return newP as Profile | null;
      }
      return null;
    } catch (err) {
      console.error("fetchProfile exception:", err);
      return null;
    }
  }

  useEffect(() => {
    if (!isBrowser) return;

    let cancelled = false;

    async function loadUserAndProfile(s: Session | null) {
      setSession(s);
      const u = s?.user ?? null;
      setUser(u);

      if (u) {
        const p = await fetchProfile(u.id);
        if (!cancelled) {
          setProfile(p);
        }
      } else {
        if (!cancelled) {
          setProfile(null);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    // Initialize session & profile on page load
    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("getSession error:", error.message);
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      loadUserAndProfile(initialSession);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!cancelled) {
          loadUserAndProfile(newSession);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      // 1. Clear any existing session to ensure a clean slate for the new account
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) return { error: error as Error };

      if (data.user) {
        const deadline = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("profiles").upsert({
          id: data.user.id,
          role: "athlete",
          full_name: fullName || null,
          email: email,
          is_active: true,
          academy_code_verified: false,
          academy_code_deadline: deadline,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("signOut error:", err);
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      if (typeof window !== "undefined") {
        try {
          // Clear any persisted session keys
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (key.startsWith("sb-") || key.includes("supabase") || key.includes("auth"))) {
              localStorage.removeItem(key);
            }
          }
        } catch (_) {}
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }
  };

  const effectiveProfile = devRole
    ? {
        ...MOCK_DEV_PROFILES[devRole],
        ...(profile ? { full_name: profile.full_name, email: profile.email } : {}),
        role: devRole,
      }
    : profile;

  const effectiveUser = user ?? (devRole ? ({ id: effectiveProfile?.id, email: effectiveProfile?.email } as any) : null);
  const effectiveSession = session ?? (devRole ? ({ user: effectiveUser } as any) : null);
  const effectiveRole = devRole ?? profile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        session: effectiveSession,
        user: effectiveUser,
        profile: effectiveProfile,
        role: effectiveRole,
        loading,
        devRole,
        setDevRole,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function getRedirectPath(role: UserRole | null, onboardingComplete?: boolean): string {
  if (!role) return "/login";
  if (role === "athlete") {
    return onboardingComplete === false ? "/onboarding" : "/athlete";
  }
  if (role === "admin") return "/admin";
  if (role === "superadmin") return "/superadmin";
  if (role === "coach") return "/coach";
  if (role === "external_judge") return "/judge";
  return "/";
}
