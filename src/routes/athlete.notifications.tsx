import { AccessGuard } from "@/components/dashboard/AccessGuard";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import {
  CreditCard,
  Trophy,
  FileText,
  Bell,
  Calendar,
  Banknote,
  Check,
  AlertTriangle,
  UserCheck,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/athlete/notifications")({ component: NotifPage });

const typeIcon: Record<string, any> = {
  fee_package_sent: CreditCard,
  cash_approved: Banknote,
  cash_pending: Banknote,
  payment_reminder: AlertTriangle,
  leave_approved: Calendar,
  leave_rejected: Calendar,
  refund_approved: Check,
  refund_rejected: FileText,
  class_assignment_poll: Calendar,
  pitch_rsvp: Calendar,
  default: Bell,
};

const typeTone: Record<string, string> = {
  fee_package_sent: "info",
  cash_approved: "success",
  payment_reminder: "warning",
  leave_approved: "success",
  leave_rejected: "danger",
  refund_approved: "success",
  refund_rejected: "danger",
  class_assignment_poll: "info",
  pitch_rsvp: "info",
};

function NotifPage() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [classPollResponses, setClassPollResponses] = useState<
    Record<string, { status: "attending" | "not_attending"; reason?: string; responded_at: string }>
  >({});

  // RSVP States mapping notification ID to a state
  const [rsvpState, setRsvpState] = useState<
    Record<string, { showReason: boolean; reason: string; loading: boolean }>
  >({});

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadNotifs();

    const ch = supabase
      .channel("notifs-athlete-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, loadNotifs)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_assignment_polls" },
        loadNotifs,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_assignment_poll_responses" },
        loadNotifs,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  async function loadNotifs() {
    if (!user) return;

    // Fetch athlete profile ID and joining date
    const { data: ap } = await supabase
      .from("athlete_profiles")
      .select("id, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const apId = ap?.id;
    if (apId) setAthleteId(apId);

    // Calculate user's registration/joining cutoff timestamp
    const rawJoinTime = ap?.created_at || (user as any)?.created_at;
    const joinTimeMs = rawJoinTime ? new Date(rawJoinTime).getTime() : 0;
    // Allow a 5-second grace window for signup creation time differences
    const joinCutoffIso = joinTimeMs > 0 ? new Date(joinTimeMs - 5000).toISOString() : null;

    // 1. Fetch real notifications for user or athlete profile created ON or AFTER joining
    let query = supabase.from("notifications").select("*");
    if (apId) {
      query = query.or(`recipient_id.eq.${user.id},recipient_id.eq.${apId}`);
    } else {
      query = query.eq("recipient_id", user.id);
    }
    if (joinCutoffIso) {
      query = query.gte("created_at", joinCutoffIso);
    }
    const { data: notifRows } = await query.order("created_at", { ascending: false }).limit(50);

    // 2. Fetch class assignment polls created ON or AFTER joining
    let pollsQuery = supabase
      .from("class_assignment_polls")
      .select("id, title, message, poll_date, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (joinCutoffIso) {
      pollsQuery = pollsQuery.gte("created_at", joinCutoffIso);
    }
    const { data: polls } = await pollsQuery;

    // 3. Fetch poll responses for this athlete
    if (apId) {
      const { data: responses } = await supabase
        .from("class_assignment_poll_responses")
        .select("poll_id, status, reason, responded_at")
        .eq("athlete_profile_id", apId);
      setClassPollResponses(Object.fromEntries((responses ?? []).map((r: any) => [r.poll_id, r])));
    }

    // Merge notifications and class assignment polls (strictly after join date)
    const existingRelatedIds = new Set((notifRows ?? []).map((n: any) => n.related_entity_id));
    const syntheticPolls = (polls ?? [])
      .filter((p: any) => {
        if (existingRelatedIds.has(p.id)) return false;
        if (joinTimeMs > 0 && p.created_at) {
          const pollTime = new Date(p.created_at).getTime();
          if (pollTime < joinTimeMs - 5000) return false;
        }
        return true;
      })
      .map((p: any) => ({
        id: `poll-${p.id}`,
        recipient_id: user.id,
        type: "class_assignment_poll",
        title: p.title || "Practice Class Scheduled",
        body:
          p.message ||
          `Class scheduled for ${p.poll_date}. Please confirm if you will be attending.`,
        is_read: false,
        related_entity_id: p.id,
        related_entity_type: "class_assignment_poll",
        created_at: p.created_at || new Date().toISOString(),
        _is_synthetic: true,
      }));

    const combined = [...(notifRows ?? []), ...syntheticPolls].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setNotifs(combined);
    setLoading(false);
  }

  async function markAllRead() {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", user.id)
      .eq("is_read", false);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function markRead(id: string) {
    if (!id.startsWith("poll-")) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    }
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  async function submitRsvp(notifId: string, pollId: string, isAttending: boolean) {
    if (!athleteId) return;

    const currentState = rsvpState[notifId] || { showReason: false, reason: "" };

    if (!isAttending && !currentState.showReason) {
      // First click of 'No', show the reason input
      setRsvpState((prev) => ({ ...prev, [notifId]: { ...currentState, showReason: true } }));
      return;
    }

    if (!isAttending && !currentState.reason.trim()) {
      alert("Please provide a reason for not attending.");
      return;
    }

    setRsvpState((prev) => ({ ...prev, [notifId]: { ...currentState, loading: true } }));

    const responsePayload = {
      poll_id: pollId,
      athlete_profile_id: athleteId,
      status: isAttending ? "attending" : "not_attending",
      reason: isAttending ? null : currentState.reason.trim(),
      responded_at: new Date().toISOString(),
    };

    const { data: existingResponse } = await supabase
      .from("class_assignment_poll_responses")
      .select("id")
      .eq("poll_id", pollId)
      .eq("athlete_profile_id", athleteId)
      .maybeSingle();

    if (existingResponse?.id) {
      await supabase
        .from("class_assignment_poll_responses")
        .update(responsePayload)
        .eq("id", existingResponse.id);
    } else {
      await supabase.from("class_assignment_poll_responses").insert(responsePayload);
    }

    setClassPollResponses((prev) => ({ ...prev, [pollId]: responsePayload as any }));

    // 4. Mark as read
    await markRead(notifId);
    setRsvpState((prev) => {
      const next = { ...prev };
      delete next[notifId];
      return next;
    });
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

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  return (
    <AccessGuard>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={
          unreadCount > 0 ? (
            <button
              onClick={markAllRead}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-subtle transition"
            >
              Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="bg-surface border border-border rounded-xl overflow-hidden max-w-4xl">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="size-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          notifs.map((n) => {
            const Icon = typeIcon[n.type] ?? typeIcon.default;
            const tone = typeTone[n.type] ?? "default";
            const state = rsvpState[n.id] || { showReason: false, reason: "", loading: false };
            const isPitchRsvp =
              (n.type === "pitch_rsvp" || n.type === "class_assignment_poll") &&
              !!n.related_entity_id;
            const currentResponse = classPollResponses[n.related_entity_id];

            return (
              <div
                key={n.id}
                className={`flex gap-4 px-5 py-5 border-t first:border-0 border-border transition-colors ${!n.is_read ? "bg-primary/[0.02]" : "hover:bg-subtle"}`}
              >
                <div
                  className={`size-10 rounded-xl grid place-items-center shrink-0 ${
                    tone === "success"
                      ? "bg-success/10 text-success"
                      : tone === "warning"
                        ? "bg-warning/10 text-warning"
                        : tone === "danger"
                          ? "bg-destructive/10 text-destructive"
                          : tone === "info"
                            ? "bg-info/10 text-info"
                            : "bg-subtle text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-foreground tracking-tight">
                      {n.title}
                    </span>
                    {!n.is_read && <span className="size-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
                  <div className="text-sm text-muted-foreground leading-relaxed pr-8">{n.body}</div>

                  {isPitchRsvp && (
                    <div
                      className="mt-4 pt-4 border-t border-border"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h4 className="text-xs font-semibold text-foreground mb-3">
                        Will you attend?
                      </h4>
                      {currentResponse && (
                        <div className="mb-3 text-xs rounded-lg border border-border bg-elevated px-3 py-2 text-muted-foreground">
                          Your response:{" "}
                          <span className="font-semibold text-foreground capitalize">
                            {currentResponse.status.replace("_", " ")}
                          </span>
                          {currentResponse.reason ? (
                            <div className="mt-1 italic">Reason: {currentResponse.reason}</div>
                          ) : null}
                        </div>
                      )}
                      {!state.showReason ? (
                        <div className="flex gap-3">
                          <button
                            onClick={() => submitRsvp(n.id, n.related_entity_id, true)}
                            disabled={state.loading}
                            className="px-4 py-2 text-sm font-semibold bg-success/10 text-success border border-success/20 rounded-lg hover:bg-success/20 transition flex items-center gap-2"
                          >
                            {state.loading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Check className="size-3.5" />
                            )}
                            Yes, I'll attend
                          </button>
                          <button
                            onClick={() => submitRsvp(n.id, n.related_entity_id, false)}
                            disabled={state.loading}
                            className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-elevated transition"
                          >
                            No, I can't
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 max-w-sm animate-fade-in">
                          <textarea
                            autoFocus
                            placeholder="Please provide a reason..."
                            value={state.reason}
                            onChange={(e) =>
                              setRsvpState((prev) => ({
                                ...prev,
                                [n.id]: { ...state, reason: e.target.value },
                              }))
                            }
                            className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none min-h-[80px]"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => submitRsvp(n.id, n.related_entity_id, false)}
                              disabled={state.loading || !state.reason.trim()}
                              className="px-4 py-2 text-sm font-semibold bg-[#ef4444] text-white rounded-lg hover:bg-[#dc2626] disabled:opacity-50 transition flex items-center gap-2"
                            >
                              {state.loading && <Loader2 className="size-3.5 animate-spin" />}
                              Submit Reason
                            </button>
                            <button
                              onClick={() =>
                                setRsvpState((prev) => ({
                                  ...prev,
                                  [n.id]: { ...state, showReason: false },
                                }))
                              }
                              disabled={state.loading}
                              className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-elevated transition"
                            >
                              Back
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground font-medium">
                    {relTime(n.created_at)}
                  </span>
                  {!isPitchRsvp && !n.is_read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(n.id);
                      }}
                      className="text-[10px] uppercase tracking-wider font-semibold text-primary hover:text-primary-dark transition mt-1"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AccessGuard>
  );
}
