import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import {
  Trophy, Users, LayoutDashboard, LogOut, MapPin, Globe2, Building2, Settings
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRequireAuth } from "@/lib/guards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/federation")({
  component: FederationLayout,
});

// ── Derive federation scope label from granted_permissions ─────────────────────
function useFederationScope() {
  const { profile } = useAuth();
  const perms: any[] = profile?.granted_permissions ?? [];
  const fedPerm = perms.find((p: any) => p?.type === "federation");
  const scope: "national" | "state" | "custom" = fedPerm?.scope ?? "national";
  const value: string | string[] | null = fedPerm?.value ?? null;

  let label = "National — All India";
  if (scope === "state" && value) label = `State — ${value}`;
  if (scope === "custom" && Array.isArray(value)) label = `Custom — ${value.join(", ")}`;

  return { scope, value, label };
}

function FederationLayout() {
  const { signOut, profile } = useAuth();
  const { loading } = useRequireAuth("boxos_admin");
  const location = useLocation();
  const { label } = useFederationScope();

  if (loading) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-t-transparent rounded-full animate-spin border-indigo-500" />
      </div>
    );
  }

  const NAV_ITEMS = [
    { icon: LayoutDashboard, label: "Overview", to: "/federation" as const },
    { icon: Users, label: "Athletes", to: "/federation/athletes" as const },
    { icon: Trophy, label: "Tournaments", to: "/federation/tournaments" as const },
    { icon: Settings, label: "Settings", to: "/federation/settings" as const },
  ];

  const initials = (profile?.full_name ?? "FD").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-border bg-surface flex-col hidden md:flex z-10 shrink-0">
        {/* Branding */}
        <div className="h-16 flex items-center px-5 border-b border-border shrink-0 gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 grid place-items-center text-indigo-600 font-bold font-display text-sm shrink-0">
            F
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm truncate">{profile?.full_name ?? "Federation"}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Globe2 className="size-3 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== "/federation" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all",
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                )}
              >
                <item.icon className={cn("size-4", isActive ? "opacity-100" : "opacity-70")} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="hidden md:block font-display font-bold text-base">Federation Portal</div>
            <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
              <MapPin className="size-3" />{label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 grid place-items-center text-indigo-600 font-bold text-xs">
              {initials}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-background p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
