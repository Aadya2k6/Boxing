import { AccessGuard } from "@/components/dashboard/AccessGuard";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  MapPin, CalendarCheck, Send, Loader2, Check, X,
  AlertCircle, Navigation, CalendarX, ClipboardList
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/athlete/attendance")({ component: AttendancePage });

// Haversine distance in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function AttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"attendance" | "leave">("attendance");
  const [athleteProfile, setAthleteProfile] = useState<any | null>(null);
  const [academy, setAcademy] = useState<any | null>(null);
  const [attendanceLog, setAttendanceLog] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Geo attendance
  const [marking, setMarking] = useState(false);
  const [geoResult, setGeoResult] = useState<{ ok: boolean; message: string; distance?: number } | null>(null);
  const todayStr = new Date().toISOString().split("T")[0];
  const alreadyMarked = attendanceLog.some(a => a.date === todayStr && a.status === "present");

  // Leave form
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user) loadData();
    else setLoading(false);
  }, [user?.id, authLoading]);

  const [todaySchedule, setTodaySchedule] = useState<{
    found: boolean;
    locationName?: string;
    fromTime?: string;
    toTime?: string;
    latitude?: number;
    longitude?: number;
    isCancelled?: boolean;
    hasAssignmentToday?: boolean;
  } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      // Get athlete profile + assigned academy
      const { data: ap } = await supabase
        .from("athlete_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      setAthleteProfile(ap);

      // Fetch academy separately if athlete has one assigned
      let acData = null;
      if (ap?.academy_id) {
        const { data: ac } = await supabase.from("academies").select("*").eq("id", ap.academy_id).maybeSingle();
        acData = ac;
      }
      setAcademy(acData);

      if (ap?.id) {
        const [{ data: attData }, { data: lvData }] = await Promise.all([
          supabase.from("attendance").select("*").eq("athlete_profile_id", ap.id).order("date", { ascending: false }).limit(30),
          supabase.from("leave_applications").select("*").eq("athlete_profile_id", ap.id).order("created_at", { ascending: false }),
        ]);
        setAttendanceLog(attData ?? []);
        setLeaves(lvData ?? []);

        if (acData) {
          await fetchTodaySchedule(ap, acData);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchTodaySchedule(ap: any, ac: any) {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const todayDayOfWeek = today.getDay(); 

      const { data: templates } = await supabase
        .from("class_schedule_templates")
        .select("*")
        .eq("is_active", true)
        .eq("academy_id", ac.id)
        .lte("valid_from", todayStr)
        .gte("valid_to", todayStr);

      const todayTemplates = (templates || []).filter((t: any) => {
        const days = Array.isArray(t.days_of_week) ? t.days_of_week.map(Number) : [];
        return days.includes(todayDayOfWeek);
      });

      if (todayTemplates.length === 0) {
        setTodaySchedule({ found: false });
        return;
      }

      const templateIds = todayTemplates.map((t: any) => t.id);

      const { data: instances } = await supabase
        .from("class_schedule_instances")
        .select("*")
        .in("template_id", templateIds)
        .eq("date", todayStr);

      const cancelledTemplateIds = new Set((instances || []).filter((i: any) => i.is_cancelled).map((i: any) => i.template_id));
      const instanceIds = (instances || []).map((i: any) => i.id);

      const { data: pitches } = await supabase
        .from("class_schedule_pitches")
        .select("*")
        .in("template_id", templateIds);

      let overrides: any[] = [];
      if (instanceIds.length > 0) {
        const { data: overData } = await supabase
          .from("class_instance_pitch_overrides")
          .select("*")
          .in("instance_id", instanceIds);
        overrides = overData || [];
      }

      let matchedPitch: any = null;
      let matchedOverride: any = null;
      let hasAssignmentToday = false;
      let isCancelled = false;

      for (const pitch of (pitches || [])) {
        const inst = (instances || []).find((i: any) => i.template_id === pitch.template_id);
        const over = inst ? overrides.find((o: any) => o.instance_id === inst.id && o.pitch_id === pitch.id) : null;

        const batsmen = over?.batsmen ? over.batsmen : pitch.batsmen;
        const bowlers = over?.bowlers ? over.bowlers : pitch.bowlers;
        const extras = over?.extras ? over.extras : pitch.extras;

        const isAllAcademy = (!batsmen || batsmen.length === 0) && (!bowlers || bowlers.length === 0) && (!extras || extras.length === 0);
        const isAssigned =
          isAllAcademy ||
          (Array.isArray(batsmen) && batsmen.includes(ap.id)) ||
          (Array.isArray(bowlers) && bowlers.includes(ap.id)) ||
          (Array.isArray(extras) && extras.includes(ap.id));

        if (isAssigned) {
          hasAssignmentToday = true;
          if (cancelledTemplateIds.has(pitch.template_id)) {
            isCancelled = true;
            continue; 
          }
          matchedPitch = pitch;
          matchedOverride = over;
          break;
        }
      }

      if (!hasAssignmentToday) {
        setTodaySchedule({ found: false, hasAssignmentToday: false });
        return;
      }

      if (!matchedPitch) {
        setTodaySchedule({ found: true, hasAssignmentToday: true, isCancelled: true });
        return;
      }

      const fromTime = (matchedOverride?.from_time ?? matchedPitch.from_time)?.substring(0, 5);
      const toTime = (matchedOverride?.to_time ?? matchedPitch.to_time)?.substring(0, 5);
      
      let targetLat = ac.latitude;
      let targetLng = ac.longitude;
      let locName = matchedOverride?.custom_location ?? matchedPitch.custom_location ?? matchedPitch.name ?? ac.name ?? "Academy location";

      if (matchedOverride?.custom_lat != null && matchedOverride?.custom_lng != null) {
        targetLat = Number(matchedOverride.custom_lat);
        targetLng = Number(matchedOverride.custom_lng);
      } else if (matchedPitch?.latitude != null && matchedPitch?.longitude != null) {
        targetLat = Number(matchedPitch.latitude);
        targetLng = Number(matchedPitch.longitude);
      }

      setTodaySchedule({
        found: true,
        hasAssignmentToday: true,
        isCancelled: false,
        locationName: locName,
        fromTime,
        toTime,
        latitude: targetLat,
        longitude: targetLng
      });
    } catch (err) {
      console.error(err);
      setTodaySchedule({ found: false });
    }
  }

  async function handleMarkAttendance() {
    if (!athleteProfile || !academy) return;
    setMarking(true);
    setGeoResult(null);

    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const todayDayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
      const currentTimeStr = today.toTimeString().substring(0, 5); // "HH:mm"

      // 1. Fetch active templates for the academy or tournaments
      const { data: templates } = await supabase
        .from("class_schedule_templates")
        .select("*")
        .eq("is_active", true)
        .eq("academy_id", academy.id)
        .lte("valid_from", todayStr)
        .gte("valid_to", todayStr);

      const todayTemplates = (templates || []).filter((t: any) => {
        const days = Array.isArray(t.days_of_week) ? t.days_of_week.map(Number) : [];
        return days.includes(todayDayOfWeek);
      });

      if (todayTemplates.length === 0) {
        setGeoResult({ ok: false, message: "You have no classes scheduled for today." });
        setMarking(false);
        return;
      }

      const templateIds = todayTemplates.map((t: any) => t.id);

      // 2. Fetch instances for today
      const { data: instances } = await supabase
        .from("class_schedule_instances")
        .select("*")
        .in("template_id", templateIds)
        .eq("date", todayStr);

      const cancelledTemplateIds = new Set((instances || []).filter((i: any) => i.is_cancelled).map((i: any) => i.template_id));
      const instanceIds = (instances || []).map((i: any) => i.id);

      // 3. Fetch pitches
      const { data: pitches } = await supabase
        .from("class_schedule_pitches")
        .select("*")
        .in("template_id", templateIds);

      // 4. Fetch overrides
      let overrides: any[] = [];
      if (instanceIds.length > 0) {
        const { data: overData } = await supabase
          .from("class_instance_pitch_overrides")
          .select("*")
          .in("instance_id", instanceIds);
        overrides = overData || [];
      }

      // 5. Find if athlete is assigned to any valid pitch *right now*
      let matchedPitch: any = null;
      let matchedOverride: any = null;
      let hasAssignmentToday = false;

      for (const pitch of (pitches || [])) {
        if (cancelledTemplateIds.has(pitch.template_id)) continue;

        const inst = (instances || []).find((i: any) => i.template_id === pitch.template_id);
        const over = inst ? overrides.find((o: any) => o.instance_id === inst.id && o.pitch_id === pitch.id) : null;

        const batsmen = over?.batsmen ? over.batsmen : pitch.batsmen;
        const bowlers = over?.bowlers ? over.bowlers : pitch.bowlers;
        const extras = over?.extras ? over.extras : pitch.extras;

        const isAllAcademy = (!batsmen || batsmen.length === 0) && (!bowlers || bowlers.length === 0) && (!extras || extras.length === 0);
        const isAssigned =
          isAllAcademy ||
          (Array.isArray(batsmen) && batsmen.includes(athleteProfile.id)) ||
          (Array.isArray(bowlers) && bowlers.includes(athleteProfile.id)) ||
          (Array.isArray(extras) && extras.includes(athleteProfile.id));

        if (isAssigned) {
          hasAssignmentToday = true;
          const fromTime = (over?.from_time ?? pitch.from_time)?.substring(0, 5);
          const toTime = (over?.to_time ?? pitch.to_time)?.substring(0, 5);

          if (fromTime && toTime && currentTimeStr >= fromTime && currentTimeStr <= toTime) {
            matchedPitch = pitch;
            matchedOverride = over;
            break; // Found the active one
          } else {
            // Keep looking, but store the last found assignment to show time window error
            matchedPitch = pitch;
            matchedOverride = over;
          }
        }
      }

      if (!hasAssignmentToday) {
        setGeoResult({ ok: false, message: "You are not assigned to any active class today." });
        setMarking(false);
        return;
      }

      if (!matchedPitch) {
        setGeoResult({ ok: false, message: "Class is cancelled for today." });
        setMarking(false);
        return;
      }

      const fromTime = (matchedOverride?.from_time ?? matchedPitch.from_time)?.substring(0, 5) || "00:00";
      const toTime = (matchedOverride?.to_time ?? matchedPitch.to_time)?.substring(0, 5) || "23:59";
      
      const nowDt = new Date();
      const [sH, sM] = fromTime.split(":").map(Number);
      const [eH, eM] = toTime.split(":").map(Number);
      const startWin = new Date(nowDt); startWin.setHours(sH, sM, 0, 0);
      const endWin = new Date(nowDt); endWin.setHours(eH, eM, 59, 999);
      const thirtyMinsBefore = new Date(startWin.getTime() - 30 * 60000);

      if (nowDt < thirtyMinsBefore || nowDt > endWin) {
        setGeoResult({ ok: false, message: `Your class is scheduled from ${fromTime} to ${toTime}. Check-in opens 30 minutes before start time.` });
        setMarking(false);
        return;
      }

      // 6. Determine target coordinates
      let targetLat = academy.latitude;
      let targetLng = academy.longitude;
      
      if (matchedOverride?.custom_lat != null && matchedOverride?.custom_lng != null) {
        targetLat = Number(matchedOverride.custom_lat);
        targetLng = Number(matchedOverride.custom_lng);
      } else if (matchedPitch?.latitude != null && matchedPitch?.longitude != null) {
        targetLat = Number(matchedPitch.latitude);
        targetLng = Number(matchedPitch.longitude);
      }

      if (targetLat == null || targetLng == null) {
        setGeoResult({ ok: false, message: "Target location coordinates are not set. Cannot verify attendance." });
        setMarking(false);
        return;
      }

      if (!navigator.geolocation) {
        setGeoResult({ ok: false, message: "Geolocation is not supported by your browser." });
        setMarking(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          const distance = Math.round(haversineMeters(lat, lon, targetLat, targetLng));
          const radius = academy.radius_meters ?? 200;

          if (distance > radius) {
            setGeoResult({ ok: false, message: `You are ${distance}m away from the assigned location (max ${radius}m).`, distance });
            setMarking(false);
            return;
          }

          // Check if attendance is already recorded today to update or insert cleanly
          const { data: existingRecord } = await supabase
            .from("attendance")
            .select("id")
            .eq("athlete_profile_id", athleteProfile.id)
            .eq("date", todayStr)
            .maybeSingle();

          let error: any = null;
          if (existingRecord?.id) {
            const { error: updateErr } = await supabase
              .from("attendance")
              .update({
                academy_id: academy.id,
                check_in_time: new Date().toISOString(),
                latitude: lat,
                longitude: lon,
                distance_meters: distance,
                status: "present",
              })
              .eq("id", existingRecord.id);
            error = updateErr;
          } else {
            const { error: insertErr } = await supabase
              .from("attendance")
              .insert({
                athlete_profile_id: athleteProfile.id,
                academy_id: academy.id,
                date: todayStr,
                check_in_time: new Date().toISOString(),
                latitude: lat,
                longitude: lon,
                distance_meters: distance,
                status: "present",
              });
            error = insertErr;
          }

          if (error) {
            setGeoResult({ ok: false, message: error.message });
          } else {
            setGeoResult({ ok: true, message: `Attendance marked! You are ${distance}m from the assigned location.`, distance });
            loadData();
          }
          setMarking(false);
        },
        (err) => {
          setGeoResult({ ok: false, message: `Location access denied: ${err.message}` });
          setMarking(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } catch (err: any) {
      setGeoResult({ ok: false, message: `Error checking schedule: ${err.message}` });
      setMarking(false);
    }
  }

  async function handleLeaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!athleteProfile) return;
    setSubmittingLeave(true);
    setLeaveError(null);
    try {
      // Must be at least tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (new Date(leaveDate) < tomorrow) {
        setLeaveError("Leave must be applied at least 1 day in advance.");
        return;
      }

      // Check if application for this date already exists
      const { data: existing } = await supabase
        .from("leave_applications")
        .select("id")
        .eq("athlete_profile_id", athleteProfile.id)
        .eq("leave_date", leaveDate)
        .maybeSingle();

      if (existing) {
        setLeaveError("You have already applied for leave on this date.");
        return;
      }

      const { data: newLeave, error } = await supabase
        .from("leave_applications")
        .insert({
          athlete_profile_id: athleteProfile.id,
          leave_date: leaveDate,
          reason: leaveReason,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      // Fetch superadmins
      const { data: superadmins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "superadmin");

      if (superadmins && superadmins.length > 0) {
        const notificationInserts = superadmins.map(sa => ({
          recipient_id: sa.id,
          type: "leave_application",
          title: "New Leave Application",
          body: `${athleteProfile.full_name || "An athlete"} has requested leave for ${new Date(leaveDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Reason: ${leaveReason}`,
          related_entity_id: newLeave.id,
          related_entity_type: "leave_application",
        }));

        await supabase.from("notifications").insert(notificationInserts);
      }

      setLeaveDate("");
      setLeaveReason("");
      loadData();
    } catch (err: any) {
      setLeaveError(err.message);
    } finally {
      setSubmittingLeave(false);
    }
  }

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  // Calendar stats
  const presentDays = attendanceLog.filter(a => a.status === "present").length;
  const leaveDays = leaves.filter(l => l.status === "approved").length;

  if (loading) return (
    <div className="min-h-[60vh] grid place-items-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <AccessGuard>
      <PageHeader title="Attendance" subtitle="Mark your daily attendance and manage leave applications" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Present (last 30d)", value: presentDays, color: "text-success" },
          { label: "Approved leaves", value: leaveDays, color: "text-info" },
          { label: "Pending leaves", value: leaves.filter(l => l.status === "pending").length, color: "text-warning" },
        ].map(s => (
          <div key={s.label} className="bento-card p-5 text-center">
            <div className={`text-3xl font-display font-bold ${s.color}`}>{s.value}</div>
            <div className="label-micro mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 bg-elevated rounded-xl w-fit mb-6">
        {(["attendance", "leave"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition capitalize ${tab === t ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "attendance" ? "Mark attendance" : "Leave applications"}
          </button>
        ))}
      </div>

      {/* ATTENDANCE TAB */}
      {tab === "attendance" && (
        <div className="space-y-6">
          {/* Mark attendance card */}
          <div className="bento-card p-6">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                <Navigation className="size-5 text-primary-dark" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Today's attendance</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                {todaySchedule?.found && todaySchedule.hasAssignmentToday && !todaySchedule.isCancelled ? (
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <MapPin className="size-3" /> {todaySchedule.locationName} ({todaySchedule.fromTime} - {todaySchedule.toTime}) · {academy?.radius_meters ?? 200}m radius
                  </div>
                ) : todaySchedule?.isCancelled ? (
                  <div className="text-xs text-warning mt-2 flex items-center gap-1">
                    <AlertCircle className="size-3" /> Class Cancelled Today
                  </div>
                ) : todaySchedule?.found === false || todaySchedule?.hasAssignmentToday === false ? (
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    No active classes scheduled for today.
                  </div>
                ) : academy ? (
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <MapPin className="size-3" /> {academy.name} · {academy.radius_meters ?? 200}m radius
                  </div>
                ) : (
                  <div className="text-xs text-warning mt-2">No academy assigned — contact your admin.</div>
                )}
              </div>
              {alreadyMarked ? (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-success/10 border border-success/30 rounded-xl">
                  <Check className="size-4 text-success" />
                  <span className="text-sm font-semibold text-success">Present ✓</span>
                </div>
              ) : (
                <button
                  onClick={handleMarkAttendance}
                  disabled={marking || !academy?.latitude}
                  className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card"
                >
                  {marking ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
                  {marking ? "Locating…" : "Mark attendance"}
                </button>
              )}
            </div>

            {/* Geo result */}
            {geoResult && (
              <div className={`mt-4 flex items-start gap-3 p-3.5 rounded-xl border ${
                geoResult.ok ? "bg-success/8 border-success/25" : "bg-destructive/8 border-destructive/25"
              }`}>
                {geoResult.ok ? <Check className="size-4 text-success shrink-0 mt-0.5" /> : <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />}
                <p className="text-sm">{geoResult.message}</p>
              </div>
            )}

            {!academy?.latitude && academy && (
              <div className="mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-warning/6 border border-warning/20">
                <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
                <p className="text-sm text-warning">Your academy's geo-location has not been configured yet. Please ask your admin to set it up.</p>
              </div>
            )}
          </div>

          {/* Attendance log */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-sm">Attendance log (last 30 days)</h3>
            </div>
            {attendanceLog.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No attendance records yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-elevated">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium px-5 py-3">Date</th>
                    <th className="text-left font-medium py-3">Status</th>
                    <th className="text-left font-medium py-3">Check-in time</th>
                    <th className="text-left font-medium py-3">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLog.map(a => (
                    <tr key={a.id} className="border-t border-border hover:bg-subtle transition">
                      <td className="px-5 py-3 tabular">
                        {new Date(a.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      </td>
                      <td className="py-3">
                        <Badge tone={a.status === "present" ? "success" : a.status === "leave" ? "info" : "danger"}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground tabular">
                        {a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="py-3 text-muted-foreground tabular">
                        {a.distance_meters != null ? `${a.distance_meters}m` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* LEAVE TAB */}
      {tab === "leave" && (
        <div className="space-y-6">
          {/* Apply form */}
          <div className="bento-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 rounded-xl bg-info/10 grid place-items-center">
                <CalendarX className="size-4 text-info" />
              </div>
              <div>
                <h3 className="font-semibold">Apply for leave</h3>
                <p className="text-xs text-muted-foreground">Minimum 1 day advance notice required</p>
              </div>
            </div>
            <form onSubmit={handleLeaveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Leave date *</label>
                <input required type="date" min={tomorrowStr} value={leaveDate} onChange={e => setLeaveDate(e.target.value)} className="input-premium" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Reason *</label>
                <textarea required rows={3} value={leaveReason} onChange={e => setLeaveReason(e.target.value)} className="input-premium resize-none" placeholder="Please describe your reason for leave" />
              </div>
              {leaveError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/8 border border-destructive/20">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{leaveError}</p>
                </div>
              )}
              <button type="submit" disabled={submittingLeave}
                className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card">
                {submittingLeave ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {submittingLeave ? "Submitting…" : "Submit leave application"}
              </button>
            </form>
          </div>

          {/* Leave history */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-sm">My leave applications</h3>
            </div>
            {leaves.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No leave applications yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-elevated">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium px-5 py-3">Date</th>
                    <th className="text-left font-medium py-3">Reason</th>
                    <th className="text-left font-medium py-3">Status</th>
                    <th className="text-left font-medium py-3">Applied on</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map(l => (
                    <tr key={l.id} className="border-t border-border hover:bg-subtle transition">
                      <td className="px-5 py-3 tabular">
                        {new Date(l.leave_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      </td>
                      <td className="py-3 text-muted-foreground text-xs max-w-xs">{l.reason}</td>
                      <td className="py-3">
                        <Badge tone={l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : "warning"}>
                          {l.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground tabular text-xs">
                        {new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AccessGuard>
  );
}
