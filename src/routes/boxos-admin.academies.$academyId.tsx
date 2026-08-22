import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, AvatarInitials, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase, Academy, AcademyStatus, Profile, AcademyLifecycleEvent } from "@/lib/supabase";
import {
  fetchAcademyById,
  fetchSuperadminsByAcademy,
  fetchLifecycleEvents,
  updateAcademyRecord,
  inviteSuperadmin,
} from "@/lib/platform-store";
import { useAuth } from "@/lib/auth";
import {
  Building2,
  ArrowLeft,
  Users,
  Shield,
  MapPin,
  Calendar,
  ShieldAlert,
  Archive,
  RefreshCw,
  X,
  Loader2,
  Plus,
  Trash2,
  Download,
  AlertTriangle,
  CreditCard,
  History,
  CheckCircle,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/boxos-admin/academies/$academyId")({
  component: AcademyDetailPage,
});

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

function AcademyDetailPage() {
  const { academyId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [academy, setAcademy] = useState<Academy | null>(null);
  const [superadmins, setSuperadmins] = useState<Profile[]>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState<AcademyLifecycleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalBoxers: 0,
    suspendedBoxers: 0,
    totalStaff: 0,
    monthlyRevenue: 0,
    totalRevenueAllTime: 0,
    verifiedBoxers: 0,
    pendingBoxers: 0,
    rejectedBoxers: 0,
    boutsTraining: 0,
    boutsTournament: 0,
  });

  // Detailed Data
  const [detailedBoxers, setDetailedBoxers] = useState<any[]>([]);
  const [detailedStaff, setDetailedStaff] = useState<any[]>([]);
  const [detailedInvoices, setDetailedInvoices] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"none" | "boxers" | "staff" | "revenue" | "suspended">("none");

  // Action Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [suspendReason, setSuspendReason] = useState("");
  const [archiveConfirmName, setArchiveConfirmName] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadAcademyData();

    const channel = supabase
      .channel(`boxos-admin-academy-${academyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "academies", filter: `id=eq.${academyId}` }, loadAcademyData)
      .on("postgres_changes", { event: "*", schema: "public", table: "academy_lifecycle_events", filter: `academy_id=eq.${academyId}` }, loadAcademyData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [academyId]);

  async function loadAcademyData() {
    setLoading(true);
    try {
      // 1. Fetch Academy
      const ac = await fetchAcademyById(academyId);
      setAcademy(ac);

      if (ac) {
        // 2. Fetch Superadmins
        const saList = await fetchSuperadminsByAcademy(academyId);
        setSuperadmins(saList);

        // 3. Fetch Lifecycle events
        const events = await fetchLifecycleEvents(academyId);
        setLifecycleEvents(events);

        // 4. Fetch Aggregate stats and details using available profiles and invoices
        try {
          const [profilesRes, invoicesRes, paymentsRes] = await Promise.allSettled([
            supabase.from("profiles").select("*").eq("academy_id", academyId),
            supabase.from("invoices").select("*").eq("academy_id", academyId),
            supabase.from("payments").select("amount, created_at").eq("academy_id", academyId).eq("status", "success"),
          ]);

          const allProfiles = profilesRes.status === "fulfilled" ? (profilesRes.value.data ?? []) : [];
          const staff = allProfiles.filter(p => p.role !== "athlete" && p.role !== "boxos_admin");
          const invoices = invoicesRes.status === "fulfilled" ? (invoicesRes.value.data ?? []) : [];
          const payments = paymentsRes.status === "fulfilled" ? (paymentsRes.value.data ?? []) : [];

          setDetailedStaff(staff);
          setDetailedInvoices(invoices);

          const { data: realBoxers } = await supabase.from("boxer_profiles").select("*").eq("academy_id", academyId);
          
          let finalBoxers = realBoxers || [];
          
          // Map is_active from profiles to determine if a boxer is suspended
          finalBoxers = finalBoxers.map((b: any) => {
             const userProfile = allProfiles.find(p => p.id === b.user_id);
             return {
                ...b,
                is_suspended: userProfile ? userProfile.is_active === false : false,
                suspension_reason: userProfile && userProfile.is_active === false ? "Account deactivated by admin" : null,
                suspension_end_date: null
             };
          });

          setDetailedBoxers(finalBoxers);

          const suspendedBoxers = finalBoxers.filter((b: any) => b.is_suspended).length;
          const totalStaff = staff.length;

          const thisMonth = new Date().getMonth();
          const thisYear = new Date().getFullYear();
          const monthlyRevenue = payments
            .filter((p: any) => {
              const d = new Date(p.created_at);
              return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
            })
            .reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

          // Verification counts
          const verifiedBoxers = finalBoxers.filter((b: any) => b.verification_status === "verified").length;
          const pendingBoxers = finalBoxers.filter((b: any) => b.verification_status === "pending").length;
          const rejectedBoxers = finalBoxers.filter((b: any) => b.verification_status === "rejected").length;

          // Bout counts (fetch quickly)
          const { data: bouts } = await supabase.from("bouts").select("bout_kind").eq("academy_id", academyId);
          const boutsTraining = (bouts || []).filter((b: any) => b.bout_kind === "training").length;
          const boutsTournament = (bouts || []).filter((b: any) => b.bout_kind === "tournament").length;

          const totalRevenueAllTime = payments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

          setStats({
            totalBoxers: finalBoxers.length,
            suspendedBoxers,
            totalStaff,
            monthlyRevenue,
            totalRevenueAllTime,
            verifiedBoxers,
            pendingBoxers,
            rejectedBoxers,
            boutsTraining,
            boutsTournament,
          });
        } catch (err) {
          console.error("Direct fetch failed:", err);
        }
      }
    } catch (err: any) {
      console.error("Error loading academy detail:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Action Handlers ──────────────────────────────────────────────────
  async function handleSuspend() {
    if (!academy || !suspendReason.trim()) return;
    setActionLoading(true);
    try {
      const authId = user?.id ?? null;
      const now = new Date().toISOString();

      await updateAcademyRecord(
        academy.id,
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

      toast.success(`${academy.name} is now suspended`);
      setShowSuspendModal(false);
      setSuspendReason("");
      loadAcademyData();
    } catch (err: any) {
      toast.error(err.message || "Failed to suspend academy");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReactivate() {
    if (!academy) return;
    setActionLoading(true);
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

      toast.success(`${academy.name} is now active`);
      loadAcademyData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate academy");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleArchive() {
    if (!academy || archiveConfirmName.trim() !== academy.name) return;
    setActionLoading(true);
    try {
      const authId = user?.id ?? null;
      const now = new Date();
      const hardDeleteEligible = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      await updateAcademyRecord(
        academy.id,
        {
          status: "archived",
          archived_at: now.toISOString(),
          hard_delete_eligible_at: hardDeleteEligible.toISOString(),
        },
        {
          event_type: "archived",
          reason: "Archived with 7-day retention period",
          actor_id: authId,
        }
      );

      toast.success(`${academy.name} archived (7-day cool-off active)`);
      setShowArchiveModal(false);
      setArchiveConfirmName("");
      loadAcademyData();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive academy");
    } finally {
      setActionLoading(false);
    }
  }

  // Auto-export all data as CSV before hard delete
  async function handlePermanentDelete() {
    if (!academy || deleteConfirmName.trim() !== academy.name) return;
    setActionLoading(true);
    const toastId = toast.loading("Generating full CSV export bundle before deletion…");
    try {
      const authId = user?.id ?? null;

      // 1. Fetch full data bundle safely
      const [boxers, fees, payments, attendance] = await Promise.allSettled([
        supabase.from("boxer_profiles").select("*").eq("academy_id", academy.id),
        supabase.from("fee_assignments").select("*").eq("academy_id", academy.id),
        supabase.from("payments").select("*").eq("academy_id", academy.id),
        supabase.from("attendance").select("*").eq("academy_id", academy.id),
      ]);

      const boxersData = boxers.status === "fulfilled" ? (boxers.value.data ?? []) : [];
      const paymentsData = payments.status === "fulfilled" ? (payments.value.data ?? []) : [];
      const attendanceData = attendance.status === "fulfilled" ? (attendance.value.data ?? []) : [];

      // 2. Format CSV content
      const csvData = [
        `BOXOS EXPORT ARCHIVE: ${academy.name}`,
        `Exported At: ${new Date().toISOString()}`,
        `Academy ID: ${academy.id}`,
        "",
        "--- BOXERS ---",
        "ID,Full Name,Gender,DOB,Phone,Email,Status",
        ...boxersData.map(b => `${b.id},"${b.full_name}",${b.gender},${b.date_of_birth},"${b.phone}","${b.email}",${b.verification_status}`),
        "",
        "--- PAYMENTS ---",
        "ID,Amount,Mode,Status,Date",
        ...paymentsData.map(p => `${p.id},${p.amount},${p.payment_mode},${p.status},${p.created_at}`),
        "",
        "--- ATTENDANCE ---",
        "ID,Boxer ID,Date,Status,Distance (m)",
        ...attendanceData.map(a => `${a.id},${a.boxer_profile_id},${a.session_date},${a.status},${a.distance_meters}`),
      ].join("\n");

      // 3. Trigger auto-download in browser
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `boxos-archive-${academy.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.loading("Export downloaded. Deleting academy records…", { id: toastId });

      // 4. Log tombstone event before deletion
      try {
        await supabase.from("academy_lifecycle_events").insert({
          academy_id: academy.id,
          event_type: "hard_deleted",
          reason: `Hard deleted by BOXOS Admin. Full data export saved to CSV.`,
          ...(authId ? { actor_id: authId } : {}),
        });
      } catch (logErr) {
        console.warn("Could not log delete event:", logErr);
      }

      // 5. Update status to deleted
      await supabase
        .from("academies")
        .update({
          status: "deleted",
          deleted_at: new Date().toISOString(),
          deleted_by: authId,
        })
        .eq("id", academy.id);

      toast.success(`${academy.name} permanently deleted`, { id: toastId });
      setShowDeleteModal(false);
      navigate({ to: "/boxos-admin" as any });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete academy", { id: toastId });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading && !academy) {
    return (
      <div className="py-24 text-center">
        <Loader2 className="size-8 animate-spin mx-auto text-blue-400 mb-3" />
        <div className="text-sm text-muted-foreground">Loading academy profile…</div>
      </div>
    );
  }

  if (!academy) {
    return (
      <div className="bento-card p-12 text-center">
        <AlertTriangle className="size-10 text-destructive mx-auto mb-3" />
        <div className="font-display font-bold text-lg">Academy not found</div>
        <p className="text-sm text-muted-foreground mt-1">This academy does not exist or may have been deleted.</p>
        <Link to="/boxos-admin" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-400 font-semibold hover:underline">
          <ArrowLeft className="size-4" /> Back to Academies
        </Link>
      </div>
    );
  }

  const isHardDeleteEligible =
    academy.status === "archived" &&
    academy.hard_delete_eligible_at &&
    new Date().getTime() >= new Date(academy.hard_delete_eligible_at).getTime();

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            to="/boxos-admin"
            className="size-9 rounded-xl border border-border bg-surface hover:bg-elevated grid place-items-center transition cursor-pointer"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-xl sm:text-2xl text-foreground">{academy.name}</h1>
              {statusBadge(academy.status)}
              <button
                onClick={() => setShowEditModal(true)}
                className="px-2 py-1 text-xs font-semibold border border-border bg-surface rounded hover:bg-elevated transition cursor-pointer"
              >
                Edit
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Academy ID: <span className="font-mono">{academy.id}</span>
            </p>
          </div>
        </div>

        <button
          onClick={loadAcademyData}
          className="size-9 rounded-xl border border-border bg-surface hover:bg-elevated grid place-items-center text-muted-foreground hover:text-foreground transition cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {/* Info Card */}
      <div className="bento-card p-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Location</div>
            <div className="text-sm font-semibold text-foreground mt-0.5">{academy.address || "—"}</div>
            <div className="text-xs text-muted-foreground">{[academy.city, academy.state].filter(Boolean).join(", ") || "—"}</div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Geofence Attendance</div>
            <div className="text-sm font-semibold text-foreground mt-0.5">{academy.attendance_radius_meters} meters radius</div>
            <div className="text-xs text-muted-foreground">
              {academy.latitude && academy.longitude ? `${academy.latitude.toFixed(4)}, ${academy.longitude.toFixed(4)}` : "No GPS set"}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Payment Gateway</div>
            <div className="text-sm font-semibold text-foreground mt-0.5 capitalize flex items-center gap-1.5">
              <CreditCard className="size-3.5 text-blue-400" />
              {academy.active_gateway}
            </div>
            <div className="text-xs text-muted-foreground">
              {academy.razorpay_key_id || academy.payu_merchant_key ? "Keys Configured ✓" : "Default Mode"}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Total Revenue</div>
            <div className="text-sm font-display font-bold text-foreground mt-0.5">
              ₹{stats.totalRevenueAllTime.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-muted-foreground">All time payments</div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Onboarded Date</div>
            <div className="text-sm font-semibold text-foreground mt-0.5">
              {new Date(academy.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="text-xs text-muted-foreground">Tenant Lifecycle: {academy.status}</div>
          </div>
        </div>
      </div>

      {/* Live Stats Row - Clickable Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveTab(activeTab === "boxers" ? "none" : "boxers")}
          className={`bento-card p-4 text-left transition cursor-pointer hover:border-emerald-600/50 ${activeTab === "boxers" ? "ring-2 ring-emerald-600 border-emerald-600" : ""}`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold">Total Boxers</span>
            <Users className="size-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-display font-bold text-foreground">{stats.totalBoxers}</div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-semibold">
            <span className="text-emerald-500">{stats.verifiedBoxers} V</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-amber-500">{stats.pendingBoxers} P</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-destructive">{stats.rejectedBoxers} R</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab(activeTab === "staff" ? "none" : "staff")}
          className={`bento-card p-4 text-left transition cursor-pointer hover:border-blue-600/50 ${activeTab === "staff" ? "ring-2 ring-blue-600 border-blue-600" : ""}`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold">Total Staff</span>
            <Shield className="size-4 text-blue-600" />
          </div>
          <div className="text-2xl font-display font-bold text-foreground">{stats.totalStaff}</div>
        </button>

        <button
          onClick={() => setActiveTab(activeTab === "revenue" ? "none" : "revenue")}
          className={`bento-card p-4 text-left transition cursor-pointer hover:border-blue-500/50 ${activeTab === "revenue" ? "ring-2 ring-blue-500 border-blue-500" : ""}`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold">Monthly Revenue</span>
            <CreditCard className="size-4 text-blue-400" />
          </div>
          <div className="text-2xl font-display font-bold text-foreground">₹{stats.monthlyRevenue.toLocaleString("en-IN")}</div>
        </button>

        <button
          onClick={() => setActiveTab(activeTab === "suspended" ? "none" : "suspended")}
          className={`bento-card p-4 text-left transition cursor-pointer hover:border-destructive/50 ${activeTab === "suspended" ? "ring-2 ring-destructive border-destructive" : ""}`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold">Suspended Boxers</span>
            <ShieldAlert className="size-4 text-destructive" />
          </div>
          <div className="text-2xl font-display font-bold text-destructive">{stats.suspendedBoxers}</div>
        </button>
      </div>

      {/* Activity Section */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bento-card p-4 border-indigo-500/20 bg-indigo-500/5">
          <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Training Bouts Organized</div>
          <div className="text-2xl font-display font-bold text-indigo-600">{stats.boutsTraining}</div>
        </div>
        <div className="bento-card p-4 border-amber-500/20 bg-amber-500/5">
          <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Tournament Bouts Organized</div>
          <div className="text-2xl font-display font-bold text-amber-600">{stats.boutsTournament}</div>
        </div>
      </div>

      {/* Detailed Tab Content */}
      {activeTab !== "none" && (
        <div className="animate-fade-up">
          {activeTab === "boxers" && (
            <SectionCard title="All Boxers" subtitle="List of all registered boxers in this academy">
              <DataTable
                headers={["Full Name", "Email", "Gender", "Verification Status"]}
                rows={detailedBoxers.map((b: any) => [
                  b.full_name || "—",
                  b.email || "—",
                  b.gender || "—",
                  <span key={b.id} className={`badge ${b.verification_status === "verified" ? "badge-success" : "badge-warning"}`}>{b.verification_status}</span>
                ])}
                emptyMessage="No boxers found."
              />
            </SectionCard>
          )}

          {activeTab === "staff" && (
            <SectionCard title="Academy Staff" subtitle="List of all coaches and admins in this academy">
              <DataTable
                headers={["Full Name", "Email", "Role", "Status"]}
                rows={detailedStaff.map((s: any) => [
                  s.full_name || "—",
                  s.email || "—",
                  <span key={s.id + "role"} className="capitalize">{s.role}</span>,
                  <span key={s.id + "status"} className={`badge ${s.is_active ? "badge-success" : "badge-neutral"}`}>{s.is_active ? "Active" : "Inactive"}</span>
                ])}
                emptyMessage="No staff found."
              />
            </SectionCard>
          )}

          {activeTab === "revenue" && (
            <SectionCard title="Invoices & Revenue" subtitle="List of all invoices generated by this academy">
              <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-between">
                <div>
                   <div className="text-sm font-semibold text-blue-400 mb-1">Current Monthly Revenue</div>
                   <div className="text-2xl font-display font-bold text-foreground">₹{stats.monthlyRevenue.toLocaleString("en-IN")}</div>
                </div>
                <CreditCard className="size-8 text-blue-400/50" />
              </div>
              <DataTable
                headers={["Invoice Number", "Amount Due", "Amount Paid", "Status", "Date"]}
                rows={detailedInvoices.map((i: any) => [
                  i.invoice_number,
                  `₹${i.amount_due}`,
                  `₹${i.amount_paid}`,
                  <span key={i.id} className={`badge ${i.status === "paid" ? "badge-success" : (i.status === "unpaid" ? "badge-danger" : "badge-warning")}`}>{i.status}</span>,
                  new Date(i.created_at).toLocaleDateString("en-IN")
                ])}
                emptyMessage="No invoices found."
              />
            </SectionCard>
          )}

          {activeTab === "suspended" && (
            <SectionCard title="Suspended Boxers" subtitle="List of boxers currently suspended from this academy">
              <DataTable
                headers={["Full Name", "Reason for Suspension", "End Date"]}
                rows={detailedBoxers.filter((b: any) => b.is_suspended).map((b: any) => [
                  b.full_name || "—",
                  b.suspension_reason || "No reason provided",
                  b.suspension_end_date ? new Date(b.suspension_end_date).toLocaleDateString("en-IN") : "Indefinite"
                ])}
                emptyMessage="No suspended boxers."
              />
            </SectionCard>
          )}
        </div>
      )}

      {/* Superadmins Section */}
      <SectionCard
        title="Superadmins"
        subtitle="Managers with full authority over this academy"
        action={
          academy.status !== "deleted" && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary-dark transition cursor-pointer shadow-card"
            >
              <Plus className="size-3.5" /> Invite Superadmin
            </button>
          )
        }
      >
        {superadmins.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No superadmin accounts linked yet. Click "Invite Superadmin" above to provision one.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {superadmins.map(sa => (
              <div key={sa.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AvatarInitials name={sa.full_name ?? "Superadmin"} size="sm" />
                  <div>
                    <div className="font-semibold text-sm text-foreground">{sa.full_name || "Name Pending"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{sa.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${sa.is_active !== false ? "badge-success" : "badge-neutral"}`}>
                    {sa.is_active !== false ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Platform Controls */}
      <SectionCard title="Platform Controls" subtitle="Enable or disable key platform features for this academy">
        <PlatformControls
          academy={academy}
          onUpdate={loadAcademyData}
        />
      </SectionCard>

      {/* Lifecycle History Log */}
      <SectionCard title="Lifecycle History" subtitle="Audit log of state changes for this academy">
        {lifecycleEvents.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No lifecycle events recorded for this academy.
          </div>
        ) : (
          <div className="space-y-3">
            {lifecycleEvents.map(ev => (
              <div key={ev.id} className="p-3 rounded-xl bg-elevated/40 border border-border flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Activity className="size-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs capitalize text-foreground">{ev.event_type.replace(/_/g, " ")}</span>
                    </div>
                    {ev.reason && <p className="text-xs text-muted-foreground mt-0.5">{ev.reason}</p>}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0 tabular">
                  {new Date(ev.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Academy Management & Danger Zone */}
      {academy.status !== "deleted" && (
        <div className="bento-card p-5 border-destructive/20 bg-destructive/4 space-y-4">
          <div className="flex items-center gap-2 text-destructive font-display font-bold">
            <AlertTriangle className="size-5" /> Academy Lifecycle Actions
          </div>
          <p className="text-xs text-muted-foreground">
            Manage tenancy status. Actions will affect all staff and athletes registered to this academy.
          </p>

          <div className="flex items-center gap-3 flex-wrap pt-2">
            {academy.status === "active" && (
              <>
                <button
                  onClick={() => setShowSuspendModal(true)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 transition cursor-pointer"
                >
                  Suspend Academy
                </button>
                <button
                  onClick={() => setShowArchiveModal(true)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-surface text-muted-foreground hover:bg-elevated transition cursor-pointer"
                >
                  Archive Academy
                </button>
              </>
            )}

            {academy.status === "suspended" && (
              <>
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-success text-white hover:bg-success/90 transition cursor-pointer"
                >
                  Reactivate Academy
                </button>
                <button
                  onClick={() => setShowArchiveModal(true)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-surface text-muted-foreground hover:bg-elevated transition cursor-pointer"
                >
                  Archive Academy
                </button>
              </>
            )}

            {academy.status === "archived" && (
              <>
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-success text-white hover:bg-success/90 transition cursor-pointer"
                >
                  Restore to Active
                </button>

                {/* 7-day Cool-off Delete Gate */}
                {isHardDeleteEligible ? (
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-destructive text-white hover:bg-destructive/90 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="size-3.5" /> Delete Permanently (7-Day Cool-off Passed)
                  </button>
                ) : (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-elevated px-3 py-1.5 rounded-xl border border-border">
                    <History className="size-3.5 text-warning" />
                    <span>
                      Hard Delete available after:{" "}
                      <strong>
                        {academy.hard_delete_eligible_at
                          ? new Date(academy.hard_delete_eligible_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
                          : "7 days"}
                      </strong>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Invite Superadmin Modal */}
      {showInviteModal && (
        <InviteSuperadminModal
          academyId={academy.id}
          academyName={academy.name}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            loadAcademyData();
          }}
        />
      )}

      {/* Suspend Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowSuspendModal(false)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="font-display font-bold text-base flex items-center gap-2 text-warning">
                <ShieldAlert className="size-5" /> Suspend {academy.name}
              </div>
              <button onClick={() => setShowSuspendModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-warning/8 border border-warning/25 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-warning">Lockout Cascade:</span> Admins, coaches, and athletes will be immediately locked out. Superadmins drop into read-only mode for Boxers &amp; Collections.
              </div>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Reason for Suspension *</span>
                <textarea
                  rows={3}
                  required
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  placeholder="e.g. Failure to comply with safety audits…"
                  className="input-premium resize-none"
                />
              </label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 bg-elevated/30">
              <button onClick={() => setShowSuspendModal(false)} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={!suspendReason.trim() || actionLoading}
                className="px-4 py-2 text-sm bg-warning text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-warning/90 transition cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowArchiveModal(false)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="font-display font-bold text-base flex items-center gap-2 text-destructive">
                <Archive className="size-5" /> Archive {academy.name}
              </div>
              <button onClick={() => setShowArchiveModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-destructive/8 border border-destructive/25 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                Archiving initiates a mandatory 7-day retention period. You can restore it anytime during these 7 days.
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Type <span className="font-mono font-bold text-foreground">{academy.name}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={archiveConfirmName}
                  onChange={e => setArchiveConfirmName(e.target.value)}
                  placeholder={academy.name}
                  className="input-premium"
                />
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 bg-elevated/30">
              <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiveConfirmName.trim() !== academy.name || actionLoading}
                className="px-4 py-2 text-sm bg-destructive text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-destructive/90 transition cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                Archive Academy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Permanently Modal with Auto-Export */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="font-display font-bold text-base flex items-center gap-2 text-destructive">
                <Trash2 className="size-5" /> Delete {academy.name}
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-xs text-destructive leading-relaxed">
                <span className="font-bold">Permanent Hard Deletion:</span>
                <p className="mt-1">
                  This will generate and auto-download a full CSV export of all boxers, fees, bouts, and attendance, and then permanently delete all tenant data. This action cannot be undone.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Type <span className="font-mono font-bold text-foreground">{academy.name}</span> to confirm permanent deletion:
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  placeholder={academy.name}
                  className="input-premium"
                />
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 bg-elevated/30">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                disabled={deleteConfirmName.trim() !== academy.name || actionLoading}
                className="px-4 py-2 text-sm bg-destructive text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-destructive/90 transition cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Export CSV &amp; Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Academy Details Modal */}
      {showEditModal && (
        <EditAcademyModal
          academy={academy}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            loadAcademyData();
          }}
        />
      )}
    </div>
  );
}

// ─── Edit Academy Modal ───────────────────────────────────────────────────────

function EditAcademyModal({ academy, onClose, onSuccess }: { academy: Academy, onClose: () => void, onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: academy.name,
    address: academy.address || "",
    attendance_radius_meters: academy.attendance_radius_meters || 200,
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from("academies")
        .update({
          name: form.name.trim(),
          address: form.address.trim(),
          attendance_radius_meters: Number(form.attendance_radius_meters),
        })
        .eq("id", academy.id);
      
      if (error) throw error;
      toast.success("Academy details updated");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to update academy");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="font-display font-bold text-base flex items-center gap-2">
            <Building2 className="size-5 text-primary" /> Edit Academy Details
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Academy Name</span>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-premium"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Address</span>
            <input
              type="text"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="input-premium"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Geofence Attendance Radius (meters)</span>
            <input
              type="number"
              min={10}
              required
              value={form.attendance_radius_meters}
              onChange={e => setForm(f => ({ ...f, attendance_radius_meters: parseInt(e.target.value) }))}
              className="input-premium"
            />
          </label>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50 hover:bg-primary-dark transition cursor-pointer flex items-center gap-1.5 shadow-card">
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Platform Controls ────────────────────────────────────────────────────────

function PlatformControls({ academy, onUpdate }: { academy: Academy, onUpdate: () => void }) {
  const [feeDisabled, setFeeDisabled] = useState(academy.fee_assignments_disabled ?? false);
  const [adsEnabled, setAdsEnabled] = useState(academy.ads_enabled ?? false);
  const [adsDays, setAdsDays] = useState(30);
  const [loading, setLoading] = useState(false);

  // Initialize state on load
  useEffect(() => {
    setFeeDisabled(academy.fee_assignments_disabled ?? false);
    setAdsEnabled(academy.ads_enabled ?? false);
  }, [academy]);

  async function handleFeeToggle() {
    setLoading(true);
    const newValue = !feeDisabled;
    try {
      const { error } = await supabase
        .from("academies")
        .update({ fee_assignments_disabled: newValue })
        .eq("id", academy.id);
      if (error) throw error;
      setFeeDisabled(newValue);
      toast.success(newValue ? "Fee assignments disabled" : "Fee assignments enabled");
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || "Failed to update fee setting");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdsUpdate(enable: boolean) {
    setLoading(true);
    try {
      let adsWindowEndsAt = null;
      if (enable && adsDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + adsDays);
        adsWindowEndsAt = d.toISOString();
      }

      const { error } = await supabase
        .from("academies")
        .update({
          ads_enabled: enable,
          ads_window_ends_at: adsWindowEndsAt,
        })
        .eq("id", academy.id);
      
      if (error) throw error;
      setAdsEnabled(enable);
      toast.success(enable ? `Ads enabled for ${adsDays} days` : "Ads disabled");
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || "Failed to update ads setting");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Fee Assignments Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-subtle/30">
        <div>
          <div className="font-semibold text-sm">Disable Fee Assignments</div>
          <div className="text-xs text-muted-foreground mt-0.5 max-w-md">
            For govt or no-fee academies. Blocks new fee plan/invoice creation and skips athlete payment wall.
          </div>
        </div>
        <button
          onClick={handleFeeToggle}
          disabled={loading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
            feeDisabled ? "bg-blue-500" : "bg-muted"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            feeDisabled ? "translate-x-6" : "translate-x-1"
          }`} />
        </button>
      </div>

      {/* Enable Ads Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-subtle/30">
        <div className="flex-1">
          <div className="font-semibold text-sm">Enable Notices & Ads</div>
          <div className="text-xs text-muted-foreground mt-0.5 max-w-md mb-3">
            Allow this academy to display notices and advertisements to their users.
          </div>
          
          {/* If disabling, just a simple toggle off. If enabling, need duration input. */}
          {adsEnabled ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-success flex items-center gap-1">
                <CheckCircle className="size-3.5" /> Active
              </span>
              {academy.ads_window_ends_at && (
                <span className="text-xs text-muted-foreground">
                  (Ends: {new Date(academy.ads_window_ends_at).toLocaleDateString("en-IN")})
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold flex items-center gap-2">
                Duration (Days):
                <input
                  type="number"
                  min="1"
                  value={adsDays}
                  onChange={e => setAdsDays(parseInt(e.target.value) || 0)}
                  className="input-premium w-20 py-1"
                />
              </label>
            </div>
          )}
        </div>

        <button
          onClick={() => handleAdsUpdate(!adsEnabled)}
          disabled={loading || (!adsEnabled && adsDays <= 0)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
            adsEnabled ? "bg-blue-500" : "bg-muted"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            adsEnabled ? "translate-x-6" : "translate-x-1"
          }`} />
        </button>
      </div>
    </div>
  );
}

// ─── Invite Superadmin Modal ──────────────────────────────────────────────────
function InviteSuperadminModal({
  academyId,
  academyName,
  onClose,
  onSuccess,
}: {
  academyId: string;
  academyName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    if (!password || password.trim().length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const authId = user?.id ?? null;
      await inviteSuperadmin(academyId, name, email, authId, password.trim());

      toast.success(`Superadmin account created for ${name.trim()} (${email.trim()})!`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite superadmin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md animate-fade-up overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-base">Invite Superadmin</div>
            <div className="text-xs text-muted-foreground">{academyName}</div>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Full Name *</span>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Coach Vikram Singh"
              className="input-premium"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Email Address *</span>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. vikram@academy.in"
              className="input-premium"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Login Password (min 6 chars) *</span>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-premium"
            />
          </label>

          <p className="text-xs text-muted-foreground leading-relaxed">
            This provisioned password allows the Superadmin to immediately log in and manage {academyName}.
          </p>

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-dark transition cursor-pointer shadow-card"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Send Superadmin Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
