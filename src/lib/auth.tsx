import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase, Profile, UserRole } from "./supabase";

const isBrowser = typeof window !== "undefined";

// ── Auth context type ──────────────────────────────────────────────────
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: profile?.role ?? null,
        loading,
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

// ── Route redirect helper ──────────────────────────────────────────────
export function getRedirectPath(role: UserRole | null, onboardingComplete?: boolean): string {
  if (!role) return "/login";
  if (role === "athlete") {
    return onboardingComplete === false ? "/onboarding" : "/athlete";
  }
  if (role === "admin") return "/admin";
  if (role === "superadmin") return "/superadmin";
  return "/";
}
