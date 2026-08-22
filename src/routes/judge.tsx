import { createFileRoute } from "@tanstack/react-router";
import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { LogOut, Clock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRequireAuth } from "@/lib/guards";
import Logo from "@/components/site/Logo";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/judge")({ component: JudgeLayout });

// ── Real access state — wired to external_judge_invites + profiles ───────────
type AccessState = "active" | "expiring" | "expired";

interface JudgeAccessInfo {
  tournamentName: string;
  state: AccessState;
  expiresAt: string | null;
}

function useJudgeAccess(userId: string | null | undefined): {
  access: JudgeAccessInfo | null;
  loading: boolean;
} {
  const [access, setAccess] = useState<JudgeAccessInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    async function fetchAccess() {
      try {
        // 1. Check profile is_active + access_expires_at first (fastest revocation path)
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_active, access_expires_at, judge_scope_tournament_id, email")
          .eq("id", userId!)
          .maybeSingle();

        const now = new Date();

        // Hard-revoked or expired via profile flags → expired immediately
        if (
          !profile ||
          profile.is_active === false ||
          (profile.access_expires_at && new Date(profile.access_expires_at) <= now)
        ) {
          setAccess({ tournamentName: "", state: "expired", expiresAt: null });
          setLoading(false);
          return;
        }

        // 2. Check external_judge_invites for the active invite
        let orQuery = `profile_id.eq.${userId}`;
        if (profile.email) {
          orQuery += `,email.eq.${profile.email}`;
        }
        
        const { data: invite, error: inviteErr } = await supabase
          .from("external_judge_invites")
          .select("status, expires_at, tournament_template_id")
          .or(orQuery)
          .order("invited_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log("Judge Access Check -> invite:", invite, "inviteErr:", inviteErr);

        if (invite && (invite.status === "revoked" || invite.status === "expired")) {
          console.warn("Judge Access Denied -> Invite is revoked or expired");
          setAccess({ tournamentName: "", state: "expired", expiresAt: null });
          setLoading(false);
          return;
        }

        // 3. Fetch tournament name
        let tournamentName = "Tournament";
        const tournamentId =
          invite?.tournament_template_id ?? profile.judge_scope_tournament_id;

        if (tournamentId) {
          const { data: template } = await supabase
            .from("ring_schedule_templates")
            .select("name, status")
            .eq("id", tournamentId)
            .maybeSingle();

          if (template) {
            tournamentName = template.name;
            // Tournament itself is completed/cancelled → expired
            if (template.status === "completed" || template.status === "cancelled") {
              setAccess({
                tournamentName,
                state: "expired",
                expiresAt: invite?.expires_at ?? null,
              });
              setLoading(false);
              return;
            }
          }
        }

        // 4. Determine state from expires_at
        const expiresAt = invite?.expires_at ?? profile.access_expires_at ?? null;
        let state: AccessState = "active";

        if (expiresAt) {
          const msLeft = new Date(expiresAt).getTime() - now.getTime();
          const hoursLeft = msLeft / (1000 * 60 * 60);
          if (msLeft <= 0) {
            state = "expired";
          } else if (hoursLeft <= 24) {
            state = "expiring";
          }
        }

        setAccess({ tournamentName, state, expiresAt });
      } catch (err) {
        console.error("[JudgeLayout] access check failed:", err);
        // Fail closed — treat unknown errors as expired
        setAccess({ tournamentName: "", state: "expired", expiresAt: null });
      } finally {
        setLoading(false);
      }
    }

    fetchAccess();

    // Re-check every 5 minutes so the banner updates without a page reload
    const interval = setInterval(fetchAccess, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  return { access, loading };
}

function AccessStatusBanner({
  tournamentName,
  state,
  expiresAt,
}: {
  tournamentName: string;
  state: AccessState;
  expiresAt: string | null;
}) {
  const msLeft = expiresAt ? new Date(expiresAt).getTime() - Date.now() : null;
  const hoursLeft = msLeft !== null ? Math.max(0, Math.floor(msLeft / (1000 * 60 * 60))) : null;
  const daysLeft = hoursLeft !== null ? Math.floor(hoursLeft / 24) : null;

  const toneMap: Record<AccessState, { bg: string; badge: string; label: string }> = {
    active: { bg: "bg-success/8 border-success/20", badge: "badge-success", label: "Active" },
    expiring: { bg: "bg-warning/8 border-warning/20", badge: "badge-warning", label: "Expiring Soon" },
    expired: { bg: "bg-destructive/8 border-destructive/20", badge: "badge-danger", label: "Expired" },
  };
  const tone = toneMap[state];

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b ${tone.bg} text-sm`}>
      <ShieldAlert className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="font-semibold truncate">{tournamentName}</span>
      <span className={`badge ${tone.badge} shrink-0`}>{tone.label}</span>
      {state !== "expired" && hoursLeft !== null && (
        <span className="text-muted-foreground text-xs shrink-0 ml-auto flex items-center gap-1">
          <Clock className="size-3" />
          {daysLeft && daysLeft > 0 ? `${daysLeft}d ${hoursLeft % 24}h left` : `${hoursLeft}h left`}
        </span>
      )}
    </div>
  );
}

function JudgeLayout() {
  const { profile, loading: authLoading } = useRequireAuth("external_judge");
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { access, loading: accessLoading } = useJudgeAccess(user?.id);

  // ── Security gate: redirect to /judge/expired if access is revoked/expired ─
  useEffect(() => {
    if (accessLoading || authLoading) return;
    if (access && access.state === "expired" && location.pathname !== "/judge/expired") {
      navigate({ to: "/judge/expired" as any });
    }
  }, [access, accessLoading, authLoading, navigate, location.pathname]);

  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Don't render children while redirecting for expired access
  if ((!access || access.state === "expired") && location.pathname !== "/judge/expired") {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal top bar */}
      <header className="bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Logo className="h-8 w-auto" textSize="text-lg" />
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-semibold text-foreground">{profile?.full_name ?? "Judge"}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Judge Portal</span>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive hover:text-white transition-all cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Persistent real access-status banner */}
      <AccessStatusBanner
        tournamentName={access?.tournamentName ?? ""}
        state={access?.state ?? "expired"}
        expiresAt={access?.expiresAt ?? null}
      />

      {/* Page content — narrow, judge-focused */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
