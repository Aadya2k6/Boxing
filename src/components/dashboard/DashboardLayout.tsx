import { Link, useNavigate } from "@tanstack/react-router";
import { Outlet, useLocation } from "@tanstack/react-router";
import { Bell, Search, LogOut, ChevronDown, Menu, X, type LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/site/Logo";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

interface DashboardLayoutProps {
  navSections: NavSection[];
  basePath: string;
  role: "Athlete" | "Admin" | "Superadmin" | "Coach" | "Judge" | "BOXOS Admin";
  userName: string;
  userMeta: string;
  accentClass?: string;
  accentBg?: string;
  dotColor?: string;
  notificationTo?: string;
  themeClass?: string;
}

export function DashboardLayout({
  navSections,
  basePath,
  role,
  userName,
  userMeta,
  accentClass = "text-primary-dark",
  accentBg = "bg-primary/10",
  dotColor = "bg-primary",
  notificationTo,
  themeClass = "",
}: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Read the 'q' search parameter from URL
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const initialQ = searchParams.get("q") || "";
  const [localSearch, setLocalSearch] = useState(initialQ);

  // Keep local search sync'd with URL changes
  useEffect(() => {
    const q =
      new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("q") ||
      "";
    setLocalSearch(q);
  }, [pathname]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      search: ((prev: any) => ({ ...prev, q: localSearch || undefined })) as any,
    });
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close sidebar on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // Load unread notification count when notificationTo is provided
  useEffect(() => {
    if (!user || !notificationTo) {
      setUnreadCount(0);
      return;
    }
    const userId = user.id;

    let cancelled = false;
    async function loadUnreadCount() {
      let q = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("is_read", false);

      if ((user as any)?.created_at) {
        const joinCutoffIso = new Date(new Date((user as any).created_at).getTime() - 5000).toISOString();
        q = q.gte("created_at", joinCutoffIso);
      }

      const { count } = await q;
      if (!cancelled) setUnreadCount(count ?? 0);
    }

    loadUnreadCount();
    const channel = supabase
      .channel(`dashboard-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        loadUnreadCount,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, notificationTo]);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  const isDark = themeClass.includes("dark");

  useEffect(() => {
    if (isDark) {
      document.documentElement.style.backgroundColor = "#050811";
      document.body.style.backgroundColor = "#050811";
    } else {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    }
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [isDark]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <Link to="/" className="flex items-center group transition-transform group-hover:scale-105">
          <Logo className="h-10 w-auto" textSize="text-xl" cinematicVariant={isDark} />
        </Link>

        {/* Role chip */}
        <div
          className={`mt-3.5 inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase font-semibold px-2.5 py-1.5 rounded-lg ${accentBg} ${accentClass}`}
        >
          <span className={`size-1.5 rounded-full ${dotColor}`} />
          {role} Portal
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {navSections.map((section, si) => (
          <div key={si}>
            {section.label && <div className="label-micro px-3 mb-2">{section.label}</div>}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const fullPath = item.to === "" ? basePath : `${basePath}/${item.to}`;
                const isActive = pathname === fullPath || (item.to === "" && pathname === basePath);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.to}
                    to={fullPath}
                    preload="intent"
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                      isActive
                        ? `${accentBg} ${accentClass} font-semibold`
                        : "text-muted-foreground hover:bg-elevated hover:text-foreground"
                    }`}
                  >
                    {isActive && (
                      <span
                        className="nav-active-bar"
                        style={{
                          background: accentClass.includes("info")
                            ? "var(--color-admin)"
                            : accentClass.includes("superadmin")
                              ? "var(--color-superadmin)"
                              : accentClass.includes("coach")
                                ? "var(--color-coach)"
                                : "var(--color-primary)",
                        }}
                      />
                    )}
                    <Icon className="size-4 shrink-0" strokeWidth={isActive ? 2 : 1.75} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          isActive ? "bg-white/20" : "bg-subtle"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User row at bottom */}
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-subtle/50">
          <div
            className={`size-9 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
              isDark ? "bg-slate-800 text-slate-100 border border-white/10 shadow-inner" : "text-background"
            }`}
            style={isDark ? undefined : { background: "linear-gradient(135deg, #9E7C2A 0%, #C9A84C 100%)" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate text-foreground">{userName}</div>
            <div className="text-[11px] text-muted-foreground truncate">{userMeta}</div>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 hover:bg-destructive hover:text-white transition-all cursor-pointer shadow-xs"
        >
          <LogOut className="size-3.5" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className={`min-h-screen w-full flex bg-background text-foreground relative ${themeClass}`}>
      {/* ── Atmospheric Glows (Dark Theme Only) ────────────────────── */}
      {isDark && (
        <>
          <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[1200px] h-[1200px] top-0 right-0 -translate-y-1/3 translate-x-1/3 opacity-50" />
          <div className="atmosphere-base atmosphere-red animate-ambient-drift w-[800px] h-[800px] top-1/4 right-0 translate-x-1/4 opacity-40" style={{ animationDelay: '-4s' }} />
        </>
      )}

      {/* ── Mobile Sidebar Backdrop ──────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar (Desktop: fixed; Mobile: slide-in drawer) ────────── */}
      <aside
        className={`w-[240px] bg-surface flex flex-col fixed top-0 bottom-0 left-0 h-full z-50 transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ boxShadow: "var(--shadow-sidebar)" }}
      >
        {/* Mobile close button — only visible on small screens */}
        <button
          className="absolute top-4 right-4 size-7 rounded-md hover:bg-elevated grid place-items-center text-muted-foreground lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>

        {sidebarContent}
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-[240px] min-w-0 flex flex-col min-h-screen z-10">
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 bg-background/90 backdrop-blur-xl h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 gap-3"
          style={{ boxShadow: "var(--shadow-header)" }}
        >
          {/* Mobile hamburger */}
          <button
            className="size-9 rounded-lg border border-border bg-surface grid place-items-center hover:border-border-strong hover:shadow-xs transition-all lg:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex-1 min-w-0">
            <Breadcrumbs basePath={basePath} role={role} />
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Search — only on larger screens */}
            <form
              onSubmit={handleSearchSubmit}
              className="hidden md:flex items-center gap-2.5 px-3.5 h-9 rounded-lg border border-border bg-surface w-52 xl:w-64 shadow-xs"
            >
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground min-w-0"
                placeholder="Search…"
              />
              <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0 hidden lg:inline">
                ⌘K
              </kbd>
            </form>

            {/* Notification bell */}
            {notificationTo ? (
              <Link
                to={notificationTo}
                className="size-9 rounded-lg border border-border bg-surface grid place-items-center hover:border-border-strong hover:shadow-xs transition-all relative shrink-0"
              >
                <Bell className="size-4" strokeWidth={1.75} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold grid place-items-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            ) : (
              <button className="size-9 rounded-lg border border-border bg-surface grid place-items-center hover:border-border-strong hover:shadow-xs transition-all relative shrink-0">
                <Bell className="size-4" strokeWidth={1.75} />
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive" />
              </button>
            )}

            {/* Top header Sign Out button */}
            <button
              onClick={handleSignOut}
              title="Sign out of account"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive hover:text-white transition-all shrink-0 cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full min-h-[calc(100vh-4rem)] flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Breadcrumbs({ basePath, role }: { basePath: string; role: string }) {
  const { pathname } = useLocation();
  const seg = pathname.replace(basePath, "").replace(/^\//, "");
  const humanSeg = seg ? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ") : "Overview";

  return (
    <div className="flex items-center gap-2 text-sm min-w-0">
      <span className="text-muted-foreground font-medium hidden sm:inline shrink-0">{role}</span>
      <ChevronDown className="size-3 -rotate-90 text-muted-foreground/50 hidden sm:inline shrink-0" />
      <span className="font-semibold text-foreground truncate">{humanSeg}</span>
    </div>
  );
}

/* ── Shared Components ─────────────────────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start sm:items-end justify-between mb-6 lg:mb-8 flex-wrap gap-4">
      <div className="min-w-0">
        <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
    </div>
  );
}

type DeltaTone = "success" | "warning" | "danger" | "info" | "neutral";

export function StatCard({
  label,
  value,
  delta,
  deltaTone = "success",
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: DeltaTone;
  hint?: string;
  icon?: LucideIcon;
  accent?: string;
}) {
  const toneMap: Record<DeltaTone, string> = {
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
    neutral: "badge-neutral",
  };

  return (
    <div className="bento-card p-4 sm:p-5 group">
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div className="label-micro">{label}</div>
        {Icon && (
          <div className={`size-8 rounded-lg ${accent || "bg-subtle"} grid place-items-center`}>
            <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-stat font-display tabular animate-count">{value}</div>
        {delta && <span className={`badge ${toneMap[deltaTone]}`}>{delta}</span>}
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "gold";
}) {
  const m: Record<string, string> = {
    neutral: "badge-neutral",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
    gold: "badge-gold",
  };
  return <span className={`badge ${m[tone]}`}>{children}</span>;
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bento-card ${className}`}>
      {(title || action) && (
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            {title && <div className="font-display font-semibold truncate">{title}</div>}
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

export function DataTable({
  headers,
  rows,
  emptyMessage = "No data available",
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm min-w-[500px] sm:min-w-0">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left text-[10px] uppercase tracking-widest text-muted-foreground font-semibold py-2.5 px-3 first:pl-4 sm:first:pl-0 last:pr-4 sm:last:pr-0 border-b border-border whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="py-12 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border last:border-0 hover:bg-elevated transition-colors"
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="py-3 sm:py-3.5 px-3 first:pl-4 sm:first:pl-0 last:pr-4 sm:last:pr-0"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AvatarInitials({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const sz = size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs";
  return (
    <div
      className={`${sz} rounded-full font-bold bg-elevated text-foreground border border-border grid place-items-center shrink-0 shadow-sm`}
    >
      {initials}
    </div>
  );
}
