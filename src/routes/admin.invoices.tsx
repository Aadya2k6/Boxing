import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  FileDown, Send, Banknote, Search, AlertTriangle, Check,
  X, Loader2, Bell, RefreshCw, ChevronDown, RotateCcw
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ensureInvoiceForAssignment } from "@/lib/fees";

export const Route = createFileRoute("/admin/invoices")({ component: InvoicesPage });

const statusTone: Record<string, any> = {
  paid: "success", unpaid: "warning", partially_paid: "warning", overdue: "danger"
};
const statusLabel: Record<string, string> = {
  paid: "Paid", unpaid: "Unpaid", partially_paid: "Partially paid", overdue: "Overdue"
};

function InvoicesPage() {
  const { user, profile } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [cashPending, setCashPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Record manual payment modal
  const [selectedInv, setSelectedInv] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refund modal
  const [refundInv, setRefundInv] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  // Sending reminder
  const [remindingId, setRemindingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const ch = supabase.channel("invoices-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_assignments" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);



  async function loadData() {
    setLoading(true);
    try {
      const [{ data: invData }, { data: cashData }] = await Promise.all([
        supabase.from("invoices")
          .select("*, boxer_profiles(id, full_name, email, phone, user_id)")
          .order("due_date", { ascending: true }),
        supabase.from("fee_assignments")
          .select("id, boxer_profile_id, status, boxer_profiles(full_name, email, user_id), fee_plans(name, amount, cycle)")
          .eq("status", "active"),
      ]);
      setInvoices(invData || []);
      setCashPending(cashData || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInv) return;
    setSaving(true);
    setSaveError(null);
    try {
      const recordedAmount = Number(payAmount);
      const { error } = await supabase.from("payments").insert({
        invoice_id: selectedInv.id,
        boxer_profile_id: selectedInv.boxer_profile_id,
        academy_id: selectedInv.academy_id || profile?.academy_id,
        amount: recordedAmount,
        payment_mode: payMode === "cash" ? "cash" : "online",
        reference: payRef || null,
        recorded_by: user?.id,
      });
      if (error) throw error;

      // Update invoice amounts and status
      const newAmountPaid = Number(selectedInv.amount_paid ?? 0) + recordedAmount;
      const newBalance = Number(selectedInv.amount_due ?? 0) - newAmountPaid;
      const newStatus = newBalance <= 0 ? "paid" : "partially_paid";
      await supabase.from("invoices")
        .update({
          status: newStatus,
          amount_paid: newAmountPaid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedInv.id);

      // If fully paid, also update fee_assignment
      if (newStatus === "paid") {
        await supabase.from("fee_assignments")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("boxer_profile_id", selectedInv.boxer_profile_id);
      }

      setSelectedInv(null);
      setPayAmount("");
      setPayRef("");
      loadData();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveCash(assignmentId: string, boxerProfileId: string) {
    const assignment = cashPending.find(a => a.id === assignmentId);
    const pMode = assignment?.payment_mode || "cash";
    const approvedStatus = pMode === "cash" ? "cash_approved" : "online_paid";

    // 1. Mark fee assignment as approved
    await supabase.from("fee_assignments")
      .update({ assignment_status: approvedStatus, cash_approved_by: user?.id, cash_approved_at: new Date().toISOString() })
      .eq("id", assignmentId);

    // 2. Find the boxer's invoice and mark it paid
    const boxerInvoice = invoices.find(i => i.boxer_profile_id === boxerProfileId && i.status !== "paid")
      ?? await ensureInvoiceForAssignment(assignment, null);

    if (boxerInvoice) {
      const payAmount = Number(boxerInvoice.balance_outstanding ?? boxerInvoice.amount_due ?? 0);
      if (payAmount > 0) {
        await supabase.from("payments").insert({
          invoice_id: boxerInvoice.id,
          boxer_profile_id: boxerProfileId,
          amount: payAmount,
          payment_mode: pMode,
          recorded_by: user?.id,
          reference: `${pMode.toUpperCase()}-${Date.now()}`,
        });
      }
      await supabase.from("invoices")
        .update({
          status: "paid",
          amount_paid: Number(boxerInvoice.amount_due ?? 0),
          balance_outstanding: 0,
          is_overdue: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", boxerInvoice.id);

    }

    // 3. Notify boxer
    if (assignment?.boxer_profiles?.user_id) {
      await supabase.from("notifications").insert({
        recipient_id: assignment.boxer_profiles.user_id,
        type: "cash_approved",
        title: "Payment confirmed ✓",
        body: `Your ${pMode === "cash" ? "cash" : "online"} payment has been confirmed by your admin. Your dashboard is now unlocked!`,
      });
    }
    loadData();
  }

  async function handleSendReminder(inv: any) {
    setRemindingId(inv.id);
    try {
      await supabase.from("notifications").insert({
        recipient_id: inv.boxer_profiles?.user_id,
        type: "payment_reminder",
        title: "Payment reminder",
        body: `Invoice ${inv.invoice_number} of ₹${Number(inv.balance_outstanding ?? inv.amount_due).toLocaleString("en-IN")} is ${inv.status === "overdue" ? "overdue" : "due soon"}. Please complete your payment to maintain access.`,
        related_entity_id: inv.id,
        related_entity_type: "invoice",
      });
    } finally {
      setRemindingId(null);
    }
  }

  async function handleRefundRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!refundInv) return;
    setRefunding(true);
    try {
      await supabase.from("refunds").insert({
        boxer_profile_id: refundInv.boxer_profile_id,
        amount: Number(refundAmount),
        reason: refundReason,
        status: "pending",
        requested_by: user?.id,
      });
      setRefundInv(null);
      setRefundAmount("");
      setRefundReason("");
    } finally {
      setRefunding(false);
    }
  }

  // Summary stats
  const totalOutstanding = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + Number(i.balance_outstanding ?? 0), 0);
  const overdueCount = invoices.filter(i => i.status === "overdue").length;
  const paidThisMonth = invoices.filter(i => {
    if (i.status !== "paid") return false;
    const d = new Date(i.updated_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);

  const filtered = invoices.filter(i => {
    const matchQ = !q || i.boxer_profiles?.full_name?.toLowerCase().includes(q.toLowerCase()) || i.invoice_number?.toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || i.status === statusFilter;
    return matchQ && matchS;
  });

  const fmt = (n: number) => `₹ ${n.toLocaleString("en-IN")}`;

  return (
    <>
      <PageHeader
        title="Invoices & dues"
        subtitle="Section 5 — Outstanding dues tracking and payment management"
        actions={
          <button onClick={loadData} className="inline-flex items-center gap-2 border border-border px-3 py-2 rounded-lg text-sm hover:bg-subtle transition">
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        }
      />

      {/* Summary cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        {[
          { label: "Total outstanding", value: fmt(totalOutstanding), tone: "text-warning" },
          { label: "Overdue invoices", value: overdueCount.toString(), tone: "text-destructive" },
          { label: "Collected this month", value: fmt(paidThisMonth), tone: "text-success" },
        ].map(s => (
          <div key={s.label} className="bento-card p-5">
            <div className="label-micro mb-2">{s.label}</div>
            <div className={`text-stat font-display tabular ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Pending payment approvals */}
      {cashPending.length > 0 && (
        <div className="bg-warning/6 border border-warning/25 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-warning mb-3">Payments pending confirmation ({cashPending.length})</div>
          <div className="space-y-2">
            {cashPending.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-surface border border-border rounded-lg px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{a.boxer_profiles?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{a.boxer_profiles?.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">
                    {a.payment_mode === "cash" || a.assignment_status === "cash_pending" ? "Cash pending" : "PayU online pending"}
                  </Badge>
                  <button onClick={() => handleApproveCash(a.id, a.boxer_profile_id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-success text-white rounded-lg hover:bg-success/90 transition">
                    <Check className="size-3" /> Confirm receipt
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-elevated flex-1 max-w-sm">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or invoice #…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm h-9 px-3 border border-border rounded-lg bg-elevated">
            <option value="all">All status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially paid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-5 py-3">Invoice</th>
              <th className="text-left font-medium py-3">Boxer</th>
              <th className="text-right font-medium py-3">Amount</th>
              <th className="text-right font-medium py-3">Paid</th>
              <th className="text-right font-medium py-3">Outstanding</th>
              <th className="text-left font-medium py-3 px-3">Status</th>
              <th className="text-left font-medium py-3">Due</th>
              <th className="text-right font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">No invoices found.</td></tr>
            ) : (
              filtered.map(inv => {
                const isOverdue = inv.status === "overdue";
                const daysOverdue = isOverdue && inv.due_date
                  ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
                  : 0;
                return (
                  <tr key={inv.id} className={`border-t border-border hover:bg-subtle transition ${isOverdue ? "bg-destructive/3" : ""}`}>
                    <td className="px-5 py-3.5">
                      <div className="font-mono text-xs font-medium">{inv.invoice_number}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{inv.billing_period ?? "—"}</div>
                    </td>
                    <td className="py-3.5">
                      <div className="font-medium text-sm">{inv.boxer_profiles?.full_name ?? "—"}</div>
                    </td>
                    <td className="py-3.5 text-right tabular">₹ {Number(inv.amount_due).toLocaleString("en-IN")}</td>
                    <td className="py-3.5 text-right tabular text-success">₹ {Number(inv.amount_paid ?? 0).toLocaleString("en-IN")}</td>
                    <td className="py-3.5 text-right tabular font-semibold">
                      {inv.status === "paid" ? <span className="text-success">—</span> : `₹ ${Number(inv.balance_outstanding ?? 0).toLocaleString("en-IN")}`}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-1">
                        <Badge tone={statusTone[inv.status] ?? "default"}>{statusLabel[inv.status] ?? inv.status}</Badge>
                        {isOverdue && daysOverdue > 0 && (
                          <span className="text-[10px] text-destructive">{daysOverdue}d overdue</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 text-xs text-muted-foreground tabular">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        {inv.status !== "paid" && (
                          <>
                            <button
                              onClick={() => handleSendReminder(inv)}
                              disabled={remindingId === inv.id}
                              title="Send reminder"
                              className="size-7 grid place-items-center rounded-md hover:bg-info/10 transition text-info"
                            >
                              {remindingId === inv.id ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
                            </button>
                            <button
                              onClick={() => { setSelectedInv(inv); setPayAmount(String(inv.balance_outstanding ?? inv.amount_due)); }}
                              title="Record payment"
                              className="size-7 grid place-items-center rounded-md hover:bg-success/10 transition text-success"
                            >
                              <Banknote className="size-3.5" />
                            </button>
                          </>
                        )}
                        {inv.status === "paid" && (
                          <button
                            onClick={() => { setRefundInv(inv); setRefundAmount(String(inv.amount_paid ?? 0)); }}
                            title="Request refund"
                            className="size-7 grid place-items-center rounded-md hover:bg-destructive/10 transition text-destructive"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="px-5 py-3 border-t border-border bg-elevated text-xs text-muted-foreground">
          {filtered.length} invoice{filtered.length !== 1 ? "s" : ""} · Outstanding: {fmt(totalOutstanding)}
        </div>
      </div>

      {/* Record Payment Modal */}
      {selectedInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md animate-fade-up overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold">Record payment</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedInv.invoice_number} · {selectedInv.boxer_profiles?.full_name}</p>
              </div>
              <button onClick={() => setSelectedInv(null)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Amount (₹) *</label>
                <input required type="number" min="1" max={selectedInv.balance_outstanding} value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="input-premium" placeholder="Enter amount" />
                <p className="text-[11px] text-muted-foreground mt-1">Outstanding: ₹{Number(selectedInv.balance_outstanding ?? 0).toLocaleString("en-IN")}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Payment mode *</label>
                <select value={payMode} onChange={e => setPayMode(e.target.value)} className="input-premium appearance-none">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online (Razorpay)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Reference / UTR (optional)</label>
                <input value={payRef} onChange={e => setPayRef(e.target.value)} className="input-premium font-mono" placeholder="UTR / txn ID" />
              </div>
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setSelectedInv(null)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-success text-white rounded-xl hover:bg-success/90 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {saving ? "Saving…" : "Record payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refund Request Modal */}
      {refundInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md animate-fade-up overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold">Request refund</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{refundInv.invoice_number} · Requires superadmin approval</p>
              </div>
              <button onClick={() => setRefundInv(null)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleRefundRequest} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Refund amount (₹) *</label>
                <input required type="number" min="1" max={refundInv.amount_paid} value={refundAmount} onChange={e => setRefundAmount(e.target.value)} className="input-premium" />
                <p className="text-[11px] text-muted-foreground mt-1">Total paid: ₹{Number(refundInv.amount_paid).toLocaleString("en-IN")}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Reason for refund *</label>
                <textarea required rows={3} value={refundReason} onChange={e => setRefundReason(e.target.value)} className="input-premium resize-none" placeholder="Mandatory — document the reason clearly" />
              </div>
              <div className="bg-warning/6 border border-warning/20 rounded-xl p-3 text-xs text-warning">
                This refund request will be sent to the superadmin for approval. The refund will only be processed after approval.
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setRefundInv(null)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
                <button type="submit" disabled={refunding} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                  {refunding ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  {refunding ? "Submitting…" : "Submit for approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
