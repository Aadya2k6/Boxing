import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  Search, X, Loader2, Check, ArrowLeft,
  MapPin, Banknote, CreditCard, RefreshCw, RotateCcw, SendHorizonal,
  User, Phone, Mail, CalendarDays, BookOpen, Shield, Award,
  Clock, CheckCircle2, XCircle, AlertCircle,
  FileText, Receipt, ClipboardList,
  IndianRupee, Wallet, Star, Calendar, Download, Ban,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { generateReceipt } from "@/lib/pdf-receipt";

export const Route = createFileRoute("/admin/boxers")({
  component: AdminBoxersPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function DetailRow({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: any }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 gap-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        {Icon && <Icon className="size-3.5 text-muted-foreground shrink-0" />}
        <span>{label}</span>
      </div>
      <span className="text-xs font-medium text-right text-foreground">{value}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className = "" }: {
  title: string; icon?: any; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-surface border border-border rounded-xl overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-2 bg-elevated/60">
        {Icon && <Icon className="size-4 text-primary" />}
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    present:           { label: "Present",            cls: "bg-success/10 text-success border-success/20" },
    absent:            { label: "Absent",             cls: "bg-destructive/10 text-destructive border-destructive/20" },
    leave:             { label: "Leave",              cls: "bg-info/10 text-info border-info/20" },
    approved:          { label: "Approved",           cls: "bg-success/10 text-success border-success/20" },
    rejected:          { label: "Rejected",           cls: "bg-destructive/10 text-destructive border-destructive/20" },
    pending:           { label: "Pending",            cls: "bg-warning/10 text-warning border-warning/20" },
    paid:              { label: "Paid",               cls: "bg-success/10 text-success border-success/20" },
    unpaid:            { label: "Unpaid",             cls: "bg-warning/10 text-warning border-warning/20" },
    overdue:           { label: "Overdue",            cls: "bg-destructive/10 text-destructive border-destructive/20" },
    online_paid:       { label: "Online Paid",        cls: "bg-success/10 text-success border-success/20" },
    cash_approved:     { label: "Cash Approved",      cls: "bg-success/10 text-success border-success/20" },
    cash_pending:      { label: "Cash Pending",       cls: "bg-warning/10 text-warning border-warning/20" },
    rollover_pending:  { label: "Rollover Pending",   cls: "bg-info/10 text-info border-info/20" },
    rollover_approved: { label: "Rollover Approved",  cls: "bg-info/10 text-info border-info/20" },
    sent:              { label: "Sent",               cls: "bg-primary/10 text-primary-dark border-primary/20" },
    online_pending:    { label: "PayU Pending",       cls: "bg-warning/10 text-warning border-warning/20" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ── FULL PAGE ATHLETE DETAIL VIEW ────────────────────────────────────────────

function FullBoxerDetailView({
  boxerId,
  onBack,
  onOpenSendModal,
  onOpenReassignAcademy,
  onApproveCash,
  onApproveRollover,
  onRejectRollover,
}: {
  boxerId: string;
  onBack: () => void;
  onOpenSendModal: (ap: any) => void;
  onOpenReassignAcademy: (ap: any) => void;
  onApproveCash: (id: string) => void;
  onApproveRollover: (id: string) => void;
  onRejectRollover: (id: string) => void;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "payments" | "attendance" | "leaves">("overview");
  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);
  
  // Suspension State
  const [showSuspensionModal, setShowSuspensionModal] = useState(false);
  const [suspendForm, setSuspendForm] = useState({
    is_suspended: false,
    suspension_reason: "",
    suspension_end_date: "",
  });
  const [suspending, setSuspending] = useState(false);

  useEffect(() => {
    if (data?.ap) {
      setSuspendForm({
        is_suspended: !!data.ap.is_suspended,
        suspension_reason: data.ap.suspension_reason || "",
        suspension_end_date: data.ap.suspension_end_date || "",
      });
    }
  }, [data?.ap]);

  const handleSaveSuspension = async () => {
    if (!data?.ap) return;
    setSuspending(true);
    try {
      const payload = {
        is_suspended: suspendForm.is_suspended,
        suspension_reason: suspendForm.is_suspended ? suspendForm.suspension_reason : null,
        suspension_end_date: suspendForm.is_suspended ? (suspendForm.suspension_end_date || null) : null,
        suspended_by: suspendForm.is_suspended && !data.ap.is_suspended ? user?.id : (data.ap.is_suspended ? data.ap.suspended_by : null),
        suspended_at: suspendForm.is_suspended && !data.ap.is_suspended ? new Date().toISOString() : (data.ap.is_suspended ? data.ap.suspended_at : null),
        reinstated_by: !suspendForm.is_suspended && data.ap.is_suspended ? user?.id : (data.ap.is_suspended ? data.ap.reinstated_by : null),
        reinstated_at: !suspendForm.is_suspended && data.ap.is_suspended ? new Date().toISOString() : (data.ap.is_suspended ? data.ap.reinstated_at : null),
      };
      const { error } = await supabase.from("boxer_profiles").update(payload).eq("id", boxerId);
      if (error) throw error;
      setShowSuspensionModal(false);
    } catch (e: any) {
      alert("Failed to update suspension: " + e.message);
    } finally {
      setSuspending(false);
    }
  };

  const handleLeaveAction = async (leaveId: string, action: "approved" | "rejected", leaveDate: string) => {
    setProcessingLeaveId(leaveId);
    try {
      const { error: updateErr } = await supabase
        .from("leave_applications")
        .update({
          status: action,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", leaveId);

      if (updateErr) throw new Error(updateErr.message);

      if (data?.ap?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: data.ap.user_id,
          type: `leave_${action}`,
          title: action === "approved" ? "Leave approved ✓" : "Leave request rejected",
          body: action === "approved"
            ? `Your leave request for ${new Date(leaveDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} has been approved.`
            : `Your leave request for ${new Date(leaveDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} was not approved.`
        });
      }

      await loadDetails();
    } catch (err: any) {
      alert(err.message || "Failed to update leave status");
    } finally {
      setProcessingLeaveId(null);
    }
  };

  const loadDetails = useCallback(async () => {
    setLoading(true);
    try {
      let { data: ap, error: apErr } = await supabase
        .from("boxer_profiles")
        .select("*")
        .or(`id.eq.${boxerId},user_id.eq.${boxerId}`)
        .maybeSingle();

      if (!ap) {
        const { data: userP } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", boxerId)
          .maybeSingle();

        if (userP) {
          ap = {
            id: userP.id,
            user_id: userP.id,
            full_name: userP.full_name || userP.email?.split("@")[0] || "Boxer",
            email: userP.email,
            phone: userP.phone,
            academy_id: userP.academy_id,
            onboarding_complete: false,
            verification_status: "pending",
          };
        }
      }

      if (!ap) {
        console.error("Error fetching boxer profile:", apErr);
        setData(null);
        return;
      }

      const [
        { data: ac },
        { data: userProf },
        { data: guardian },
        { data: fa },
        { data: invoices },
        { data: payments },
        { data: attendance },
        { data: leaves },
        { data: discounts },
      ] = await Promise.all([
        ap.academy_id
          ? supabase.from("academies").select("id, name, city, state").eq("id", ap.academy_id).maybeSingle()
          : Promise.resolve({ data: null }),
        ap.user_id
          ? supabase.from("profiles").select("email, role, updated_at").eq("id", ap.user_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("guardian_details").select("*").eq("boxer_profile_id", boxerId).maybeSingle(),
        supabase
          .from("fee_assignments")
          .select("*, fee_plans(*)")
          .eq("boxer_profile_id", boxerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("invoices")
          .select("*")
          .eq("boxer_profile_id", boxerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("*")
          .eq("boxer_profile_id", boxerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("attendance")
          .select("*")
          .eq("boxer_profile_id", boxerId)
          .order("session_date", { ascending: false })
          .limit(100),
        supabase
          .from("leave_applications")
          .select("*")
          .eq("boxer_profile_id", boxerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("discount_applications")
          .select("*, discount_schemes(name, discount_type, discount_value)")
          .eq("boxer_profile_id", boxerId)
          .order("created_at", { ascending: false }),
      ]);

      const fullAp = {
        ...ap,
        academies: ac,
        profiles: userProf,
        guardian_details: guardian,
      };

      setData({
        ap: fullAp,
        fa,
        invoices: invoices ?? [],
        payments: payments ?? [],
        attendance: attendance ?? [],
        leaves: leaves ?? [],
        discounts: discounts ?? [],
      });
    } catch (err) {
      console.error("Exception loading boxer detail page:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [boxerId]);

  useEffect(() => {
    loadDetails();
    const channel = supabase
      .channel(`boxer-detail-${boxerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "boxer_profiles" }, loadDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, loadDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, loadDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, loadDetails)
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_applications" }, loadDetails)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [boxerId, loadDetails]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading boxer profile...</p>
      </div>
    );
  }

  if (!data || !data.ap) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-12 text-center max-w-lg mx-auto mt-10">
        <AlertCircle className="size-10 text-destructive mx-auto mb-3" />
        <h3 className="font-display font-semibold text-lg">Boxer not found</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Could not load the requested boxer record.</p>
        <button onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2 bg-subtle hover:bg-elevated rounded-xl text-sm font-medium transition">
          <ArrowLeft className="size-4" /> Back to Boxers
        </button>
      </div>
    );
  }

  const { ap, fa, invoices, payments, attendance, leaves, discounts } = data;

  const totalPresent = attendance.filter((a: any) => a.status === "present").length;
  const totalAbsent  = attendance.filter((a: any) => a.status === "absent").length;
  const totalLeaves  = leaves.filter((l: any) => l.status === "approved").length;
  const pendingLeaves= leaves.filter((l: any) => l.status === "pending").length;

  const totalPaid = payments.reduce((acc: number, p: any) => acc + Number(p.amount ?? 0), 0);
  const totalInvoiced = invoices.reduce((acc: number, i: any) => acc + Number(i.amount_due ?? 0), 0);
  const totalOutstanding = Math.max(0, totalInvoiced - totalPaid);

  let payStatus = "unassigned";
  if (fa) {
    const st = fa.status;
    const latestInv = invoices[0];
    if (st === "active" && latestInv?.status === "paid") payStatus = "paid";
    else if (latestInv?.status === "paid")               payStatus = "paid";
    else if (latestInv?.status === "overdue")            payStatus = "overdue";
    else if (latestInv)                                  payStatus = "unpaid";
    else                                                 payStatus = "awaiting_invoice";
  }

  return (
    <div className="space-y-6 animate-fade-up pb-12">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-elevated text-xs font-semibold text-muted-foreground hover:text-foreground transition shadow-sm"
        >
          <ArrowLeft className="size-4" /> Back to all boxers
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onOpenReassignAcademy(ap)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-info/10 text-info text-xs font-semibold hover:bg-info/20 transition"
          >
            <MapPin className="size-3.5" />
            Reassign Academy
          </button>
          <button
            onClick={() => setShowSuspensionModal(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${ap.is_suspended ? "bg-warning text-warning-foreground hover:bg-warning/90" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}`}
          >
            <Ban className="size-3.5" />
            {ap.is_suspended ? "Manage Suspension (Active)" : "Manage Suspension"}
          </button>

          {(payStatus === "cash_pending" || payStatus === "online_pending") && (
            <button
              onClick={() => onApproveCash(ap.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-success text-white text-xs font-semibold hover:bg-success/90 transition shadow-sm"
            >
              <Check className="size-3.5" /> Approve Payment
            </button>
          )}

          {payStatus === "rollover_pending" && (
            <>
              <button
                onClick={() => onApproveRollover(ap.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-info text-white text-xs font-semibold hover:bg-info/90 transition shadow-sm"
              >
                <RotateCcw className="size-3.5" /> Approve Rollover
              </button>
              <button
                onClick={() => onRejectRollover(ap.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition shadow-sm"
              >
                <X className="size-3.5" /> Reject Rollover
              </button>
            </>
          )}

          <button
            onClick={() => onOpenSendModal(ap)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
          >
            {fa ? <RefreshCw className="size-3.5" /> : <SendHorizonal className="size-3.5" />}
            {fa ? "Change Fee Plan" : "Assign Fee Package"}
          </button>
        </div>
      </div>

      {/* Hero card */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-card relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="size-16 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-primary-foreground grid place-items-center text-xl font-display font-bold shadow-md shrink-0">
              {(ap.full_name ?? "?").split(" ").map((w: string) => w[0]).join("").substring(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-xl font-bold text-foreground">{ap.full_name}</h1>
                <StatusPill status={payStatus} />
                {ap.is_suspended && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                    Suspended
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                {ap.email && (
                  <span className="flex items-center gap-1"><Mail className="size-3.5 text-primary" />{ap.email}</span>
                )}
                {ap.phone && (
                  <span className="flex items-center gap-1"><Phone className="size-3.5 text-primary" />{ap.phone}</span>
                )}
                <span className="flex items-center gap-1"><MapPin className="size-3.5 text-primary" />{ap.academies?.name ?? "No Academy Assigned"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-border">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Fee Plan</div>
              <div className="font-display font-bold text-base text-foreground mt-0.5">
                {fa?.fee_plans?.name ?? fa?.fee_plans?.plan_name ?? "Unassigned"}
              </div>
              {fa?.fee_plans?.amount && (
                <div className="text-xs text-muted-foreground">
                  ₹{Number(fa.fee_plans.amount).toLocaleString("en-IN")} / {fa.fee_plans.cycle ?? fa.fee_plans.billing_cycle ?? "monthly"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick KPI stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border/60">
          <div className="p-3 bg-elevated/40 rounded-xl">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5"><Calendar className="size-3.5 text-success" /> Attendance</div>
            <div className="text-lg font-bold font-display mt-0.5">{totalPresent} <span className="text-xs font-normal text-muted-foreground">days present</span></div>
          </div>
          <div className="p-3 bg-elevated/40 rounded-xl">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5"><Clock className="size-3.5 text-warning" /> Pending Leaves</div>
            <div className="text-lg font-bold font-display mt-0.5">{pendingLeaves} <span className="text-xs font-normal text-muted-foreground">requests</span></div>
          </div>
          <div className="p-3 bg-elevated/40 rounded-xl">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5"><IndianRupee className="size-3.5 text-info" /> Total Paid</div>
            <div className="text-lg font-bold font-display mt-0.5">₹{totalPaid.toLocaleString("en-IN")}</div>
          </div>
          <div className="p-3 bg-elevated/40 rounded-xl">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5"><Wallet className="size-3.5 text-destructive" /> Outstanding</div>
            <div className="text-lg font-bold font-display mt-0.5">₹{totalOutstanding.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-2 border-b border-border pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-elevated"
          }`}
        >
          <User className="size-3.5 inline mr-1.5" /> Full Profile Overview
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "payments"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-elevated"
          }`}
        >
          <Receipt className="size-3.5 inline mr-1.5" /> Invoices & Payments ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab("attendance")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "attendance"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-elevated"
          }`}
        >
          <CalendarDays className="size-3.5 inline mr-1.5" /> Attendance History ({attendance.length})
        </button>
        <button
          onClick={() => setActiveTab("leaves")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "leaves"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-elevated"
          }`}
        >
          <Clock className="size-3.5 inline mr-1.5" /> Leave Applications ({leaves.length})
        </button>
      </div>

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Info */}
          <SectionCard title="Personal & Contact Info" icon={User}>
            <div className="space-y-0.5">
              <DetailRow label="Full Name" value={ap.full_name} icon={User} />
              <DetailRow label="Email Address" value={ap.email} icon={Mail} />
              <DetailRow label="Phone Number" value={ap.phone} icon={Phone} />
              <DetailRow label="Date of Birth" value={ap.date_of_birth ? new Date(ap.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null} icon={CalendarDays} />
              <DetailRow label="Gender" value={ap.gender} />
              <DetailRow label="Blood Group" value={ap.blood_group} />
              <DetailRow label="Address" value={ap.address} icon={MapPin} />
              <DetailRow label="City & State" value={ap.city ? `${ap.city}${ap.state ? `, ${ap.state}` : ""}` : null} />
              <DetailRow label="Pincode" value={ap.pincode} />
              <DetailRow label="Emergency Contact" value={ap.emergency_contact_phone ? `${ap.emergency_contact_name ?? "Contact"} (${ap.emergency_contact_phone})` : null} icon={Phone} />
            </div>
          </SectionCard>

          {/* Boxing & Athletic Profile */}
          <SectionCard title="Boxing & Training Profile" icon={Award}>
            <div className="space-y-0.5">
              <DetailRow label="Stance" value={ap.stance ? ap.stance.toUpperCase() : "Orthodox"} />
              <DetailRow label="Weight" value={ap.weight_kg ? `${ap.weight_kg} kg` : null} />
              <DetailRow label="Height" value={ap.height_cm ? `${ap.height_cm} cm` : null} />
              <DetailRow label="Reach" value={ap.reach_cm ? `${ap.reach_cm} cm` : null} />
              <DetailRow label="Primary Discipline" value={ap.primary_discipline ?? "Boxing"} />
              <DetailRow label="Training Year / Batch" value={ap.training_year} />
              <DetailRow label="Assigned Academy" value={ap.academies?.name} icon={MapPin} />
              <DetailRow label="Onboarding Status" value={ap.onboarding_complete ? "Completed ✓" : "In Progress"} />
              <DetailRow label="Verification Status" value={ap.verification_status?.toUpperCase() ?? "PENDING"} icon={Shield} />
              <DetailRow label="Joined Date" value={ap.created_at ? new Date(ap.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null} />
            </div>
          </SectionCard>

          {/* Guardian details if present */}
          {ap.guardian_details && (
            <SectionCard title="Parent / Guardian Details" icon={Shield}>
              <div className="space-y-0.5">
                <DetailRow label="Guardian Name" value={ap.guardian_details.full_name} icon={User} />
                <DetailRow label="Relationship" value={ap.guardian_details.relationship} />
                <DetailRow label="Phone Number" value={ap.guardian_details.phone} icon={Phone} />
                <DetailRow label="Email Address" value={ap.guardian_details.email} icon={Mail} />
                <DetailRow label="Occupation" value={ap.guardian_details.occupation} />
                <DetailRow label="Emergency Contact" value={ap.guardian_details.emergency_contact} />
              </div>
            </SectionCard>
          )}

          {/* Applied Discounts & Schemes */}
          <SectionCard title="Discounts & Fee Schemes" icon={Star}>
            {discounts.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No active discounts or subsidy schemes applied to this boxer.
              </div>
            ) : (
              <div className="space-y-3">
                {discounts.map((d: any) => (
                  <div key={d.id} className="p-3 rounded-xl bg-elevated/40 border border-border flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-xs text-foreground">{d.discount_schemes?.name ?? "Special Discount"}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {d.discount_schemes?.discount_type === "percentage" ? `${d.discount_schemes.discount_value}% OFF` : `₹${d.discount_schemes?.discount_value} FLAT OFF`}
                      </div>
                    </div>
                    <Badge tone="success">Active</Badge>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB CONTENT: PAYMENTS */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          {/* Active Fee Assignment Banner */}
          <SectionCard title="Current Fee Plan Assignment" icon={Wallet}>
            {fa ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-base font-bold text-foreground flex items-center gap-2">
                    {fa.fee_plans?.name ?? fa.fee_plans?.plan_name ?? "Assigned Plan"}
                    <StatusPill status={fa.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Amount: <strong className="text-foreground">₹{Number(fa.fee_plans?.amount).toLocaleString("en-IN")}</strong> · Billing Cycle: <strong className="text-foreground capitalize">{fa.fee_plans?.cycle ?? fa.fee_plans?.billing_cycle ?? "monthly"}</strong>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Assigned on: {new Date(fa.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <button
                  onClick={() => onOpenSendModal(ap)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-primary/10 text-primary-dark hover:bg-primary/20 transition self-start sm:self-auto"
                >
                  Change Fee Plan
                </button>
              </div>
            ) : (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No fee package currently assigned to this boxer.</p>
                <button
                  onClick={() => onOpenSendModal(ap)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 transition shadow-sm inline-flex items-center gap-2"
                >
                  <SendHorizonal className="size-3.5" /> Assign Fee Plan
                </button>
              </div>
            )}
          </SectionCard>

          {/* Invoices List */}
          <SectionCard title="Invoices & Billing History" icon={Receipt}>
            {invoices.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No invoices generated yet for this boxer.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="py-3.5 flex items-center justify-between gap-4 flex-wrap first:pt-0 last:pb-0">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-xs text-foreground font-mono">{inv.invoice_number}</span>
                        <StatusPill status={inv.status} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Period: {inv.billing_period_start ? new Date(inv.billing_period_start).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"} to {inv.billing_period_end ? new Date(inv.billing_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Due: {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <div className="font-bold text-sm text-foreground">₹{Number(inv.amount_due).toLocaleString("en-IN")}</div>
                        <div className="text-xs text-muted-foreground">Paid: ₹{Number(inv.amount_paid ?? 0).toLocaleString("en-IN")}</div>
                      </div>
                      <button
                        onClick={() => {
                          const isPaid = inv.status === "paid";
                          const matchingPayment = payments.find((p: any) => p.invoice_id === inv.id);
                          generateReceipt({
                            invoiceNumber: inv.invoice_number,
                            athleteName: ap.full_name,
                            amount: isPaid ? Number(inv.amount_paid || inv.amount_due || 0) : Number(inv.amount_due || 0),
                            paymentDate: matchingPayment?.created_at || inv.updated_at || inv.created_at,
                            paymentMode: matchingPayment?.payment_mode || "online",
                            transactionRef: matchingPayment?.reference || inv.id,
                            planName: fa?.fee_plans?.name || "Fee Plan",
                            academyName: ap.academies?.name,
                            status: inv.status === "paid" ? "paid" : inv.status === "overdue" ? "overdue" : "unpaid",
                            amountLabel: isPaid ? "Amount Paid" : "Amount Due",
                          });
                        }}
                        className="p-2 rounded-xl border border-border hover:bg-elevated transition text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Download PDF Receipt"
                      >
                        <Download className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Payment Transactions */}
          <SectionCard title="Payment Transactions" icon={CreditCard}>
            {payments.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No payment transactions recorded.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {payments.map((p: any) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                    <div>
                      <div className="font-semibold text-xs text-foreground flex items-center gap-2">
                        <Banknote className="size-3.5 text-success" />
                        ₹{Number(p.amount).toLocaleString("en-IN")} ({p.payment_mode?.toUpperCase() ?? "ONLINE"})
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Ref: {p.reference || p.transaction_id || p.id}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB CONTENT: ATTENDANCE */}
      {activeTab === "attendance" && (
        <SectionCard title="Attendance Log" icon={CalendarDays}>
          {attendance.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No attendance records found for this boxer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
                    <th className="py-2.5 text-left">Date</th>
                    <th className="py-2.5 text-left">Status</th>
                    <th className="py-2.5 text-left">Check-in Time</th>
                    <th className="py-2.5 text-right">Distance from Academy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {attendance.map((a: any) => (
                    <tr key={a.id} className="hover:bg-elevated/40 transition">
                      <td className="py-3 font-medium text-foreground">
                        {new Date(a.session_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3"><StatusPill status={a.status} /></td>
                      <td className="py-3 text-muted-foreground">
                        {a.checked_in_at ? new Date(a.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="py-3 text-right font-mono text-muted-foreground">
                        {a.distance_meters != null ? `${a.distance_meters}m` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* TAB CONTENT: LEAVES */}
      {activeTab === "leaves" && (
        <SectionCard title="Leave Applications" icon={Clock}>
          {leaves.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No leave applications submitted by this boxer.
            </div>
          ) : (
            <div className="space-y-4">
              {leaves.map((l: any) => (
                <div key={l.id} className="p-4 rounded-xl border border-border bg-elevated/30 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="font-semibold text-xs text-foreground">
                      Leave Date: {new Date((l.start_date || l.created_at) + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                      {l.end_date && l.end_date !== l.start_date ? ` to ${new Date(l.end_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={l.status ?? "pending"} />
                      {(l.status ?? "pending") === "pending" && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => handleLeaveAction(l.id, "approved", l.start_date || l.created_at)}
                            disabled={processingLeaveId === l.id}
                            className="px-2.5 py-1 rounded-lg bg-success/15 hover:bg-success/25 text-success text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                            title="Approve Leave"
                          >
                            {processingLeaveId === l.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleLeaveAction(l.id, "rejected", l.start_date || l.created_at)}
                            disabled={processingLeaveId === l.id}
                            className="px-2.5 py-1 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                            title="Reject Leave"
                          >
                            {processingLeaveId === l.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {l.reason && (
                    <p className="text-xs text-muted-foreground bg-elevated/50 border border-border p-3 rounded-xl italic">
                      "{l.reason}"
                    </p>
                  )}
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Applied on {l.created_at ? new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                    {l.reviewed_at && (
                      <span>Reviewed on {new Date(l.reviewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Suspension Modal */}
      {showSuspensionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-destructive/10 grid place-items-center shrink-0">
                  <Ban className="size-4 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Medical Suspension</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Manage training restriction for {ap.full_name}</p>
                </div>
              </div>
              <button onClick={() => setShowSuspensionModal(false)} className="p-2 hover:bg-subtle rounded-lg text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-subtle/50 transition">
                <input
                  type="checkbox"
                  checked={suspendForm.is_suspended}
                  onChange={e => setSuspendForm(f => ({ ...f, is_suspended: e.target.checked }))}
                  className="size-4 rounded border-border text-destructive focus:ring-destructive"
                />
                <span className="text-sm font-semibold text-destructive">Suspend Boxer</span>
              </label>

              {suspendForm.is_suspended && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Reason for Suspension *</label>
                    <input 
                      type="text" 
                      value={suspendForm.suspension_reason} 
                      onChange={e => setSuspendForm(f => ({ ...f, suspension_reason: e.target.value }))}
                      className="input-premium" 
                      placeholder="e.g. Broken thumb" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 flex justify-between">
                      <span>Suspension End Date</span>
                      <span className="text-muted-foreground font-normal">(Optional / Indefinite)</span>
                    </label>
                    <input 
                      type="date" 
                      value={suspendForm.suspension_end_date} 
                      onChange={e => setSuspendForm(f => ({ ...f, suspension_end_date: e.target.value }))}
                      className="input-premium" 
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowSuspensionModal(false)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button 
                onClick={handleSaveSuspension} 
                disabled={suspending || (suspendForm.is_suspended && !suspendForm.suspension_reason.trim())} 
                className="flex-1 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {suspending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN ADMIN ATHLETES PAGE ───────────────────────────────────────────────

function AdminBoxersPage() {
  const { user, profile } = useAuth();
  const [boxers, setBoxers]     = useState<any[]>([]);
  const [feePlans, setFeePlans]     = useState<any[]>([]);
  const [academies, setAcademies]   = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [academyFilter, setAcademyFilter] = useState("all");

  // Selected boxer for full-page detail view
  const [selectedBoxerId, setSelectedBoxerId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("id");
    }
    return null;
  });

  const navigateBoxerDetail = (id: string | null) => {
    setSelectedBoxerId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("id", id);
      else url.searchParams.delete("id");
      window.history.pushState(null, "", url.toString());
    }
  };

  // Modals & Action States
  const [selectedBoxerForModal, setSelectedBoxerForModal] = useState<any | null>(null);
  const [showSendModal, setShowSendModal]         = useState(false);
  const [sendPlanId, setSendPlanId]               = useState("");
  const [sendAcademyId, setSendAcademyId]         = useState("");
  const [sendNotes, setSendNotes]                 = useState("");
  const [sending, setSending]                     = useState(false);
  const [sendError, setSendError]                 = useState<string | null>(null);
  const [cashApproveId, setCashApproveId]         = useState<string | null>(null);
  const [approving, setApproving]                 = useState(false);
  const [rolloverApproveId, setRolloverApproveId] = useState<string | null>(null);
  const [rolloverRejectId, setRolloverRejectId]   = useState<string | null>(null);
  const [rolloverActioning, setRolloverActioning] = useState(false);
  const [reassignId, setReassignId]               = useState<string | null>(null);
  const [reassignAcademy, setReassignAcademy]     = useState("");
  const [reassigning, setReassigning]             = useState(false);
  const [suspendActionId, setSuspendActionId]     = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("admin-boxers-watch-full")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "boxer_profiles" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.academy_id]);

  async function loadData() {
    setLoading(true);
    try {
      const targetAcademyId = profile?.academy_id;

      let profQuery = supabase.from("profiles").select("*").eq("role", "boxer").order("created_at", { ascending: false });
      let bpQuery = supabase.from("boxer_profiles").select("*").order("created_at", { ascending: false });
      let plansQuery = supabase.from("fee_plans").select("id,name,amount,cycle").eq("is_active", true);
      let assignsQuery = supabase.from("fee_assignments").select("id,boxer_profile_id,fee_plan_id,status,assignment_status,payment_mode,rollover_requested,fee_plans(name,amount,cycle)");
      let invsQuery = supabase.from("invoices").select("id,boxer_profile_id,status,due_date,amount_due,amount_paid,billing_period_start,billing_period_end");
      let acsQuery = supabase.from("academies").select("id,name,city,state").order("name");

      if (targetAcademyId) {
        profQuery = profQuery.eq("academy_id", targetAcademyId);
        bpQuery = bpQuery.eq("academy_id", targetAcademyId);
      }

      const [profilesRes, boxerProfilesRes, plansRes, assignsRes, invsRes, acsRes] = await Promise.all([
        profQuery,
        bpQuery,
        plansQuery,
        assignsQuery,
        invsQuery,
        acsQuery,
      ]);

      if (profilesRes.error) console.error("Error fetching boxer profiles:", profilesRes.error);
      if (boxerProfilesRes.error) console.error("Error fetching boxer_profiles:", boxerProfilesRes.error);
      if (plansRes.error) console.error("Error fetching fee_plans:", plansRes.error);
      if (assignsRes.error) console.error("Error fetching fee_assignments:", assignsRes.error);
      if (invsRes.error) console.error("Error fetching invoices:", invsRes.error);
      if (acsRes.error) console.error("Error fetching academies:", acsRes.error);

      const normalizedPlans = (plansRes.data ?? []).map(p => ({
        ...p,
        plan_name: p.name ?? "Fee Plan",
        billing_cycle: p.cycle ?? "monthly",
      }));
      setFeePlans(normalizedPlans);
      setAcademies(acsRes.data ?? []);

      const userProfiles = profilesRes.data ?? [];
      const boxerProfiles = boxerProfilesRes.data ?? [];
      const acs = acsRes.data ?? [];
      const assigns = assignsRes.data ?? [];
      const invs = invsRes.data ?? [];

      const seenIds = new Set<string>();
      const combinedBoxers: any[] = [];

      // 1. Add from boxer_profiles
      for (const bp of boxerProfiles) {
        const userProf = userProfiles.find(p => p.id === bp.user_id);
        const academyId = bp.academy_id || userProf?.academy_id;
        const academy = acs.find(ac => ac.id === academyId);
        const assignment = assigns.find(a => a.boxer_profile_id === bp.id || (bp.user_id && a.boxer_profile_id === bp.user_id));
        const invoice = invs.find(i => i.boxer_profile_id === bp.id || (bp.user_id && i.boxer_profile_id === bp.user_id));

        let payStatus = "unassigned";
        if (assignment) {
          const ast = assignment.assignment_status;
          if (ast === "cash_pending")      payStatus = "cash_pending";
          else if (ast === "online_pending") payStatus = "online_pending";
          else if (ast === "rollover_pending") payStatus = "rollover_pending";
          else if (ast === "rollover_approved") payStatus = "rollover_approved";
          else if (ast === "cash_approved" || ast === "online_paid") payStatus = "paid";
          else if (invoice?.status === "paid")    payStatus = "paid";
          else if (invoice?.status === "overdue")  payStatus = "overdue";
          else if (invoice)                        payStatus = "unpaid";
          else                                     payStatus = "awaiting_invoice";
        }

        seenIds.add(bp.id);
        if (bp.user_id) seenIds.add(bp.user_id);

        combinedBoxers.push({
          ...bp,
          full_name: bp.full_name || userProf?.full_name || bp.email?.split("@")[0] || "Boxer",
          email: bp.email || userProf?.email,
          phone: bp.phone || userProf?.phone,
          academy_id: academyId,
          academy,
          assignment,
          invoice,
          payStatus,
        });
      }

      // 2. Add from profiles where role === 'boxer' if not already in boxer_profiles
      for (const p of userProfiles) {
        if (!seenIds.has(p.id)) {
          const academy = acs.find(ac => ac.id === p.academy_id);
          const assignment = assigns.find(a => a.boxer_profile_id === p.id);
          const invoice = invs.find(i => i.boxer_profile_id === p.id);

          let payStatus = "unassigned";
          if (assignment) {
            const ast = assignment.assignment_status;
            if (ast === "cash_pending")      payStatus = "cash_pending";
            else if (ast === "online_pending") payStatus = "online_pending";
            else if (ast === "rollover_pending") payStatus = "rollover_pending";
            else if (ast === "rollover_approved") payStatus = "rollover_approved";
            else if (ast === "cash_approved" || ast === "online_paid") payStatus = "paid";
            else if (invoice?.status === "paid")    payStatus = "paid";
            else if (invoice?.status === "overdue")  payStatus = "overdue";
            else if (invoice)                        payStatus = "unpaid";
            else                                     payStatus = "awaiting_invoice";
          }

          combinedBoxers.push({
            id: p.id,
            user_id: p.id,
            full_name: p.full_name || p.email?.split("@")[0] || "Boxer",
            email: p.email,
            phone: p.phone,
            academy_id: p.academy_id,
            academy,
            assignment,
            invoice,
            payStatus,
            onboarding_complete: p.onboarding_complete ?? false,
          });
        }
      }

      setBoxers(combinedBoxers);
    } catch (e) {
      console.error("loadData caught exception:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPackage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBoxerForModal || !sendPlanId) return;
    setSending(true);
    setSendError(null);
    try {
      const plan = feePlans.find(p => p.id === sendPlanId);
      if (!plan) throw new Error("Selected fee plan not found");

      const targetUserId = selectedBoxerForModal.user_id || selectedBoxerForModal.id;
      const targetAcademyId = sendAcademyId || selectedBoxerForModal.academy_id || profile?.academy_id || academies[0]?.id;

      if (!targetAcademyId) throw new Error("Please select an academy location for this boxer.");

      // 1. Ensure boxer_profiles record exists
      let boxerProfileId = selectedBoxerForModal.id;
      const { data: existingBp } = await supabase
        .from("boxer_profiles")
        .select("id")
        .or(`id.eq.${selectedBoxerForModal.id},user_id.eq.${targetUserId}`)
        .maybeSingle();

      if (existingBp) {
        boxerProfileId = existingBp.id;
        if (targetAcademyId) {
          await supabase.from("boxer_profiles").update({ academy_id: targetAcademyId }).eq("id", boxerProfileId);
        }
      } else {
        const { data: newBp, error: newBpErr } = await supabase
          .from("boxer_profiles")
          .upsert({
            user_id: targetUserId,
            academy_id: targetAcademyId,
            full_name: selectedBoxerForModal.full_name || "Boxer",
            email: selectedBoxerForModal.email || null,
            phone: selectedBoxerForModal.phone || null,
            date_of_birth: selectedBoxerForModal.date_of_birth || "2000-01-01",
            gender: selectedBoxerForModal.gender || "Male",
            verification_status: "pending",
            onboarding_complete: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" })
          .select("id")
          .single();

        if (newBpErr) throw new Error(newBpErr.message);
        if (newBp) boxerProfileId = newBp.id;
      }

      // 2. Insert or update fee_assignments
      const { data: existingAssign } = await supabase
        .from("fee_assignments")
        .select("id")
        .eq("boxer_profile_id", boxerProfileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let assignmentId = existingAssign?.id;

      if (existingAssign?.id) {
        const { error: updErr } = await supabase.from("fee_assignments").update({
          fee_plan_id: sendPlanId,
          academy_id: targetAcademyId,
          status: "active",
          updated_at: new Date().toISOString(),
        }).eq("id", existingAssign.id);
        if (updErr) throw new Error(updErr.message);
      } else {
        const { data: newAssign, error: insErr } = await supabase.from("fee_assignments").insert({
          boxer_profile_id: boxerProfileId,
          fee_plan_id: sendPlanId,
          academy_id: targetAcademyId,
          center_id: selectedBoxerForModal?.center_id,
          assigned_by: user?.id,
          status: "active",
        }).select("id").single();
        if (insErr) throw new Error(insErr.message);
        assignmentId = newAssign?.id;
      }

      // 3. Insert or update invoice
      const cycleDays = plan.cycle === "quarterly" || plan.billing_cycle === "quarterly" ? 90 
        : plan.cycle === "yearly" || plan.billing_cycle === "yearly" ? 365 
        : plan.cycle === "half_yearly" || plan.billing_cycle === "half_yearly" ? 180 
        : 30;

      const startDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + cycleDays);

      const { data: existingInv } = await supabase
        .from("invoices")
        .select("id")
        .eq("boxer_profile_id", boxerProfileId)
        .neq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingInv?.id) {
        const { error: invUpdErr } = await supabase.from("invoices").update({
          academy_id: targetAcademyId,
          fee_assignment_id: assignmentId,
          amount_due: plan.amount,
          amount_paid: 0,
          due_date: dueDate.toISOString().split("T")[0],
          billing_period_start: startDate.toISOString().split("T")[0],
          billing_period_end: dueDate.toISOString().split("T")[0],
          status: "unpaid",
          updated_at: new Date().toISOString(),
        }).eq("id", existingInv.id);
        if (invUpdErr) throw new Error(invUpdErr.message);
      } else {
        const { error: invInsErr } = await supabase.from("invoices").insert({
          invoice_number: `BOX-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999999)).padStart(6, "0")}`,
          academy_id: targetAcademyId,
          boxer_profile_id: boxerProfileId,
          fee_assignment_id: assignmentId,
          amount_due: plan.amount,
          amount_paid: 0,
          due_date: dueDate.toISOString().split("T")[0],
          billing_period_start: startDate.toISOString().split("T")[0],
          billing_period_end: dueDate.toISOString().split("T")[0],
          status: "unpaid",
        });
        if (invInsErr) throw new Error(invInsErr.message);
      }

      // 4. Send notification
      const academy = academies.find(a => a.id === targetAcademyId);
      if (targetUserId) {
        await supabase.from("notifications").insert({
          recipient_id: targetUserId,
          type: "fee_package_sent",
          title: existingAssign ? "Fee package reassigned" : "Fee package assigned",
          body: `Your fee plan has been ${existingAssign ? "reassigned" : "assigned"} to "${plan.name || plan.plan_name}" (₹${Number(plan.amount).toLocaleString("en-IN")})${academy ? ` at ${academy.name}` : ""}.`,
          related_entity_type: "fee_assignment",
        });
      }

      setShowSendModal(false);
      setSendPlanId("");
      setSendAcademyId("");
      setSendNotes("");
      await loadData();
    } catch (err: any) {
      console.error("handleSendPackage error:", err);
      setSendError(err.message || "Failed to assign fee plan");
    } finally {
      setSending(false);
    }
  }

  async function handleToggleSuspension(boxerId: string, currentlySuspended: boolean) {
    setSuspendActionId(boxerId);
    try {
      await supabase.from("boxer_profiles")
        .update({ is_suspended: !currentlySuspended })
        .eq("id", boxerId);
      
      const boxer = boxers.find(a => a.id === boxerId);
      if (boxer?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: boxer.user_id,
          type: "status_changed",
          title: !currentlySuspended ? "Account Suspended" : "Account Reinstated",
          body: !currentlySuspended 
            ? "Your account has been suspended by the academy admin. Please contact administration."
            : "Your account has been reinstated. You can now access your dashboard.",
        });
      }
      loadData();
    } finally {
      setSuspendActionId(null);
    }
  }

  async function handleReassignAcademy() {
    if (!reassignId || !reassignAcademy) return;
    setReassigning(true);
    try {
      await supabase.from("boxer_profiles").update({ academy_id: reassignAcademy }).eq("id", reassignId);
      const boxer = boxers.find(a => a.id === reassignId);
      const academy = academies.find(a => a.id === reassignAcademy);
      if (boxer?.user_id && academy) {
        await supabase.from("notifications").insert({
          recipient_id: boxer.user_id, type: "academy_changed",
          title: "Academy location updated",
          body: `Your assigned academy has been updated to ${academy.name}.`,
        });
      }
      setReassignId(null); setReassignAcademy(""); loadData();
    } finally { setReassigning(false); }
  }

  async function handleApproveCash(boxerId: string) {
    setApproving(true);
    try {
      const boxer = boxers.find(a => a.id === boxerId);
      const invoice  = boxer?.invoice;
      const pMode    = "cash";

      // 1. Update fee assignment status
      if (boxer?.assignment?.id) {
        await supabase.from("fee_assignments").update({
          assignment_status: "cash_approved",
          status: "active",
        }).eq("id", boxer.assignment.id);
      } else {
        await supabase.from("fee_assignments").update({
          assignment_status: "cash_approved",
          status: "active",
        }).eq("boxer_profile_id", boxerId).in("assignment_status", ["cash_pending"]);
      }

      if (invoice?.id) {
        const unpaid = Number(invoice.amount_due ?? 0);
        if (unpaid > 0) {
          await supabase.from("payments").insert({
            invoice_id: invoice.id,
            boxer_profile_id: boxer.boxer_profile_id || boxer.id,
            amount: unpaid,
            payment_mode: pMode,
            recorded_by: user?.id,
            reference: `CASH-${Date.now()}`,
          });
        }
        await supabase.from("invoices").update({
          status: "paid",
          amount_paid: unpaid,
          updated_at: new Date().toISOString(),
        }).eq("id", invoice.id);
      }

      if (boxer?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: boxer.user_id,
          type: "cash_approved",
          title: "Payment confirmed ✓",
          body: `Your cash payment has been confirmed by your admin. Your dashboard is now unlocked!`,
        });
      }
      setCashApproveId(null);
      loadData();
    } catch (err: any) { alert(err.message || "Failed to approve cash payment"); }
    finally { setApproving(false); }
  }

  async function handleApproveRollover(boxerId: string) {
    setRolloverActioning(true);
    try {
      const boxer = boxers.find(a => a.id === boxerId);
      
      // Update fee assignment status
      if (boxer?.assignment?.id) {
        await supabase.from("fee_assignments").update({
          assignment_status: "rollover_approved",
          status: "active",
        }).eq("id", boxer.assignment.id);
      } else {
        await supabase.from("fee_assignments").update({
          assignment_status: "rollover_approved",
          status: "active",
        }).eq("boxer_profile_id", boxerId).in("assignment_status", ["rollover_pending"]);
      }

      if (boxer?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: boxer.user_id,
          type: "rollover_approved",
          title: "Payment rollover approved ✓",
          body: "Your payment rollover has been approved. Your dashboard is now unlocked!",
        });
      }
      setRolloverApproveId(null);
      loadData();
    } catch (err: any) { alert(err.message); }
    finally { setRolloverActioning(false); }
  }

  async function handleRejectRollover(boxerId: string) {
    setRolloverActioning(true);
    try {
      const boxer = boxers.find(a => a.id === boxerId);
      
      // Revert fee assignment status so boxer can pay again
      if (boxer?.assignment?.id) {
        await supabase.from("fee_assignments").update({
          assignment_status: null,
          payment_mode: null,
          rollover_requested: false,
        }).eq("id", boxer.assignment.id);
      } else {
        await supabase.from("fee_assignments").update({
          assignment_status: null,
          payment_mode: null,
          rollover_requested: false,
        }).eq("boxer_profile_id", boxerId).in("assignment_status", ["rollover_pending"]);
      }

      if (boxer?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: boxer.user_id,
          type: "rollover_rejected",
          title: "Payment rollover rejected",
          body: "Your payment rollover request was declined. Please complete your payment to unlock your dashboard.",
        });
      }
      setRolloverRejectId(null);
      loadData();
    } catch (err: any) { alert(err.message); }
    finally { setRolloverActioning(false); }
  }

  const statusTone: Record<string, any> = {
    unassigned: undefined, awaiting_invoice: undefined,
    unpaid: "warning", cash_pending: "warning", online_pending: "warning",
    rollover_pending: "info", rollover_approved: "info",
    overdue: "danger", paid: "success",
  };
  const statusLabel: Record<string, string> = {
    unassigned: "Unassigned", awaiting_invoice: "Invoice pending",
    unpaid: "Unpaid", cash_pending: "Cash pending", online_pending: "PayU pending",
    rollover_pending: "Rollover pending", rollover_approved: "Rollover approved",
    overdue: "Overdue", paid: "Paid",
  };

  const filtered = boxers.filter(a => {
    const matchQ = !q || a.full_name?.toLowerCase().includes(q.toLowerCase()) || (a.email && a.email.toLowerCase().includes(q.toLowerCase())) || (a.phone && a.phone.includes(q)) || a.primary_discipline?.toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || a.payStatus === statusFilter;
    const matchA = academyFilter === "all" || a.academy_id === academyFilter;
    return matchQ && matchS && matchA;
  });
  const cashPending     = boxers.filter(a => a.payStatus === "cash_pending");
  const rolloverPending = boxers.filter(a => a.payStatus === "rollover_pending");

  // IF AN ATHLETE IS SELECTED -> RENDER THE FULL ATHLETE DETAIL PAGE
  if (selectedBoxerId) {
    return (
      <FullBoxerDetailView
        boxerId={selectedBoxerId}
        onBack={() => navigateBoxerDetail(null)}
        onOpenSendModal={(ap) => {
          setSelectedBoxerForModal(ap);
          setSendPlanId(ap.assignment?.fee_plan_id || feePlans[0]?.id || "");
          setSendAcademyId(ap.academy_id || academies[0]?.id || "");
          setShowSendModal(true);
        }}
        onOpenReassignAcademy={(ap) => {
          setReassignId(ap.id);
          setReassignAcademy(ap.academy_id ?? "");
        }}
        onApproveCash={(id) => setCashApproveId(id)}
        onApproveRollover={(id) => setRolloverApproveId(id)}
        onRejectRollover={(id) => setRolloverRejectId(id)}
      />
    );
  }

  // DEFAULT VIEW: FULL ATHLETES TABLE LIST
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Boxers Management"
        subtitle={`${boxers.length} enrolled boxers · ${cashPending.length} cash pending · ${rolloverPending.length} rollover${rolloverPending.length !== 1 ? "s" : ""} pending`}
      />

      {/* Cash pending banner */}
      {cashPending.length > 0 && (
        <div className="bg-warning/8 border border-warning/25 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-warning">Cash payment approvals needed</div>
            <div className="text-xs text-muted-foreground mt-0.5">{cashPending.length} boxer{cashPending.length > 1 ? "s" : ""} — confirm receipt to unlock access.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {cashPending.map(a => (
              <button key={a.id} onClick={() => setCashApproveId(a.id)}
                className="inline-flex items-center gap-2 bg-warning text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-warning/90 transition cursor-pointer">
                <Check className="size-3" /> Approve {a.full_name?.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rollover pending banner */}
      {rolloverPending.length > 0 && (
        <div className="bg-info/8 border border-info/25 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-info">Payment rollover approvals needed</div>
            <div className="text-xs text-muted-foreground mt-0.5">{rolloverPending.length} boxer{rolloverPending.length > 1 ? "s" : ""} requested a rollover.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {rolloverPending.map(a => (
              <button key={a.id} onClick={() => setRolloverApproveId(a.id)}
                className="inline-flex items-center gap-2 bg-info text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-info/90 transition cursor-pointer">
                <RotateCcw className="size-3" /> Review {a.full_name?.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full width table card */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-card">
        {/* Search & Filter Header */}
        <div className="px-6 py-4 border-b border-border flex items-center gap-4 flex-wrap bg-elevated/40">
          <div className="flex items-center gap-2 px-3.5 h-10 rounded-xl border border-border bg-surface flex-1 max-w-md shadow-sm">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search boxers by name, email, phone…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {q && <button onClick={() => setQ("")}><X className="size-4 text-muted-foreground" /></button>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Academy:</span>
            <select value={academyFilter} onChange={e => setAcademyFilter(e.target.value)} className="text-sm h-10 px-3.5 border border-border rounded-xl bg-surface font-medium shadow-sm">
              <option value="all">All Academies</option>
              {academies.map(ac => (
                <option key={ac.id} value={ac.id}>{ac.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Filter status:</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm h-10 px-3.5 border border-border rounded-xl bg-surface font-medium shadow-sm">
              <option value="all">All Statuses ({boxers.length})</option>
              <option value="unassigned">Unassigned</option>
              <option value="cash_pending">Cash pending</option>
              <option value="rollover_pending">Rollover pending</option>
              <option value="rollover_approved">Rollover approved</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        {/* Boxers Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated/70 border-b border-border">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                <th className="text-left py-3.5 px-6">Boxer Name</th>
                <th className="text-left py-3.5 px-4">Discipline</th>
                <th className="text-left py-3.5 px-4">Assigned Academy</th>
                <th className="text-left py-3.5 px-4">Fee Package</th>
                <th className="text-left py-3.5 px-4">Payment Status</th>
                <th className="text-left py-3.5 px-4">Due Date</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="size-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">No matching boxers found.</td></tr>
              ) : filtered.map(a => (
                <tr
                  key={a.id}
                  onClick={() => navigateBoxerDetail(a.id)}
                  className="hover:bg-primary/5 transition cursor-pointer group"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-gradient-to-br from-primary to-primary-dark text-primary-foreground grid place-items-center text-xs font-bold shrink-0 shadow-sm group-hover:scale-105 transition">
                        {(a.full_name ?? "?").split(" ").map((w: string) => w[0]).join("").substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-foreground group-hover:text-primary transition flex items-center gap-1.5">
                          {a.full_name}
                          {a.is_suspended && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-destructive/10 text-destructive border border-destructive/20">
                              Suspended
                            </span>
                          )}
                          <span className="text-[11px] font-normal text-muted-foreground opacity-0 group-hover:opacity-100 transition">
                            View details →
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">{a.training_year ?? "General Training"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-xs font-medium text-muted-foreground">{a.primary_discipline ?? "—"}</td>
                  <td className="py-4 px-4 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate max-w-[150px] font-medium text-foreground">{a.academy?.name ?? "Unassigned"}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-xs">
                    {a.assignment?.fee_plans ? (
                      <div>
                        <div className="font-semibold text-foreground">{a.assignment.fee_plans.name ?? a.assignment.fee_plans.plan_name ?? "Unknown Plan"}</div>
                        <div className="text-muted-foreground">₹{Number(a.assignment.fee_plans.amount).toLocaleString("en-IN")}</div>
                      </div>
                    ) : <span className="text-muted-foreground italic">No plan</span>}
                  </td>
                  <td className="py-4 px-4">
                    <Badge tone={statusTone[a.payStatus]}>{statusLabel[a.payStatus] ?? a.payStatus}</Badge>
                  </td>
                  <td className="py-4 px-4 text-xs text-muted-foreground">
                    {a.invoice?.due_date ? new Date(a.invoice.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="py-4 px-6 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setReassignId(a.id); setReassignAcademy(a.academy_id ?? ""); }}
                        title="Reassign Academy"
                        className="p-2 rounded-xl border border-border hover:bg-info/10 hover:border-info/30 transition text-info cursor-pointer"
                      >
                        <MapPin className="size-4" />
                      </button>

                      <button
                        onClick={() => handleToggleSuspension(a.id, !!a.is_suspended)}
                        disabled={suspendActionId === a.id}
                        title={a.is_suspended ? "Reactivate Account" : "Suspend Account"}
                        className={`p-2 rounded-xl border transition cursor-pointer ${
                          a.is_suspended
                            ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
                            : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                        }`}
                      >
                        {suspendActionId === a.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Ban className="size-4" />
                        )}
                      </button>

                      {(a.payStatus === "cash_pending" || a.payStatus === "online_pending") && (
                        <button
                          onClick={() => setCashApproveId(a.id)}
                          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-success text-white hover:bg-success/90 transition shadow-sm cursor-pointer"
                        >
                          Approve Payment
                        </button>
                      )}

                      {a.payStatus === "rollover_pending" && (
                        <>
                          <button
                            onClick={() => setRolloverApproveId(a.id)}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-info text-white hover:bg-info/90 transition flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="size-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => setRolloverRejectId(a.id)}
                            className="text-xs font-bold px-2 py-1.5 rounded-xl bg-destructive text-white hover:bg-destructive/90 transition cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => {
                          setSelectedBoxerForModal(a);
                          setSendPlanId(a.assignment?.fee_plan_id || feePlans[0]?.id || "");
                          setSendAcademyId(a.academy_id || academies[0]?.id || "");
                          setShowSendModal(true);
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary/10 text-primary-dark hover:bg-primary/20 transition inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {a.assignment ? <RefreshCw className="size-3.5" /> : <SendHorizonal className="size-3.5" />}
                        {a.assignment ? "Reassign Fee" : "Assign Fee"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border bg-elevated/40 flex justify-between items-center text-xs text-muted-foreground">
          <span>Displaying <strong>{filtered.length}</strong> of <strong>{boxers.length}</strong> enrolled boxers</span>
          <span>Click any boxer row to view full detailed profile, billing history & attendance</span>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Send / Reassign Fee Package Modal */}
      {showSendModal && selectedBoxerForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setShowSendModal(false)}>
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md animate-fade-up overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
              <div>
                <h3 className="font-display font-semibold">Assign Fee Plan Package</h3>
                <p className="text-xs text-muted-foreground mt-0.5">for {selectedBoxerForModal.full_name}</p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground transition cursor-pointer"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleSendPackage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-2">Select Fee Plan *</label>
                <select required value={sendPlanId} onChange={e => setSendPlanId(e.target.value)} className="input-premium">
                  <option value="">Choose plan…</option>
                  {feePlans.map(p => {
                    const planName = p.name ?? p.plan_name ?? "Fee Plan";
                    const amountStr = `₹${Number(p.amount).toLocaleString("en-IN")}`;
                    const cycleStr = p.cycle ?? p.billing_cycle ?? "monthly";
                    return (
                      <option key={p.id} value={p.id}>
                        {planName} — {amountStr} / {cycleStr}
                      </option>
                    );
                  })}
                </select>
              </div>

              {sendPlanId && (() => {
                const plan = feePlans.find(p => p.id === sendPlanId);
                if (!plan) return null;
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount</span><span className="font-bold">₹ {Number(plan.amount).toLocaleString("en-IN")}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Cycle</span><span className="capitalize">{plan.billing_cycle === "custom" && plan.custom_duration_days ? `${plan.custom_duration_days} Days` : (plan.cycle || plan.billing_cycle)}</span></div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold mb-2">Assign to Academy Location *</label>
                <select required value={sendAcademyId} onChange={e => setSendAcademyId(e.target.value)} className="input-premium">
                  <option value="">Select academy…</option>
                  {academies.map(a => (<option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2">Notes (optional)</label>
                <textarea rows={2} value={sendNotes} onChange={e => setSendNotes(e.target.value)} placeholder="Notes for boxer…" className="input-premium resize-none" />
              </div>

              {sendError && <div className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg p-3">{sendError}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowSendModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition cursor-pointer">Cancel</button>
                <button type="submit" disabled={sending || !sendPlanId || !sendAcademyId} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card cursor-pointer">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
                  {sending ? "Assigning…" : "Assign Package"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rollover approve Modal */}
      {rolloverApproveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setRolloverApproveId(null)}>
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-info/10 grid place-items-center mx-auto mb-4"><RotateCcw className="size-5 text-info" /></div>
            <h3 className="font-semibold text-base">Approve Payment Rollover?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">This will defer payment for <strong>{boxers.find(a => a.id === rolloverApproveId)?.full_name}</strong> and unlock their dashboard.</p>
            <div className="flex gap-3">
              <button onClick={() => setRolloverApproveId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition cursor-pointer">Cancel</button>
              <button onClick={() => handleApproveRollover(rolloverApproveId)} disabled={rolloverActioning} className="flex-1 px-4 py-2 text-sm font-semibold bg-info text-white rounded-xl hover:bg-info/90 transition flex items-center justify-center gap-2 cursor-pointer">
                {rolloverActioning ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollover reject Modal */}
      {rolloverRejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setRolloverRejectId(null)}>
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4"><X className="size-5 text-destructive" /></div>
            <h3 className="font-semibold text-base">Reject Rollover Request?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5"><strong>{boxers.find(a => a.id === rolloverRejectId)?.full_name}</strong>'s rollover will be rejected.</p>
            <div className="flex gap-3">
              <button onClick={() => setRolloverRejectId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition cursor-pointer">Cancel</button>
              <button onClick={() => handleRejectRollover(rolloverRejectId)} disabled={rolloverActioning} className="flex-1 px-4 py-2 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 transition flex items-center justify-center gap-2 cursor-pointer">
                {rolloverActioning ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash approve Modal */}
      {cashApproveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setCashApproveId(null)}>
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-success/10 grid place-items-center mx-auto mb-4"><Banknote className="size-5 text-success" /></div>
            <h3 className="font-semibold text-base">Confirm Cash Received</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Confirm you have received cash payment from <strong>{boxers.find(a => a.id === cashApproveId)?.full_name}</strong>. Their dashboard will unlock immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => setCashApproveId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition cursor-pointer">Cancel</button>
              <button onClick={() => handleApproveCash(cashApproveId)} disabled={approving} className="flex-1 px-4 py-2 text-sm font-semibold bg-success text-white rounded-xl hover:bg-success/90 transition flex items-center justify-center gap-2 cursor-pointer">
                {approving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm Received
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign academy Modal */}
      {reassignId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setReassignId(null)}>
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 rounded-xl bg-info/10 grid place-items-center shrink-0"><MapPin className="size-4 text-info" /></div>
              <div>
                <h3 className="font-semibold">Reassign Academy Location</h3>
                <p className="text-xs text-muted-foreground">{boxers.find(a => a.id === reassignId)?.full_name}</p>
              </div>
            </div>
            <select value={reassignAcademy} onChange={e => setReassignAcademy(e.target.value)} className="input-premium mb-3">
              <option value="">Select new academy…</option>
              {academies.map(a => (<option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>))}
            </select>
            <p className="text-[11px] text-muted-foreground mb-5">Boxer's attendance geo-fence will update immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => { setReassignId(null); setReassignAcademy(""); }} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition cursor-pointer">Cancel</button>
              <button onClick={handleReassignAcademy} disabled={reassigning || !reassignAcademy} className="flex-1 px-4 py-2 text-sm font-semibold bg-info text-white rounded-xl hover:bg-info/90 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer">
                {reassigning ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
