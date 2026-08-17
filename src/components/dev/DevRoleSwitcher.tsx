import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { UserRole } from "@/lib/supabase";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  ShieldAlert,
  Users,
  Radio,
  Gavel,
  Shield,
  Layers,
  ChevronUp,
  ChevronDown,
  X,
  Sparkles,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

export function DevRoleSwitcher() {
  const { role, devRole, setDevRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  if (pathname === '/') return null;

  const roles: { key: UserRole; label: string; path: string; icon: any; color: string; desc: string }[] = [
    {
      key: "athlete",
      label: "Athlete",
      path: "/athlete",
      icon: Users,
      color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
      desc: "Boxer dashboard, bouts, attendance, profile",
    },
    {
      key: "coach",
      label: "Coach",
      path: "/coach",
      icon: Radio,
      color: "bg-amber-500/10 text-amber-600 border-amber-500/30",
      desc: "Live ring timer, my boxers, session attendance",
    },
    {
      key: "admin",
      label: "Admin",
      path: "/admin",
      icon: Shield,
      color: "bg-blue-500/10 text-blue-600 border-blue-500/30",
      desc: "Academy scheduling, bout manager, judge invites",
    },
    {
      key: "superadmin",
      label: "Superadmin",
      path: "/superadmin",
      icon: Layers,
      color: "bg-purple-500/10 text-purple-600 border-purple-500/30",
      desc: "Global categories, multi-academy bouts & judges",
    },
    {
      key: "external_judge",
      label: "External Judge",
      path: "/judge",
      icon: Gavel,
      color: "bg-rose-500/10 text-rose-600 border-rose-500/30",
      desc: "Live 10-point must scoring, round tabs, timer",
    },
  ];

  const handleSwitch = (r: UserRole, targetPath: string) => {
    setDevRole(r);
    navigate({ to: targetPath as any });
  };

  const handleReset = () => {
    setDevRole(null);
    navigate({ to: "/login" as any });
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] font-sans">
      {isOpen ? (
        <div className="w-80 sm:w-96 bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
          {/* Header */}
          <div className="px-4 py-3 bg-elevated/70 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-lg bg-primary/20 text-primary-dark grid place-items-center">
                <Sparkles className="size-3.5" />
              </div>
              <div>
                <span className="font-display font-bold text-xs">Dev Role Switcher</span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary-dark font-mono font-medium">
                  {role ? role.toUpperCase() : "NO ROLE"}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="size-6 rounded-md hover:bg-elevated grid place-items-center text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-3 space-y-2 max-h-[75vh] overflow-y-auto">
            <div className="text-[11px] text-muted-foreground px-1 mb-1">
              Select a role to preview its dashboard instantly with bypass authentication:
            </div>

            <div className="space-y-1.5">
              {roles.map(({ key, label, path, icon: Icon, color, desc }) => {
                const isActive = role === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleSwitch(key, path)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                      isActive
                        ? "border-primary bg-primary/8 shadow-sm"
                        : "border-border hover:border-border-strong hover:bg-elevated/50"
                    }`}
                  >
                    <div className={`size-8 rounded-lg border grid place-items-center shrink-0 ${color}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">{label}</span>
                        {isActive && (
                          <span className="text-[10px] font-bold text-primary-dark bg-primary/15 px-1.5 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Links */}
            <div className="pt-2 border-t border-border mt-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
                Quick Feature Links
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <button
                  onClick={() => { setDevRole("athlete"); navigate({ to: "/athlete/bouts" as any }); }}
                  className="p-1.5 rounded-lg hover:bg-elevated text-left text-muted-foreground hover:text-foreground flex items-center justify-between cursor-pointer"
                >
                  <span>🥊 Boxer Bouts</span>
                  <ExternalLink className="size-2.5 opacity-50" />
                </button>
                <button
                  onClick={() => { setDevRole("coach"); navigate({ to: "/coach" as any }); }}
                  className="p-1.5 rounded-lg hover:bg-elevated text-left text-muted-foreground hover:text-foreground flex items-center justify-between cursor-pointer"
                >
                  <span>⏱️ Live Rings Timer</span>
                  <ExternalLink className="size-2.5 opacity-50" />
                </button>
                <button
                  onClick={() => { setDevRole("admin"); navigate({ to: "/admin/scheduling" as any }); }}
                  className="p-1.5 rounded-lg hover:bg-elevated text-left text-muted-foreground hover:text-foreground flex items-center justify-between cursor-pointer"
                >
                  <span>📅 Ring Scheduling</span>
                  <ExternalLink className="size-2.5 opacity-50" />
                </button>
                <button
                  onClick={() => { setDevRole("admin"); navigate({ to: "/admin/bouts" as any }); }}
                  className="p-1.5 rounded-lg hover:bg-elevated text-left text-muted-foreground hover:text-foreground flex items-center justify-between cursor-pointer"
                >
                  <span>⚔️ Bout Manager</span>
                  <ExternalLink className="size-2.5 opacity-50" />
                </button>
                <button
                  onClick={() => { setDevRole("superadmin"); navigate({ to: "/superadmin/categories" as any }); }}
                  className="p-1.5 rounded-lg hover:bg-elevated text-left text-muted-foreground hover:text-foreground flex items-center justify-between cursor-pointer"
                >
                  <span>⚖️ Weight Categories</span>
                  <ExternalLink className="size-2.5 opacity-50" />
                </button>
                <button
                  onClick={() => { setDevRole("external_judge"); navigate({ to: "/judge" as any }); }}
                  className="p-1.5 rounded-lg hover:bg-elevated text-left text-muted-foreground hover:text-foreground flex items-center justify-between cursor-pointer"
                >
                  <span>📝 Judge Scoring</span>
                  <ExternalLink className="size-2.5 opacity-50" />
                </button>
              </div>
            </div>

            {/* Reset */}
            {devRole && (
              <div className="pt-2 border-t border-border">
                <button
                  onClick={handleReset}
                  className="w-full py-1.5 px-3 rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-xs font-semibold text-muted-foreground transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="size-3" /> Reset to Real Auth
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-surface/95 backdrop-blur-md border border-border hover:border-primary/50 text-foreground px-3.5 py-2 rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="size-2 rounded-full bg-primary animate-pulse" />
          <Sparkles className="size-3.5 text-primary-dark group-hover:rotate-12 transition-transform" />
          <span className="text-xs font-bold font-display">Switch Role</span>
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark border border-primary/20">
            {role ?? "Guest"}
          </span>
          <ChevronUp className="size-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
