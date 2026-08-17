import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { Check, X, Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/refunds")({ component: RefundsPage });

function RefundsPage() {
  const { user } = useAuth();
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => { loadRefunds(); }, []);

  async function loadRefunds() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("refunds")
        .select("*, boxer_profiles(full_name, email), profiles!refunds_requested_by_fkey(full_name)")
        .order("created_at", { ascending: false });
      setRefunds(data || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string, athleteUserId: string) {
    setActionId(id);
    setProcessing(true);
    try {
      await supabase.from("refunds").update({
        status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", id);
      if (athleteUserId) {
        await supabase.from("notifications").insert({
          recipient_id: athleteUserId,
          type: "refund_approved",
          title: "Refund approved",
          body: "Your refund request has been approved by the superadmin and will be processed shortly.",
        });
      }
      loadRefunds();
    } finally {
      setProcessing(false);
      setActionId(null);
    }
  }

  async function handleReject(id: string, athleteUserId: string) {
    setProcessing(true);
    try {
      await supabase.from("refunds").update({
        status: "rejected",
        rejection_reason: rejectNote,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", id);
      if (athleteUserId) {
        await supabase.from("notifications").insert({
          recipient_id: athleteUserId,
          type: "refund_rejected",
          title: "Refund request declined",
          body: `Your refund request has been declined. Reason: ${rejectNote || "No reason provided"}`,
        });
      }
      setRejectId(null);
      setRejectNote("");
      loadRefunds();
    } finally {
      setProcessing(false);
    }
  }

  const pending = refunds.filter(r => r.status === "pending");
  const historical = refunds.filter(r => r.status !== "pending");
  const pendingTotal = pending.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <PageHeader
        title="Refund approvals"
        subtitle={`Section 7 — ${pending.length} pending · ₹ ${pendingTotal.toLocaleString("en-IN")} total pending`}
      />

      <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/6 border border-warning/20 mb-5">
        <AlertCircle className="size-4 text-warning mt-0.5 shrink-0" />
        <p className="text-sm text-warning">All refunds require superadmin approval before processing. Admin must document reason. Full audit trail is maintained below.</p>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display font-semibold mb-3">Pending approval ({pending.length})</h2>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-elevated">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium px-5 py-3">Athlete</th>
                  <th className="text-right font-medium py-3">Amount</th>
                  <th className="text-left font-medium py-3 pl-5">Reason</th>
                  <th className="text-left font-medium py-3">Requested by</th>
                  <th className="text-left font-medium py-3">Date</th>
                  <th className="text-right font-medium px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(r => (
                  <tr key={r.id} className="border-t border-border hover:bg-subtle transition">
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{r.boxer_profiles?.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.boxer_profiles?.email}</div>
                    </td>
                    <td className="py-3.5 text-right tabular font-bold">₹ {Number(r.amount).toLocaleString("en-IN")}</td>
                    <td className="py-3.5 pl-5 text-muted-foreground max-w-xs">{r.reason}</td>
                    <td className="py-3.5 text-muted-foreground text-xs">{r.profiles?.full_name ?? "Admin"}</td>
                    <td className="py-3.5 text-muted-foreground text-xs tabular">
                      {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setRejectId(r.id)} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/8 transition">
                          <X className="size-3" /> Reject
                        </button>
                        <button onClick={() => handleApprove(r.id, r.boxer_profiles?.user_id)} disabled={processing && actionId === r.id}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-success text-white rounded-lg hover:bg-success/90 disabled:opacity-50 transition">
                          {processing && actionId === r.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                          Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* History */}
      <section>
        <h2 className="font-display font-semibold mb-3">Refund history</h2>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-5 py-3">Athlete</th>
                <th className="text-right font-medium py-3">Amount</th>
                <th className="text-left font-medium py-3 pl-5">Reason</th>
                <th className="text-left font-medium py-3">Status</th>
                <th className="text-left font-medium py-3">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-12 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : historical.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No refund history yet.</td></tr>
              ) : (
                historical.map(r => (
                  <tr key={r.id} className="border-t border-border hover:bg-subtle transition">
                    <td className="px-5 py-3.5 font-medium">{r.boxer_profiles?.full_name}</td>
                    <td className="py-3.5 text-right tabular font-semibold">₹ {Number(r.amount).toLocaleString("en-IN")}</td>
                    <td className="py-3.5 pl-5 text-muted-foreground text-xs max-w-xs">{r.reason}</td>
                    <td className="py-3.5">
                      <Badge tone={r.status === "approved" ? "success" : "danger"}>
                        {r.status === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                    </td>
                    <td className="py-3.5 text-xs text-muted-foreground tabular">
                      {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up">
            <h3 className="font-semibold mb-1">Reject refund</h3>
            <p className="text-sm text-muted-foreground mb-4">Provide a reason for rejection (optional, visible to the requesting admin).</p>
            <textarea rows={3} value={rejectNote} onChange={e => setRejectNote(e.target.value)} className="input-premium resize-none mb-4" placeholder="Reason for rejection…" />
            <div className="flex gap-3">
              <button onClick={() => { setRejectId(null); setRejectNote(""); }} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleReject(rejectId, refunds.find(r => r.id === rejectId)?.boxer_profiles?.user_id)} disabled={processing}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {processing ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
