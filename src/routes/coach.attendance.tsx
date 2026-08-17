import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { CalendarCheck as CalIcon, Users as UsersIcon, MapPin as MapPinIcon, Check as CheckIcon, X as XIcon, Loader2 as SpinnerIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/coach/attendance")({ component: CoachAttendance });

// ── Stub data — TODO: wire to attendance table + coach_ring_assignments
const TODAY = new Date().toISOString().split("T")[0];

interface SessionBoxer {
  id: string;
  name: string;
  attendanceStatus: "present" | "absent" | "not_marked";
  lateMinutes?: number;
  fitStatus: "fit" | "injured" | "suspended";
}

interface TodaySession {
  ringName: string;
  location: string;
  from: string;
  to: string;
  boxers: SessionBoxer[];
}

const STUB_SESSIONS: TodaySession[] = [
  {
    ringName: "Ring A",
    location: "Main Hall",
    from: "06:00",
    to: "08:00",
    boxers: [
      { id: "bx1", name: "Aisha Khan", attendanceStatus: "present", fitStatus: "fit" },
      { id: "bx2", name: "Priya Sharma", attendanceStatus: "not_marked", fitStatus: "injured" },
      { id: "bx3", name: "Sana Sheikh", attendanceStatus: "absent", fitStatus: "suspended" },
    ],
  },
];

function CoachAttendance() {
  const [sessions, setSessions] = useState(STUB_SESSIONS);
  const [saving, setSaving] = useState<string | null>(null);

  async function markAttendance(sessionIdx: number, boxerIdx: number, status: "present" | "absent") {
    const boxer = sessions[sessionIdx].boxers[boxerIdx];
    setSaving(boxer.id);
    // TODO: supabase.from("attendance").upsert(...)
    await new Promise(r => setTimeout(r, 500));
    setSessions(prev => {
      const next = [...prev];
      next[sessionIdx] = {
        ...next[sessionIdx],
        boxers: next[sessionIdx].boxers.map((b, i) => i === boxerIdx ? { ...b, attendanceStatus: status } : b),
      };
      return next;
    });
    setSaving(null);
    toast.success(`${boxer.name} marked ${status}`);
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Attendance"
        subtitle={`${new Date(TODAY).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`}
      />

      {sessions.length === 0 ? (
        <div className="bento-card p-12 text-center">
          <CalIcon className="size-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
          <div className="text-sm text-muted-foreground">No sessions assigned for today</div>
        </div>
      ) : (
        sessions.map((session, si) => {
          const presentCount = session.boxers.filter(b => b.attendanceStatus === "present").length;
          const totalActive = session.boxers.filter(b => b.fitStatus === "fit").length;

          return (
            <div key={si} className="bento-card overflow-hidden">
              {/* Session header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-elevated/30">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-primary/10 grid place-items-center">
                    <CalIcon className="size-4 text-primary-dark" strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="font-display font-bold">{session.ringName}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="flex items-center gap-1"><MapPinIcon className="size-3" />{session.location}</span>
                      <span>{session.from}–{session.to}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm">{presentCount}/{totalActive}</div>
                  <div className="text-xs text-muted-foreground">present / fit</div>
                </div>
              </div>

              {/* Boxer rows */}
              <div className="divide-y divide-border">
                {session.boxers.map((boxer, bi) => (
                  <div key={boxer.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="size-8 rounded-full bg-primary/10 grid place-items-center text-xs font-bold text-primary-dark shrink-0">
                      {boxer.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{boxer.name}</div>
                      {boxer.fitStatus !== "fit" && (
                        <div className={`text-xs mt-0.5 ${boxer.fitStatus === "suspended" ? "text-destructive" : "text-warning"}`}>
                          {boxer.fitStatus === "suspended" ? "⚠ Suspended" : "⚠ Injured"}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {boxer.attendanceStatus === "present" ? (
                        <span className="badge badge-success flex items-center gap-1"><CheckIcon className="size-2.5" />Present</span>
                      ) : boxer.attendanceStatus === "absent" ? (
                        <span className="badge badge-danger flex items-center gap-1"><XIcon className="size-2.5" />Absent</span>
                      ) : (
                        <span className="badge badge-neutral">Not marked</span>
                      )}
                      <button
                        onClick={() => markAttendance(si, bi, "present")}
                        disabled={saving === boxer.id || boxer.fitStatus === "suspended"}
                        className="size-8 rounded-lg border border-success/30 bg-success/8 text-success hover:bg-success hover:text-white transition grid place-items-center cursor-pointer disabled:opacity-40"
                        title="Mark Present"
                      >
                        {saving === boxer.id ? <SpinnerIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
                      </button>
                      <button
                        onClick={() => markAttendance(si, bi, "absent")}
                        disabled={saving === boxer.id}
                        className="size-8 rounded-lg border border-destructive/30 bg-destructive/8 text-destructive hover:bg-destructive hover:text-white transition grid place-items-center cursor-pointer disabled:opacity-40"
                        title="Mark Absent"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Save all row */}
              <div className="px-5 py-3 border-t border-border bg-elevated/20 flex justify-end">
                <button
                  onClick={() => toast.success("Attendance saved for " + session.ringName)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary-dark transition cursor-pointer"
                >
                  <CheckIcon className="size-3.5" /> Save Attendance
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
