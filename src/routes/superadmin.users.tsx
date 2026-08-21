import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { Plus, Search, Loader2, Shield, X, Check, Eye, EyeOff, Settings2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/users")({ component: UsersPage });

const roleColors: Record<string, any> = { superadmin: "gold", admin: "info", coach: "neutral", athlete: undefined };

const ADMIN_FEATURES = [
  { id: "boxers", label: "Boxers", description: "View/manage the boxer roster" },
  { id: "fees", label: "Fees", description: "Fee plans, invoices, payments, coupons" },
  { id: "attendance", label: "Attendance", description: "Attendance and leave applications" },
  { id: "coaches", label: "Coaches", description: "Reassign which coaches are attached to a center" },
];

function UsersPage() {
  const { user: currentUser, profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [centers, setCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "coach" | "athlete">("all");

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePass, setInvitePass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [inviteRole, setInviteRole] = useState<"admin" | "coach">("admin");
  const [inviteCenters, setInviteCenters] = useState<string[]>([]);
  const [inviteFeatures, setInviteFeatures] = useState<string[]>(ADMIN_FEATURES.map(f => f.id));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Manage modal
  const [manageUser, setManageUser] = useState<any>(null);
  const [manageCenters, setManageCenters] = useState<string[]>([]);
  const [manageFeatures, setManageFeatures] = useState<string[]>([]);
  const [savingManage, setSavingManage] = useState(false);

  const [actionUserId, setActionUserId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: profilesData }, { data: centersData }, { data: adminAssignments }, { data: coachAssignments }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("centers").select("id, name, city").eq("is_active", true).order("name"),
        supabase.from("admin_center_assignments").select("profile_id, center_id"),
        supabase.from("coach_center_assignments").select("profile_id, center_id"),
      ]);

      // Merge center assignments into profiles
      const enriched = (profilesData ?? []).map(p => {
        const assignments = p.role === "admin"
          ? (adminAssignments ?? []).filter(a => a.profile_id === p.id).map(a => a.center_id)
          : p.role === "coach"
          ? (coachAssignments ?? []).filter(a => a.profile_id === p.id).map(a => a.center_id)
          : [];
        return { ...p, assignedCenters: assignments };
      });
      setUsers(enriched);
      setCenters(centersData ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("create-staff-account", {
        body: {
          email: inviteEmail.trim(),
          password: invitePass,
          full_name: inviteName.trim(),
          role: inviteRole,
          academy_id: profile?.academy_id,
          invited_by: currentUser?.id,
          granted_permissions: inviteRole === "admin" ? inviteFeatures : [],
          center_ids: inviteCenters,
        },
      });
      if (fnErr || fnData?.error) throw new Error(fnData?.error || fnErr?.message || "Failed to create account");
      toast.success(`${inviteRole === "admin" ? "Admin" : "Coach"} account created`);
      setShowInviteModal(false);
      setInviteName(""); setInviteEmail(""); setInvitePass(""); setInviteCenters([]); setInviteFeatures(ADMIN_FEATURES.map(f => f.id));
      loadAll();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openManage(u: any) {
    setManageUser(u);
    setManageCenters(u.assignedCenters ?? []);
    setManageFeatures(Array.isArray(u.granted_permissions) ? u.granted_permissions : []);
  }

  async function handleSaveManage() {
    if (!manageUser) return;
    setSavingManage(true);
    try {
      // Update permissions
      const { error: permErr } = await supabase.from("profiles").update({ granted_permissions: manageFeatures }).eq("id", manageUser.id);
      if (permErr) throw permErr;

      // Update center assignments
      const assignTable = manageUser.role === "admin" ? "admin_center_assignments" : "coach_center_assignments";
      await supabase.from(assignTable).delete().eq("profile_id", manageUser.id);
      if (manageCenters.length > 0) {
        await supabase.from(assignTable).insert(manageCenters.map(cid => ({ profile_id: manageUser.id, center_id: cid, assigned_by: currentUser?.id })));
      }
      toast.success("Updated successfully");
      setManageUser(null);
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingManage(false);
    }
  }

  async function toggleActive(userId: string, currentActive: boolean) {
    setActionUserId(userId);
    await supabase.from("profiles").update({ is_active: !currentActive }).eq("id", userId);
    setActionUserId(null);
    loadAll();
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

  const filtered = users.filter(u => {
    const matchQ = !q || u.full_name?.toLowerCase().includes(q.toLowerCase()) || u.email?.toLowerCase().includes(q.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchQ && matchRole;
  });

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
      await supabase.from("boxer_profiles").delete().in("user_id", expiredIds);
      await supabase.from("profiles").delete().in("id", expiredIds);
      setCleanupCount(expiredUsers.length);
      setTimeout(() => setCleanupCount(null), 3000);
      loadAll();
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-surface min-w-[250px]">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="flex gap-1 p-1 bg-elevated rounded-xl border border-border">
          {(["all", "admin", "coach", "athlete"] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${roleFilter === r ? "bg-surface shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {r === "all" ? "All" : r === "admin" ? "Admins" : r === "coach" ? "Coaches" : "Athletes"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-medium px-5 py-3">Name & Email</th>
              <th className="text-left font-medium py-3">Role</th>
              <th className="text-left font-medium py-3">Details / Centers</th>
              <th className="text-left font-medium py-3">Joined</th>
              <th className="text-left font-medium py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No users found.</td></tr>
            ) : filtered.map(u => {
              const isAthlete = u.role === "athlete";
              const isVerified = u.academy_code_verified === true || u.onboarding_complete === true;
              const isExpired = isAthlete && !isVerified && u.academy_code_deadline && new Date(u.academy_code_deadline).getTime() < Date.now();
              const assignedNames = u.assignedCenters?.map((cid: string) => centers.find(c => c.id === cid)?.name).filter(Boolean).join(", ") || "None";

              return (
                <tr key={u.id} className="border-b border-border/50 hover:bg-subtle transition last:border-0">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-gradient-to-br from-primary to-primary-dark text-primary-foreground grid place-items-center text-[11px] font-semibold shrink-0">
                        {u.full_name?.split(" ").map((w: string) => w[0]).join("").substring(0, 2) || "U"}
                      </div>
                      <div>
                        <div className="font-semibold flex items-center gap-1.5">
                          {u.full_name ?? "—"}
                          {u.id === currentUser?.id && <span className="text-[10px] text-muted-foreground font-normal">(you)</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5">
                    <Badge tone={roleColors[u.role] ?? "default"}>
                      {u.role === "superadmin" ? <><Shield className="size-2.5 inline mr-1" />Superadmin</> : <span className="capitalize">{u.role}</span>}
                    </Badge>
                  </td>
                  <td className="py-3.5 text-xs text-muted-foreground max-w-[200px] truncate">
                    {!isAthlete ? (
                      assignedNames
                    ) : isVerified ? (
                      <Badge tone="success">Verified Athlete</Badge>
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
                    <div className="flex items-center justify-end gap-2">
                      {!isAthlete && (u.role === "admin" || u.role === "coach") && (
                        <button onClick={() => openManage(u)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-elevated text-[11px] font-semibold hover:bg-border transition text-foreground">
                          <Settings2 className="size-3" /> Manage
                        </button>
                      )}
                      {u.id !== currentUser?.id && (
                        <button onClick={() => toggleActive(u.id, u.is_active !== false)} disabled={actionUserId === u.id}
                          className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-subtle transition text-muted-foreground">
                          {actionUserId === u.id ? <Loader2 className="size-3 animate-spin" /> : u.is_active !== false ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </div>
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
          <div className="bg-surface border border-border rounded-2xl shadow-modal w-full max-w-md animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
              <div className="font-display font-bold">Invite User</div>
              <button onClick={() => setShowInviteModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleInvite} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Full name</label>
                <input required value={inviteName} onChange={e => setInviteName(e.target.value)} className="input-premium w-full" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Email</label>
                <input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="input-premium w-full" placeholder="Email address" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Temporary password (min 8 characters)</label>
                <div className="relative">
                  <input required type={showPass ? "text" : "password"} minLength={8} value={invitePass} onChange={e => setInvitePass(e.target.value)} className="input-premium w-full pr-10" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold">
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2">Role</label>
                <div className="flex gap-2">
                  {(["admin", "coach"] as const).map(r => (
                    <button key={r} type="button" onClick={() => setInviteRole(r)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition capitalize ${inviteRole === r ? "bg-primary/10 border-primary text-primary" : "border-border hover:bg-elevated"}`}>
                      {r === "admin" ? "Admin" : "Coach"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2">Centers</label>
                <div className="space-y-2">
                  {centers.map(c => (
                    <label key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 cursor-pointer">
                      <span className="text-sm">{c.name}{c.city ? ` — ${c.city}` : ""}</span>
                      <button
                        type="button"
                        onClick={() => setInviteCenters(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${inviteCenters.includes(c.id) ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${inviteCenters.includes(c.id) ? "translate-x-4.5" : "translate-x-0.5"}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
              {inviteRole === "admin" && (
                <div>
                  <label className="block text-xs font-semibold mb-2">Permissions</label>
                  <div className="space-y-2">
                    {ADMIN_FEATURES.map(f => (
                      <label key={f.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">{f.label}</div>
                          <div className="text-xs text-muted-foreground">{f.description}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInviteFeatures(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-3 ${inviteFeatures.includes(f.id) ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${inviteFeatures.includes(f.id) ? "translate-x-4.5" : "translate-x-0.5"}`} />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {saveError && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{saveError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-elevated transition">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 shadow-card hover:bg-primary/90 transition">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null} Create account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Modal */}
      {manageUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-modal w-full max-w-md animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
              <div>
                <div className="font-display font-bold">Manage User</div>
                <div className="text-xs text-muted-foreground mt-0.5">{manageUser.full_name ?? manageUser.email}</div>
              </div>
              <button onClick={() => setManageUser(null)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-2">Centers</label>
                <div className="space-y-2">
                  {centers.map(c => (
                    <label key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 cursor-pointer">
                      <span className="text-sm">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => setManageCenters(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${manageCenters.includes(c.id) ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${manageCenters.includes(c.id) ? "translate-x-4.5" : "translate-x-0.5"}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
              {manageUser.role === "admin" && (
                <div>
                  <label className="block text-xs font-semibold mb-2">Permissions</label>
                  <div className="space-y-2">
                    {ADMIN_FEATURES.map(f => (
                      <label key={f.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">{f.label}</div>
                          <div className="text-xs text-muted-foreground">{f.description}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setManageFeatures(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-3 ${manageFeatures.includes(f.id) ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${manageFeatures.includes(f.id) ? "translate-x-4.5" : "translate-x-0.5"}`} />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setManageUser(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-elevated transition">Cancel</button>
                <button onClick={handleSaveManage} disabled={savingManage} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 shadow-card hover:bg-primary/90 transition">
                  {savingManage ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
