import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase, Academy, AcademyStatus } from "@/lib/supabase";
import {
  fetchAcademies,
  createAcademyRecord,
  updateAcademyRecord,
  inviteSuperadmin,
  createSuperadminAccount,
} from "@/lib/platform-store";
import { useAuth } from "@/lib/auth";
import {
  Building2,
  Plus,
  Search,
  Users,
  Shield,
  MapPin,
  Calendar,
  ChevronRight,
  ShieldAlert,
  Archive,
  RefreshCw,
  X,
  Loader2,
  Trash2,
  Locate,
  AlertTriangle,
  Radio,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/boxos-admin/")({ component: BoxosAdminAcademies });

function statusBadge(status: AcademyStatus) {
  switch (status) {
    case "active":
      return <span className="badge badge-success">Active</span>;
    case "suspended":
      return <span className="badge badge-warning">Suspended</span>;
    case "archived":
      return <span className="badge badge-neutral">Archived</span>;
    case "deleted":
      return <span className="badge badge-danger">Deleted</span>;
    default:
      return <span className="badge badge-neutral">{status}</span>;
  }
}

function BoxosAdminAcademies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, { boxers: number; superadmins: number }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | AcademyStatus>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Suspend modal state
  const [suspendTarget, setSuspendTarget] = useState<Academy | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspending, setSuspending] = useState(false);

  // Archive modal state
  const [archiveTarget, setArchiveTarget] = useState<Academy | null>(null);
  const [archiveConfirmName, setArchiveConfirmName] = useState("");
  const [archiving, setArchiving] = useState(false);


  useEffect(() => {
    loadAcademies();

    const channel = supabase
      .channel("boxos-admin-academies-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "academies" }, loadAcademies)
      .on("postgres_changes", { event: "*", schema: "public", table: "academy_lifecycle_events" }, loadAcademies)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadAcademies() {
    setLoading(true);
    try {
      const res = await fetchAcademies();
      setAcademies(res.data);

      // Aggregate boxer & superadmin counts
      const [boxerRes, profileRes] = await Promise.allSettled([
        supabase.from("boxer_profiles").select("academy_id"),
        supabase.from("profiles").select("academy_id, role").eq("role", "superadmin"),
      ]);

      const counts: Record<string, { boxers: number; superadmins: number }> = {};
      res.data.forEach(a => { counts[a.id] = { boxers: 0, superadmins: 0 }; });

      if (boxerRes.status === "fulfilled" && boxerRes.value.data) {
        boxerRes.value.data.forEach((b: any) => {
          if (b.academy_id && counts[b.academy_id]) counts[b.academy_id].boxers++;
        });
      }
      if (profileRes.status === "fulfilled" && profileRes.value.data) {
        profileRes.value.data.forEach((p: any) => {
          if (p.academy_id && counts[p.academy_id]) counts[p.academy_id].superadmins++;
        });
      }
      setStatsMap(counts);
    } catch (err: any) {
      console.error("Error loading academies:", err);
      toast.error(err.message || "Failed to load academies");
    } finally {
      setLoading(false);
    }
  }

  async function handleSuspendAcademy() {
    if (!suspendTarget || !suspendReason.trim()) return;
    setSuspending(true);
    try {
      const authId = user?.id ?? null;
      const now = new Date().toISOString();

      await updateAcademyRecord(
        suspendTarget.id,
        {
          status: "suspended",
          suspended_reason: suspendReason.trim(),
          suspended_at: now,
          suspended_by: authId,
        },
        {
          event_type: "suspended",
          reason: suspendReason.trim(),
          actor_id: authId,
        }
      );

      toast.success(`${suspendTarget.name} has been suspended`);
      setSuspendTarget(null);
      setSuspendReason("");
      loadAcademies();
    } catch (err: any) {
      toast.error(err.message || "Failed to suspend academy");
    } finally {
      setSuspending(false);
    }
  }

  async function handleReactivateAcademy(academy: Academy) {
    const toastId = toast.loading(`Reactivating ${academy.name}…`);
    try {
      const authId = user?.id ?? null;

      await updateAcademyRecord(
        academy.id,
        {
          status: "active",
          suspended_reason: null,
          suspended_at: null,
          suspended_by: null,
        },
        {
          event_type: "reactivated",
          reason: "Reactivated by BOXOS Platform Admin",
          actor_id: authId,
        }
      );

      toast.success(`${academy.name} is now active`, { id: toastId });
      loadAcademies();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate academy", { id: toastId });
    }
  }

  async function handleArchiveAcademy() {
    if (!archiveTarget || archiveConfirmName.trim() !== archiveTarget.name) return;
    setArchiving(true);
    try {
      const authId = user?.id ?? null;
      const now = new Date();
      const hardDeleteEligible = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      await updateAcademyRecord(
        archiveTarget.id,
        {
          status: "archived",
          archived_at: now.toISOString(),
          hard_delete_eligible_at: hardDeleteEligible.toISOString(),
        },
        {
          event_type: "archived",
          reason: "Archived with 7-day deletion cool-off window",
          actor_id: authId,
        }
      );

      toast.success(`${archiveTarget.name} archived (7-day cool-off active)`);
      setArchiveTarget(null);
      setArchiveConfirmName("");
      loadAcademies();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive academy");
    } finally {
      setArchiving(false);
    }
  }

  const activeCount = academies.filter(a => a.status === "active").length;
  const suspendedCount = academies.filter(a => a.status === "suspended").length;
  const archivedCount = academies.filter(a => a.status === "archived").length;

  const filtered = academies.filter(a => {
    const matchQ =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.city?.toLowerCase().includes(search.toLowerCase()) ||
      a.state?.toLowerCase().includes(search.toLowerCase());

    const matchF = filter === "all" || a.status === filter;
    return matchQ && matchF;
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Academies"
        subtitle={`${academies.length} total · ${activeCount} active · ${suspendedCount} suspended · ${archivedCount} archived`}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-fuchsia-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-fuchsia-700 transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> Create Academy
          </button>
        }
      />

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search academies by name, city, state…"
            className="input-premium pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-elevated rounded-xl">
          {(["all", "active", "suspended", "archived"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                filter === tab
                  ? "bg-surface shadow-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Academy Cards List */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="size-8 animate-spin mx-auto text-fuchsia-600 mb-3" />
          <div className="text-sm text-muted-foreground">Loading academies from database…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bento-card p-12 text-center">
          <Building2 className="size-12 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-display font-bold text-lg">No academies found</div>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {search || filter !== "all"
              ? "Try adjusting your search or filters to find what you are looking for."
              : "Get started by onboarding your first academy tenant onto the platform."}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 inline-flex items-center gap-2 bg-fuchsia-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-fuchsia-700 transition cursor-pointer"
          >
            <Plus className="size-4" /> Create First Academy
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(academy => {
            const stats = statsMap[academy.id] ?? { boxers: 0, superadmins: 0 };
            return (
              <div
                key={academy.id}
                className="bento-card p-5 hover:border-border-strong hover:shadow-elevated transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-11 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-purple-600/20 border border-fuchsia-500/30 grid place-items-center text-fuchsia-600 font-bold font-display text-sm shrink-0">
                        {academy.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-base text-foreground truncate">
                          {academy.name}
                        </h3>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">
                            {[academy.city, academy.state].filter(Boolean).join(", ") || "Location not specified"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>{statusBadge(academy.status)}</div>
                  </div>

                  {/* Suspension reason banner if suspended */}
                  {academy.status === "suspended" && academy.suspended_reason && (
                    <div className="bg-warning/8 border border-warning/20 rounded-xl p-2.5 text-xs text-warning flex items-start gap-2 mb-3">
                      <ShieldAlert className="size-3.5 shrink-0 mt-0.5" />
                      <span>{academy.suspended_reason}</span>
                    </div>
                  )}

                  {/* Geofence & Mini Stats */}
                  <div className="grid grid-cols-3 gap-2 bg-elevated/60 rounded-xl p-3 mb-4 text-center text-xs">
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase font-semibold">Boxers</div>
                      <div className="font-bold text-sm text-foreground mt-0.5">{stats.boxers}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase font-semibold">Superadmins</div>
                      <div className="font-bold text-sm text-foreground mt-0.5">{stats.superadmins}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase font-semibold">Geofence</div>
                      <div className="font-bold text-sm text-foreground mt-0.5">{academy.attendance_radius_meters}m</div>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] text-muted-foreground">
                    Onboarded {new Date(academy.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {academy.status === "active" && (
                      <>
                        <button
                          onClick={() => setSuspendTarget(academy)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-warning/40 text-warning hover:bg-warning/10 transition cursor-pointer"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => setArchiveTarget(academy)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:bg-elevated transition cursor-pointer"
                        >
                          Archive
                        </button>
                      </>
                    )}

                    {academy.status === "suspended" && (
                      <>
                        <button
                          onClick={() => handleReactivateAcademy(academy)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-success text-white hover:bg-success/90 transition cursor-pointer"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => setArchiveTarget(academy)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:bg-elevated transition cursor-pointer"
                        >
                          Archive
                        </button>
                      </>
                    )}

                    {academy.status === "archived" && (
                      <button
                        onClick={() => handleReactivateAcademy(academy)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-success text-white hover:bg-success/90 transition cursor-pointer"
                      >
                        Restore
                      </button>
                    )}

                    <Link
                      to="/boxos-admin/academies/$academyId"
                      params={{ academyId: academy.id }}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-fuchsia-600/10 text-fuchsia-600 rounded-lg hover:bg-fuchsia-600 hover:text-white transition cursor-pointer"
                    >
                      <span>View</span>
                      <ChevronRight className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Academy Modal */}
      {showCreateModal && (
        <CreateAcademyModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadAcademies();
          }}
        />
      )}

      {/* Suspend Academy Modal */}
      {suspendTarget && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setSuspendTarget(null)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="font-display font-bold text-base flex items-center gap-2 text-warning">
                <ShieldAlert className="size-5" /> Suspend {suspendTarget.name}
              </div>
              <button onClick={() => setSuspendTarget(null)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-warning/8 border border-warning/25 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-warning">Lockout Notice:</span> Non-superadmin staff (admins, coaches, athletes) in this academy will be immediately locked out. Superadmins will only have read-only access to Boxers &amp; Fees.
              </div>

              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Reason for Suspension *</span>
                <textarea
                  rows={3}
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  placeholder="e.g. Incomplete verification documents / payment compliance review…"
                  className="input-premium resize-none"
                  required
                />
              </label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 bg-elevated/30">
              <button
                onClick={() => setSuspendTarget(null)}
                className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspendAcademy}
                disabled={!suspendReason.trim() || suspending}
                className="px-4 py-2 text-sm bg-warning text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-warning/90 transition cursor-pointer flex items-center gap-1.5"
              >
                {suspending ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Academy Modal */}
      {archiveTarget && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setArchiveTarget(null)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="font-display font-bold text-base flex items-center gap-2 text-destructive">
                <Archive className="size-5" /> Archive {archiveTarget.name}
              </div>
              <button onClick={() => setArchiveTarget(null)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-destructive/8 border border-destructive/25 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-destructive">Soft Deletion with 7-Day Cool-off:</span>
                <p className="mt-1">
                  Archiving deactivates this academy. It will enter a mandatory 7-day retention period. You can restore it at any time within 7 days. Permanent hard deletion is only unlocked after 7 days.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Type <span className="font-mono font-bold text-foreground">{archiveTarget.name}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={archiveConfirmName}
                  onChange={e => setArchiveConfirmName(e.target.value)}
                  placeholder={archiveTarget.name}
                  className="input-premium"
                />
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 bg-elevated/30">
              <button
                onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveAcademy}
                disabled={archiveConfirmName.trim() !== archiveTarget.name || archiving}
                className="px-4 py-2 text-sm bg-destructive text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-destructive/90 transition cursor-pointer flex items-center gap-1.5"
              >
                {archiving ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                Archive Academy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Academy Modal with Multi-Superadmin Invite Builder ───────────
function CreateAcademyModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    latitude: "",
    longitude: "",
    attendance_radius_meters: 200,
  });

  const [superadmins, setSuperadmins] = useState<{ name: string; email: string; password: string }[]>([
    { name: "", email: "", password: "" },
  ]);

  function handleLocateMe() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        toast.success("GPS Coordinates captured");
        setLocating(false);
      },
      err => {
        toast.error(`Geolocation error: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function addSuperadminRow() {
    setSuperadmins(prev => [...prev, { name: "", email: "", password: "" }]);
  }

  function removeSuperadminRow(idx: number) {
    setSuperadmins(prev => prev.filter((_, i) => i !== idx));
  }

  function updateSuperadminRow(idx: number, field: "name" | "email" | "password", val: string) {
    setSuperadmins(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const validSuperadmins = superadmins.filter(s => s.name.trim() && s.email.trim());
    if (validSuperadmins.length === 0) {
      toast.error("Please provide at least one Superadmin (Name & Email)");
      return;
    }

    for (const sa of validSuperadmins) {
      if (!sa.password || sa.password.trim().length < 6) {
        toast.error(`Password for ${sa.name || sa.email} must be at least 6 characters`);
        return;
      }
    }

    setLoading(true);
    try {
      const newAcademy = await createAcademyRecord({
        name: form.name.trim(),
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        attendance_radius_meters: form.attendance_radius_meters || 200,
        actorId: user?.id ?? null,
      });

      // Provision superadmin accounts with credentials
      for (const sa of validSuperadmins) {
        await createSuperadminAccount({
          academyId: newAcademy.id,
          name: sa.name.trim(),
          email: sa.email.trim(),
          password: sa.password.trim(),
          actorId: user?.id ?? null,
        });
      }

      toast.success(`Academy "${form.name}" created and superadmin credentials provisioned!`);
      onSuccess();
    } catch (err: any) {
      console.error("Create academy error:", err);
      toast.error(err.message || "Failed to create academy");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-up">
        <div className="p-5 border-b border-border sticky top-0 bg-surface/95 backdrop-blur-md z-10 flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-lg">Create New Academy</div>
            <div className="text-xs text-muted-foreground">Onboard a new boxing academy tenant onto BOXOS</div>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Academy Details */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              1. Academy Information
            </div>

            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Academy Name *</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ring Masters Boxing Academy"
                className="input-premium"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Address</span>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="e.g. Sports Complex, Gate 3, Ring Road"
                className="input-premium"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">City</span>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="e.g. Mumbai"
                  className="input-premium"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">State</span>
                <input
                  type="text"
                  value={form.state}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                  placeholder="e.g. Maharashtra"
                  className="input-premium"
                />
              </label>
            </div>

            {/* Geofence & Coordinates */}
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                  placeholder="e.g. 19.0760"
                  className="input-premium"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                  placeholder="e.g. 72.8777"
                  className="input-premium"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Geofence Radius (m)</span>
                <input
                  type="number"
                  value={form.attendance_radius_meters}
                  onChange={e => setForm(f => ({ ...f, attendance_radius_meters: parseInt(e.target.value) || 200 }))}
                  className="input-premium"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleLocateMe}
              disabled={locating}
              className="inline-flex items-center gap-1.5 text-xs text-fuchsia-600 font-semibold hover:underline cursor-pointer"
            >
              {locating ? <Loader2 className="size-3.5 animate-spin" /> : <Locate className="size-3.5" />}
              Auto-detect current GPS coordinates
            </button>
          </div>

          <div className="border-t border-border" />

          {/* Initial Superadmins */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  2. Initial Superadmin(s)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Credentials and login access will be provisioned for these managers.
                </div>
              </div>
              <button
                type="button"
                onClick={addSuperadminRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-fuchsia-600 hover:text-fuchsia-700 cursor-pointer"
              >
                <Plus className="size-3.5" /> Add another
              </button>
            </div>

            <div className="space-y-2.5">
              {superadmins.map((sa, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-elevated/50 p-3 rounded-xl border border-border">
                  <div className="flex-1 grid sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      value={sa.name}
                      onChange={e => updateSuperadminRow(idx, "name", e.target.value)}
                      placeholder="Superadmin full name *"
                      className="input-premium text-xs"
                    />
                    <input
                      type="email"
                      required
                      value={sa.email}
                      onChange={e => updateSuperadminRow(idx, "email", e.target.value)}
                      placeholder="superadmin@academy.in *"
                      className="input-premium text-xs"
                    />
                    <input
                      type="password"
                      required
                      value={sa.password}
                      onChange={e => updateSuperadminRow(idx, "password", e.target.value)}
                      placeholder="Login password (min 6 chars) *"
                      className="input-premium text-xs"
                    />
                  </div>
                  {superadmins.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSuperadminRow(idx)}
                      className="size-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center cursor-pointer shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 bg-fuchsia-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-fuchsia-700 disabled:opacity-50 transition cursor-pointer shadow-card"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create Academy &amp; Send Invites
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
