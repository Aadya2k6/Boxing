import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { Plus, MoreHorizontal, Search, Loader2, Shield, Key, X, Check, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/users")({ component: UsersPage });

const roleColors: Record<string, any> = { superadmin: "gold", admin: "info", coach: "neutral", athlete: undefined };

function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "coach">("admin");
  const [inviteName, setInviteName] = useState("");
  const [invitePass, setInvitePass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      setUsers(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      // Create auth user via admin API (superadmin only)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: inviteEmail,
        password: invitePass,
        options: { data: { full_name: inviteName, role: inviteRole } }
      });
      if (authError) throw authError;
      if (authData.user) {
        // Upsert profile with correct role
        await supabase.from("profiles").upsert({
          id: authData.user.id,
          email: inviteEmail,
          full_name: inviteName,
          role: inviteRole,
        });
      }
      setShowInviteModal(false);
      setInviteEmail(""); setInviteName(""); setInvitePass(""); setInviteRole("admin");
      loadUsers();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(userId: string, currentActive: boolean) {
    setActionUserId(userId);
    await supabase.from("profiles").update({ is_active: !currentActive }).eq("id", userId);
    setActionUserId(null);
    loadUsers();
  }

  function relativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  const filtered = users.filter(u =>
    !q || u.full_name?.toLowerCase().includes(q.toLowerCase()) || u.email?.toLowerCase().includes(q.toLowerCase())
  );

  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);

  const expiredUsers = users.filter(u =>
    u.role === "athlete" &&
    u.academy_code_verified !== true &&
    u.onboarding_complete !== true &&
    u.academy_code_deadline &&
    new Date(u.academy_code_deadline).getTime() < Date.now()
  );

  async function handleCleanupExpired() {
    if (expiredUsers.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${expiredUsers.length} unverified athlete registration(s) whose 15-day timeline has expired?`)) return;
    setCleaningUp(true);
    try {
      const expiredIds = expiredUsers.map(u => u.id);
      await supabase.from("athlete_profiles").delete().in("user_id", expiredIds);
      await supabase.from("profiles").delete().in("id", expiredIds);
      setCleanupCount(expiredUsers.length);
      setTimeout(() => setCleanupCount(null), 3000);
      loadUsers();
    } finally {
      setCleaningUp(false);
    }
  }

  return (
    <>
      <PageHeader
        title="User management"
        subtitle={`${users.length} user${users.length !== 1 ? "s" : ""} · ${users.filter(u => u.role === "admin").length} admins · ${users.filter(u => u.role === "superadmin").length} superadmins`}
        actions={
          <div className="flex items-center gap-2">
            {expiredUsers.length > 0 && (
              <button
                onClick={handleCleanupExpired}
                disabled={cleaningUp}
                className="inline-flex items-center gap-1.5 border border-destructive/40 text-destructive bg-destructive/5 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-destructive/10 transition disabled:opacity-50 cursor-pointer"
              >
                {cleaningUp ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Clean Up {expiredUsers.length} Expired Signup{expiredUsers.length !== 1 ? "s" : ""}
              </button>
            )}
            <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card cursor-pointer">
              <Plus className="size-3.5" /> Invite user
            </button>
          </div>
        }
      />

      {cleanupCount !== null && (
        <div className="mb-4 p-3 rounded-xl bg-success/10 border border-success/30 text-xs text-success font-medium flex items-center gap-2">
          <Check className="size-4" /> Deleted {cleanupCount} expired unverified account(s) from database. Storage cleaned up successfully!
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-elevated max-w-sm">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-5 py-3">Name</th>
              <th className="text-left font-medium py-3">Email</th>
              <th className="text-left font-medium py-3">Role</th>
              <th className="text-left font-medium py-3">Academy Code</th>
              <th className="text-left font-medium py-3">Joined</th>
              <th className="text-left font-medium py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No users found.</td></tr>
            ) : filtered.map(u => {
              const isAthlete = u.role === "athlete";
              const isVerified = u.academy_code_verified === true || u.onboarding_complete === true;
              const isExpired = isAthlete && !isVerified && u.academy_code_deadline && new Date(u.academy_code_deadline).getTime() < Date.now();

              return (
                <tr key={u.id} className="border-t border-border hover:bg-subtle transition">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-gradient-to-br from-primary to-primary-dark text-primary-foreground grid place-items-center text-[11px] font-semibold">
                        {u.full_name?.split(" ").map((w: string) => w[0]).join("").substring(0, 2)}
                      </div>
                      <span className="font-medium">{u.full_name ?? "—"}</span>
                      {u.id === currentUser?.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
                    </div>
                  </td>
                  <td className="py-3.5 text-muted-foreground text-sm">{u.email}</td>
                  <td className="py-3.5">
                    <Badge tone={roleColors[u.role] ?? "default"}>
                      {u.role === "superadmin" ? <><Shield className="size-2.5 inline mr-1" />Superadmin</> : u.role === "admin" ? "Admin" : u.role === "coach" ? "Coach" : "Athlete"}
                    </Badge>
                  </td>
                  <td className="py-3.5">
                    {!isAthlete ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : isVerified ? (
                      <Badge tone="success">Verified</Badge>
                    ) : isExpired ? (
                      <Badge tone="danger">Expired (15d limit)</Badge>
                    ) : (
                      <Badge tone="warning">Code Pending</Badge>
                    )}
                  </td>
                  <td className="py-3.5 text-muted-foreground text-xs tabular">{relativeTime(u.created_at)}</td>
                  <td className="py-3.5">
                    <Badge tone={u.is_active !== false ? "success" : undefined}>
                      {u.is_active !== false ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {u.id !== currentUser?.id && (
                      <button onClick={() => toggleActive(u.id, u.is_active !== false)} disabled={actionUserId === u.id}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-border hover:bg-subtle transition text-muted-foreground">
                        {actionUserId === u.id ? <Loader2 className="size-3 animate-spin" /> : u.is_active !== false ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md animate-fade-up overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-semibold">Invite admin user</h3>
              <button onClick={() => setShowInviteModal(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Full name *</label>
                <input required value={inviteName} onChange={e => setInviteName(e.target.value)} className="input-premium" placeholder="Name" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Email *</label>
                <input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="input-premium" placeholder="admin@academy.in" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Temporary password *</label>
                <div className="relative">
                  <input required type={showPass ? "text" : "password"} value={invitePass} onChange={e => setInvitePass(e.target.value)} className="input-premium pr-10" placeholder="Min 8 characters" />
                  <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Role *</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} className="input-premium appearance-none">
                  <option value="admin">Admin</option>
                  <option value="coach">Coach</option>
                  {/* Superadmin is intentionally absent — see architecture.md §1.2 */}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1.5">Need another Superadmin? Contact BOXOS support — superadmin accounts can only be created from the BOXOS platform console.</p>
              </div>
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {saving ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

