import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import {
  Trophy, Users, LayoutDashboard, LogOut, MapPin, Globe2, Settings, Menu, X
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRequireAuth } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { useFederationFilters } from "@/lib/federation";
import Logo from "@/components/site/Logo";

export const Route = createFileRoute("/federation")({
  component: FederationLayout,
});

function FederationLayout() {
  const { signOut, profile } = useAuth();
  const { loading } = useRequireAuth("federation" as any);
  const location = useLocation();
  const { label } = useFederationFilters();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050811] grid place-items-center">
        <span className="size-8 border-2 border-t-transparent rounded-full animate-spin border-primary" />
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
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden theme-federation-dark">
      {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-border bg-surface flex-col hidden md:flex z-20 shrink-0">
        {/* Branding */}
        <div className="h-16 flex items-center px-5 border-b border-border shrink-0 justify-between">
          <Link to="/federation" className="flex items-center gap-2">
            <Logo cinematicVariant={true} className="h-8 w-auto" wordmarkClassName="h-4" />
          </Link>
        </div>

        {/* Jurisdiction Badge */}
        <div className="px-5 py-3 border-b border-border/50 bg-subtle/20">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Jurisdiction</div>
          <div className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold truncate">
            <Globe2 className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-card font-bold"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                )}
              >
                <item.icon className={cn("size-4", isActive ? "opacity-100 text-white" : "opacity-70")} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all cursor-pointer"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar Drawer ────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-xs bg-surface border-r border-border flex flex-col h-full z-10 p-4 shadow-elevated">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <Logo cinematicVariant={true} className="h-8 w-auto" wordmarkClassName="h-4" />
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded-lg hover:bg-elevated text-muted-foreground">
                <X className="size-5" />
              </button>
            </div>
            <div className="py-3 border-b border-border/50">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Jurisdiction</div>
              <div className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold truncate">
                <Globe2 className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.to || (item.to !== "/federation" && location.pathname.startsWith(item.to));
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-card font-bold"
                        : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="pt-4 border-t border-border">
              <button
                onClick={() => signOut()}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Canvas ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-xl hover:bg-elevated text-muted-foreground cursor-pointer"
            >
              <Menu className="size-5" />
            </button>
            <div className="font-display font-bold text-base text-foreground">Federation Portal</div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <MapPin className="size-3" />{label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-foreground">{profile?.full_name ?? "Federation Officer"}</div>
              <div className="text-[10px] text-muted-foreground">Federation Admin</div>
            </div>
            <div className="size-8 rounded-full bg-slate-800 text-slate-100 border border-white/10 grid place-items-center font-bold text-xs shadow-card">
              {initials}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
