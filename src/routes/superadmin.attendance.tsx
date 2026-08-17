import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge, SectionCard } from "@/components/dashboard/DashboardLayout";
import {
  CalendarCheck, Users, CheckCircle, XCircle, Clock,
  Loader2, Bell, Search, MessageSquare, RefreshCw
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/superadmin/attendance")({ component: SAAttendance });

function SAAttendance() {
  const [polls, setPolls] = useState<any[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const hasAutoSelected = useRef(false);
  const [responses, setResponses] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [q, setQ] = useState("");

  const loadPolls = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("attendance_polls")
        .select("id, poll_date, title, message, created_at, sent_by, profiles(full_name)")
        .order("poll_date", { ascending: false })
        .limit(30);
      setPolls(data ?? []);

      // Auto-select the most recent poll on first load
      if (data && data.length > 0 && !hasAutoSelected.current) {
        hasAutoSelected.current = true;
        setSelectedPollId(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load polls and all athletes in parallel
    Promise.all([
      loadPolls(),
      supabase
        .from("boxer_profiles")
        .select("id, full_name")
        .eq("onboarding_complete", true)
        .order("full_name")
        .then(({ data }) => setAthletes(data ?? [])),
    ]);

    // Live updates for new responses
    const ch = supabase
      .channel("sa-attendance-polls")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_poll_responses" }, () => {
        if (selectedPollId) loadResponses(selectedPollId);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_polls" }, loadPolls)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (selectedPollId) loadResponses(selectedPollId);
  }, [selectedPollId]);

  async function loadResponses(pollId: string) {
    setLoadingResponses(true);
    const { data } = await supabase
      .from("attendance_poll_responses")
      .select("*, boxer_profiles!attendance_poll_responses_boxer_profile_id_fkey(full_name)")
      .eq("poll_id", pollId)
      .order("responded_at", { ascending: false });
    setResponses(data ?? []);
    setLoadingResponses(false);
  }

  const selectedPoll = polls.find(p => p.id === selectedPollId);
  const attendingCount = responses.filter(r => r.status === "attending").length;
  const notAttendingCount = responses.filter(r => r.status === "not_attending").length;
  const noResponseCount = athletes.length - responses.length;

  const filteredResponses = responses.filter(r =>
    !q || r.boxer_profiles?.full_name?.toLowerCase().includes(q.toLowerCase())
  );

  // Athletes who haven't responded yet
  const respondedIds = new Set(responses.map(r => r.boxer_profile_id));
  const noResponseAthletes = athletes.filter(a =>
    !respondedIds.has(a.id) &&
    (!q || a.full_name?.toLowerCase().includes(q.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <span className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Attendance Polls"
        subtitle="View athlete responses to daily attendance polls across all academies"
        actions={
          <button
            onClick={() => { loadPolls(); if (selectedPollId) loadResponses(selectedPollId); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-elevated transition"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        }
      />

      {/* Summary KPIs for selected poll */}
      {selectedPoll && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total athletes", value: athletes.length, icon: Users, cls: "text-muted-foreground" },
            { label: "Will attend", value: attendingCount, icon: CheckCircle, cls: "text-success" },
            { label: "Can't attend", value: notAttendingCount, icon: XCircle, cls: "text-destructive" },
            { label: "No response", value: Math.max(0, noResponseCount), icon: Clock, cls: "text-warning" },
          ].map(s => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`size-4 ${s.cls}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <div className={`text-2xl font-display font-bold ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[280px_1fr] gap-5">
        {/* Poll selector sidebar */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-border bg-elevated">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past polls</p>
          </div>
          {polls.length === 0 ? (
            <div className="p-6 text-center">
              <Bell className="size-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No polls sent yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Admins can send a poll from the Attendance page.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
              {polls.map(p => {
                const isSelected = p.id === selectedPollId;
                const dateLabel = new Date(p.poll_date + "T00:00:00").toLocaleDateString("en-IN", {
                  weekday: "short", day: "numeric", month: "short", year: "numeric"
                });
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPollId(p.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-subtle transition ${isSelected ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <CalendarCheck className={`size-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>{dateLabel}</span>
                    </div>
                    {p.profiles?.full_name && (
                      <p className="text-[11px] text-muted-foreground mt-1 pl-6">Sent by {p.profiles.full_name}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Responses panel */}
        <div className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-surface max-w-sm">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search athlete…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {!selectedPoll ? (
            <div className="bg-surface border border-border rounded-xl p-10 text-center">
              <CalendarCheck className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">Select a poll</p>
              <p className="text-xs text-muted-foreground mt-1">Choose a poll from the list to view responses.</p>
            </div>
          ) : loadingResponses ? (
            <div className="bg-surface border border-border rounded-xl p-10 flex justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Responses table */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-elevated flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Responses ({responses.length})
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-elevated/50">
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left font-medium px-5 py-3">Athlete</th>
                      <th className="text-left font-medium px-4 py-3">Status</th>
                      <th className="text-left font-medium px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="size-3" /> Reason (if not attending)
                        </span>
                      </th>
                      <th className="text-right font-medium px-5 py-3">Responded at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResponses.map(r => (
                      <tr key={r.id} className="border-t border-border hover:bg-subtle transition">
                        <td className="px-5 py-3.5 font-medium">{r.boxer_profiles?.full_name ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          <Badge tone={r.status === "attending" ? "success" : "danger"}>
                            {r.status === "attending" ? "Attending ✓" : "Not Attending"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground max-w-[240px]">
                          {r.status === "not_attending" ? (
                            r.reason ? (
                              <span className="text-foreground">{r.reason}</span>
                            ) : (
                              <span className="italic">No reason provided</span>
                            )
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-muted-foreground tabular">
                          {r.responded_at
                            ? `${new Date(r.responded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${new Date(r.responded_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {filteredResponses.length === 0 && noResponseAthletes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-10 text-sm text-muted-foreground">
                          No responses yet. Athletes have been notified.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* No-response athletes */}
              {noResponseAthletes.length > 0 && (
                <div className="bg-surface border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-elevated flex items-center gap-2">
                    <Clock className="size-3.5 text-warning" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      No response yet ({noResponseAthletes.length})
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {noResponseAthletes.map(a => (
                      <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{a.full_name}</span>
                        <Badge tone="warning">Pending</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
