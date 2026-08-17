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
        return null;
      }
      return data as Profile | null;
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
        if (!cancelled) setProfile(p);
      } else {
        if (!cancelled) setProfile(null);
      }
      if (!cancelled) setLoading(false);
    }

    // Initialize on load with resilient refresh token error catching
    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (cancelled) return;
      if (error || (s && s.expires_at && s.expires_at * 1000 < Date.now())) {
        try {
          supabase.auth.signOut({ scope: "local" });
        } catch {}
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      loadUserAndProfile(s);
    }).catch((err) => {
      console.warn("Auth initialization error, resetting session:", err);
      try {
        supabase.auth.signOut({ scope: "local" });
      } catch {}
      if (!cancelled) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    // Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !newSession) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      } else {
        loadUserAndProfile(newSession);
      }
    });

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

      // handle_new_user() trigger auto-creates profiles row on signup
      // (defined in file.sql Migration 0001) — no manual insert needed

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
        role: (profile?.role as UserRole) ?? null,
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

export function getRedirectPath(role: UserRole | null, onboardingComplete?: boolean): string {
  if (!role) return "/login";
  if (role === "boxos_admin") return "/boxos-admin";
  if (role === "athlete") return "/athlete";
  if (role === "admin") return "/admin";
  if (role === "superadmin") return "/superadmin";
  if (role === "coach") return "/coach";
  if (role === "external_judge") return "/judge";
  return "/";
}
