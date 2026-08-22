import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { CalendarCheck as CalIcon, Users as UsersIcon, MapPin as MapPinIcon, Check as CheckIcon, X as XIcon, Loader2 as SpinnerIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

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



function CoachAttendance() {
  const { profile, user } = useAuth();
  const [sessions, setSessions] = useState<TodaySession[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!profile?.academy_id) return;
      setLoading(true);
      try {
        const todayDate = TODAY;
        
        const [templatesRes, sessionsRes, instancesRes, overridesRes, boxersRes, attendanceRes] = await Promise.all([
          supabase.from("ring_schedule_templates").select("id, name").eq("academy_id", profile.academy_id),
          supabase.from("ring_sessions").select("*"),
          supabase.from("ring_instances").select("*").eq("date", todayDate).eq("is_cancelled", false),
          supabase.from("ring_instance_overrides").select("*"),
          supabase.from("boxer_profiles").select("id, full_name, is_suspended, academy_id").eq("academy_id", profile.academy_id),
          supabase.from("attendance").select("*") // Filtered by date inside
        ]);

        const templates = templatesRes.data || [];
        const templateIds = templates.map((t: any) => t.id);
        const dbSessions = (sessionsRes.data || []).filter((s: any) => templateIds.includes(s.template_id));
        const instances = instancesRes.data || [];
        const overrides = overridesRes.data || [];
        const boxers = boxersRes.data || [];
        
        // Filter attendance for today (session_date might be timestamp)
        const todaysAtt = (attendanceRes.data || []).filter((a: any) => a.session_date && String(a.session_date).substring(0, 10) === todayDate);
        
        const boxerMap = new Map(boxers.map((b: any) => [b.id, b]));

        const builtSessions: TodaySession[] = [];
        for (const session of dbSessions) {
          const inst = instances.find((i: any) => i.template_id === session.template_id);
          if (!inst) continue; // Not scheduled for today
          
          const over = overrides.find((o: any) => o.ring_instance_id === inst.id && o.ring_session_id === session.id);
          
          // assigned_boxer_ids might be stored as json/string arrays
          let assignedIds: string[] = [];
          try {
             if (over?.assigned_boxer_ids) {
                assignedIds = typeof over.assigned_boxer_ids === 'string' ? JSON.parse(over.assigned_boxer_ids) : over.assigned_boxer_ids;
             } else if (session.assignedBoxerIds || session.assigned_boxer_ids) {
                const ids = session.assignedBoxerIds || session.assigned_boxer_ids;
                assignedIds = typeof ids === 'string' ? JSON.parse(ids) : ids;
             } else {
                // If no specific assignments, just show all academy boxers for fallback
                assignedIds = boxers.map((b: any) => b.id);
             }
          } catch(e) {
             assignedIds = boxers.map((b: any) => b.id);
          }

          const sessionBoxers: SessionBoxer[] = assignedIds.map(id => {
            const b = boxerMap.get(id);
            if (!b) return null;
            
            const att = todaysAtt.find((a: any) => a.boxer_profile_id === b.id);
            const attStatus = att?.status ? (String(att.status).toLowerCase() === "present" || String(att.status).toLowerCase() === "attending" ? "present" : "absent") : "not_marked";

            return {
              id: b.id,
              name: b.full_name || "Unknown Boxer",
              attendanceStatus: attStatus as "present" | "absent" | "not_marked",
              fitStatus: b.is_suspended ? "suspended" : "fit"
            };
          }).filter(Boolean) as SessionBoxer[];

          builtSessions.push({
            ringName: session.name || "Ring",
            location: over?.location || session.custom_location || templates.find((t: any) => t.id === session.template_id)?.name || "Main Venue",
            from: session.from_time || "00:00",
            to: session.to_time || "00:00",
            boxers: sessionBoxers,
          });
        }
        
        setSessions(builtSessions);
      } catch (err: any) {
        toast.error("Failed to load attendance data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [profile?.academy_id]);

  async function markAttendance(sessionIdx: number, boxerIdx: number, status: "present" | "absent") {
    const boxer = sessions[sessionIdx].boxers[boxerIdx];
    setSaving(boxer.id);
    
    try {
      // Check if existing record
      const { data: existing } = await supabase.from("attendance")
        .select("id")
        .eq("boxer_profile_id", boxer.id)
        .like("session_date", `${TODAY}%`)
        .single();
        
      if (existing) {
        await supabase.from("attendance").update({ status }).eq("id", existing.id);
      } else {
        await supabase.from("attendance").insert({
           boxer_profile_id: boxer.id,
           session_date: TODAY,
           status: status,
           marked_by: user?.id
        });
      }
      
      setSessions(prev => {
        const next = [...prev];
        next[sessionIdx] = {
          ...next[sessionIdx],
          boxers: next[sessionIdx].boxers.map((b, i) => i === boxerIdx ? { ...b, attendanceStatus: status } : b),
        };
        return next;
      });
      toast.success(`${boxer.name} marked ${status}`);
    } catch(err: any) {
      toast.error(`Failed to mark attendance: ${err.message}`);
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <SpinnerIcon className="size-8 animate-spin mb-4 text-primary" />
        <p>Loading sessions...</p>
      </div>
    );
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
