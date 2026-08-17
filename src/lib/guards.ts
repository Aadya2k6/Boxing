import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { UserRole } from "./supabase";

// ── Generic protected route hook ───────────────────────────────────────
// Usage: call at the top of any protected route component
export function useRequireAuth(requiredRole?: UserRole) {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // Not logged in
    if (!session) {
      navigate({ to: "/login" });
      return;
    }

    // Wait until profile is fetched
    if (!profile) return;

    // Wrong role -> navigate to correct role dashboard
    if (requiredRole && profile.role !== requiredRole) {
      if (profile.role === "admin") {
        navigate({ to: "/admin" });
      } else if (profile.role === "superadmin") {
        navigate({ to: "/superadmin" });
      } else if (profile.role === "athlete") {
        navigate({ to: "/athlete" });
      } else if (profile.role === "coach") {
        navigate({ to: "/coach" as any });
      } else if (profile.role === "external_judge") {
        navigate({ to: "/judge" as any });
      } else {
        navigate({ to: "/login" });
      }
    }
  }, [session, profile, loading, requiredRole, navigate]);

  return { session, profile, loading };
}

// ── Athlete route guard ───────────────────────────────────────────────
export function useRequireAthlete() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // Not logged in -> redirect to login page
    if (!session) {
      navigate({ to: "/login" });
      return;
    }

    // Wait until profile is loaded
    if (!profile) return;

    if (profile.role !== "athlete") {
      if (profile.role === "admin") {
        navigate({ to: "/admin" });
      } else if (profile.role === "superadmin") {
        navigate({ to: "/superadmin" });
      } else if (profile.role === "coach") {
        navigate({ to: "/coach" as any });
      } else if (profile.role === "external_judge") {
        navigate({ to: "/judge" as any });
      } else {
        navigate({ to: "/login" });
      }
    }
  }, [session, profile, loading, navigate]);

  return { session, profile, loading };
}

// ── Redirect logged-in users away from /login and /signup ─────────────
export function useRedirectIfLoggedIn() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session || !profile) return;
    const dest: string =
      profile.role === "admin" ? "/admin" :
        profile.role === "superadmin" ? "/superadmin" :
          profile.role === "coach" ? "/coach" :
            profile.role === "external_judge" ? "/judge" :
              "/athlete";
    navigate({ to: dest as any });
  }, [session, profile, loading, navigate]);
}
