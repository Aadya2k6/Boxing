import { AccessGuard } from "@/components/dashboard/AccessGuard";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { Calendar, MapPin, Clock, Loader2, Info, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/athlete/schedule")({ component: SchedulePage });

// ── Calendar Helpers ──────────────────────────────────────────────────
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Main Component ────────────────────────────────────────────────────
function SchedulePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [allSessionDates, setAllSessionDates] = useState<Set<string>>(new Set());
  const [cancelledDates, setCancelledDates] = useState<Set<string>>(new Set());
  const [attendanceLog, setAttendanceLog] = useState<any[]>([]);
  const [athleteProfile, setAthleteProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Month navigation state
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // Wait for auth then load athlete profile
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      loadInitialData();
    } else {
      setLoading(false);
    }
  }, [user?.id, authLoading]);

  // Refetch sessions whenever year changes (after profile is known)
  useEffect(() => {
    if (athleteProfile) {
      loadCalendarSessions(athleteProfile, currentYear);
    }
  }, [athleteProfile?.id, currentYear]);

  // Realtime: re-fetch when schedule templates or pitches change
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("athlete-schedule-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_schedule_templates" }, () => {
        if (athleteProfile) loadCalendarSessions(athleteProfile, currentYear);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_sessions" }, () => {
        if (athleteProfile) loadCalendarSessions(athleteProfile, currentYear);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {
        if (athleteProfile) loadCalendarSessions(athleteProfile, currentYear);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        if (athleteProfile) loadCalendarSessions(athleteProfile, currentYear);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, athleteProfile?.id, currentYear]);

  async function loadInitialData() {
    // Clear stale data first
    setSessions([]);
    setAllSessions([]);
    setAllSessionDates(new Set());
    setAttendanceLog([]);

    if (!user?.id) {
      setLoading(false);
      return;
    }

    const { data: ap } = await supabase
      .from("boxer_profiles")
      .select("id, user_id, academy_id, experience_level, primary_goal, full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ap) {
      setAthleteProfile(null);
      setLoading(false);
      return;
    }

    setAthleteProfile(ap);
    loadCalendarSessions(ap, currentYear);
  }

  async function loadCalendarSessions(ap: any, year: number) {
    if (!ap?.id) {
      setCalendarLoading(false);
      setLoading(false);
      return;
    }
    setCalendarLoading(true);

    const athleteProfileId: string = ap.id;
    const academyId: string | null = ap.academy_id ?? null;

    try {
      // Build queries — filter templates by the athlete's academy when known
      let templatesQuery = supabase
        .from("ring_schedule_templates")
        .select("*")
        .eq("is_active", true);
      if (academyId) {
        templatesQuery = templatesQuery.eq("academy_id", academyId);
      }

      const [
        { data: dbTemplates },
        { data: dbPitches },
        { data: att },
        { data: dbInstances },
      ] = await Promise.all([
        templatesQuery,
        supabase
          .from("ring_sessions")
          .select("*"),
        supabase
          .from("attendance")
          .select("session_date, status")
          .eq("boxer_profile_id", athleteProfileId)
          .order("session_date", { ascending: false }),
        supabase
          .from("ring_instances")
          .select("template_id, date, is_cancelled")
          .gte("date", `${year}-01-01`)
          .lte("date", `${year}-12-31`),
      ]);

      // Normalize attendance rows for mapping
      const normalizedAtt = (att ?? []).map((a: any) => ({
        date: a.session_date ?? a.date,
        status: a.status,
      }));

      // Build set of cancelled dates (where ALL templates for that academy are cancelled)
      const cancelledSet = new Set<string>();
      (dbInstances ?? []).forEach((inst: any) => {
        if (inst.is_cancelled) {
          const dateStr = String(inst.date).substring(0, 10);
          cancelledSet.add(dateStr);
        }
      });
      setCancelledDates(cancelledSet);

      const activeTemplates = dbTemplates ?? [];
      const combinedPitches = dbPitches ?? [];

      const generatedSessions: any[] = [];
      const dateSet = new Set<string>();

      const yearStart = new Date(`${year}-01-01T00:00:00`);
      const yearEnd   = new Date(`${year}-12-31T23:59:59`);

      // ── Expand each template into individual session occurrences ────
      // Only include sessions where this athlete's UUID is in the pitch arrays
      activeTemplates.forEach((tmpl: any) => {
        const rawDays: any[] = tmpl.days_of_week ?? [];
        const daysOfWeek: number[] = rawDays.map((d: any) => Number(d)).filter((n: number) => !isNaN(n));
        const rawFrom = tmpl.valid_from;
        const rawTo   = tmpl.valid_to;

        if (!rawFrom || !rawTo || daysOfWeek.length === 0) return;

        const myPitches = combinedPitches.filter((p: any) => {
          if (p.template_id !== tmpl.id) return false;
          const isAllAcademy = (!p.batsmen || p.batsmen.length === 0) && (!p.bowlers || p.bowlers.length === 0) && (!p.extras || p.extras.length === 0);
          const inBatsmen = Array.isArray(p.batsmen) && p.batsmen.includes(athleteProfileId);
          const inBowlers = Array.isArray(p.bowlers) && p.bowlers.includes(athleteProfileId);
          const inExtras  = Array.isArray(p.extras)  && p.extras.includes(athleteProfileId);
          return isAllAcademy || inBatsmen || inBowlers || inExtras;
        });

        if (myPitches.length === 0) return; // athlete not assigned in any pitch of this template

        const tStart = new Date(String(rawFrom).split("T")[0] + "T00:00:00");
        const tEnd   = new Date(String(rawTo).split("T")[0]   + "T23:59:59");

        if (isNaN(tStart.getTime()) || isNaN(tEnd.getTime())) return;

        const effectiveStart = tStart > yearStart ? tStart : yearStart;
        const effectiveEnd   = tEnd   < yearEnd   ? tEnd   : yearEnd;

        if (effectiveStart > effectiveEnd) return;

        const cur = new Date(effectiveStart);

        while (cur <= effectiveEnd) {
          if (cur.getFullYear() === year && daysOfWeek.includes(cur.getDay())) {
            const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
            dateSet.add(dateStr);

            myPitches.forEach((p: any) => {
              let role = "";
              if (Array.isArray(p.batsmen) && p.batsmen.includes(athleteProfileId)) role = "Batsman";
              else if (Array.isArray(p.bowlers) && p.bowlers.includes(athleteProfileId)) role = "Bowler";
              else if (Array.isArray(p.extras)  && p.extras.includes(athleteProfileId))  role = "Extra";

              const startTime = String(p.from_time ?? "").slice(0, 5);
              const endTime   = String(p.to_time   ?? "").slice(0, 5);
              const locName   = p.custom_location ?? "Academy Pitch";

              generatedSessions.push({
                id: `${tmpl.id}-${p.id}-${dateStr}`,
                template_id: tmpl.id,
                pitch_id: p.id,
                title: `${tmpl.name} (${p.name})`,
                session_name: tmpl.name,
                pitch_name: p.name,
                start_time: startTime,
                end_time: endTime,
                location: locName,
                role,
                focus: role ? `Role: ${role}` : "Practice Session",
                session_date: dateStr,
              });
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
      });



      const todayStr = new Date().toISOString().split("T")[0];
      // Filter out cancelled sessions
      const activeSessions = generatedSessions.filter((s: any) => !cancelledSet.has(s.session_date));
      const activeDateSet = new Set<string>(Array.from(dateSet).filter(d => !cancelledSet.has(d)));

      const upcomingList = activeSessions
        .filter((s: any) => s.session_date >= todayStr)
        .sort((a: any, b: any) => a.session_date.localeCompare(b.session_date))
        .slice(0, 10);

      setSessions(upcomingList);
      setAllSessions(activeSessions);
      setAllSessionDates(activeDateSet);
      setAttendanceLog(att ?? []);
    } catch (err) {
      console.error("loadCalendarSessions exception:", err);
    } finally {
      setCalendarLoading(false);
      setLoading(false);
    }
  }


  const presentDays = attendanceLog.filter(a => a.status === "present").length;
  const lastAttended = attendanceLog.find(a => a.status === "present")?.date;

  const thisMonthAttendance = attendanceLog.filter(a => {
    const d = new Date(a.date);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && a.status === "present";
  }).length;

  const handlePrevMonth = () => {
    setSelectedDay(null);
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    setSelectedDay(null);
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Resolve detail for selected day
  const selectedDateKey = selectedDay ? formatDateKey(currentYear, currentMonth, selectedDay) : null;
  const isCancelledDay = selectedDateKey ? cancelledDates.has(selectedDateKey) : false;
  const selectedDaySessions = selectedDay
    ? allSessions.filter(s => s.session_date === selectedDateKey)
    : [];

  if (loading) return (
    <div className="min-h-[60vh] grid place-items-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );

  // No athlete profile yet — onboarding not complete or coach not assigned
  if (!athleteProfile) return (
    <AccessGuard>
      <PageHeader title="Training schedule" subtitle="Your upcoming sessions, calendar overview & attendance summary" />
      <div className="min-h-[40vh] grid place-items-center">
        <div className="text-center max-w-sm">
          <Calendar className="size-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-display font-semibold text-base mb-2">No schedule yet</h3>
          <p className="text-sm text-muted-foreground">
            Your training schedule will appear here once your coach or admin assigns you to a practice session. Please complete onboarding if you haven't already.
          </p>
        </div>
      </div>
    </AccessGuard>
  );

  return (
    <AccessGuard>
      <PageHeader title="Training schedule" subtitle="Your upcoming sessions, calendar overview & attendance summary" />

      {/* ── Monthly Calendar Card ─────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6 animate-fade-up">
        {/* Calendar Header with Navigation */}
        <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-accent grid place-items-center">
              <Sparkles className="size-4 text-primary-dark" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-base">Monthly Schedule</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Navigate months to review your upcoming training sessions</p>
            </div>
          </div>

          {/* Month Navigator Controls */}
          <div className="flex items-center gap-1 bg-subtle/70 p-1 rounded-xl border border-border/80 self-start sm:self-auto shadow-xs">
            <button
              onClick={handlePrevMonth}
              className="size-8 rounded-lg hover:bg-elevated flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title="Previous Month"
            >
              <ChevronLeft className="size-4" />
            </button>

            <div className="flex items-center gap-1 px-1">
              <select
                value={currentMonth}
                onChange={(e) => {
                  setSelectedDay(null);
                  setCurrentMonth(Number(e.target.value));
                }}
                className="font-display font-bold text-sm bg-transparent border-0 outline-none cursor-pointer text-foreground py-0.5 px-1 rounded hover:bg-elevated transition appearance-none text-center"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx} className="bg-surface text-foreground font-sans text-sm">
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={currentYear}
                onChange={(e) => {
                  setSelectedDay(null);
                  setCurrentYear(Number(e.target.value));
                }}
                className="font-display font-bold text-sm bg-transparent border-0 outline-none cursor-pointer text-foreground py-0.5 px-1 rounded hover:bg-elevated transition appearance-none text-center"
              >
                {(() => {
                  const startYear = Math.min(1950, currentYear - 50);
                  const endYear = Math.max(2100, currentYear + 50);
                  const years = [];
                  for (let y = startYear; y <= endYear; y++) {
                    years.push(y);
                  }
                  return years.map((yr) => (
                    <option key={yr} value={yr} className="bg-surface text-foreground font-sans text-sm">
                      {yr}
                    </option>
                  ));
                })()}
              </select>
            </div>

            <button
              onClick={handleNextMonth}
              className="size-8 rounded-lg hover:bg-elevated flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title="Next Month"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Legend */}
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded" style={{ background: "linear-gradient(135deg, #8B5E3C, #A6724A)" }} />
              Class
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded border border-border" style={{ background: "#FDF8F0" }} />
              Regular
            </span>
          </div>
        </div>

        {/* Mobile Legend */}
        <div className="md:hidden px-5 pt-3 pb-1 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded" style={{ background: "#8B5E3C" }} />
            Class
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded border border-border" style={{ background: "#FDF8F0" }} />
            Regular
          </span>
        </div>

        {/* Main Grid View */}
        <div className="p-3 sm:p-4 grid md:grid-cols-12 gap-4 items-start">
          <div className="md:col-span-8 bg-subtle/30 rounded-xl p-3 border border-border/50 relative">
            {calendarLoading && (
              <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] grid place-items-center rounded-xl z-10">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            )}
            <MonthCard
              year={currentYear}
              month={currentMonth}
              monthName={MONTH_NAMES[currentMonth]}
              sessionDates={allSessionDates}
              cancelledDates={cancelledDates}
              todayKey={todayKey}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </div>

          {/* Interactive Date details */}
          <div className="md:col-span-4 space-y-3">
            <div className="bg-subtle/20 border border-border/80 rounded-xl p-3.5 sm:p-4">
              <div className="label-micro mb-2">Day details</div>
              {selectedDay ? (
                <div>
                  <h3 className="font-display font-bold text-base text-foreground">
                    {selectedDay} {MONTH_NAMES[currentMonth]} {currentYear}
                  </h3>

                  {isCancelledDay && (
                    <div className="mt-3 p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 flex items-start gap-2">
                      <span className="size-2 rounded-full bg-destructive mt-1 shrink-0" />
                      <div>
                        <div className="text-[11px] font-semibold text-destructive">Class Cancelled</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Your class for today has been cancelled by the admin.</div>
                      </div>
                    </div>
                  )}

                  {selectedDaySessions.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-[11px] font-semibold text-accent-foreground">Scheduled Classes</div>
                      {selectedDaySessions.map((s, idx) => (
                        <div key={s.id ?? idx} className="p-3 rounded-lg border border-primary/20 bg-accent/30 hover:bg-accent/40 transition">
                          <div className="text-xs font-bold text-foreground">{s.title ?? "Practice Session"}</div>
                          <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                            {s.start_time && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="size-3" />
                                <span>{s.start_time} {s.end_time ? ` - ${s.end_time}` : ""}</span>
                              </div>
                            )}
                            {s.location && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="size-3" />
                                <span className="truncate">{s.location}</span>
                              </div>
                            )}
                            {s.coach && (
                              <div className="text-[10px]">
                                Coach: <span className="font-medium text-foreground">{s.coach}</span>
                              </div>
                            )}
                          </div>
                          {s.focus && (
                            <div className="mt-2">
                              <Badge tone="gold">{s.focus}</Badge>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!isCancelledDay && selectedDaySessions.length === 0 && (
                    <div className="mt-3 p-3 rounded-lg border border-border bg-surface/50 text-center">
                      <p className="text-xs text-muted-foreground">
                        Regular day. No classes scheduled.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Click any day on the calendar to view details.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Upcoming Sessions list */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden animate-fade-up delay-100">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold">Upcoming sessions</h2>
            <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
          </div>

          {sessions.length === 0 ? (
            <div className="py-12 px-5 text-center">
              <div className="size-12 rounded-2xl bg-info/10 grid place-items-center mx-auto mb-3">
                <Info className="size-5 text-info" />
              </div>
              <p className="text-sm font-semibold">No sessions scheduled</p>
              <p className="text-xs text-muted-foreground mt-1">Your admin/coach will post upcoming sessions here. Check back soon.</p>
            </div>
          ) : (
            <ul>
              {sessions.map((s, i) => (
                <li key={s.id ?? i} className="flex items-center gap-4 px-5 py-4 border-t first:border-0 border-border hover:bg-subtle transition">
                  <div className="size-10 rounded-xl bg-accent grid place-items-center text-primary-dark shrink-0">
                    <Calendar className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.title ?? "Training session"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(s.session_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                        {s.start_time && ` · ${s.start_time}`}
                      </span>
                      {s.location && (
                        <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{s.location}</span>
                      )}
                      {s.coach && <span>· {s.coach}</span>}
                    </div>
                  </div>
                  {s.focus && <Badge tone="gold">{s.focus}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stats sidebar */}
        <div className="space-y-3 animate-fade-up delay-200">
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="label-micro mb-3">This month</div>
            <div className="text-stat tabular font-display">
              {thisMonthAttendance}
              <span className="text-base text-muted-foreground ml-1">sessions attended</span>
            </div>
            {thisMonthAttendance > 0 && (
              <div className="mt-4 h-2 rounded-full bg-subtle overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary-dark to-primary rounded-full transition-all" style={{ width: `${Math.min(100, (thisMonthAttendance / 26) * 100)}%` }} />
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Last attended</div>
                <div className="font-medium mt-1">
                  {lastAttended ? new Date(lastAttended).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total (30d)</div>
                <div className="font-medium mt-1">{presentDays} sessions</div>
              </div>
            </div>
          </div>

          {/* Recent attendance */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="label-micro mb-3">Recent attendance</div>
            <div className="flex flex-wrap gap-1.5">
              {attendanceLog.slice(0, 14).map(a => (
                <div key={a.date} title={new Date(a.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                  className={`size-7 rounded-md grid place-items-center text-[10px] font-medium ${a.status === "present" ? "bg-success/15 text-success" :
                      a.status === "leave" ? "bg-info/15 text-info" :
                        "bg-subtle text-muted-foreground"
                    }`}>
                  {new Date(a.date).getDate()}
                </div>
              ))}
              {attendanceLog.length === 0 && <p className="text-xs text-muted-foreground">No records yet.</p>}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-success/50" />Present</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-info/50" />Leave</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-subtle" />Absent</span>
            </div>
          </div>


        </div>
      </div>
    </AccessGuard>
  );
}

// ── Month Card Component ──────────────────────────────────────────────
function MonthCard({
  year,
  month,
  monthName,
  sessionDates,
  cancelledDates,
  todayKey,
  selectedDay,
  onSelectDay,
}: {
  year: number;
  month: number;
  monthName: string;
  sessionDates: Set<string>;
  cancelledDates: Set<string>;
  todayKey: string;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;

  const cells: { day: number; type: "holiday" | "class" | "regular" | "empty"; tooltip?: string }[] = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: 0, type: "empty" });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = formatDateKey(year, month, d);
    const isClass = sessionDates.has(dateKey);
    const isCancelled = cancelledDates.has(dateKey);

    if (isCancelled) {
      cells.push({ day: d, type: "holiday", tooltip: "Class cancelled" });
    } else if (isClass) {
      cells.push({ day: d, type: "class", tooltip: "Scheduled class" });
    } else {
      cells.push({ day: d, type: "regular" });
    }
  }

  return (
    <div className="w-full">
      {/* Month card body */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5 text-center">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-[11px] font-bold text-muted-foreground/80 py-1 select-none uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((cell, idx) => {
          if (cell.type === "empty") {
            return <div key={idx} className="h-8 sm:h-9 md:h-10" />;
          }

          const dateKey = formatDateKey(year, month, cell.day);
          const isToday = dateKey === todayKey;
          const isSelected = selectedDay === cell.day;

          let bgStyle: React.CSSProperties = {};
          let textClass = "text-foreground/80";
          const borderClass = "border border-border/40";

          if (cell.type === "holiday") {
            // Reused for cancelled days — show muted red
            bgStyle = { background: "linear-gradient(135deg, #991b1b, #dc2626)" };
            textClass = "text-white font-semibold";
          } else if (cell.type === "class") {
            bgStyle = { background: "linear-gradient(135deg, #8B5E3C, #A6724A)" };
            textClass = "text-white font-semibold";
          } else {
            bgStyle = { background: "#FDF8F0" };
            textClass = "text-foreground/70";
          }

          let extraClass = "hover:scale-105 hover:shadow-xs";
          if (isToday) {
            extraClass += " ring-2 ring-primary ring-offset-1 ring-offset-background z-10";
          }
          if (isSelected) {
            extraClass += " ring-2 ring-foreground scale-105 shadow-sm z-10";
          }

          return (
            <button
              key={idx}
              onClick={() => onSelectDay(cell.day)}
              title={cell.tooltip ? `${cell.day} — ${cell.tooltip}` : String(cell.day)}
              className={`h-8 sm:h-9 md:h-10 rounded-lg flex items-center justify-center text-xs sm:text-sm font-semibold cursor-pointer transition-all duration-150 ${textClass} ${borderClass} ${extraClass}`}
              style={bgStyle}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
