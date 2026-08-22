import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  CalendarCheck, Users, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, Loader2, Check, X, AlertTriangle, Search, Bell
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/attendance")({ component: AdminAttendancePage });

type Tab = "overview" | "daily" | "leaves" | "poll";

function AdminAttendancePage() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [summaries, setSummaries] = useState<any[]>([]);
  const [dailyRecords, setDailyRecords] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [q, setQ] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedBoxer, setExpandedBoxer] = useState<string | null>(null);
  const [boxerHistory, setBoxerHistory] = useState<any[]>([]);
  const [todayPollSent, setTodayPollSent] = useState(false);
  const [todayPollId, setTodayPollId] = useState<string | null>(null);
  const [pollResponses, setPollResponses] = useState<any[]>([]);
  const [sendingPoll, setSendingPoll] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    loadAll();
    const ch = supabase.channel("admin-attendance-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_applications" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_polls" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.academy_id]);

  useEffect(() => {
    if (tab === "daily") {
      loadDailyRecords(dateFilter);
    }
  }, [dateFilter, tab]);

  async function loadAll() {
    setLoading(true);
    try {
      const academyId = profile?.academy_id;

      let bpQuery = supabase.from("boxer_profiles").select("id, full_name, user_id, academy_id").order("full_name");
      let attQuery = supabase.from("attendance").select("boxer_profile_id, status, session_date, checked_in_at, distance_meters, academy_id");
      let leavesQuery = supabase.from("leave_applications").select("*, boxer_profiles(full_name)").order("start_date", { ascending: false });
      let pollQuery = supabase.from("attendance_polls").select("id, sent_at, academy_id").order("sent_at", { ascending: false }).limit(1);

      if (academyId) {
        bpQuery = bpQuery.eq("academy_id", academyId);
        attQuery = attQuery.eq("academy_id", academyId);
        leavesQuery = leavesQuery.eq("academy_id", academyId);
        pollQuery = pollQuery.eq("academy_id", academyId);
      }

      const [
        { data: aps, error: apErr },
        { data: att, error: attErr },
        { data: leaves, error: lErr },
        { data: todayPolls, error: pErr }
      ] = await Promise.all([
        bpQuery,
        attQuery,
        leavesQuery,
        pollQuery,
      ]);

      if (apErr) console.error("Error fetching boxers for attendance:", apErr);
      if (attErr) console.error("Error fetching attendance records:", attErr);
      if (lErr) console.error("Error fetching leaves:", lErr);
      if (pErr) console.error("Error fetching polls:", pErr);

      const latestPoll = todayPolls?.[0];
      const isTodayPoll = latestPoll && latestPoll.sent_at && new Date(latestPoll.sent_at).toISOString().split("T")[0] === todayStr;

      const sums = (aps ?? []).map(ap => {
        const records = (att ?? []).filter(a => a.boxer_profile_id === ap.id);
        const pending = (leaves ?? []).filter(l => l.boxer_profile_id === ap.id && l.status === "pending").length;
        const approved = (leaves ?? []).filter(l => l.boxer_profile_id === ap.id && l.status === "approved").length;
        const lastRecord = records.sort((a, b) => (b.session_date || "").localeCompare(a.session_date || ""))[0];
        return {
          boxer_profile_id: ap.id,
          user_id: ap.user_id,
          full_name: ap.full_name,
          total_present: records.filter(r => r.status === "present").length,
          total_absent: records.filter(r => r.status === "absent").length,
          total_approved_leave: approved,
          pending_leave_requests: pending,
          last_marked_date: lastRecord?.session_date ?? null,
        };
      });

      setSummaries(sums);
      setLeaveRequests(leaves ?? []);
      setTodayPollSent(!!isTodayPoll);
      setTodayPollId(isTodayPoll ? latestPoll.id : null);

      if (isTodayPoll && latestPoll?.id) {
        await loadPollResponses(latestPoll.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadPollResponses(pollId: string) {
    const { data } = await supabase
      .from("attendance_poll_responses")
      .select("*, boxer_profiles(full_name)")
      .eq("poll_id", pollId)
      .order("responded_at", { ascending: false });
    setPollResponses(data ?? []);
  }

  async function handleSendAttendancePoll() {
    if (todayPollSent) {
      alert("An attendance poll has already been sent today. You can only send one poll per day.");
      return;
    }
    if (!confirm(`Send an attendance poll to all ${summaries.length} boxers? They will be asked to confirm attendance or provide a reason for absence.`)) return;

    setSendingPoll(true);
    try {
      const academyId = profile?.academy_id;
      if (!academyId) {
        throw new Error("Admin is not assigned to an academy location.");
      }

      const { data: poll, error: pollErr } = await supabase
        .from("attendance_polls")
        .insert({
          academy_id: academyId,
          sent_by: user?.id,
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (pollErr) {
        throw pollErr;
      }

      const notifInserts = summaries
        .filter(s => s.user_id)
        .map(s => ({
          recipient_id: s.user_id,
          academy_id: academyId,
          type: "attendance_poll",
          title: "📋 Attendance check for today",
          body: "Please mark your attendance for today's training session, or provide a reason if you cannot attend.",
          data: { poll_id: poll.id },
        }));

      if (notifInserts.length > 0) {
        await supabase.from("notifications").insert(notifInserts);
      }

      setTodayPollSent(true);
      setTodayPollId(poll.id);
      alert(`✓ Attendance poll sent to ${notifInserts.length} boxers.`);
      loadAll();
    } catch (e: any) {
      alert(e.message || "Failed to send attendance poll.");
    } finally {
      setSendingPoll(false);
    }
  }

  async function loadDailyRecords(date: string) {
    const academyId = profile?.academy_id;
    let q = supabase
      .from("attendance")
      .select("*, boxer_profiles(full_name)")
      .eq("session_date", date)
      .order("checked_in_at", { ascending: false });

    if (academyId) q = q.eq("academy_id", academyId);

    const { data } = await q;
    setDailyRecords(data ?? []);
  }

  async function expandBoxer(boxerId: string) {
    if (expandedBoxer === boxerId) { setExpandedBoxer(null); return; }
    setExpandedBoxer(boxerId);
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("boxer_profile_id", boxerId)
      .order("session_date", { ascending: false })
      .limit(30);
    setBoxerHistory(data ?? []);
  }

  async function handleLeave(id: string, action: "approved" | "rejected", reason?: string) {
    setProcessing(id);
    try {
      await supabase.from("leave_applications")
        .update({
          status: action,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          ...(action === "rejected" && reason ? { rejection_reason: reason } : {}),
        })
        .eq("id", id);

      const leave = leaveRequests.find(l => l.id === id);
      if (leave) {
        const { data: ap } = await supabase
          .from("boxer_profiles").select("user_id").eq("id", leave.boxer_profile_id).maybeSingle();
        if (ap?.user_id) {
          const dateStr = leave.start_date ? new Date(leave.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "the requested date";
          await supabase.from("notifications").insert({
            recipient_id: ap.user_id,
            academy_id: profile?.academy_id,
            type: `leave_${action}`,
            title: action === "approved" ? "Leave approved ✓" : "Leave request rejected",
            body: action === "approved"
              ? `Your leave for ${dateStr} has been approved. This day will not count as absent.`
              : `Your leave request for ${dateStr} was not approved.${reason ? ` Reason: ${reason}` : ""}`,
          });
        }
      }
      loadAll();
    } finally {
      setProcessing(null);
    }
  }

  useEffect(() => {
    if (tab === "daily") loadDailyRecords(dateFilter);
  }, [tab, dateFilter]);

  const pendingLeaves = leaveRequests.filter(l => l.status === "pending");
  const filteredSummaries = summaries.filter(s => !q || s.full_name?.toLowerCase().includes(q.toLowerCase()));
  const filteredLeaves = leaveRequests.filter(l =>
    !q || l.boxer_profiles?.full_name?.toLowerCase().includes(q.toLowerCase())
  );
  const attendingCount = pollResponses.filter(r => r.status === "attending").length;
  const notAttendingCount = pollResponses.filter(r => r.status === "not_attending").length;

  return (
    <>
      <PageHeader
        title="Attendance & Leave"
        subtitle="Track daily attendance and manage leave requests"
        actions={
          <div className="flex items-center gap-2">
            {pendingLeaves.length > 0 && (
              <button onClick={() => setTab("leaves")}
                className="inline-flex items-center gap-2 bg-warning text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-warning/90 transition shadow-card">
                <Clock className="size-3.5" />
                {pendingLeaves.length} leave{pendingLeaves.length > 1 ? "s" : ""} pending
              </button>
            )}
            <button
              onClick={handleSendAttendancePoll}
              disabled={sendingPoll || todayPollSent}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition shadow-card ${
                todayPollSent
                  ? "bg-success/10 text-success border border-success/20 cursor-default"
                  : "bg-[#ef4444] text-white hover:bg-[#dc2626]"
              } disabled:opacity-60`}
            >
              {sendingPoll ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
              {todayPollSent ? "Poll sent today ✓" : "Send attendance poll"}
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Boxers tracked", value: summaries.length, icon: Users, tone: "" },
          { label: "Total present (all time)", value: summaries.reduce((a, s) => a + s.total_present, 0), icon: CheckCircle, tone: "text-success" },
          { label: "Total absent (all time)", value: summaries.reduce((a, s) => a + s.total_absent, 0), icon: XCircle, tone: "text-destructive" },
          { label: "Pending leave requests", value: pendingLeaves.length, icon: Clock, tone: pendingLeaves.length > 0 ? "text-warning" : "" },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`size-4 ${s.tone || "text-muted-foreground"}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className={`text-2xl font-display font-bold ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-subtle rounded-lg p-1 mb-5 w-fit">
        {([
          { key: "overview" as Tab, label: "Overview" },
          { key: "daily" as Tab, label: "Daily View" },
          { key: "leaves" as Tab, label: `Leave Requests${pendingLeaves.length > 0 ? ` (${pendingLeaves.length})` : ""}` },
          { key: "poll" as Tab, label: `Today's Poll${todayPollSent ? ` (${pollResponses.length})` : ""}` },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${tab === t.key ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-surface mb-4 max-w-sm">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search boxer…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* OVERVIEW TAB */}
          {tab === "overview" && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-elevated">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium px-5 py-3">Boxer</th>
                    <th className="text-right font-medium px-4 py-3">Present</th>
                    <th className="text-right font-medium px-4 py-3">Absent</th>
                    <th className="text-right font-medium px-4 py-3">Leave</th>
                    <th className="text-right font-medium px-4 py-3">Pending</th>
                    <th className="text-right font-medium px-5 py-3">Last marked</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSummaries.map(s => (
                    <>
                      <tr key={s.boxer_profile_id} className="border-t border-border hover:bg-subtle transition">
                        <td className="px-5 py-3.5 font-medium">{s.full_name}</td>
                        <td className="px-4 py-3.5 text-right"><span className="text-success font-semibold">{s.total_present}</span></td>
                        <td className="px-4 py-3.5 text-right"><span className="text-destructive font-semibold">{s.total_absent}</span></td>
                        <td className="px-4 py-3.5 text-right text-muted-foreground">{s.total_approved_leave}</td>
                        <td className="px-4 py-3.5 text-right">
                          {s.pending_leave_requests > 0
                            ? <Badge tone="warning">{s.pending_leave_requests}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                          {s.last_marked_date ? new Date(s.last_marked_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Never"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button onClick={() => expandBoxer(s.boxer_profile_id)}
                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition">
                            {expandedBoxer === s.boxer_profile_id ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            History
                          </button>
                        </td>
                      </tr>
                      {expandedBoxer === s.boxer_profile_id && (
                        <tr key={`${s.boxer_profile_id}-hist`} className="border-t border-border bg-subtle/40">
                          <td colSpan={7} className="px-5 py-4">
                            <p className="text-xs font-semibold text-muted-foreground mb-3">Last 30 records</p>
                            <div className="flex flex-wrap gap-1.5">
                              {boxerHistory.length === 0
                                ? <span className="text-xs text-muted-foreground">No records.</span>
                                : boxerHistory.map(a => (
                                  <span key={a.id} title={`${a.status}${a.distance_meters ? ` · ${a.distance_meters}m` : ""}`}
                                    className={`px-2 py-1 rounded-md text-[11px] font-medium border ${a.status === "present" ? "bg-success/10 border-success/20 text-success" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
                                    {new Date(a.session_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                  </span>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {filteredSummaries.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">No boxers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* DAILY TAB */}
          {tab === "daily" && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <label className="text-xs font-semibold text-muted-foreground shrink-0">Select date</label>
                <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input-premium py-1.5 text-sm w-44" />
              </div>
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-elevated">
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left font-medium px-5 py-3">Boxer</th>
                      <th className="text-left font-medium px-4 py-3">Status</th>
                      <th className="text-left font-medium px-4 py-3">Marked at</th>
                      <th className="text-right font-medium px-5 py-3">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRecords.map(r => (
                      <tr key={r.id} className="border-t border-border hover:bg-subtle">
                        <td className="px-5 py-3.5 font-medium">{r.boxer_profiles?.full_name ?? "—"}</td>
                        <td className="px-4 py-3.5"><Badge tone={r.status === "present" ? "success" : "danger"}>{r.status}</Badge></td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">
                          {r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                          {r.distance_meters != null ? `${r.distance_meters}m` : "—"}
                        </td>
                      </tr>
                    ))}
                    {dailyRecords.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-10 text-sm text-muted-foreground">
                        No attendance records for {new Date(dateFilter + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LEAVE REQUESTS TAB */}
          {tab === "leaves" && (
            <div className="space-y-3">
              {filteredLeaves.length === 0 && (
                <div className="bg-surface border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
                  No leave requests found.
                </div>
              )}
              {filteredLeaves.map(l => (
                <div key={l.id} className="bg-surface border border-border rounded-xl p-5 flex items-start gap-4">
                  <div className={`size-10 rounded-xl grid place-items-center shrink-0 ${
                    l.status === "approved" ? "bg-success/10" :
                    l.status === "rejected" ? "bg-destructive/10" : "bg-warning/10"
                  }`}>
                    {l.status === "approved" ? <CheckCircle className="size-4 text-success" /> :
                     l.status === "rejected" ? <XCircle className="size-4 text-destructive" /> :
                     <Clock className="size-4 text-warning" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{l.boxer_profiles?.full_name ?? "Unknown"}</span>
                      <Badge tone={l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : "warning"}>
                        {l.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Leave for: <strong>{l.start_date ? new Date(l.start_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—"}{l.end_date && l.end_date !== l.start_date ? ` to ${new Date(l.end_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</strong>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Reason: {l.reason ?? "—"}</div>
                    {l.rejection_reason && (
                      <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="size-3 shrink-0" /> {l.rejection_reason}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Applied: {new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  {l.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleLeave(l.id, "approved")} disabled={processing === l.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-success text-white rounded-lg hover:bg-success/90 disabled:opacity-50 transition">
                        {processing === l.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                        Approve
                      </button>
                      <button onClick={() => {
                        const reason = window.prompt("Rejection reason (optional):");
                        handleLeave(l.id, "rejected", reason ?? undefined);
                      }} disabled={processing === l.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 rounded-lg hover:bg-destructive/20 disabled:opacity-50 transition">
                        <X className="size-3" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* POLL RESPONSES TAB */}
          {tab === "poll" && (
            <div>
              {!todayPollSent ? (
                <div className="bg-surface border border-border rounded-xl p-10 text-center">
                  <Bell className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-semibold">No poll sent today</p>
                  <p className="text-xs text-muted-foreground mt-1">Use the "Send attendance poll" button to notify boxers.</p>
                </div>
              ) : (
                <>
                  {/* Poll summary */}
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="bg-surface border border-border rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-success">{attendingCount}</div>
                      <div className="text-xs text-muted-foreground mt-1">Will Attend</div>
                    </div>
                    <div className="bg-surface border border-border rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-destructive">{notAttendingCount}</div>
                      <div className="text-xs text-muted-foreground mt-1">Can't Attend</div>
                    </div>
                    <div className="bg-surface border border-border rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-muted-foreground">{summaries.length - pollResponses.length}</div>
                      <div className="text-xs text-muted-foreground mt-1">No Response Yet</div>
                    </div>
                  </div>

                  <div className="bg-surface border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-elevated">
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="text-left font-medium px-5 py-3">Boxer</th>
                          <th className="text-left font-medium px-4 py-3">Response</th>
                          <th className="text-left font-medium px-4 py-3">Reason (if not attending)</th>
                          <th className="text-right font-medium px-5 py-3">Responded at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pollResponses.map(r => (
                          <tr key={r.id} className="border-t border-border hover:bg-subtle">
                            <td className="px-5 py-3.5 font-medium">{r.boxer_profiles?.full_name ?? "—"}</td>
                            <td className="px-4 py-3.5">
                              <Badge tone={r.status === "attending" ? "success" : "danger"}>
                                {r.status === "attending" ? "Attending ✓" : "Not Attending"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-muted-foreground">
                              {r.reason ?? (r.status === "not_attending" ? "No reason given" : "—")}
                            </td>
                            <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                              {r.responded_at ? new Date(r.responded_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                          </tr>
                        ))}
                        {pollResponses.length === 0 && (
                          <tr><td colSpan={4} className="text-center py-10 text-sm text-muted-foreground">
                            No responses yet. Boxers have been notified.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
