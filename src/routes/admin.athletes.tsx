import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  Search, Filter, SendHorizonal, X, Loader2, Check,
  ChevronDown, UserCircle2, MapPin, Banknote, CreditCard, RefreshCw, RotateCcw
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/athletes")({ component: AthletesPage });

function AthletesPage() {
  const { user, profile } = useAuth();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [feePlans, setFeePlans] = useState<any[]>([]);
  const [academies, setAcademies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAthlete, setSelectedAthlete] = useState<any | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendPlanId, setSendPlanId] = useState("");
  const [sendAcademyId, setSendAcademyId] = useState("");
  const [sendNotes, setSendNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [cashApproveId, setCashApproveId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rolloverApproveId, setRolloverApproveId] = useState<string | null>(null);
  const [rolloverRejectId, setRolloverRejectId] = useState<string | null>(null);
  const [rolloverActioning, setRolloverActioning] = useState(false);
  const [reassignId, setReassignId] = useState<string | null>(null); // athlete id to reassign academy
  const [reassignAcademy, setReassignAcademy] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [suspendActionId, setSuspendActionId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const channel = supabase.channel("admin-athletes-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: aps }, { data: plans }, { data: assigns }, { data: invs }, { data: acs }] = await Promise.all([
        supabase.from("boxer_profiles").select("*").eq("onboarding_complete", true).order("created_at", { ascending: false }),
        supabase.from("fee_plans").select("id, name, amount, cycle").eq("is_active", true),
        supabase.from("fee_assignments").select("id, boxer_profile_id, fee_plan_id, status, fee_plans(name, amount, cycle)"),
        supabase.from("invoices").select("id, boxer_profile_id, status, due_date, amount_due, amount_paid, billing_period_start, billing_period_end"),
        supabase.from("academies").select("id, name, city, state").order("name"),
      ]);

      const normalizedPlans = (plans ?? []).map(p => ({
        ...p,
        plan_name: p.name ?? "Plan",
        billing_cycle: p.cycle ?? "monthly",
      }));

      setFeePlans(normalizedPlans);
      setAcademies(acs ?? []);

      const enriched = (aps ?? []).map(ap => {
        const rawAssignment = assigns?.find(a => a.boxer_profile_id === ap.id);
        const assignment = rawAssignment ? {
          ...rawAssignment,
          assignment_status: rawAssignment.status,
          fee_plans: rawAssignment.fee_plans ? {
            ...rawAssignment.fee_plans,
            plan_name: (rawAssignment.fee_plans as any).name,
            billing_cycle: (rawAssignment.fee_plans as any).cycle,
          } : null,
        } : undefined;
        const invoice = invs?.find(i => i.boxer_profile_id === ap.id);
        const academy = acs?.find(ac => ac.id === ap.academy_id);
        let payStatus = "unassigned";
        if (assignment) {
          const st = assignment.assignment_status;
          if (st === "active" && invoice?.status === "paid") payStatus = "paid";
          else if (invoice?.status === "paid") payStatus = "paid";
          else if (invoice?.status === "overdue") payStatus = "overdue";
          else if (invoice) payStatus = "unpaid";
          else payStatus = "awaiting_invoice";
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
    if (!selectedAthlete || !sendPlanId) return;
    setSending(true);
    setSendError(null);
    try {
      const plan = feePlans.find(p => p.id === sendPlanId);
      if (!plan) throw new Error("Plan not found");

      const existing = selectedAthlete.assignment;

      if (existing) {
        await supabase.from("fee_assignments").update({
          fee_plan_id: sendPlanId, status: "active",
          academy_id: profile?.academy_id || selectedAthlete.academy_id,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("fee_assignments").insert({
          boxer_profile_id: selectedAthlete.id, fee_plan_id: sendPlanId,
          academy_id: profile?.academy_id || selectedAthlete.academy_id,
          assigned_by: user?.id, status: "active",
        });
      }

      const cycleDays = (plan.billing_cycle || plan.cycle) === "monthly" ? 30 : (plan.billing_cycle || plan.cycle) === "quarterly" ? 90 : (plan.billing_cycle || plan.cycle) === "yearly" ? 365 : 30;
      const startDate = new Date();
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + cycleDays);

      const existingInv = selectedAthlete.invoice;
      const academyId = profile?.academy_id || selectedAthlete.academy_id;

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
          academy_id: academyId, boxer_profile_id: selectedAthlete.id,
          amount_due: plan.amount, amount_paid: 0,
          due_date: dueDate.toISOString().split("T")[0],
          billing_period_start: startDate.toISOString().split("T")[0],
          billing_period_end: dueDate.toISOString().split("T")[0],
          status: "unpaid",
        });
      }

      // 4. Notify athlete
      const academy = academies.find(a => a.id === (sendAcademyId || selectedAthlete.academy_id));
      const isReassignment = !!existing;
      await supabase.from("notifications").insert({
        recipient_id: selectedAthlete.user_id,
        type: "fee_package_sent",
        title: isReassignment ? "Fee package reassigned" : "Fee package assigned",
        body: `Your fee plan has been ${isReassignment ? "reassigned" : "assigned"} to "${plan.plan_name}" (₹${Number(plan.amount).toLocaleString("en-IN")})${academy ? ` at ${academy.name}` : ""}. Please complete your payment to unlock your dashboard.`,
        related_entity_type: "fee_assignment",
      });

      setShowSendModal(false);
      setSendPlanId("");
      setSendAcademyId("");
      setSendNotes("");
      loadData();
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleReassignAcademy() {
    if (!reassignId || !reassignAcademy) return;
    setReassigning(true);
    try {
      await supabase.from("boxer_profiles")
        .update({ academy_id: reassignAcademy })
        .eq("id", reassignId);
      const athlete = athletes.find(a => a.id === reassignId);
      const academy = academies.find(a => a.id === reassignAcademy);
      if (athlete?.user_id && academy) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id,
          type: "academy_changed",
          title: "Academy location updated",
          body: `Your assigned academy has been updated to ${academy.name}. Your attendance geo-fence is now active for this location.`,
        });
      }
      setReassignId(null);
      setReassignAcademy("");
      loadData();
    } finally {
      setReassigning(false);
    }
  }

  async function handleToggleSuspension(athleteId: string, currentlySuspended: boolean) {
    setSuspendActionId(athleteId);
    try {
      await supabase.from("boxer_profiles")
        .update({ is_suspended: !currentlySuspended })
        .eq("id", athleteId);
      
      const athlete = athletes.find(a => a.id === athleteId);
      if (athlete?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id,
          type: "status_changed",
          title: !currentlySuspended ? "Account Suspended" : "Account Reinstated",
          body: !currentlySuspended 
            ? "Your account has been suspended by the academy admin. Please contact the administration."
            : "Your account has been reinstated. You can now access your dashboard.",
        });
      }
      loadData();
    } finally {
      setSuspendActionId(null);
    }
  }

  async function handleApproveCash(athleteId: string) {
    setApproving(true);
    try {
      const athlete = athletes.find(a => a.id === athleteId);
      const invoice = athlete?.invoice;
      const pMode = athlete?.assignment?.payment_mode || "cash";
      const approvedStatus = pMode === "cash" ? "cash_approved" : "online_paid";

      // 1. Mark fee assignment as approved
      await supabase.from("fee_assignments")
        .update({
          assignment_status: approvedStatus,
          cash_approved_by: user?.id,
          cash_approved_at: new Date().toISOString(),
        })
        .eq("boxer_profile_id", athleteId);

      // 2. Insert a payment record and mark invoice as paid
      if (invoice?.id) {
        const unpaidAmount = Number(invoice.balance_outstanding ?? invoice.amount_due ?? 0);
        if (unpaidAmount > 0) {
          await supabase.from("payments").insert({
            invoice_id: invoice.id,
            boxer_profile_id: athleteId,
            amount: unpaidAmount,
            payment_mode: pMode,
            recorded_by: user?.id,
            reference: `${pMode.toUpperCase()}-${Date.now()}`,
          });
        }
        // Update invoice status to paid
        await supabase.from("invoices")
          .update({
            status: "paid",
            amount_paid: Number(invoice.amount_due ?? 0),
            balance_outstanding: 0,
            is_overdue: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id);
      }

      // 3. Notify athlete
      if (athlete?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id,
          type: "cash_approved",
          title: "Payment confirmed ✓",
          body: `Your ${pMode === "cash" ? "cash" : "online"} payment has been confirmed by your admin. Your dashboard is now unlocked!`,
        });
      }

      setCashApproveId(null);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to approve payment");
    } finally {
      setApproving(false);
    }
  }

  async function handleApproveRollover(athleteId: string) {
    setRolloverActioning(true);
    try {
      const athlete = athletes.find(a => a.id === athleteId);

      // 1. Approve rollover: set status to rollover_approved — dashboard unlocks for athlete
      await supabase.from("fee_assignments")
        .update({
          assignment_status: "rollover_approved",
          rollover_approved: true,
          rollover_approved_by: user?.id,
          rollover_approved_at: new Date().toISOString(),
        })
        .eq("boxer_profile_id", athleteId)
        .eq("assignment_status", "rollover_pending");

      // 2. Notify athlete
      if (athlete?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id,
          type: "rollover_approved",
          title: "Payment rollover approved ✓",
          body: `Your payment rollover has been approved. Your dashboard is now unlocked! Please visit Fee & Payments to clear the outstanding balance when convenient.`,
        });
      }

      setRolloverApproveId(null);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to approve rollover");
    } finally {
      setRolloverActioning(false);
    }
  }

  async function handleRejectRollover(athleteId: string) {
    setRolloverActioning(true);
    try {
      const athlete = athletes.find(a => a.id === athleteId);

      // 1. Reject rollover: revert to 'sent' so athlete must choose a payment method
      await supabase.from("fee_assignments")
        .update({ assignment_status: "sent", payment_mode: null })
        .eq("boxer_profile_id", athleteId);

      // 2. Notify athlete
      if (athlete?.user_id) {
        await supabase.from("notifications").insert({
          recipient_id: athlete.user_id,
          type: "rollover_rejected",
          title: "Payment rollover rejected",
          body: `Your payment rollover request has been declined. Please proceed with paying via online or cash to unlock your dashboard.`,
        });
      }

      setRolloverRejectId(null);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to reject rollover");
    } finally {
      setRolloverActioning(false);
    }
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

  const cashPending = athletes.filter(a => a.payStatus === "cash_pending");
  const rolloverPending = athletes.filter(a => a.payStatus === "rollover_pending");

  return (
    <>
      <PageHeader
        title="Athletes"
        subtitle={`${athletes.length} enrolled · ${cashPending.length} cash payments pending· ${rolloverPending.length} rollover${rolloverPending.length !== 1 ? "s" : ""} pending`}
      />

      {/* Cash pending approvals banner */}
      {cashPending.length > 0 && (
        <div className="bg-warning/8 border border-warning/25 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-warning">Cash payment approvals needed</div>
            <div className="text-xs text-muted-foreground mt-0.5">{cashPending.length} athlete{cashPending.length > 1 ? "s" : ""} selected cash payment — confirm receipt before unlocking access.</div>
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

      {/* Rollover pending approvals banner */}
      {rolloverPending.length > 0 && (
        <div className="bg-info/8 border border-info/25 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-info">Payment rollover approvals needed</div>
            <div className="text-xs text-muted-foreground mt-0.5">{rolloverPending.length} athlete{rolloverPending.length > 1 ? "s" : ""} requested a payment rollover — approve to defer payment and unlock their dashboard.</div>
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

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {/* Filters */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-elevated flex-1 max-w-sm">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search athletes…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm h-9 px-3 border border-border rounded-lg bg-elevated">
            <option value="all">All status</option>
            <option value="unassigned">Unassigned</option>
            <option value="cash_pending">Cash pending</option>
            <option value="online_pending">PayU pending</option>
            <option value="rollover_pending">Rollover pending</option>
            <option value="rollover_approved">Rollover approved (unpaid)</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-5 py-3">Athlete</th>
              <th className="text-left font-medium py-3">Discipline</th>
              <th className="text-left font-medium py-3">Academy</th>
              <th className="text-left font-medium py-3">Fee plan</th>
              <th className="text-left font-medium py-3">Payment status</th>
              <th className="text-left font-medium py-3">Due date</th>
              <th className="py-3 px-5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">No athletes found.</td></tr>
            ) : (
              filtered.map(a => (
                <tr key={a.id} className="border-t border-border hover:bg-subtle transition">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-gradient-to-br from-primary to-primary-dark text-primary-foreground grid place-items-center text-[11px] font-semibold shrink-0">
                        {a.full_name?.split(" ").map((w: string) => w[0]).join("").substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{a.full_name}</div>
                        <div className="text-[11px] text-muted-foreground">{a.training_year ?? "—"}</div>
                        {a.is_suspended && <span className="badge badge-danger text-[9px] mt-1">Suspended</span>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 text-muted-foreground text-xs">{a.primary_discipline ?? "—"}</td>
                  <td className="py-3.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="size-3 shrink-0" />
                      <span className="truncate max-w-[120px]" title={a.academy?.name ?? a.city ?? "Not assigned"}>
                        {a.academy?.name ?? a.city ?? "Not assigned"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 text-xs">
                    {a.assignment?.fee_plans ? (
                      <div>
                        <div className="font-medium">{a.assignment.fee_plans.plan_name}</div>
                        <div className="text-muted-foreground">₹{Number(a.assignment.fee_plans.amount).toLocaleString("en-IN")}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={statusTone[a.payStatus]}>{statusLabel[a.payStatus] ?? a.payStatus}</Badge>
                      {a.payStatus === "cash_pending" && (
                        <span className="text-[10px] text-warning flex items-center gap-0.5"><Banknote className="size-2.5" />Cash</span>
                      )}
                      {a.payStatus === "online_pending" && (
                        <span className="text-[10px] text-warning flex items-center gap-0.5"><CreditCard className="size-2.5" />PayU</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 text-xs text-muted-foreground tabular">
                    {a.invoice?.due_date ? new Date(a.invoice.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Suspend/Reinstate */}
                      <button
                        onClick={() => handleToggleSuspension(a.id, a.is_suspended)}
                        title={a.is_suspended ? "Reinstate Athlete" : "Suspend Athlete"}
                        disabled={suspendActionId === a.id}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition disabled:opacity-50 ${a.is_suspended ? "bg-success/10 text-success hover:bg-success/20" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}`}
                      >
                        {suspendActionId === a.id ? <Loader2 className="size-3 animate-spin" /> : a.is_suspended ? "Reinstate" : "Suspend"}
                      </button>

                      {/* Reassign academy — always visible */}
                      <button
                        onClick={() => { setReassignId(a.id); setReassignAcademy(a.academy_id ?? ""); }}
                        title="Reassign academy"
                        className="size-7 grid place-items-center rounded-md hover:bg-info/10 transition text-info"
                      >
                        <MapPin className="size-3.5" />
                      </button>
                      {(a.payStatus === "cash_pending" || a.payStatus === "online_pending") && (
                        <button onClick={() => setCashApproveId(a.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-success/10 text-success hover:bg-success/20 transition">
                          Approve payment
                        </button>
                      )}
                      {a.payStatus === "rollover_pending" && (
                        <>
                          <button onClick={() => setRolloverApproveId(a.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-info/10 text-info hover:bg-info/20 transition flex items-center gap-1">
                            <RotateCcw className="size-3" /> Approve rollover
                          </button>
                          <button onClick={() => setRolloverRejectId(a.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition">
                            Reject
                          </button>
                        </>
                      )}
                      {/* Reassign / Assign fee package */}
                      <button
                        onClick={() => {
                          setSelectedAthlete(a);
                          setSendPlanId(a.assignment?.fee_plan_id ?? feePlans[0]?.id ?? "");
                          setSendAcademyId(a.academy_id ?? "");
                          setShowSendModal(true);
                        }}
                        title={a.assignment ? "Reassign fee package" : "Assign fee package"}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary-dark hover:bg-primary/20 transition inline-flex items-center gap-1"
                      >
                        {a.assignment ? <RefreshCw className="size-3" /> : <SendHorizonal className="size-3" />}
                        {a.assignment ? "Reassign Fee" : "Send package"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="px-5 py-3 border-t border-border bg-elevated flex justify-between items-center text-xs text-muted-foreground">
          <span>Showing {filtered.length} of {athletes.length}</span>
        </div>
      </div>

      {/* Send Fee Package Modal */}
      {showSendModal && selectedAthlete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md animate-fade-up overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
              <div>
                <h3 className="font-display font-semibold">Send fee package</h3>
                <p className="text-xs text-muted-foreground mt-0.5">to {selectedAthlete.full_name}</p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground transition"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleSendPackage} className="p-6 space-y-4">
              {/* Fee plan */}
              <div>
                <label className="block text-xs font-semibold mb-2">Select fee plan *</label>
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

              {/* Plan preview */}
              {sendPlanId && (() => {
                const plan = feePlans.find(p => p.id === sendPlanId);
                if (!plan) return null;
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount</span><span className="font-bold">₹ {Number(plan.amount).toLocaleString("en-IN")}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Cycle</span><span className="capitalize">{plan.billing_cycle === "custom" && plan.custom_duration_days ? `${plan.custom_duration_days} Days` : plan.billing_cycle}</span></div>
                    <p className="text-[11px] text-muted-foreground pt-1">Invoice auto-generated on send. Athlete notified immediately.</p>
                  </div>
                );
              })()}

              {/* Academy assignment */}
              <div>
                <label className="block text-xs font-semibold mb-2">
                  Assign to academy <span className="text-muted-foreground font-normal">(required for geo-fence attendance)</span>
                </label>
                <select required value={sendAcademyId} onChange={e => setSendAcademyId(e.target.value)} className="input-premium">
                  <option value="">Select academy…</option>
                  {academies.map(a => (
                    <option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>
                  ))}
                </select>
                {selectedAthlete.academy_id && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Currently: <strong>{selectedAthlete.academies?.name ?? "Unknown"}</strong>
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold mb-2">Notes (optional)</label>
                <textarea rows={2} value={sendNotes} onChange={e => setSendNotes(e.target.value)} placeholder="Any notes for the athlete…" className="input-premium resize-none" />
              </div>

              {sendError && (
                <div className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg p-3">{sendError}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSendModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
                <button type="submit" disabled={sending || !sendPlanId || !sendAcademyId} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
                  {sending ? "Sending…" : "Send package"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rollover approve confirm */}
      {rolloverApproveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-info/10 grid place-items-center mx-auto mb-4">
              <RotateCcw className="size-5 text-info" />
            </div>
            <h3 className="font-semibold text-base">Approve payment rollover?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Approving will defer payment for <strong>{athletes.find(a => a.id === rolloverApproveId)?.full_name}</strong> and unlock their dashboard. The rolled-over amount will remain in their Fee & Payments section.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRolloverApproveId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleApproveRollover(rolloverApproveId)} disabled={rolloverActioning} className="flex-1 px-4 py-2 text-sm font-semibold bg-info text-white rounded-xl hover:bg-info/90 transition flex items-center justify-center gap-2">
                {rolloverActioning ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Approve rollover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollover reject confirm */}
      {rolloverRejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4">
              <X className="size-5 text-destructive" />
            </div>
            <h3 className="font-semibold text-base">Reject rollover request?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              <strong>{athletes.find(a => a.id === rolloverRejectId)?.full_name}</strong>'s rollover will be rejected. Their dashboard remains locked until they pay via cash or online.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRolloverRejectId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleRejectRollover(rolloverRejectId)} disabled={rolloverActioning} className="flex-1 px-4 py-2 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 transition flex items-center justify-center gap-2">
                {rolloverActioning ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                Reject rollover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash approve confirm */}
      {cashApproveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-success/10 grid place-items-center mx-auto mb-4">
              <Banknote className="size-5 text-success" />
            </div>
            <h3 className="font-semibold text-base">Confirm cash receipt</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Confirm that you have physically received the cash payment from <strong>{athletes.find(a => a.id === cashApproveId)?.full_name}</strong>. Their dashboard will unlock immediately.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCashApproveId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleApproveCash(cashApproveId)} disabled={approving} className="flex-1 px-4 py-2 text-sm font-semibold bg-success text-white rounded-xl hover:bg-success/90 transition flex items-center justify-center gap-2">
                {approving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Confirm received
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Academy Modal */}
      {reassignId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 rounded-xl bg-info/10 grid place-items-center shrink-0">
                <MapPin className="size-4 text-info" />
              </div>
              <div>
                <h3 className="font-semibold">Reassign academy</h3>
                <p className="text-xs text-muted-foreground">{athletes.find(a => a.id === reassignId)?.full_name}</p>
              </div>
            </div>
            <select value={reassignAcademy} onChange={e => setReassignAcademy(e.target.value)} className="input-premium mb-3">
              <option value="">Select new academy…</option>
              {academies.map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mb-5">The athlete's geo-fence will update immediately. They will be notified of the change.</p>
            <div className="flex gap-3">
              <button onClick={() => { setReassignId(null); setReassignAcademy(""); }} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={handleReassignAcademy} disabled={reassigning || !reassignAcademy} className="flex-1 px-4 py-2 text-sm font-semibold bg-info text-white rounded-xl hover:bg-info/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {reassigning ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

