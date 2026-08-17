import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  Search, X, Loader2, Check, ArrowLeft,
  MapPin, Banknote, CreditCard, RefreshCw, RotateCcw, SendHorizonal,
  User, Phone, Mail, CalendarDays, BookOpen, Shield, Award,
  Clock, CheckCircle2, XCircle, AlertCircle,
  FileText, Receipt, ClipboardList,
  IndianRupee, Wallet, Star, Calendar, Download,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { generateReceipt } from "@/lib/pdf-receipt";

export const Route = createFileRoute("/superadmin/athletes")({
  component: SuperAdminAthletesPage,
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

function FullAthleteDetailView({
  athleteId,
  onBack,
  onOpenSendModal,
  onOpenReassignAcademy,
  onApproveCash,
  onApproveRollover,
  onRejectRollover,
}: {
  athleteId: string;
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
      const { data: ap, error: apErr } = await supabase
        .from("boxer_profiles")
        .select("*")
        .eq("id", athleteId)
        .maybeSingle();

      if (apErr || !ap) {
        console.error("Error fetching athlete profile:", apErr);
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
        supabase.from("guardian_details").select("*").eq("boxer_profile_id", athleteId).maybeSingle(),
        supabase
          .from("fee_assignments")
          .select("*, fee_plans(*)")
          .eq("boxer_profile_id", athleteId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("invoices")
          .select("*")
          .eq("boxer_profile_id", athleteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("*")
          .eq("boxer_profile_id", athleteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("attendance")
          .select("*")
          .eq("boxer_profile_id", athleteId)
          .order("date", { ascending: false })
          .limit(100),
        supabase
          .from("leave_applications")
          .select("*")
          .eq("boxer_profile_id", athleteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("discount_applications")
          .select("*, discount_schemes(name, value_type, value)")
          .eq("boxer_profile_id", athleteId)
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
      console.error("Exception loading athlete detail page:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    loadDetails();
    const channel = supabase
      .channel(`athlete-detail-${athleteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "boxer_profiles", filter: `id=eq.${athleteId}` }, () => {
        loadDetails();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId, loadDetails]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-9 w-32 bg-elevated rounded-xl" />
        </div>
        <div className="h-44 bg-surface border border-border rounded-2xl p-6 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data?.ap) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="size-4" /> Back to Athletes
        </button>
        <div className="bg-surface border border-border rounded-2xl p-12 text-center">
          <AlertCircle className="size-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Athlete Not Found</h3>
          <p className="text-sm text-muted-foreground mt-1">The requested athlete record could not be loaded.</p>
        </div>
      </div>
    );
  }

  const handleDownloadBill = (inv: any, ap: any, matchingPayment: any) => {
    const isPaid = inv.status === "paid" || !!matchingPayment;
    const payDate = isPaid
      ? (matchingPayment?.payment_date || matchingPayment?.created_at || inv.updated_at || new Date().toISOString())
      : (inv.due_date || new Date().toISOString());
    const payMode = matchingPayment?.payment_mode || inv.payment_mode || "online";
    const txRef = matchingPayment?.transaction_reference || undefined;
    const amount = isPaid
      ? (matchingPayment ? Number(matchingPayment.amount) : Number(inv.amount_paid || inv.amount_due || 0))
      : Number(inv.balance_outstanding ?? inv.amount_due ?? 0);

    generateReceipt({
      invoiceNumber: inv.invoice_number,
      athleteName: ap.full_name,
      amount: amount,
      paymentDate: payDate,
      paymentMode: payMode,
      transactionRef: txRef,
      planName: inv.billing_period,
      academyName: ap.academies?.name,
      status: inv.status === "paid" ? "paid" : (inv.status === "overdue" ? "overdue" : "unpaid"),
      amountLabel: isPaid ? "Amount Paid" : "Amount Due",
    });
  };

  const { ap, fa, invoices, payments, attendance, leaves, discounts } = data;
  const initials = (ap.full_name ?? "?").split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
  const presentCount  = attendance.filter((a: any) => a.status === "present").length;
  const absentCount   = attendance.filter((a: any) => a.status === "absent").length;
  const leaveCount    = attendance.filter((a: any) => a.status === "leave").length;
  const attendancePct = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const totalPaid     = payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const latestInvoice = invoices[0];
  const outstandingBal= latestInvoice ? Number(latestInvoice.balance_outstanding ?? 0) : 0;
  const guardian      = Array.isArray(ap.guardian_details) ? ap.guardian_details[0] : ap.guardian_details;

  const payStatus = fa?.assignment_status ?? "unassigned";

  const TABS = [
    { id: "overview",   label: "Profile & Overview",   icon: User },
    { id: "payments",   label: "Billing & Payments",   icon: IndianRupee },
    { id: "attendance", label: "Attendance Records",   icon: CalendarDays },
    { id: "leaves",     label: "Leave Applications",   icon: ClipboardList },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Navigation Back Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface border border-border text-sm font-semibold hover:bg-subtle transition shadow-sm"
        >
          <ArrowLeft className="size-4 text-primary" />
          Back to Athletes List
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenReassignAcademy(ap)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-info/10 text-info text-xs font-semibold hover:bg-info/20 transition"
          >
            <MapPin className="size-3.5" />
            Reassign Academy
          </button>
          <button
            onClick={() => onOpenSendModal(ap)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
          >
            <RefreshCw className="size-3.5" />
            {fa ? "Reassign Fee Plan" : "Send Fee Package"}
          </button>
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-card overflow-hidden relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="size-20 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-primary-foreground grid place-items-center text-2xl font-bold shrink-0 shadow-lg">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display font-bold text-2xl text-foreground">{ap.full_name}</h1>
                <StatusPill status={payStatus} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {ap.primary_discipline ?? "Boxing Athlete"} · {ap.training_year ?? "General Training"}
              </p>
              <div className="flex items-center gap-4 mt-2.5 text-xs text-muted-foreground flex-wrap">
                {ap.academies?.name && (
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <MapPin className="size-3.5 text-primary" />
                    {ap.academies.name} {ap.academies.city ? `(${ap.academies.city})` : ""}
                  </span>
                )}
                {ap.profiles?.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="size-3.5" />
                    {ap.profiles.email}
                  </span>
                )}
                {ap.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="size-3.5" />
                    {ap.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Approval Banners inside Hero if pending */}
          {(payStatus === "cash_pending" || payStatus === "online_pending") && (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex flex-col items-end justify-center gap-2">
              <span className="text-xs font-semibold text-warning flex items-center gap-1">
                <Banknote className="size-4" /> Cash payment awaiting approval
              </span>
              <button
                onClick={() => onApproveCash(ap.id)}
                className="px-4 py-2 rounded-xl bg-success text-white text-xs font-bold hover:bg-success/90 transition shadow-sm flex items-center gap-1.5"
              >
                <Check className="size-4" /> Confirm Cash Received
              </button>
            </div>
          )}

          {payStatus === "rollover_pending" && (
            <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex flex-col items-end justify-center gap-2">
              <span className="text-xs font-semibold text-info flex items-center gap-1">
                <RotateCcw className="size-4" /> Payment Rollover Requested
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => onApproveRollover(ap.id)}
                  className="px-3 py-1.5 rounded-lg bg-info text-white text-xs font-bold hover:bg-info/90 transition flex items-center gap-1"
                >
                  <Check className="size-3.5" /> Approve
                </button>
                <button
                  onClick={() => onRejectRollover(ap.id)}
                  className="px-3 py-1.5 rounded-lg bg-destructive text-white text-xs font-bold hover:bg-destructive/90 transition flex items-center gap-1"
                >
                  <X className="size-3.5" /> Reject
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Top Key Metrics Banner */}
        <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-elevated/60 border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground font-medium">Attendance Rate</div>
            <div className={`text-2xl font-bold mt-1 ${attendancePct >= 75 ? "text-success" : attendancePct >= 50 ? "text-warning" : "text-destructive"}`}>
              {attendancePct}%
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{presentCount} present of {attendance.length} sessions</div>
          </div>

          <div className="bg-elevated/60 border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground font-medium">Total Fees Paid</div>
            <div className="text-2xl font-bold text-success mt-1">
              ₹{totalPaid.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{payments.length} transactions recorded</div>
          </div>

          <div className="bg-elevated/60 border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground font-medium">Outstanding Due</div>
            <div className={`text-2xl font-bold mt-1 ${outstandingBal > 0 ? "text-warning" : "text-foreground"}`}>
              ₹{outstandingBal.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {latestInvoice?.due_date ? `Due ${new Date(latestInvoice.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "No pending invoice"}
            </div>
          </div>

          <div className="bg-elevated/60 border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground font-medium">Leave Requests</div>
            <div className="text-2xl font-bold text-info mt-1">
              {leaves.length}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {leaves.filter((l: any) => l.status === "approved").length} approved
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Bar Navigation */}
      <div className="flex border-b border-border gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PROFILE & OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SectionCard title="Personal Information" icon={User}>
            <DetailRow label="Full Name" value={ap.full_name} />
            <DetailRow label="Date of Birth" value={ap.date_of_birth ? new Date(ap.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null} />
            <DetailRow label="Gender" value={ap.gender} />
            <DetailRow label="Phone Number" value={ap.phone} icon={Phone} />
            <DetailRow label="Email Address" value={ap.profiles?.email} icon={Mail} />
            <DetailRow label="City" value={ap.city} icon={MapPin} />
            <DetailRow label="State" value={ap.state} />
            <DetailRow label="Nationality" value={ap.nationality} />
            <DetailRow label="Onboarding Date" value={ap.created_at ? new Date(ap.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null} icon={CalendarDays} />
            <DetailRow label="Last Profile Update" value={ap.updated_at ? new Date(ap.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" } as any) : null} icon={Clock} />
          </SectionCard>

          <SectionCard title="Boxing & Skill Profile" icon={BookOpen}>
            <DetailRow label="Primary Discipline" value={ap.primary_discipline} />
            <DetailRow label="Batting Style" value={ap.batting_style} />
            <DetailRow label="Bowling Style" value={ap.bowling_style} />
            <DetailRow label="Training Year Group" value={ap.training_year} />
            <DetailRow label="Experience Level" value={ap.experience_level} />
            <DetailRow label="Shirt Jersey Number" value={ap.shirt_number?.toString()} />
            <DetailRow label="Assigned Skill Level" value={ap.skill_level} icon={Star} />
          </SectionCard>

          {guardian && (
            <SectionCard title="Guardian & Emergency Contact" icon={Shield}>
              <DetailRow label="Guardian Name" value={guardian.name} />
              <DetailRow label="Relationship" value={guardian.relationship} />
              <DetailRow label="Contact Phone" value={guardian.phone} icon={Phone} />
              <DetailRow label="Contact Email" value={guardian.email} icon={Mail} />
              <DetailRow label="Residential Address" value={guardian.address} />
            </SectionCard>
          )}

          <SectionCard title="Academy & Package Assignment" icon={Award}>
            <DetailRow label="Assigned Academy" value={ap.academies ? `${ap.academies.name} (${ap.academies.city ?? "Location"})` : "Not assigned"} icon={MapPin} />
            <DetailRow label="Fee Plan Package" value={fa?.fee_plans?.plan_name ?? "No plan assigned"} icon={FileText} />
            <DetailRow label="Plan Base Amount" value={fa?.fee_plans?.amount ? `₹${Number(fa.fee_plans.amount).toLocaleString("en-IN")}` : null} icon={IndianRupee} />
            <DetailRow label="Billing Cycle" value={fa?.fee_plans?.billing_cycle} />
            <DetailRow label="Assignment Status" value={fa?.assignment_status} />
            <DetailRow label="Chosen Payment Mode" value={fa?.payment_mode} />
            <DetailRow label="Start Date" value={fa?.fee_start_date ? new Date(fa.fee_start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null} />
          </SectionCard>

          {discounts.length > 0 && (
            <SectionCard title="Applied Discounts & Coupons" icon={Receipt} className="md:col-span-2">
              <div className="divide-y divide-border">
                {discounts.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-semibold">{d.discount_schemes?.name ?? "Discount Offer"}</div>
                      <div className="text-xs text-muted-foreground">Applied on {d.created_at ? new Date(d.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""}</div>
                    </div>
                    <span className="text-sm font-bold text-success">
                      {d.discount_schemes?.value_type === "percentage"
                        ? `-${d.discount_schemes.value}% Discount`
                        : `-₹${Number(d.discount_schemes?.value ?? 0).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {ap.additional_notes && (
            <SectionCard title="Special Notes & Remarks" icon={BookOpen} className="md:col-span-2">
              <p className="text-sm text-muted-foreground leading-relaxed">{ap.additional_notes}</p>
            </SectionCard>
          )}
        </div>
      )}

      {/* TAB 2: BILLING & PAYMENTS */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          {latestInvoice && (
            <div className={`rounded-2xl border p-6 ${
              latestInvoice.status === "paid" ? "bg-success/5 border-success/20"
              : latestInvoice.status === "overdue" ? "bg-destructive/5 border-destructive/20"
              : "bg-warning/5 border-warning/20"
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Billing Invoice</div>
                  <div className="text-xl font-bold mt-1">{latestInvoice.invoice_number}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{latestInvoice.billing_period}</div>
                </div>
                <div className="flex items-center gap-2.5">
                  <StatusPill status={latestInvoice.status} />
                  <button
                    onClick={() => {
                      const matchingPayment = payments.find((p: any) => p.invoice_id === latestInvoice.id);
                      handleDownloadBill(latestInvoice, ap, matchingPayment);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-semibold hover:bg-subtle transition shadow-sm text-primary"
                    title="Download active bill/receipt"
                  >
                    <Download className="size-3.5" />
                    <span>Download Bill</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-surface/80 border border-border rounded-xl p-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Invoice Amount Due</div>
                  <div className="text-lg font-bold mt-1">₹{Number(latestInvoice.amount_due ?? 0).toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Amount Paid</div>
                  <div className="text-lg font-bold text-success mt-1">₹{Number(latestInvoice.amount_paid ?? 0).toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Remaining Balance</div>
                  <div className="text-lg font-bold text-warning mt-1">₹{Number(latestInvoice.balance_outstanding ?? 0).toLocaleString("en-IN")}</div>
                </div>
              </div>
            </div>
          )}

          <SectionCard title={`Payment Transactions History (${payments.length})`} icon={Wallet}>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No payments recorded for this athlete yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Payment Mode</th>
                      <th className="py-2.5 px-3">Reference / Transaction ID</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {payments.map((p: any) => (
                      <tr key={p.id} className="hover:bg-subtle/50 transition">
                        <td className="py-3 px-3 font-medium">
                          {p.payment_date ? new Date(p.payment_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1.5 capitalize text-xs font-semibold">
                            {p.payment_mode === "cash" ? <Banknote className="size-3.5 text-success" /> : <CreditCard className="size-3.5 text-success" />}
                            {p.payment_mode ?? "Cash"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-muted-foreground font-mono">
                          {p.transaction_reference ?? "Direct Record"}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-success">
                          ₹{Number(p.amount).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title={`All Invoices (${invoices.length})`} icon={FileText}>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No invoices created yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Billing Period</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3">Amount Due</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {invoices.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-subtle/50 transition">
                        <td className="py-3 px-3 font-mono font-semibold text-xs">{inv.invoice_number}</td>
                        <td className="py-3 px-3 text-xs">{inv.billing_period}</td>
                        <td className="py-3 px-3 text-xs text-muted-foreground">
                          {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="py-3 px-3 font-semibold">₹{Number(inv.amount_due ?? 0).toLocaleString("en-IN")}</td>
                        <td className="py-3 px-3"><StatusPill status={inv.status} /></td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              const matchingPayment = payments.find((p: any) => p.invoice_id === inv.id);
                              handleDownloadBill(inv, ap, matchingPayment);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg transition"
                            title="Download Bill / Receipt"
                          >
                            <Download className="size-3.5" />
                            <span>Bill</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB 3: ATTENDANCE */}
      {activeTab === "attendance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-success/5 border border-success/20 rounded-2xl p-5 text-center">
              <div className="text-3xl font-bold text-success">{presentCount}</div>
              <div className="text-xs font-semibold text-muted-foreground mt-1">Sessions Present</div>
            </div>
            <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 text-center">
              <div className="text-3xl font-bold text-destructive">{absentCount}</div>
              <div className="text-xs font-semibold text-muted-foreground mt-1">Sessions Absent</div>
            </div>
            <div className="bg-info/5 border border-info/20 rounded-2xl p-5 text-center">
              <div className="text-3xl font-bold text-info">{leaveCount}</div>
              <div className="text-xs font-semibold text-muted-foreground mt-1">Leaves Taken</div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 space-y-2">
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>Overall Attendance Percentage</span>
              <span className={attendancePct >= 75 ? "text-success" : attendancePct >= 50 ? "text-warning" : "text-destructive"}>
                {attendancePct}%
              </span>
            </div>
            <div className="h-3 bg-elevated rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${attendancePct >= 75 ? "bg-success" : attendancePct >= 50 ? "bg-warning" : "bg-destructive"}`}
                style={{ width: `${attendancePct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center pt-1">Calculated over the last {attendance.length} attendance sessions</p>
          </div>

          <SectionCard title={`Attendance History Log (${attendance.length})`} icon={CalendarDays}>
            {attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No attendance records registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Day</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Time Marked</th>
                      <th className="py-2.5 px-3">Notes / Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {attendance.map((a: any) => (
                      <tr key={a.id} className="hover:bg-subtle/50 transition">
                        <td className="py-3 px-3 font-medium text-xs">
                          {new Date(a.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="py-3 px-3 text-xs text-muted-foreground">
                          {new Date(a.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" })}
                        </td>
                        <td className="py-3 px-3"><StatusPill status={a.status} /></td>
                        <td className="py-3 px-3 text-xs text-muted-foreground">
                          {a.marked_at ? new Date(a.marked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="py-3 px-3 text-xs text-muted-foreground">{a.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* TAB 4: LEAVES */}
      {activeTab === "leaves" && (
        <SectionCard title={`Leave Requests & Applications (${leaves.length})`} icon={ClipboardList}>
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No leave applications submitted by this athlete.</p>
          ) : (
            <div className="divide-y divide-border">
              {leaves.map((l: any) => (
                <div key={l.id} className="py-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-4 text-primary" />
                      <span className="text-sm font-semibold">
                        {l.leave_date
                          ? new Date(l.leave_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={l.status ?? "pending"} />
                      {(l.status ?? "pending") === "pending" && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => handleLeaveAction(l.id, "approved", l.leave_date)}
                            disabled={processingLeaveId === l.id}
                            className="px-2.5 py-1 rounded-lg bg-success/15 hover:bg-success/25 text-success text-[11px] font-bold transition flex items-center gap-1"
                            title="Approve Leave"
                          >
                            {processingLeaveId === l.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleLeaveAction(l.id, "rejected", l.leave_date)}
                            disabled={processingLeaveId === l.id}
                            className="px-2.5 py-1 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive text-[11px] font-bold transition flex items-center gap-1"
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
    </div>
  );
}

// ── MAIN SUPERADMIN ATHLETES PAGE ──────────────────────────────────────────

function SuperAdminAthletesPage() {
  const { user } = useAuth();
  const [athletes, setAthletes]     = useState<any[]>([]);
  const [feePlans, setFeePlans]     = useState<any[]>([]);
  const [academies, setAcademies]   = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selected athlete for full-page detail view
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("id");
    }
    return null;
  });

  const navigateAthleteDetail = (id: string | null) => {
    setSelectedAthleteId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("id", id);
      else url.searchParams.delete("id");
      window.history.pushState(null, "", url.toString());
    }
  };

  // Modals & Action States
  const [selectedAthleteForModal, setSelectedAthleteForModal] = useState<any | null>(null);
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

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("sa-athletes-watch-full")
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "boxer_profiles" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: aps }, { data: plans }, { data: assigns }, { data: invs }, { data: acs }] = await Promise.all([
        supabase.from("boxer_profiles").select("*").eq("onboarding_complete", true).order("created_at", { ascending: false }),
        supabase.from("fee_plans").select("id,name,amount,cycle").eq("is_active", true),
        supabase.from("fee_assignments").select("id,boxer_profile_id,fee_plan_id,status,fee_plans(name,amount,cycle)"),
        supabase.from("invoices").select("id,boxer_profile_id,status,due_date,amount_due,amount_paid,billing_period_start,billing_period_end"),
        supabase.from("academies").select("id,name,city,state").order("name"),
      ]);

      setFeePlans(plans ?? []);
      setAcademies(acs ?? []);

      const enriched = (aps ?? []).map(ap => {
        const assignment = assigns?.find(a => a.boxer_profile_id === ap.id);
        const invoice    = invs?.find(i => i.boxer_profile_id === ap.id);
        const academy    = acs?.find(ac => ac.id === ap.academy_id);
        let payStatus = "unassigned";
        if (assignment) {
          const st = assignment.status;
          if (st === "active" && invoice?.status === "paid") payStatus = "paid";
          else if (invoice?.status === "paid")               payStatus = "paid";
          else if (invoice?.status === "overdue")            payStatus = "overdue";
          else if (invoice)                                  payStatus = "unpaid";
          else                                               payStatus = "awaiting_invoice";
        }
        return { ...ap, assignment, invoice, academy, payStatus };
      });

      setAthletes(enriched);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPackage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAthleteForModal || !sendPlanId) return;
    setSending(true); setSendError(null);
    try {
      const plan = feePlans.find(p => p.id === sendPlanId);
      if (!plan) throw new Error("Plan not found");

      const existing = selectedAthleteForModal.assignment;
      if (existing) {
        await supabase.from("fee_assignments").update({
          fee_plan_id: sendPlanId, status: "active",
          academy_id: sendAcademyId || selectedAthleteForModal.academy_id,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("fee_assignments").insert({
          boxer_profile_id: selectedAthleteForModal.id, fee_plan_id: sendPlanId,
          academy_id: sendAcademyId || selectedAthleteForModal.academy_id,
          assigned_by: user?.id, status: "active",
        });
      }

      const cycleDays = plan.cycle === "monthly" ? 30 : plan.cycle === "quarterly" ? 90 : plan.cycle === "yearly" ? 365 : 30;
      const startDate = new Date();
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + cycleDays);

      const existingInv = selectedAthleteForModal.invoice;
      const academyId   = sendAcademyId || selectedAthleteForModal.academy_id;
      if (existingInv?.id) {
        await supabase.from("invoices").update({
          academy_id: academyId, amount_due: plan.amount, amount_paid: 0,
          due_date: dueDate.toISOString().split("T")[0],
          billing_period_start: startDate.toISOString().split("T")[0],
          billing_period_end: dueDate.toISOString().split("T")[0],
          status: "unpaid", updated_at: new Date().toISOString(),
        }).eq("id", existingInv.id);
      } else {
        await supabase.from("invoices").insert({
          invoice_number: `BOX-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999999)).padStart(6, "0")}`,
          academy_id: academyId, boxer_profile_id: selectedAthleteForModal.id,
          amount_due: plan.amount, amount_paid: 0,
          due_date: dueDate.toISOString().split("T")[0],
          billing_period_start: startDate.toISOString().split("T")[0],
          billing_period_end: dueDate.toISOString().split("T")[0],
          status: "unpaid",
        });
      }

      const academy = academies.find(a => a.id === academyId);
      await supabase.from("notifications").insert({
        recipient_id: selectedAthleteForModal.user_id, type: "fee_package_sent",
        title: existing ? "Fee package reassigned" : "Fee package assigned",
        body: `Your fee plan has been ${existing ? "reassigned" : "assigned"} to "${plan.name}" (₹${Number(plan.amount).toLocaleString("en-IN")})${academy ? ` at ${academy.name}` : ""}.`,
        related_entity_type: "fee_assignment",
      });

      setShowSendModal(false); setSendPlanId(""); setSendAcademyId(""); setSendNotes("");
      loadData();
    } catch (err: any) { setSendError(err.message); }
    finally { setSending(false); }
  }

  async function handleReassignAcademy() {
    if (!reassignId || !reassignAcademy) return;
    setReassigning(true);
    try {
      await supabase.from("boxer_profiles").update({ academy_id: reassignAcademy }).eq("id", reassignId);
      const athlete = athletes.find(a => a.id === reassignId);
      const academy = academies.find(a => a.id === reassignAcademy);
      if (athlete?.user_id && academy) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id, type: "academy_changed",
          title: "Academy location updated",
          body: `Your assigned academy has been updated to ${academy.name}.`,
        });
      }
      setReassignId(null); setReassignAcademy(""); loadData();
    } finally { setReassigning(false); }
  }

  async function handleApproveCash(athleteId: string) {
    setApproving(true);
    try {
      const athlete = athletes.find(a => a.id === athleteId);
      const invoice  = athlete?.invoice;
      const pMode    = athlete?.assignment?.payment_mode || "cash";
      const approved = pMode === "cash" ? "cash_approved" : "online_paid";

      await supabase.from("fee_assignments").update({
        assignment_status: approved, cash_approved_by: user?.id, cash_approved_at: new Date().toISOString(),
      }).eq("boxer_profile_id", athleteId);

      if (invoice?.id) {
        const unpaid = Number(invoice.balance_outstanding ?? invoice.amount_due ?? 0);
        if (unpaid > 0) {
          await supabase.from("payments").insert({
            invoice_id: invoice.id, boxer_profile_id: athleteId, amount: unpaid,
            payment_mode: pMode,
            recorded_by: user?.id, reference: `${pMode.toUpperCase()}-${Date.now()}`,
          });
        }
        await supabase.from("invoices").update({
          status: "paid", amount_paid: Number(invoice.amount_due ?? 0),
          balance_outstanding: 0, is_overdue: false, updated_at: new Date().toISOString(),
        }).eq("id", invoice.id);
      }

      if (athlete?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id, type: "cash_approved", title: "Payment confirmed ✓",
          body: `Your ${pMode === "cash" ? "cash" : "online"} payment has been confirmed.`,
        });
      }
      setCashApproveId(null); loadData();
    } catch (err: any) { alert(err.message || "Failed to approve"); }
    finally { setApproving(false); }
  }

  async function handleApproveRollover(athleteId: string) {
    setRolloverActioning(true);
    try {
      const athlete = athletes.find(a => a.id === athleteId);
      await supabase.from("fee_assignments").update({
        assignment_status: "rollover_approved", 
        rollover_approved: true,
        rollover_approved_by: user?.id, 
        rollover_approved_at: new Date().toISOString(),
      }).eq("boxer_profile_id", athleteId).eq("assignment_status", "rollover_pending");
      if (athlete?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id, type: "rollover_approved",
          title: "Payment rollover approved ✓",
          body: "Your payment rollover has been approved.",
        });
      }
      setRolloverApproveId(null); loadData();
    } catch (err: any) { alert(err.message); }
    finally { setRolloverActioning(false); }
  }

  async function handleRejectRollover(athleteId: string) {
    setRolloverActioning(true);
    try {
      const athlete = athletes.find(a => a.id === athleteId);
      await supabase.from("fee_assignments").update({ assignment_status: "sent", payment_mode: null }).eq("boxer_profile_id", athleteId);
      if (athlete?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id, type: "rollover_rejected",
          title: "Payment rollover rejected",
          body: "Your rollover request was declined.",
        });
      }
      setRolloverRejectId(null); loadData();
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

  const filtered = athletes.filter(a => {
    const matchQ = !q || a.full_name?.toLowerCase().includes(q.toLowerCase()) || a.primary_discipline?.toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || a.payStatus === statusFilter;
    return matchQ && matchS;
  });
  const cashPending     = athletes.filter(a => a.payStatus === "cash_pending");
  const rolloverPending = athletes.filter(a => a.payStatus === "rollover_pending");

  // IF AN ATHLETE IS SELECTED -> RENDER THE FULL ATHLETE DETAIL PAGE
  if (selectedAthleteId) {
    return (
      <FullAthleteDetailView
        athleteId={selectedAthleteId}
        onBack={() => navigateAthleteDetail(null)}
        onOpenSendModal={(ap) => {
          setSelectedAthleteForModal(ap);
          setSendPlanId(ap.assignment?.fee_plan_id ?? feePlans[0]?.id ?? "");
          setSendAcademyId(ap.academy_id ?? "");
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
    <div className="space-y-6">
      <PageHeader
        title="Athletes Management"
        subtitle={`${athletes.length} enrolled athletes · ${cashPending.length} cash pending · ${rolloverPending.length} rollover${rolloverPending.length !== 1 ? "s" : ""} pending`}
      />

      {/* Cash pending banner */}
      {cashPending.length > 0 && (
        <div className="bg-warning/8 border border-warning/25 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-warning">Cash payment approvals needed</div>
            <div className="text-xs text-muted-foreground mt-0.5">{cashPending.length} athlete{cashPending.length > 1 ? "s" : ""} — confirm receipt to unlock access.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {cashPending.map(a => (
              <button key={a.id} onClick={() => setCashApproveId(a.id)}
                className="inline-flex items-center gap-2 bg-warning text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-warning/90 transition">
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
            <div className="text-xs text-muted-foreground mt-0.5">{rolloverPending.length} athlete{rolloverPending.length > 1 ? "s" : ""} requested a rollover.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {rolloverPending.map(a => (
              <button key={a.id} onClick={() => setRolloverApproveId(a.id)}
                className="inline-flex items-center gap-2 bg-info text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-info/90 transition">
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
              placeholder="Search athletes by name or discipline…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {q && <button onClick={() => setQ("")}><X className="size-4 text-muted-foreground" /></button>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Filter status:</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm h-10 px-3.5 border border-border rounded-xl bg-surface font-medium shadow-sm">
              <option value="all">All Athletes ({athletes.length})</option>
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

        {/* Athletes Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated/70 border-b border-border">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                <th className="text-left py-3.5 px-6">Athlete Name</th>
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
                <tr><td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">No matching athletes found.</td></tr>
              ) : filtered.map(a => (
                <tr
                  key={a.id}
                  onClick={() => navigateAthleteDetail(a.id)}
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
                        <div className="font-semibold text-foreground">{a.assignment.fee_plans.plan_name}</div>
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
                        className="p-2 rounded-xl border border-border hover:bg-info/10 hover:border-info/30 transition text-info"
                      >
                        <MapPin className="size-4" />
                      </button>

                      {(a.payStatus === "cash_pending" || a.payStatus === "online_pending") && (
                        <button
                          onClick={() => setCashApproveId(a.id)}
                          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-success text-white hover:bg-success/90 transition shadow-sm"
                        >
                          Approve Payment
                        </button>
                      )}

                      {a.payStatus === "rollover_pending" && (
                        <>
                          <button
                            onClick={() => setRolloverApproveId(a.id)}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-info text-white hover:bg-info/90 transition flex items-center gap-1"
                          >
                            <RotateCcw className="size-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => setRolloverRejectId(a.id)}
                            className="text-xs font-bold px-2 py-1.5 rounded-xl bg-destructive text-white hover:bg-destructive/90 transition"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => {
                          setSelectedAthleteForModal(a);
                          setSendPlanId(a.assignment?.fee_plan_id ?? feePlans[0]?.id ?? "");
                          setSendAcademyId(a.academy_id ?? "");
                          setShowSendModal(true);
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary/10 text-primary-dark hover:bg-primary/20 transition inline-flex items-center gap-1.5"
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
          <span>Displaying <strong>{filtered.length}</strong> of <strong>{athletes.length}</strong> enrolled athletes</span>
          <span>Click any athlete row to view full detailed profile, billing history & attendance</span>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Send / Reassign Fee Package Modal */}
      {showSendModal && selectedAthleteForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md animate-fade-up overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
              <div>
                <h3 className="font-display font-semibold">Assign Fee Plan Package</h3>
                <p className="text-xs text-muted-foreground mt-0.5">for {selectedAthleteForModal.full_name}</p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground transition"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleSendPackage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-2">Select Fee Plan *</label>
                <select required value={sendPlanId} onChange={e => setSendPlanId(e.target.value)} className="input-premium">
                  <option value="">Choose plan…</option>
                  {feePlans.map(p => (
                    <option key={p.id} value={p.id}>{p.plan_name} — ₹{Number(p.amount).toLocaleString("en-IN")} / {p.billing_cycle === "custom" && p.custom_duration_days ? `${p.custom_duration_days} days` : p.billing_cycle}</option>
                  ))}
                </select>
              </div>

              {sendPlanId && (() => {
                const plan = feePlans.find(p => p.id === sendPlanId);
                if (!plan) return null;
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount</span><span className="font-bold">₹ {Number(plan.amount).toLocaleString("en-IN")}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Cycle</span><span className="capitalize">{plan.billing_cycle === "custom" && plan.custom_duration_days ? `${plan.custom_duration_days} Days` : plan.billing_cycle}</span></div>
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
                <textarea rows={2} value={sendNotes} onChange={e => setSendNotes(e.target.value)} placeholder="Notes for athlete…" className="input-premium resize-none" />
              </div>

              {sendError && <div className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg p-3">{sendError}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowSendModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
                <button type="submit" disabled={sending || !sendPlanId || !sendAcademyId} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-info/10 grid place-items-center mx-auto mb-4"><RotateCcw className="size-5 text-info" /></div>
            <h3 className="font-semibold text-base">Approve Payment Rollover?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">This will defer payment for <strong>{athletes.find(a => a.id === rolloverApproveId)?.full_name}</strong> and unlock their dashboard.</p>
            <div className="flex gap-3">
              <button onClick={() => setRolloverApproveId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleApproveRollover(rolloverApproveId)} disabled={rolloverActioning} className="flex-1 px-4 py-2 text-sm font-semibold bg-info text-white rounded-xl hover:bg-info/90 transition flex items-center justify-center gap-2">
                {rolloverActioning ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollover reject Modal */}
      {rolloverRejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4"><X className="size-5 text-destructive" /></div>
            <h3 className="font-semibold text-base">Reject Rollover Request?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5"><strong>{athletes.find(a => a.id === rolloverRejectId)?.full_name}</strong>'s rollover will be rejected.</p>
            <div className="flex gap-3">
              <button onClick={() => setRolloverRejectId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleRejectRollover(rolloverRejectId)} disabled={rolloverActioning} className="flex-1 px-4 py-2 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 transition flex items-center justify-center gap-2">
                {rolloverActioning ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash approve Modal */}
      {cashApproveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-success/10 grid place-items-center mx-auto mb-4"><Banknote className="size-5 text-success" /></div>
            <h3 className="font-semibold text-base">Confirm Cash Received</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Confirm you have received cash payment from <strong>{athletes.find(a => a.id === cashApproveId)?.full_name}</strong>. Their dashboard will unlock immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => setCashApproveId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleApproveCash(cashApproveId)} disabled={approving} className="flex-1 px-4 py-2 text-sm font-semibold bg-success text-white rounded-xl hover:bg-success/90 transition flex items-center justify-center gap-2">
                {approving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm Received
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign academy Modal */}
      {reassignId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 rounded-xl bg-info/10 grid place-items-center shrink-0"><MapPin className="size-4 text-info" /></div>
              <div>
                <h3 className="font-semibold">Reassign Academy Location</h3>
                <p className="text-xs text-muted-foreground">{athletes.find(a => a.id === reassignId)?.full_name}</p>
              </div>
            </div>
            <select value={reassignAcademy} onChange={e => setReassignAcademy(e.target.value)} className="input-premium mb-3">
              <option value="">Select new academy…</option>
              {academies.map(a => (<option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>))}
            </select>
            <p className="text-[11px] text-muted-foreground mb-5">Athlete's attendance geo-fence will update immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => { setReassignId(null); setReassignAcademy(""); }} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={handleReassignAcademy} disabled={reassigning || !reassignAcademy} className="flex-1 px-4 py-2 text-sm font-semibold bg-info text-white rounded-xl hover:bg-info/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {reassigning ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
