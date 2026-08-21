import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { UserRole } from "./supabase";

// ── Generic protected route hook ───────────────────────────────────────────────
// Usage: call at the top of any protected route component.
//
// Security behaviour:
//   loading  → do nothing (spinner shown by layout)
//   !session → redirect to /login (unauthenticated)
//   session + !profile (after load) → redirect to /login (profile missing / corrupted)
//   session + is_active === false → redirect to /login (account suspended)
//   session + wrong role → redirect to the correct role dashboard
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

    // Loading is done + session exists but profile is still null:
    // this means the profile fetch failed or the DB has no matching profile row.
    // Force re-auth so the user lands on the login page cleanly.
    if (!profile) {
      navigate({ to: "/login" });
      return;
    }

    // Account suspended / deactivated → deny access
    if (profile.is_active === false) {
      navigate({ to: "/login" });
      return;
    }

    // Wrong role → navigate to the user's own dashboard
    if (requiredRole && profile.role !== requiredRole) {
      if (profile.role === "boxos_admin") {
        // Check if this is a federation account disguised as boxos_admin
        const perms: any[] = profile.granted_permissions ?? [];
        const isFed = perms.some((p: any) => p?.type === "federation");
        navigate({ to: (isFed ? "/federation" : "/boxos-admin") as any });
      } else if (profile.role === "admin") {
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

  return { session, user: session?.user ?? null, profile, loading };
}

// ── Athlete route guard ────────────────────────────────────────────────────────
export function useRequireAthlete() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // Not logged in
    if (!session) {
      navigate({ to: "/login" });
      return;
    }

    // Profile missing after load → force re-auth
    if (!profile) {
      navigate({ to: "/login" });
      return;
    }

    // Account suspended
    if (profile.is_active === false) {
      navigate({ to: "/login" });
      return;
    }

    if (profile.role !== "athlete") {
      if (profile.role === "boxos_admin") {
        navigate({ to: "/boxos-admin" as any });
      } else if (profile.role === "admin") {
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

// ── Redirect logged-in users away from /login and /signup ─────────────────────
export function useRedirectIfLoggedIn() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session || !profile) return;
    // Suspended accounts stay on the login page (no redirect loop)
    if (profile.is_active === false) return;

    const dest: string =
      profile.role === "boxos_admin" ? "/boxos-admin" :
        profile.role === "admin" ? "/admin" :
          profile.role === "superadmin" ? "/superadmin" :
            profile.role === "coach" ? "/coach" :
              profile.role === "external_judge" ? "/judge" :
                "/athlete";
    navigate({ to: dest as any });
  }, [session, profile, loading, navigate]);
}
