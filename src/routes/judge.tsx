import { createFileRoute } from "@tanstack/react-router";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { LogOut, Clock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRequireAuth } from "@/lib/guards";
import Logo from "@/components/site/Logo";

export const Route = createFileRoute("/judge")({ component: JudgeLayout });

// Mock access status — TODO: wire to external_judge_invites table
type AccessState = "active" | "expiring" | "expired";
const MOCK_ACCESS: { tournamentName: string; state: AccessState; expiresAt: string } = {
  tournamentName: "State Boxing Championship 2026",
  state: "active",
  expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
};

function AccessStatusBanner({
  tournamentName,
  state,
  expiresAt,
}: {
  tournamentName: string;
  state: AccessState;
  expiresAt: string;
}) {
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
  const daysLeft = Math.floor(hoursLeft / 24);

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
      {state !== "expired" && (
        <span className="text-muted-foreground text-xs shrink-0 ml-auto flex items-center gap-1">
          <Clock className="size-3" />
          {daysLeft > 0 ? `${daysLeft}d ${hoursLeft % 24}h left` : `${hoursLeft}h left`}
        </span>
      )}
    </div>
  );
}

function JudgeLayout() {
  const { profile, loading } = useRequireAuth("external_judge");
  const { signOut } = useAuth();
  const navigate = useNavigate();

  if (loading)
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );

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

      {/* Persistent access-status banner */}
      <AccessStatusBanner
        tournamentName={MOCK_ACCESS.tournamentName}
        state={MOCK_ACCESS.state}
        expiresAt={MOCK_ACCESS.expiresAt}
      />

      {/* Page content — narrow, judge-focused */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
