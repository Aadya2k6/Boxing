import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import {
  AlertTriangle, Banknote, Bell, Calendar, Check, CreditCard, Loader2, RotateCcw, Users, X
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/notifications")({ component: SuperadminNotifications });

const typeIcon: Record<string, any> = {
  fee_package_sent: CreditCard,
  cash_pending: Banknote,
  cash_approved: Check,
  payment_reminder: AlertTriangle,
  refund_approved: Check,
  refund_rejected: AlertTriangle,
  class_assignment_poll: Calendar,
  pitch_rsvp: Calendar,
  new_user: Users,
  refund_requested: RotateCcw,
  leave_application: Calendar,
  rollover_requested: RotateCcw,
  rollover_approved: RotateCcw,
  rollover_rejected: X,
  default: Bell,
};

const typeTone: Record<string, string> = {
  fee_package_sent: "info",
  cash_pending: "warning",
  cash_approved: "success",
  payment_reminder: "danger",
  refund_approved: "success",
  refund_rejected: "warning",
  class_assignment_poll: "info",
  pitch_rsvp: "info",
  new_user: "info",
  refund_requested: "warning",
  leave_application: "warning",
  rollover_requested: "info",
  rollover_approved: "success",
  rollover_rejected: "warning",
};

function SuperadminNotifications() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [leaveApps, setLeaveApps] = useState<Record<string, any>>({});
  const [rolloverAssignments, setRolloverAssignments] = useState<Record<string, any>>({});
  const [rolloverActioning, setRolloverActioning] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadNotifs();
    const channel = supabase.channel("notifs-superadmin")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, loadNotifs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function loadNotifs() {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(75);
    const notifRows = data ?? [];
    setNotifs(notifRows);

    // Fetch leave application statuses for leave_application notifications
    const leaveIds = notifRows
      .filter(n => n.type === "leave_application" && n.related_entity_id)
      .map(n => n.related_entity_id);

    if (leaveIds.length > 0) {
      const { data: laData } = await supabase
        .from("leave_applications")
        .select("id, status, boxer_profile_id, start_date, end_date, boxer_profiles(user_id)")
        .in("id", leaveIds);
      if (laData) {
        const mapping = laData.reduce((acc, curr) => {
          acc[curr.id] = curr;
          return acc;
        }, {} as Record<string, any>);
        setLeaveApps(mapping);
      }
    }

    // Fetch fee_assignment data for rollover_requested notifications
    const rolloverIds = notifRows
      .filter(n => n.type === "rollover_requested" && n.related_entity_id)
      .map(n => n.related_entity_id);

    if (rolloverIds.length > 0) {
      const { data: faData } = await supabase
        .from("fee_assignments")
        .select("id, status, boxer_profile_id, boxer_profiles(user_id, full_name), fee_plans(name, amount)")
        .in("id", rolloverIds);
      if (faData) {
        const mapping = faData.reduce((acc, curr: any) => {
          acc[curr.id] = {
            ...curr,
            assignment_status: curr.status,
            payment_mode: "rollover",
            fee_plans: curr.fee_plans ? { ...curr.fee_plans, plan_name: curr.fee_plans.name } : null,
          };
          return acc;
        }, {} as Record<string, any>);
        setRolloverAssignments(mapping);
      }
    }

    setLoading(false);
  }

  async function handleLeaveAction(leaveId: string, action: "approve" | "deny") {
    const leaveApp = leaveApps[leaveId];
    if (!leaveApp) return;

    const newStatus = action === "approve" ? "approved" : "rejected";

    // 1. Update leave application status
    const { error: updateErr } = await supabase
      .from("leave_applications")
      .update({ status: newStatus, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", leaveId);

    if (updateErr) {
      console.error(updateErr);
      return;
    }

    // Update state locally
    setLeaveApps(prev => ({
      ...prev,
      [leaveId]: {
        ...prev[leaveId],
        status: newStatus,
      }
    }));

    // 2. Notify athlete
    const athleteUserId = leaveApp.boxer_profiles?.user_id;
    if (athleteUserId) {
      await supabase.from("notifications").insert({
        recipient_id: athleteUserId,
        type: action === "approve" ? "leave_approved" : "leave_rejected",
        title: action === "approve" ? "Leave Approved ✓" : "Leave Denied ✗",
        body: `Your leave request for ${new Date(leaveApp.leave_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} has been ${action === "approve" ? "approved" : "denied"}.`,
      });
    }
  }

  async function handleRolloverAction(assignmentId: string, action: "approve" | "reject") {
    const fa = rolloverAssignments[assignmentId];
    if (!fa) return;
    setRolloverActioning(prev => ({ ...prev, [assignmentId]: true }));
    try {
      if (action === "approve") {
        await supabase.from("fee_assignments")
          .update({
            assignment_status: "rollover_approved",
            rollover_approved: true,
            rollover_approved_by: user?.id,
            rollover_approved_at: new Date().toISOString(),
          })
          .eq("id", assignmentId);

        const athleteUserId = fa.boxer_profiles?.user_id;
        if (athleteUserId) {
          await supabase.from("notifications").insert({
            recipient_id: athleteUserId,
            type: "rollover_approved",
            title: "Payment rollover approved ✓",
            body: `Your payment rollover has been approved. Your dashboard is now unlocked! Please visit Fee & Payments to clear the outstanding balance when convenient.`,
          });
        }
      } else {
        await supabase.from("fee_assignments")
          .update({ assignment_status: "sent", payment_mode: null })
          .eq("id", assignmentId);

        const athleteUserId = fa.boxer_profiles?.user_id;
        if (athleteUserId) {
          await supabase.from("notifications").insert({
            recipient_id: athleteUserId,
            type: "rollover_rejected",
            title: "Payment rollover rejected",
            body: `Your payment rollover request has been declined. Please proceed with paying via online or cash to unlock your dashboard.`,
          });
        }
      }

      // Update local state to reflect action
      setRolloverAssignments(prev => ({
        ...prev,
        [assignmentId]: {
          ...prev[assignmentId],
          assignment_status: action === "approve" ? "rollover_approved" : "sent",
        }
      }));
    } catch (err: any) {
      console.error(err);
    } finally {
      setRolloverActioning(prev => ({ ...prev, [assignmentId]: false }));
    }
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", user.id).eq("is_read", false);
    loadNotifs();
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  function relTime(ts: string) {
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

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={unreadCount > 0 ? (
          <button onClick={markAllRead} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-subtle transition">Mark all read</button>
        ) : undefined}
      />

      <div className="bg-surface border border-border rounded-xl overflow-hidden max-w-4xl">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : notifs.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : notifs.map(n => {
          const Icon = typeIcon[n.type] ?? typeIcon.default;
          const tone = typeTone[n.type] ?? "default";
          const leaveApp = leaveApps[n.related_entity_id];
          const rolloverAssignment = rolloverAssignments[n.related_entity_id];

          return (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`flex gap-4 px-5 py-4 border-t first:border-0 border-border hover:bg-subtle transition cursor-pointer ${!n.is_read ? "bg-info/[0.03]" : ""}`}
            >
              <div className={`size-9 rounded-md grid place-items-center shrink-0 ${
                tone === "success" ? "bg-success/10 text-success" :
                tone === "warning" ? "bg-warning/10 text-warning" :
                tone === "danger" ? "bg-destructive/10 text-destructive" :
                tone === "info" ? "bg-info/10 text-info" : "bg-subtle text-muted-foreground"
              }`}>
                <Icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  {!n.is_read && <span className="size-1.5 rounded-full bg-info shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.body}</div>

                {n.type === "leave_application" && leaveApp && (
                  <div className="mt-3 flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    {leaveApp.status === "pending" ? (
                      <>
                        <button
                          onClick={() => handleLeaveAction(n.related_entity_id, "approve")}
                          className="px-3 py-1.5 text-xs font-semibold bg-success/10 text-success border border-success/25 rounded-lg hover:bg-success/20 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="size-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleLeaveAction(n.related_entity_id, "deny")}
                          className="px-3 py-1.5 text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/25 rounded-lg hover:bg-destructive/20 transition flex items-center gap-1 cursor-pointer"
                        >
                          <X className="size-3.5" /> Deny
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        leaveApp.status === "approved" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                      }`}>
                        {leaveApp.status === "approved" ? "Approved ✓" : "Denied ✗"}
                      </span>
                    )}
                  </div>
                )}

                {/* Rollover notification inline actions */}
                {n.type === "rollover_requested" && rolloverAssignment && (
                  <div className="mt-3 flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    {rolloverAssignment.assignment_status === "rollover_pending" ? (
                      <>
                        <button
                          onClick={() => handleRolloverAction(n.related_entity_id, "approve")}
                          disabled={rolloverActioning[n.related_entity_id]}
                          className="px-3 py-1.5 text-xs font-semibold bg-info/10 text-info border border-info/25 rounded-lg hover:bg-info/20 transition flex items-center gap-1 cursor-pointer disabled:opacity-60"
                        >
                          {rolloverActioning[n.related_entity_id] ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          Approve rollover
                        </button>
                        <button
                          onClick={() => handleRolloverAction(n.related_entity_id, "reject")}
                          disabled={rolloverActioning[n.related_entity_id]}
                          className="px-3 py-1.5 text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/25 rounded-lg hover:bg-destructive/20 transition flex items-center gap-1 cursor-pointer disabled:opacity-60"
                        >
                          <X className="size-3.5" /> Reject
                        </button>
                      </>
                    ) : rolloverAssignment.assignment_status === "rollover_approved" ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success">
                        Rollover approved ✓
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">
                        Rollover rejected ✗
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular shrink-0 mt-0.5">{relTime(n.created_at)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
