import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import {
  Plus, X, Loader2, Check, ClipboardList, Pencil, Trash2,
  ChevronLeft, ChevronRight, Search, Clock, Users, Bell,
  AlertTriangle, MapPin, Sparkles, CalendarDays, Navigation,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/class-assigning")({
  component: ClassAssigningPage,
});

// ── Calendar helpers ───────────────────────────────────────────────────
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const WEEKDAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEKDAY_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function calculateEstimatedSessions(validFrom: string, validTo: string, daysOfWeek: number[]): number {
  if (!validFrom || !validTo || !daysOfWeek.length) return 0;
  const start = new Date(validFrom + "T00:00:00");
  const end = new Date(validTo + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
  
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (daysOfWeek.includes(cur.getDay())) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ── Types ──────────────────────────────────────────────────────────────
export interface Pitch {
  id: string;
  name: string;
  fromTime: string;
  toTime: string;
  locationType?: "existing" | "custom";
  locationName?: string;
  customLocation?: string;
  latitude?: number | string;
  longitude?: number | string;
  batsmen: string[];
  bowlers: string[];
  extras: string[];
  rsvps?: { [athleteId: string]: { status: "attending" | "not_attending"; reason?: string } };
}

export interface Schedule {
  id: string;
  name: string;
  academy_id: string;
  daysOfWeek: number[];   // 0=Sun … 6=Sat
  validFrom: string;      // yyyy-mm-dd
  validTo: string;        // yyyy-mm-dd
  createdAt: string;
  pitches: Pitch[];
}

export interface Student {
  id: string;
  full_name: string;
  user_id: string;
  academy_id?: string;
  primary_discipline?: string;
  secondary_discipline?: string;
  playing_role?: string;
  sport?: string;
}

export interface Academy {
  id: string;
  name: string;
  city?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────
function checkOverlap(f1: string, t1: string, f2: string, t2: string) {
  return f1 < t2 && f2 < t1;
}
type PitchRole = "batsmen" | "bowlers" | "extras";

function getStudentRole(s: Student): string {
  return (s.playing_role || s.primary_discipline || s.secondary_discipline || "").toLowerCase().trim();
}

export function isBatsmanColumnEligible(s: Student): boolean {
  const r = getStudentRole(s);
  if (!r) return true;
  // Pure bowler: NOT eligible for Batsmen column
  if (r === "bowler" || (r.includes("bowl") && !r.includes("bat") && !r.includes("all"))) {
    return false;
  }
  return true;
}

export function isBowlerColumnEligible(s: Student): boolean {
  const r = getStudentRole(s);
  if (!r) return true;
  // Pure batsman: NOT eligible for Bowlers column
  if (r === "batsman" || r.includes("keeper") || r === "wicketkeeper-batsman" || (r.includes("bat") && !r.includes("bowl") && !r.includes("all"))) {
    return false;
  }
  return true;
}

export function isExtraColumnEligible(_s: Student): boolean {
  // Extras column displays ALL students
  return true;
}

function normalizePitchAssignments(form: Omit<Pitch,"id"|"rsvps">): Omit<Pitch,"id"|"rsvps"> {
  const used = new Set<string>();
  const next = { ...form };
  for (const role of ["batsmen","bowlers","extras"] as PitchRole[]) {
    const unique = Array.from(new Set(next[role]));
    next[role] = unique.filter(id => { if (used.has(id)) return false; used.add(id); return true; });
  }
  return next;
}

function stripRsvpsFromSchedules(schedules: Schedule[]) {
  return schedules.map(s => ({
    ...s,
    pitches: s.pitches.map(({ rsvps, ...p }) => p),
  }));
}

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const d = new Date();
  d.setHours(parseInt(h,10)); d.setMinutes(parseInt(m,10));
  return d.toLocaleTimeString("en-IN", { hour:"numeric", minute:"2-digit" });
}

function parseArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

/** Returns true if the given date (yyyy-mm-dd) falls on one of the schedule's class days */
function isClassDay(schedule: Schedule, dateKey: string): boolean {
  if (!schedule.validFrom || !schedule.validTo || !schedule.daysOfWeek?.length) return false;
  const vFrom = String(schedule.validFrom).split("T")[0];
  const vTo = String(schedule.validTo).split("T")[0];
  if (dateKey < vFrom || dateKey > vTo) return false;
  const parts = dateKey.split("-");
  if (parts.length !== 3) return false;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const weekday = new Date(y, m, d).getDay();
  return schedule.daysOfWeek.includes(weekday);
}

// ── Main component ─────────────────────────────────────────────────────
function ClassAssigningPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);

  // Live database entity states
  const [dbSessions, setDbSessions] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [leaveApplications, setLeaveApplications] = useState<any[]>([]);
  const [dbInstances, setDbInstances] = useState<any[]>([]);
  const [dbPitchOverrides, setDbPitchOverrides] = useState<any[]>([]);
  const [selectedAcademyFilter, setSelectedAcademyFilter] = useState<string>("all");

  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [cancellingAllDay, setCancellingAllDay] = useState(false);

  // ── Calendar state ─────────────────────────────────────────────────
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calSelectedDay, setCalSelectedDay] = useState<number | null>(today.getDate());
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const handleCalPrev = () => {
    setCalSelectedDay(null);
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const handleCalNext = () => {
    setCalSelectedDay(null);
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  // ── 3-Step Schedule Creation Modal State ───────────────────────────
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleModalStep, setScheduleModalStep] = useState<1 | 2 | 3>(1);
  const [editingScheduleId, setEditingScheduleId] = useState<string|null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string|null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Schedule draft form fields
  const [sName, setSName] = useState("");
  const [sAcademyId, setSAcademyId] = useState("");
  const [sIsTournament, setSIsTournament] = useState(false);
  const [sDaysOfWeek, setSDaysOfWeek] = useState<number[]>([]);
  const [sValidFrom, setSValidFrom] = useState("");
  const [sValidTo, setSValidTo] = useState("");
  const [draftPitches, setDraftPitches] = useState<Pitch[]>([]);

  // ── Pitch Sub-Modal State ──────────────────────────────────────────
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [editingPitchId, setEditingPitchId] = useState<string|null>(null);
  const [pitchForm, setPitchForm] = useState<Omit<Pitch,"id"|"rsvps">>({
    name:"", fromTime:"09:00", toTime:"11:00",
    locationType:"existing", locationName:"", latitude:"", longitude:"",
    batsmen:[], bowlers:[], extras:[],
  });
  const [overlapWarning, setOverlapWarning] = useState<(()=>void)|null>(null);
  const [notifyingPitchId, setNotifyingPitchId] = useState<string|null>(null);

  // ── Date Schedule Attendance & Overrides Modal State ─────────────────────────────
  const [activeDateModal, setActiveDateModal] = useState<{
    dateKey: string;
    schedule: Schedule;
  } | null>(null);

  const [modalTab, setModalTab] = useState<"attending" | "not_attending" | "present" | "students" | "location" | "cancel">("attending");
  const [overrideLocation, setOverrideLocation] = useState<{ [pitchId: string]: string }>({});
  const [overrideLat, setOverrideLat] = useState<{ [pitchId: string]: string | number }>({});
  const [overrideLng, setOverrideLng] = useState<{ [pitchId: string]: string | number }>({});
  const [overrideStudents, setOverrideStudents] = useState<{ [pitchId: string]: { batsmen: string[]; bowlers: string[]; extras: string[] } }>({});
  const [savingOverrides, setSavingOverrides] = useState(false);

  const [modalDetails, setModalDetails] = useState<{
    loading: boolean;
    attending: { id: string; name: string }[];
    notAttending: { id: string; name: string; reason?: string }[];
    present: { id: string; name: string; checkInTime?: string }[];
    totalAssigned: number;
  }>({ loading: true, attending: [], notAttending: [], present: [], totalAssigned: 0 });

  const handleLocateMe = (pitchId: string) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setOverrideLat(prev => ({ ...prev, [pitchId]: pos.coords.latitude }));
          setOverrideLng(prev => ({ ...prev, [pitchId]: pos.coords.longitude }));
        },
        (err) => {
          alert("Unable to fetch current location: " + err.message);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  const handleLocateMeForPitchForm = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPitchForm(prev => ({
            ...prev,
            latitude: String(pos.coords.latitude),
            longitude: String(pos.coords.longitude)
          }));
        },
        (err) => {
          alert("Unable to fetch current location: " + err.message);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  async function openDateScheduleModal(s: Schedule, dateKey: string) {
    setActiveDateModal({ schedule: s, dateKey });
    setModalTab("attending");
    setModalDetails({ loading: true, attending: [], notAttending: [], present: [], totalAssigned: 0 });

    // Pre-populate override location, lat, lng and student states
    const locMap: { [pitchId: string]: string } = {};
    const latMap: { [pitchId: string]: string | number } = {};
    const lngMap: { [pitchId: string]: string | number } = {};
    const studMap: { [pitchId: string]: { batsmen: string[]; bowlers: string[]; extras: string[] } } = {};
    const inst = dbInstances.find((i: any) => String(i.template_id) === String(s.id) && String(i.date).substring(0, 10) === dateKey);

    (s.pitches ?? []).forEach(p => {
      let over: any = null;
      if (inst) {
        over = dbPitchOverrides.find((o: any) => String(o.instance_id) === String(inst.id) && String(o.pitch_id) === String(p.id));
      }
      locMap[p.id] = over?.custom_location ?? p.customLocation ?? p.locationName ?? "";
      latMap[p.id] = over?.custom_lat ?? p.latitude ?? "";
      lngMap[p.id] = over?.custom_lng ?? p.longitude ?? "";
      studMap[p.id] = {
        batsmen: over?.batsmen ? parseArray(over.batsmen) : parseArray(p.batsmen),
        bowlers: over?.bowlers ? parseArray(over.bowlers) : parseArray(p.bowlers),
        extras: over?.extras ? parseArray(over.extras) : parseArray(p.extras),
      };
    });
    setOverrideLocation(locMap);
    setOverrideLat(latMap);
    setOverrideLng(lngMap);
    setOverrideStudents(studMap);

    try {
      const assignedIds = new Set<string>();
      (s.pitches ?? []).forEach(p => {
        (p.batsmen ?? []).forEach(id => assignedIds.add(id));
        (p.bowlers ?? []).forEach(id => assignedIds.add(id));
        (p.extras ?? []).forEach(id => assignedIds.add(id));
      });

      const targetIds = assignedIds.size > 0 
        ? Array.from(assignedIds) 
        : students.filter(st => !s.academy_id || st.academy_id === s.academy_id).map(st => st.id);

      const pitchIds = (s.pitches ?? []).map(p => p.id).filter(Boolean);

      const [{ data: rawAttData }, { data: polls }] = await Promise.all([
        supabase.from("attendance").select("*"),
        pitchIds.length > 0
          ? supabase.from("ring_assignment_polls").select("id, pitch_id").in("pitch_id", pitchIds).eq("poll_date", dateKey)
          : { data: [] },
      ]);

      const pollIds = (polls ?? []).map(p => p.id);
      const { data: pollResponses } = pollIds.length > 0
        ? await supabase
            .from("ring_assignment_poll_responses")
            .select("boxer_profile_id, status, reason")
            .in("poll_id", pollIds)
        : { data: [] };

      const studentMap = new Map<string, string>();
      students.forEach(st => {
        if (st.id) studentMap.set(String(st.id), st.full_name);
        if (st.user_id) studentMap.set(String(st.user_id), st.full_name);
      });

      const attendingList: { id: string; name: string }[] = [];
      const notAttendingList: { id: string; name: string; reason?: string }[] = [];

      (pollResponses ?? []).forEach((r: any) => {
        const athId = String(r.boxer_profile_id);
        const name = studentMap.get(athId) || "Athlete";
        if (r.status === "attending") {
          attendingList.push({ id: athId, name });
        } else if (r.status === "not_attending") {
          notAttendingList.push({ id: athId, name, reason: r.reason || "No reason specified" });
        }
      });

      const presentList: { id: string; name: string; checkInTime?: string }[] = [];
      const dateAttData = (rawAttData ?? []).filter((a: any) => a.date && String(a.date).substring(0, 10) === dateKey);
      dateAttData.forEach((a: any) => {
        if (a.status && (String(a.status).toLowerCase() === "present" || String(a.status).toLowerCase() === "attending")) {
          const athId = a.boxer_profile_id ? String(a.boxer_profile_id) : a.user_id ? String(a.user_id) : "";
          const name = studentMap.get(athId) || "Athlete";
          presentList.push({ id: athId, name, checkInTime: a.check_in_time });
        }
      });

      setModalDetails({
        loading: false,
        attending: attendingList,
        notAttending: notAttendingList,
        present: presentList,
        totalAssigned: targetIds.length,
      });
    } catch (err) {
      console.error("Error loading date schedule details:", err);
      setModalDetails({ loading: false, attending: [], notAttending: [], present: [], totalAssigned: 0 });
    }
  }

  // ── Override Save Handlers ───────────────────────────────────────────
  async function handleSaveOverrideStudents() {
    if (!activeDateModal) return;
    setSavingOverrides(true);
    try {
      const { schedule, dateKey } = activeDateModal;
      let instId = dbInstances.find(i => String(i.template_id) === String(schedule.id) && String(i.date).substring(0, 10) === dateKey)?.id;
      if (!instId) {
        const { data: newInst, error: instErr } = await supabase.from("ring_instances").insert({
          template_id: schedule.id,
          academy_id: schedule.academy_id,
          date: dateKey,
          is_cancelled: false,
        }).select("id").single();
        if (instErr) throw instErr;
        instId = newInst.id;
      }

      for (const pitch of schedule.pitches ?? []) {
        const studObj = overrideStudents[pitch.id];
        if (!studObj) continue;

        const existingOver = dbPitchOverrides.find(o => String(o.instance_id) === String(instId) && String(o.pitch_id) === String(pitch.id));
        if (existingOver) {
          await supabase.from("ring_instance_overrides").update({
            batsmen: studObj.batsmen,
            bowlers: studObj.bowlers,
            extras: studObj.extras,
            updated_at: new Date().toISOString(),
          }).eq("id", existingOver.id);
        } else {
          await supabase.from("ring_instance_overrides").insert({
            instance_id: instId,
            pitch_id: pitch.id,
            batsmen: studObj.batsmen,
            bowlers: studObj.bowlers,
            extras: studObj.extras,
            created_by: user?.id,
          });
        }

        const allStudIds = [...studObj.batsmen, ...studObj.bowlers, ...studObj.extras];
        const recipients = Array.from(new Set(allStudIds.map(id => students.find(s => String(s.id) === String(id) || String(s.user_id) === String(id))?.user_id).filter(Boolean))) as string[];
        if (recipients.length > 0) {
          await supabase.from("notifications").insert(recipients.map(uid => ({
            recipient_id: uid,
            type: "schedule_updated",
            title: "Schedule Updated For Today",
            body: `Your practice schedule assignment for ${dateKey} (${pitch.name}) has been updated.`,
          })));
        }
      }

      await loadData(true);
      alert("Student assignments saved for today and notifications sent!");
    } catch (err: any) {
      console.error("handleSaveOverrideStudents error:", err);
      alert(`Error saving student assignments: ${err.message || err}`);
    } finally {
      setSavingOverrides(false);
    }
  }

  async function handleSaveOverrideLocation() {
    if (!activeDateModal) return;
    setSavingOverrides(true);
    try {
      const { schedule, dateKey } = activeDateModal;
      let instId = dbInstances.find(i => String(i.template_id) === String(schedule.id) && String(i.date).substring(0, 10) === dateKey)?.id;
      if (!instId) {
        const { data: newInst, error: instErr } = await supabase.from("ring_instances").insert({
          template_id: schedule.id,
          academy_id: schedule.academy_id,
          date: dateKey,
          is_cancelled: false,
        }).select("id").single();
        if (instErr) throw instErr;
        instId = newInst.id;
      }

      for (const pitch of schedule.pitches ?? []) {
        const newLoc = overrideLocation[pitch.id];
        const newLat = overrideLat[pitch.id] !== "" && overrideLat[pitch.id] !== undefined ? Number(overrideLat[pitch.id]) : null;
        const newLng = overrideLng[pitch.id] !== "" && overrideLng[pitch.id] !== undefined ? Number(overrideLng[pitch.id]) : null;

        const existingOver = dbPitchOverrides.find(o => String(o.instance_id) === String(instId) && String(o.pitch_id) === String(pitch.id));
        if (existingOver) {
          await supabase.from("ring_instance_overrides").update({
            custom_location: newLoc,
            custom_lat: newLat,
            custom_lng: newLng,
            updated_at: new Date().toISOString(),
          }).eq("id", existingOver.id);
        } else {
          await supabase.from("ring_instance_overrides").insert({
            instance_id: instId,
            pitch_id: pitch.id,
            custom_location: newLoc,
            custom_lat: newLat,
            custom_lng: newLng,
            created_by: user?.id,
          });
        }

        const studObj = overrideStudents[pitch.id] || { batsmen: pitch.batsmen, bowlers: pitch.bowlers, extras: pitch.extras };
        const allStudIds = [...studObj.batsmen, ...studObj.bowlers, ...studObj.extras];
        const recipients = Array.from(new Set(allStudIds.map(id => students.find(s => String(s.id) === String(id) || String(s.user_id) === String(id))?.user_id).filter(Boolean))) as string[];
        if (recipients.length > 0) {
          await supabase.from("notifications").insert(recipients.map(uid => ({
            recipient_id: uid,
            type: "location_changed",
            title: "Class Location Changed",
            body: `Location for your class on ${dateKey} (${pitch.name}) has been changed to: "${newLoc}".`,
          })));
        }
      }

      await loadData(true);
      alert("Location updated and notifications sent to athletes!");
    } catch (err: any) {
      console.error("handleSaveOverrideLocation error:", err);
      alert(`Error saving location: ${err.message || err}`);
    } finally {
      setSavingOverrides(false);
    }
  }

  async function handleCancelSingleClass() {
    if (!activeDateModal) return;
    if (!confirm(`Are you sure you want to cancel "${activeDateModal.schedule.name}" for ${activeDateModal.dateKey}?`)) return;
    setSavingOverrides(true);
    try {
      const { schedule, dateKey } = activeDateModal;
      let instId = dbInstances.find(i => String(i.template_id) === String(schedule.id) && String(i.date).substring(0, 10) === dateKey)?.id;
      if (instId) {
        await supabase.from("ring_instances").update({
          is_cancelled: true,
          cancel_reason: "Cancelled by Superadmin",
        }).eq("id", instId);
      } else {
        await supabase.from("ring_instances").insert({
          template_id: schedule.id,
          academy_id: schedule.academy_id,
          date: dateKey,
          is_cancelled: true,
          cancel_reason: "Cancelled by Superadmin",
        });
      }

      const assignedIds = new Set<string>();
      (schedule.pitches ?? []).forEach(p => {
        [...(p.batsmen ?? []), ...(p.bowlers ?? []), ...(p.extras ?? [])].forEach(id => assignedIds.add(id));
      });
      const targetStudents = assignedIds.size > 0
        ? students.filter(st => assignedIds.has(st.id) || assignedIds.has(st.user_id))
        : students.filter(st => !schedule.academy_id || String(st.academy_id) === String(schedule.academy_id));

      const recipients = Array.from(new Set(targetStudents.map(st => st.user_id).filter(Boolean))) as string[];
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(recipients.map(uid => ({
          recipient_id: uid,
          type: "class_cancelled",
          title: "Class Cancelled",
          body: `Your class "${schedule.name}" on ${dateKey} has been cancelled by the admin.`,
        })));
      }

      await loadData(true);
      setActiveDateModal(null);
      alert("Class cancelled and notifications sent to athletes.");
    } catch (err: any) {
      alert(`Error cancelling class: ${err.message || err}`);
    } finally {
      setSavingOverrides(false);
    }
  }

  async function handleToggleCancelAllDay(dateKey: string, cancel: boolean) {
    if (cancel) {
      const ok = confirm(`Are you sure you want to cancel ALL classes scheduled for ${dateKey}? This will send cancellation notifications to all enrolled athletes.`);
      if (!ok) return;
    }
    setCancellingAllDay(true);
    try {
      const activeSchedules = schedules.filter(s => isClassDay(s, dateKey));

      for (const s of activeSchedules) {
        const existingInst = dbInstances.find(i => String(i.template_id) === String(s.id) && String(i.date).substring(0, 10) === dateKey);
        if (existingInst) {
          await supabase.from("ring_instances")
            .update({ is_cancelled: cancel, cancel_reason: cancel ? "Cancelled by Superadmin" : null })
            .eq("id", existingInst.id);
        } else {
          await supabase.from("ring_instances").insert({
            template_id: s.id,
            academy_id: s.academy_id,
            date: dateKey,
            is_cancelled: cancel,
            cancel_reason: cancel ? "Cancelled by Superadmin" : null,
          });
        }
      }

      if (cancel) {
        const userIdsToNotify = new Set<string>();
        activeSchedules.forEach(s => {
          (s.pitches ?? []).forEach(p => {
            const pitchAssigned = [...(p.batsmen ?? []), ...(p.bowlers ?? []), ...(p.extras ?? [])];
            pitchAssigned.forEach(athId => {
              const st = students.find(st => String(st.id) === String(athId) || String(st.user_id) === String(athId));
              if (st?.user_id) userIdsToNotify.add(st.user_id);
            });
          });
          const academyStudents = students.filter(st => !s.academy_id || String(st.academy_id) === String(s.academy_id));
          academyStudents.forEach(st => {
            if (st.user_id) userIdsToNotify.add(st.user_id);
          });
        });

        if (userIdsToNotify.size > 0) {
          await supabase.from("notifications").insert(
            Array.from(userIdsToNotify).map(uid => ({
              recipient_id: uid,
              type: "class_cancelled",
              title: "Class Cancelled Today",
              body: `All boxing classes on ${dateKey} have been cancelled by the academy admin.`,
            }))
          );
        }
      }

      await loadData(true);
    } catch (err: any) {
      console.error("handleToggleCancelAllDay error:", err);
      alert(`Failed to update class cancellation: ${err.message || err}`);
    } finally {
      setCancellingAllDay(false);
    }
  }

  // ── Load data with Live Realtime Subscription ────────────────────────
  useEffect(() => {
    loadData();

    const ch = supabase.channel("sa-class-assigning-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_applications" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_assignment_polls" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_assignment_poll_responses" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_polls" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_poll_responses" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_schedule_templates" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_sessions" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_instances" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_instance_overrides" }, () => loadData(true))
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);


  async function loadData(isSilent = false) {
    if (!isSilent) setLoading(true);
    try {
      const [studentsRes, pollsRes, academiesRes, sessionsRes, attendanceRes, leavesRes, dbTemplatesRes, dbPitchesRes, instancesRes, pitchOverridesRes] = await Promise.all([
        supabase.from("boxer_profiles").select("id, full_name, user_id, academy_id, stance, declared_weight_kg")
          .order("full_name",{ascending:true}),
        supabase.from("ring_assignment_polls").select("id, ring_instance_id, sent_by, sent_at")
          .order("sent_at",{ascending:false}),
        supabase.from("academies").select("id, name, city").order("name"),
        Promise.resolve({ data: [], error: null }),
        supabase.from("attendance").select("*").order("session_date",{ascending:false}),
        supabase.from("leave_applications").select("*, boxer_profiles(full_name)").order("start_date",{ascending:false}),
        supabase.from("ring_schedule_templates").select("*"),
        supabase.from("ring_sessions").select("*"),
        supabase.from("ring_instances").select("*"),
        supabase.from("ring_instance_overrides").select("*"),
      ]);

      if (studentsRes.error) console.error("studentsRes error:", studentsRes.error.message);
      if (pollsRes.error) console.error("pollsRes error:", pollsRes.error.message);
      if (academiesRes.error) console.error("academiesRes error:", academiesRes.error.message);
      if ((sessionsRes as any)?.error) console.error("sessionsRes error:", (sessionsRes as any).error.message);
      if (attendanceRes.error) console.error("attendanceRes error:", attendanceRes.error.message);
      if (leavesRes.error) console.error("leavesRes error:", leavesRes.error.message);
      if (dbTemplatesRes.error) console.error("dbTemplates error:", dbTemplatesRes.error.message);
      if (dbPitchesRes.error) console.error("dbPitches error:", dbPitchesRes.error.message);

      const pollIds = (pollsRes.data ?? []).map((p: any) => p.id);
      const responsesRes = pollIds.length > 0
        ? await supabase.from("ring_assignment_poll_responses")
            .select("poll_id, boxer_profile_id, status, reason, responded_at")
            .in("poll_id", pollIds)
        : { data: [] as any[] };

      const responsesByPitch = new Map<string, Record<string,{status:"attending"|"not_attending";reason?:string}>>();
      (pollsRes.data ?? []).forEach((poll: any) => {
        const pr = responsesByPitch.get(poll.pitch_id) ?? {};
        (responsesRes.data ?? []).filter((r: any) => r.poll_id === poll.id).forEach((r: any) => {
          pr[r.boxer_profile_id] = { status: r.status, reason: r.reason ?? undefined };
        });
        responsesByPitch.set(poll.pitch_id, pr);
      });

      // ── Map ring_schedule_templates rows into Schedule[] ────────────
      const dbSchedules: Schedule[] = (dbTemplatesRes.data ?? [])
        .filter((t: any) => t.is_active !== false)
        .map((t: any) => {
          const rawDays = parseArray(t.days_of_week ?? t.daysOfWeek);
          const daysOfWeek = rawDays.map((d: any) => Number(d)).filter((n: number) => !isNaN(n));

          const pitchesForTemplate: Pitch[] = (dbPitchesRes.data ?? [])
            .filter((p: any) => {
              const tId = p.template_id ?? p.templateId;
              return String(tId) === String(t.id);
            })
            .map((p: any) => ({
              id: p.id,
              name: p.name,
              fromTime: (p.from_time ?? p.fromTime ?? "").slice(0, 5),
              toTime: (p.to_time ?? p.toTime ?? "").slice(0, 5),
              locationType: "custom",
              locationName: p.custom_location ?? p.location_name ?? p.locationName ?? "",
              customLocation: p.custom_location ?? p.location_name ?? p.locationName ?? "",
              batsmen: parseArray(p.batsmen),
              bowlers: parseArray(p.bowlers),
              extras: parseArray(p.extras),
              rsvps: responsesByPitch.get(p.id) ?? {},
            }));
          return {
            id: t.id,
            name: t.name,
            academy_id: t.academy_id ?? t.academyId ?? "",
            daysOfWeek,
            validFrom: String(t.valid_from ?? t.validFrom ?? "").split("T")[0],
            validTo: String(t.valid_to ?? t.validTo ?? "").split("T")[0],
            createdAt: t.created_at ?? t.createdAt ?? "",
            pitches: pitchesForTemplate,
          };
        });

      setSchedules(dbSchedules);
      if (studentsRes.data) setStudents(studentsRes.data.filter((s:any) => Boolean(s.full_name && s.id)) as Student[]);
      if (academiesRes.data) setAcademies(academiesRes.data);
      if (sessionsRes.data) setDbSessions(sessionsRes.data);
      if (attendanceRes.data) setAttendanceRecords(attendanceRes.data);
      if (leavesRes.data) setLeaveApplications(leavesRes.data);
      if (instancesRes.data) setDbInstances(instancesRes.data);
      if (pitchOverridesRes.data) setDbPitchOverrides(pitchOverridesRes.data);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }

  // ── Schedule actions ───────────────────────────────────────────────
  function openCreateSchedule() {
    setEditingScheduleId(null);
    setSName(""); setSAcademyId(""); setSDaysOfWeek([]); setSValidFrom(""); setSValidTo("");
    setDraftPitches([]);
    setScheduleModalStep(1);
    setShowScheduleModal(true);
  }

  function openEditSchedule(s: Schedule) {
    setEditingScheduleId(s.id);
    setSName(s.name); setSAcademyId(s.academy_id);
    setSDaysOfWeek(s.daysOfWeek ?? []);
    setSValidFrom(s.validFrom ?? ""); setSValidTo(s.validTo ?? "");
    setDraftPitches(s.pitches ?? []);
    setScheduleModalStep(1);
    setShowScheduleModal(true);
  }

  const step1Valid = Boolean(sName.trim() && sAcademyId && sDaysOfWeek.length > 0 && sValidFrom && sValidTo && sValidFrom <= sValidTo);

  async function handleFinalCreateSchedule() {
    if (!step1Valid) return;
    setSavingSchedule(true);
    try {
      if (editingScheduleId) {
        // ── Update existing template row ──────────────────────────────
        const { error: tErr } = await supabase.from("ring_schedule_templates").update({
          name: sName.trim(),
          academy_id: sAcademyId,
          days_of_week: sDaysOfWeek,
          valid_from: sValidFrom,
          valid_to: sValidTo,
          is_active: true,
        }).eq("id", editingScheduleId);

        if (tErr) throw tErr;

        // Sync pitches: delete all old pitches then re-insert
        await supabase.from("ring_sessions").delete().eq("template_id", editingScheduleId);
        if (draftPitches.length > 0) {
          const { error: pErr } = await supabase.from("ring_sessions").insert(
            draftPitches.map(p => ({
              id: p.id || crypto.randomUUID(),
              template_id: editingScheduleId,
              name: p.name,
              from_time: p.fromTime ?? (p as any).from_time ?? "09:00",
              to_time: p.toTime ?? (p as any).to_time ?? "11:00",
              custom_location: (p as any).customLocation ?? (p as any).location_name ?? null,
              batsmen: p.batsmen ?? [],
              bowlers: p.bowlers ?? [],
              extras: p.extras ?? [],
            }))
          );
          if (pErr) throw pErr;
        }
      } else {
        // ── Insert new template row ───────────────────────────────────
        const newId = crypto.randomUUID();
        const { error: tErr } = await supabase.from("ring_schedule_templates").insert({
          id: newId,
          name: sName.trim(),
          academy_id: sAcademyId || null,
          days_of_week: sDaysOfWeek,
          valid_from: sValidFrom,
          valid_to: sValidTo,
          is_active: true,
        });

        if (tErr) throw tErr;

        if (draftPitches.length > 0) {
          const { error: pErr } = await supabase.from("ring_sessions").insert(
            draftPitches.map(p => ({
              id: p.id || crypto.randomUUID(),
              template_id: newId,
              name: p.name,
              from_time: p.fromTime ?? (p as any).from_time ?? "09:00",
              to_time: p.toTime ?? (p as any).to_time ?? "11:00",
              custom_location: (p as any).customLocation ?? (p as any).location_name ?? null,
              batsmen: p.batsmen ?? [],
              bowlers: p.bowlers ?? [],
              extras: p.extras ?? [],
            }))
          );
          if (pErr) throw pErr;
        }

        // Send notifications & ring_assignment_polls for new schedule
        if (sAcademyId && draftPitches.length > 0) {
          try {
            for (const p of draftPitches) {
              const pollId = crypto.randomUUID();
              await supabase.from("ring_assignment_polls").insert({
                id: pollId,
                sent_by: user?.id,
                template_id: newId,
                pitch_id: p.id || crypto.randomUUID(),
                poll_date: sValidFrom || new Date().toISOString().split("T")[0],
                title: `Practice Class: ${sName.trim()} (${p.name})`,
                message: `Practice class scheduled for ${p.name} (${p.fromTime ?? '09:00'} - ${p.toTime ?? '11:00'}). Please confirm if you will be attending.`,
                academy_id: sAcademyId,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });

              let targetStudentIds: string[] = [];
              const pitchAssigned = [...(p.batsmen || []), ...(p.bowlers || []), ...(p.extras || [])];
              if (pitchAssigned.length > 0) {
                targetStudentIds = pitchAssigned;
              } else {
                const { data: academyStudents } = await supabase
                  .from("boxer_profiles")
                  .select("id")
                  .eq("academy_id", sAcademyId);
                targetStudentIds = (academyStudents || []).map(s => s.id);
              }

              if (targetStudentIds.length > 0) {
                const { data: userProfiles } = await supabase
                  .from("boxer_profiles")
                  .select("user_id")
                  .in("id", targetStudentIds)
                  .not("user_id", "is", null);

                if (userProfiles && userProfiles.length > 0) {
                  const notifs = userProfiles.map(ap => ({
                    recipient_id: ap.user_id,
                    type: "class_assignment_poll",
                    title: `Practice Class: ${sName.trim()} (${p.name})`,
                    body: `Practice class scheduled for ${p.name} (${p.fromTime ?? '09:00'} - ${p.toTime ?? '11:00'}). Please confirm your attendance.`,
                    related_entity_id: pollId,
                    related_entity_type: "class_assignment_poll",
                  }));
                  await supabase.from("notifications").insert(notifs);
                }
              }
            }
          } catch (notifErr) {
            console.warn("Poll/notification creation warning:", notifErr);
          }
        }
      }
      await loadData(true);
      setShowScheduleModal(false);
    } catch (err: any) {
      console.error("handleFinalCreateSchedule error:", err);
      alert(`Error saving schedule: ${err.message || err}`);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleDeleteSchedule(id: string) {
    try {
      // Delete pitches first (FK constraint), then the template
      await supabase.from("ring_sessions").delete().eq("template_id", id);
      await supabase.from("ring_schedule_templates").delete().eq("id", id);
      setDeleteScheduleId(null);
      if (selectedScheduleId === id) setSelectedScheduleId(null);
      await loadData(true);
    } catch (err) {
      console.error("handleDeleteSchedule error:", err);
    }
  }

  // ── Pitch actions ──────────────────────────────────────────────────
  function openCreatePitch() {
    setEditingPitchId(null);
    setPitchForm({ name:"", fromTime:"09:00", toTime:"11:00", locationType:"existing", locationName:"", latitude:"", longitude:"", batsmen:[], bowlers:[], extras:[] });
    setShowPitchModal(true);
  }

  function openEditPitch(pitch: Pitch) {
    setEditingPitchId(pitch.id);
    setPitchForm(normalizePitchAssignments({
      name: pitch.name, fromTime: pitch.fromTime, toTime: pitch.toTime,
      locationType: pitch.locationType ?? "existing",
      locationName: pitch.locationName ?? pitch.customLocation ?? "",
      latitude: pitch.latitude ?? "",
      longitude: pitch.longitude ?? "",
      batsmen: pitch.batsmen, bowlers: pitch.bowlers, extras: pitch.extras,
    }));
    setShowPitchModal(true);
  }

  function updatePitchRole(role: PitchRole, ids: string[]) {
    setPitchForm(cur => {
      const next = { ...cur, [role]: Array.from(new Set(ids)) };
      const inRole = new Set(next[role]);
      for (const r of ["batsmen","bowlers","extras"] as PitchRole[]) {
        if (r !== role) next[r] = next[r].filter(id => !inRole.has(id));
      }
      return normalizePitchAssignments(next);
    });
  }

  async function processPitchSave() {
    if (!pitchForm.name.trim()) return;
    const cleaned = normalizePitchAssignments(pitchForm);

    if (showScheduleModal) {
      // In draft mode (schedule creation wizard) — just update local state
      if (editingPitchId) {
        setDraftPitches(prev => prev.map(p => p.id === editingPitchId ? { ...cleaned, id: editingPitchId, rsvps: p.rsvps } : p));
      } else {
        setDraftPitches(prev => [...prev, { ...cleaned, id: crypto.randomUUID() }]);
      }
      setShowPitchModal(false);
      setOverlapWarning(null);
      return;
    }

    // Adding/editing a pitch directly on an existing selected schedule — write to DB
    if (!selectedScheduleId) return;
    try {
      if (editingPitchId) {
        // Update existing pitch row
        const { error: updateErr } = await supabase.from("ring_sessions").update({
          name: cleaned.name,
          from_time: cleaned.fromTime,
          to_time: cleaned.toTime,
          custom_location: cleaned.locationName || null,
          batsmen: cleaned.batsmen,
          bowlers: cleaned.bowlers,
          extras: cleaned.extras,
        }).eq("id", editingPitchId);

        if (updateErr) throw updateErr;
      } else {
        // Insert new pitch row
        const { error: insertErr } = await supabase.from("ring_sessions").insert({
          id: crypto.randomUUID(),
          template_id: selectedScheduleId,
          name: cleaned.name,
          from_time: cleaned.fromTime,
          to_time: cleaned.toTime,
          custom_location: cleaned.locationName || null,
          batsmen: cleaned.batsmen,
          bowlers: cleaned.bowlers,
          extras: cleaned.extras,
        });

        if (insertErr) throw insertErr;
      }
      setShowPitchModal(false);
      setOverlapWarning(null);
      await loadData(true);
    } catch (err: any) {
      console.error("processPitchSave error:", err);
      alert(`Error saving pitch: ${err.message || err}`);
    }
  }

  function handleSavePitchAttempt(e: React.FormEvent) {
    e.preventDefault();
    const curName = pitchForm.name.trim().toLowerCase();
    let hasOverlap = false;

    const listToCheck = showScheduleModal ? draftPitches : (schedules.find(s => s.id === selectedScheduleId)?.pitches ?? []);

    for (const p of listToCheck) {
      if (editingPitchId && p.id === editingPitchId) continue;
      if (p.name.trim().toLowerCase() === curName && checkOverlap(pitchForm.fromTime, pitchForm.toTime, p.fromTime, p.toTime)) {
        hasOverlap = true; break;
      }
    }

    if (hasOverlap) setOverlapWarning(() => processPitchSave);
    else processPitchSave();
  }

  async function handleDeletePitch(pitchId: string) {
    if (showScheduleModal) {
      setDraftPitches(prev => prev.filter(p => p.id !== pitchId));
      return;
    }
    // Delete from DB directly
    try {
      await supabase.from("ring_sessions").delete().eq("id", pitchId);
      await loadData(true);
    } catch (err) {
      console.error("handleDeletePitch error:", err);
    }
  }

  async function handleNotifyPitch(pitch: Pitch, schedule: Schedule) {
    setNotifyingPitchId(pitch.id);
    try {
      const { data: existing, error: exErr } = await supabase
        .from("ring_assignment_polls").select("id, expires_at, created_at")
        .eq("pitch_id", pitch.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if (exErr) throw exErr;
      if (existing && new Date(existing.expires_at ?? existing.created_at).getTime() > Date.now()) {
        alert("This pitch can only be notified again after 24 hours."); return;
      }
      const { data: poll, error: pollErr } = await supabase.from("ring_assignment_polls").insert({
        sent_by: user?.id, template_id: schedule.id, pitch_id: pitch.id,
        poll_date: new Date().toISOString().split("T")[0],
        title: "Boxing Practice Scheduled",
        message: `Please respond within 24 hours for ${pitch.name} (${formatTime(pitch.fromTime)} - ${formatTime(pitch.toTime)}).`,
      }).select("id").single();
      if (pollErr) { if (pollErr.code === "23505") { alert("This pitch can only be notified again after 24 hours."); return; } throw pollErr; }

      const assignedIds = Array.from(new Set([...pitch.batsmen, ...pitch.bowlers, ...pitch.extras]));
      const recipients = assignedIds.map(id => students.find(s => s.id === id)?.user_id).filter(Boolean) as string[];
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(recipients.map(uid => ({
          recipient_id: uid, type: "class_assignment_poll",
          title: "Boxing Practice Scheduled",
          body: `Please respond within 24 hours for ${pitch.name} at ${formatTime(pitch.fromTime)} - ${formatTime(pitch.toTime)}.`,
          related_entity_id: poll.id, related_entity_type: "class_assignment_poll",
        })));
      }
      await loadData();
      alert("Notifications sent successfully!");
    } finally { setNotifyingPitchId(null); }
  }

  // ── Derived calendar data ──────────────────────────────────────────
  const selectedDateKey = calSelectedDay ? formatDateKey(calYear, calMonth, calSelectedDay) : null;
  const cancelledDateKeys = useMemo(() => {
    const keys = new Set<string>();
    (dbInstances ?? []).forEach((inst: any) => {
      if (inst.is_cancelled && inst.date) {
        keys.add(String(inst.date).substring(0, 10));
      }
    });
    return keys;
  }, [dbInstances]);

  const isSelectedDayCancelled = calSelectedDay
    ? cancelledDateKeys.has(formatDateKey(calYear, calMonth, calSelectedDay))
    : false;

  /** Schedules filtered by selected academy */
  const filteredSchedules = useMemo(() => {
    if (selectedAcademyFilter === "all") return schedules;
    return schedules.filter(s => String(s.academy_id) === String(selectedAcademyFilter));
  }, [schedules, selectedAcademyFilter]);

  const { studentMapById, studentMapByUserId } = useMemo(() => {
    const byId = new Map<string, Student>();
    const byUserId = new Map<string, Student>();
    (students ?? []).forEach(st => {
      if (st.id) byId.set(String(st.id), st);
      if (st.user_id) byUserId.set(String(st.user_id), st);
    });
    return { studentMapById: byId, studentMapByUserId: byUserId };
  }, [students]);

  /** Set of dateKeys that have any scheduled class, DB session, marked attendance, or approved leave */
  const allClassDateKeys = useMemo(() => {
    const keys = new Set<string>();
    const daysInCal = getDaysInMonth(calYear, calMonth);
    
    // 1. Days matching recurring schedules
    for (let d = 1; d <= daysInCal; d++) {
      const dk = formatDateKey(calYear, calMonth, d);
      if (filteredSchedules.some(s => isClassDay(s, dk))) keys.add(dk);
    }

    // 2. Days with live DB sessions
    (dbSessions ?? []).forEach((sess: any) => {
      if (sess.session_date) {
        const sessDate = String(sess.session_date).substring(0, 10);
        if (selectedAcademyFilter === "all" || String(sess.academy_id) === String(selectedAcademyFilter)) {
          keys.add(sessDate);
        }
      }
    });

    // 3. Days with attendance records
    (attendanceRecords ?? []).forEach((att: any) => {
      if (att.date) {
        const attDate = String(att.date).substring(0, 10);
        if (selectedAcademyFilter === "all" || !att.academy_id || String(att.academy_id) === String(selectedAcademyFilter)) {
          keys.add(attDate);
        }
      }
    });

    // 4. Days with approved leave applications
    (leaveApplications ?? []).forEach((l: any) => {
      if (l.leave_date && (l.status === "approved" || String(l.status).toLowerCase() === "approved")) {
        const leaveDate = String(l.leave_date).substring(0, 10);
        if (selectedAcademyFilter === "all" || !l.academy_id || String(l.academy_id) === String(selectedAcademyFilter)) {
          keys.add(leaveDate);
        }
      }
    });

    return keys;
  }, [calYear, calMonth, filteredSchedules, dbSessions, attendanceRecords, leaveApplications, selectedAcademyFilter]);

  /** Schedules & sessions on the selected day with live attendance stats */
  const selectedDaySchedules = useMemo(() => {
    if (!selectedDateKey) return [];
    
    const items: {
      id: string;
      title: string;
      academyName?: string;
      daysLabel?: string;
      scheduleRef?: Schedule;
      isDbSession?: boolean;
      totalAssigned: number;
      presentCount: number;
    }[] = [];

    // Attendance records for selected date with present status (normalized date & status)
    const dayAttendance = attendanceRecords.filter(a => 
      a.date && 
      String(a.date).substring(0, 10) === selectedDateKey && 
      a.status && 
      String(a.status).toLowerCase() === "present"
    );

    // 1. All recurring schedules active on this date (filtered by academy if specific filter is set)
    const schedulesToCheck = selectedAcademyFilter === "all"
      ? schedules
      : schedules.filter(s => String(s.academy_id) === String(selectedAcademyFilter));

    schedulesToCheck.forEach(s => {
      if (isClassDay(s, selectedDateKey)) {
        const academy = academies.find(a => String(a.id) === String(s.academy_id));
        const assignedIds = new Set<string>();
        (s.pitches ?? []).forEach(p => {
          parseArray(p.batsmen).forEach(id => assignedIds.add(String(id)));
          parseArray(p.bowlers).forEach(id => assignedIds.add(String(id)));
          parseArray(p.extras).forEach(id => assignedIds.add(String(id)));
        });

        // Map assigned IDs to include both profile ID and user_id for all assigned athletes
        const expandedAssignedIds = new Set<string>();
        assignedIds.forEach(id => {
          expandedAssignedIds.add(id);
          const st = studentMapById.get(id) || studentMapByUserId.get(id);
          if (st) {
            if (st.id) expandedAssignedIds.add(String(st.id));
            if (st.user_id) expandedAssignedIds.add(String(st.user_id));
          }
        });

        const academyStudents = students.filter(st => !s.academy_id || String(st.academy_id) === String(s.academy_id));
        const totalAssigned = assignedIds.size > 0 
          ? assignedIds.size 
          : academyStudents.length;

        // Present count: ONLY count athletes who are assigned to THIS specific schedule
        const presentSet = new Set<string>();

        dayAttendance.forEach(a => {
          const apId = a.boxer_profile_id ? String(a.boxer_profile_id) : "";
          const uId = a.user_id ? String(a.user_id) : "";

          if (assignedIds.size > 0) {
            // Schedule has explicit pitch assignments — only count assigned athletes
            if (expandedAssignedIds.has(apId) || (uId && expandedAssignedIds.has(uId))) {
              presentSet.add(apId || uId);
            } else {
              // Try resolving via student map (boxer_profile_id ↔ user_id)
              const st = studentMapById.get(apId) || studentMapByUserId.get(uId);
              if (st && (expandedAssignedIds.has(String(st.id)) || (st.user_id && expandedAssignedIds.has(String(st.user_id))))) {
                presentSet.add(String(st.id));
              }
              // Do NOT add if not in this schedule's assignments
            }
          } else {
            // No pitch assignments — count athletes who belong to this schedule's academy
            const isAcademyStudent =
              (apId && academyStudents.some(st => String(st.id) === apId || (st.user_id && String(st.user_id) === apId))) ||
              (uId && academyStudents.some(st => String(st.id) === uId || (st.user_id && String(st.user_id) === uId)));
            if (isAcademyStudent) {
              presentSet.add(apId || uId);
            }
            // Do NOT add athletes from other academies
          }
        });

        // Also check poll RSVPs — only for athletes assigned to the pitches in THIS schedule
        (s.pitches ?? []).forEach(p => {
          const rsvps = p.rsvps ?? {};
          Object.entries(rsvps).forEach(([athId, r]: [string, any]) => {
            if ((r?.status === "attending" || r?.status === "present") && expandedAssignedIds.has(String(athId))) {
              presentSet.add(String(athId));
            }
          });
        });

        items.push({
          id: s.id,
          title: s.name,
          academyName: academy ? `${academy.name}${academy.city ? ` · ${academy.city}` : ""}` : undefined,
          daysLabel: s.daysOfWeek.sort().map(d => WEEKDAY_NAMES[d]).join(", "),
          scheduleRef: s,
          isDbSession: false,
          totalAssigned,
          presentCount: presentSet.size,
        });
      }
    });

    // 2. Live DB sessions for this date
    (dbSessions ?? []).forEach((sess: any) => {
      if (sess.session_date && String(sess.session_date).substring(0, 10) === selectedDateKey) {
        if (selectedAcademyFilter === "all" || String(sess.academy_id) === String(selectedAcademyFilter)) {
          const academyName = sess.academies?.name || academies.find(a => String(a.id) === String(sess.academy_id))?.name;
          const isAthleteAssigned = Boolean(sess.boxer_profile_id);

          let present = 0;
          if (isAthleteAssigned) {
            const targetId = String(sess.boxer_profile_id);
            const targetSt = studentMapById.get(targetId) || studentMapByUserId.get(targetId);
            present = dayAttendance.filter(a => {
              const apId = a.boxer_profile_id ? String(a.boxer_profile_id) : "";
              const uId = a.user_id ? String(a.user_id) : "";
              if (apId === targetId || uId === targetId) return true;
              if (targetSt && (apId === String(targetSt.id) || (targetSt.user_id && uId === String(targetSt.user_id)))) return true;
              return false;
            }).length;
          } else {
            present = dayAttendance.filter(a => !sess.academy_id || String(a.academy_id) === String(sess.academy_id)).length;
          }

          items.push({
            id: sess.id,
            title: sess.title || "Special Session",
            academyName,
            daysLabel: sess.start_time ? `${formatTime(sess.start_time)} - ${formatTime(sess.end_time)}` : "Live DB Session",
            isDbSession: true,
            totalAssigned: isAthleteAssigned ? 1 : Math.max(1, students.length),
            presentCount: present,
          });
        }
      }
    });

    return items;
  }, [selectedDateKey, schedules, filteredSchedules, dbSessions, attendanceRecords, academies, students, selectedAcademyFilter, studentMapById, studentMapByUserId]);

  /** Attendance check-ins for selected date */
  const selectedDateAttendance = useMemo(() => {
    if (!selectedDateKey) return [];
    return attendanceRecords.filter(a => 
      a.date && 
      String(a.date).substring(0, 10) === selectedDateKey && 
      (selectedAcademyFilter === "all" || String(a.academy_id) === String(selectedAcademyFilter))
    );
  }, [selectedDateKey, attendanceRecords, selectedAcademyFilter]);

  /** Approved leaves for selected date */
  const selectedDateLeaves = useMemo(() => {
    if (!selectedDateKey) return [];
    return leaveApplications.filter(l => 
      l.leave_date && 
      String(l.leave_date).substring(0, 10) === selectedDateKey && 
      String(l.status).toLowerCase() === "approved"
    );
  }, [selectedDateKey, leaveApplications]);

  const selectedSchedule = schedules.find(s => s.id === selectedScheduleId);
  const targetAcademyId = showScheduleModal ? sAcademyId : selectedSchedule?.academy_id;
  const scheduleStudents = useMemo(() => {
    if (!targetAcademyId) return students;
    const matched = students.filter(s => !s.academy_id || s.academy_id === targetAcademyId);
    return matched.length > 0 ? matched : students;
  }, [students, targetAcademyId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-8 animate-spin mb-4 text-primary" />
        <p>Loading schedules…</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={selectedSchedule ? selectedSchedule.name : "Class Assigning"}
        subtitle={
          selectedSchedule
            ? "Manage pitches, students, and RSVPs for this schedule"
            : "View monthly schedule overview and manage class schedules"
        }
        actions={
          selectedSchedule ? (
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedScheduleId(null)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border hover:bg-subtle transition">
                <ChevronLeft className="size-4" /> Back to schedules
              </button>
              <button onClick={openCreatePitch} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card">
                <Plus className="size-4" /> Add Pitch
              </button>
            </div>
          ) : (
            <button onClick={openCreateSchedule} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card">
              <Plus className="size-4" /> New Schedule
            </button>
          )
        }
      />

      {!selectedScheduleId ? (
        // ── Main overview: calendar + schedule list ──────────────────
        <div className="space-y-6">

          {/* ── Monthly Calendar ────────────────────────────────────── */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden animate-fade-up">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-accent grid place-items-center">
                  <Sparkles className="size-4 text-primary-dark" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-base">Monthly Schedule Overview</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Live DB synchronized · review class days, attendance & leaves</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Academy Filter */}
                <select
                  value={selectedAcademyFilter}
                  onChange={e => setSelectedAcademyFilter(e.target.value)}
                  className="bg-subtle/80 border border-border text-foreground text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary shadow-xs"
                >
                  <option value="all">All Academies ({academies.length})</option>
                  {academies.map(a => (
                    <option key={a.id} value={a.id}>{a.name}{a.city ? ` (${a.city})` : ""}</option>
                  ))}
                </select>

                {/* Navigator */}
                <div className="flex items-center gap-1 bg-subtle/70 p-1 rounded-xl border border-border/80 shadow-xs">
                  <button onClick={handleCalPrev} className="size-8 rounded-lg hover:bg-elevated flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground cursor-pointer shrink-0" title="Previous Month">
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="font-display font-bold text-sm text-foreground px-2 select-none whitespace-nowrap">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </span>
                  <button onClick={handleCalNext} className="size-8 rounded-lg hover:bg-elevated flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground cursor-pointer shrink-0" title="Next Month">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded border border-emerald-500/40 bg-emerald-500/20" />Classes Cancelled
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded border border-primary/40 bg-primary/20" />Scheduled Class
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded border border-white/10 bg-white/5" />Regular Day
                </span>
              </div>
            </div>

            {/* Mobile legend */}
            <div className="lg:hidden px-4 pt-3 pb-1 flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2.5 rounded border border-emerald-500/40 bg-emerald-500/20" />Cancelled</span>
              <span className="flex items-center gap-1"><span className="size-2.5 rounded border border-primary/40 bg-primary/20" />Class</span>
              <span className="flex items-center gap-1"><span className="size-2.5 rounded border border-white/10 bg-white/5" />Regular</span>
            </div>

            {/* Calendar grid + day detail */}
            <div className="p-3 sm:p-4 grid md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-8 bg-subtle/30 rounded-xl p-3 border border-border/50">
                <SuperAdminMonthCard
                  year={calYear} month={calMonth}
                  classDateKeys={allClassDateKeys}
                  cancelledDateKeys={cancelledDateKeys}
                  todayKey={todayKey}
                  selectedDay={calSelectedDay}
                  onSelectDay={setCalSelectedDay}
                />
              </div>

              {/* Day detail panel */}
              <div className="md:col-span-4 space-y-3">
                <div className="bg-subtle/20 border border-border/80 rounded-xl p-3.5 sm:p-4">
                  <div className="label-micro mb-2">Day details</div>
                  {calSelectedDay ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="font-display font-bold text-base text-foreground">
                          {calSelectedDay} {MONTH_NAMES[calMonth]} {calYear}
                        </h3>
                        {selectedDateKey && (
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-destructive cursor-pointer bg-destructive/10 border border-destructive/20 px-2 py-1 rounded-lg hover:bg-destructive/15 transition select-none">
                            <input
                              type="checkbox"
                              checked={isSelectedDayCancelled}
                              disabled={cancellingAllDay}
                              onChange={e => handleToggleCancelAllDay(selectedDateKey, e.target.checked)}
                              className="accent-destructive size-3.5 rounded cursor-pointer"
                            />
                            <span>Cancel All Classes Today</span>
                          </label>
                        )}
                      </div>

                      {isSelectedDayCancelled && (
                        <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 flex items-start gap-2">
                          <span className="size-2 rounded-full bg-destructive mt-1 shrink-0" />
                          <div>
                            <div className="text-[11px] font-semibold text-destructive">All Classes Cancelled</div>
                            <div className="text-xs text-muted-foreground mt-0.5">All scheduled classes for today have been cancelled by Superadmin.</div>
                          </div>
                        </div>
                      )}

                      {/* Scheduled Classes & DB Sessions */}
                      {selectedDaySchedules.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Scheduled Classes & Sessions ({selectedDaySchedules.length})
                          </div>
                          {selectedDaySchedules.map((item) => {
                            const dateKey = formatDateKey(calYear, calMonth, calSelectedDay);
                            return (
                              <div
                                key={item.id}
                                className="p-3 rounded-xl border border-primary/20 bg-accent/30 cursor-pointer hover:bg-accent/50 transition space-y-2"
                                onClick={() => {
                                  if (item.scheduleRef) {
                                    openDateScheduleModal(item.scheduleRef, dateKey);
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-bold text-foreground">{item.title}</div>
                                  {item.scheduleRef && (
                                    <span className="text-[10px] font-semibold text-primary-dark bg-primary/10 px-2 py-0.5 rounded-full">
                                      Day Settings & RSVP
                                    </span>
                                  )}
                                </div>
                                {item.academyName && <div className="text-[10px] text-muted-foreground">{item.academyName}</div>}
                                {item.daysLabel && (
                                  <div className="text-[10px] text-muted-foreground font-medium">
                                    {item.daysLabel}
                                  </div>
                                )}
                                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground">Live Attendance:</span>
                                  <span className="font-bold text-foreground bg-surface px-2 py-0.5 rounded border border-border">
                                    Present: {item.presentCount} / {item.totalAssigned} Students
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        !isSelectedDayCancelled && (
                          <div className="p-3 rounded-lg border border-border bg-surface/50 text-center">
                            <p className="text-xs text-muted-foreground">No classes or sessions scheduled.</p>
                          </div>
                        )
                      )}



                      {/* Approved Athlete Leaves for Day */}
                      {selectedDateLeaves.length > 0 && (
                        <div className="pt-2 border-t border-border/60 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Athletes on Leave</span>
                            <span className="text-[10px] font-bold bg-warning/10 text-warning px-2 py-0.5 rounded-full">
                              {selectedDateLeaves.length} Approved
                            </span>
                          </div>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {selectedDateLeaves.map((l: any) => (
                              <div key={l.id} className="text-xs p-2 rounded-lg bg-warning/5 border border-warning/20">
                                <div className="font-medium text-foreground">{l.boxer_profiles?.full_name || "Athlete"}</div>
                                <div className="text-[11px] text-muted-foreground italic mt-0.5">"{l.reason}"</div>
                              </div>
                            ))}
                          </div>
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

          {/* ── Schedule grid ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">All Schedules</h2>
            </div>
            {schedules.length === 0 ? (
              <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center">
                <ClipboardList className="size-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-semibold">No schedules created</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first class schedule to get started.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {schedules.map(s => {
                  const academy = academies.find(a => a.id === s.academy_id);
                  return (
                    <div key={s.id} onClick={() => setSelectedScheduleId(s.id)}
                      className="bg-surface border border-border rounded-xl p-5 group hover:border-border-strong hover:shadow-card transition-all duration-200 cursor-pointer">
                      <div className="flex items-start justify-between mb-4">
                        <div className="size-10 rounded-lg bg-subtle grid place-items-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          <CalendarDays className="size-5 text-muted-foreground group-hover:text-primary" strokeWidth={1.75} />
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEditSchedule(s)} className="size-8 grid place-items-center rounded-md hover:bg-subtle transition"><Pencil className="size-3.5 text-muted-foreground" /></button>
                          <button onClick={() => setDeleteScheduleId(s.id)} className="size-8 grid place-items-center rounded-md hover:bg-destructive/10 transition"><Trash2 className="size-3.5 text-destructive" /></button>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-display font-semibold text-sm truncate">{s.name}</h3>
                        {academy && <span className="text-xs text-muted-foreground truncate mt-0.5">{academy.name}{academy.city ? ` · ${academy.city}` : ""}</span>}
                      </div>
                      {/* Days of week pills */}
                      {s.daysOfWeek?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {[0,1,2,3,4,5,6].map(d => (
                            <span key={d}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${s.daysOfWeek.includes(d) ? "bg-primary/10 text-primary-dark" : "bg-subtle text-muted-foreground/40"}`}>
                              {WEEKDAY_NAMES[d]}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                        {s.validFrom && <span className="font-medium">{s.validFrom} → {s.validTo}</span>}
                        <span className="ml-auto">{s.pitches?.length || 0} pitches</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── Pitch detail view for selected schedule ──────────────────
        <div className="space-y-6">
          {/* Schedule meta banner */}
          {selectedSchedule && (
            <div className="bg-subtle/40 border border-border rounded-xl px-5 py-3.5 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-4" />
                <span className="font-medium text-foreground">{academies.find(a => a.id === selectedSchedule.academy_id)?.name ?? "—"}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[0,1,2,3,4,5,6].map(d => (
                  <span key={d}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${selectedSchedule.daysOfWeek?.includes(d) ? "bg-primary/10 text-primary-dark" : "bg-subtle text-muted-foreground/30"}`}>
                    {WEEKDAY_NAMES[d]}
                  </span>
                ))}
              </div>
              {selectedSchedule.validFrom && (
                <span className="text-xs text-muted-foreground">{selectedSchedule.validFrom} → {selectedSchedule.validTo}</span>
              )}
            </div>
          )}

          {!selectedSchedule?.pitches?.length ? (
            <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center">
              <MapPin className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">No pitches scheduled yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a pitch to start assigning students.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {selectedSchedule!.pitches.map(pitch => {
                const assignedIds = Array.from(new Set([...pitch.batsmen, ...pitch.bowlers, ...pitch.extras]));
                const agreedIds: string[] = [], notAgreedIds: string[] = [], pendingIds: string[] = [];
                assignedIds.forEach(id => {
                  const rsvp = pitch.rsvps?.[id];
                  if (rsvp?.status === "attending") agreedIds.push(id);
                  else if (rsvp?.status === "not_attending") notAgreedIds.push(id);
                  else pendingIds.push(id);
                });
                return (
                  <div key={pitch.id} className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                    {/* Pitch header */}
                    <div className="px-5 py-4 border-b border-border bg-subtle/30 flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <h3 className="font-semibold text-base text-foreground">{pitch.name}</h3>
                        <div className="flex items-center flex-wrap gap-3 mt-1 text-xs text-muted-foreground font-medium">
                          <span className="flex items-center gap-1"><Clock className="size-3.5" /> {formatTime(pitch.fromTime)} — {formatTime(pitch.toTime)}</span>
                          {pitch.locationType === "custom" && pitch.locationName && (
                            <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {pitch.locationName}</span>
                          )}
                          {pitch.locationType === "custom" && pitch.latitude && pitch.longitude && (
                            <span className="flex items-center gap-1 text-[10px]">
                              <Navigation className="size-3" />
                              {Number(pitch.latitude).toFixed(4)}, {Number(pitch.longitude).toFixed(4)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleNotifyPitch(pitch, selectedSchedule!)}
                          disabled={notifyingPitchId === pitch.id || assignedIds.length === 0}
                          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-md border border-primary text-primary hover:bg-primary/10 transition disabled:opacity-50">
                          {notifyingPitchId === pitch.id ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
                          Notify
                        </button>
                        <button onClick={() => openEditPitch(pitch)} className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-elevated transition">Edit</button>
                        <button onClick={() => handleDeletePitch(pitch.id)} className="text-xs font-medium px-3 py-1.5 rounded-md border border-destructive/20 text-destructive hover:bg-destructive/10 transition">Delete</button>
                      </div>
                    </div>
                    {/* Student roles */}
                    <div className="p-5 grid md:grid-cols-3 gap-6 border-b border-border">
                      <StudentListColumn title="Batsmen" ids={pitch.batsmen} allStudents={students} />
                      <StudentListColumn title="Bowlers" ids={pitch.bowlers} allStudents={students} />
                      <StudentListColumn title="Extras" ids={pitch.extras} allStudents={students} />
                    </div>
                    {/* RSVPs */}
                    <div className="p-5 bg-subtle/20">
                      <div className="flex items-center gap-2 mb-4">
                        <Users className="size-4 text-muted-foreground" />
                        <h4 className="font-semibold text-sm">RSVP Status</h4>
                      </div>
                      <div className="grid md:grid-cols-3 gap-6">
                        <RsvpColumn title="Agreed" tone="success" ids={agreedIds} allStudents={students} pitch={pitch} />
                        <RsvpColumn title="Not Agreed" tone="danger" ids={notAgreedIds} allStudents={students} pitch={pitch} />
                        <RsvpColumn title="Pending" tone="neutral" ids={pendingIds} allStudents={students} pitch={pitch} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}

      {/* 3-STEP SCHEDULE CREATION / EDIT WIZARD MODAL */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-xl animate-fade-up overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display font-semibold text-lg text-foreground">
                  {scheduleModalStep === 1 && (editingScheduleId ? "Edit Schedule Details" : "New Schedule")}
                  {scheduleModalStep === 2 && "Add Pitches"}
                  {scheduleModalStep === 3 && "Review & Create"}
                </h3>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="size-8 grid place-items-center rounded-xl bg-subtle/80 hover:bg-subtle text-muted-foreground hover:text-foreground transition">
                <X className="size-4" />
              </button>
            </div>

            {/* 3-Dot Progress Indicator */}
            <div className="flex items-center justify-center gap-2 py-3 bg-subtle/20 border-b border-border/50 shrink-0">
              <span className={`size-2.5 rounded-full transition-all ${scheduleModalStep >= 1 ? "bg-[#a6724a]" : "bg-muted-foreground/30"}`} />
              <span className={`size-2.5 rounded-full transition-all ${scheduleModalStep >= 2 ? "bg-[#a6724a]" : "bg-muted-foreground/30"}`} />
              <span className={`size-2.5 rounded-full transition-all ${scheduleModalStep >= 3 ? "bg-[#a6724a]" : "bg-muted-foreground/30"}`} />
            </div>

            {/* Body Steps */}
            <div className="p-6 flex-1 overflow-y-auto space-y-5">

              {/* STEP 1: SCHEDULE DETAILS */}
              {scheduleModalStep === 1 && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-foreground">Schedule Mode</label>
                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => setSIsTournament(false)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${!sIsTournament ? "bg-primary/15 border-primary/50 text-primary-dark shadow-xs" : "border-border text-muted-foreground hover:bg-subtle"}`}>
                        Regular Practice
                      </button>
                      <button type="button" onClick={() => setSIsTournament(true)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${sIsTournament ? "bg-amber-500/15 border-amber-500 text-amber-700 shadow-xs" : "border-border text-muted-foreground hover:bg-subtle"}`}>
                        🏆 Tournament Event
                      </button>
                    </div>
                    {sIsTournament && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] mb-2 font-medium">
                        🏆 Tournament events lift single-academy restrictions, allowing you to select squad players across any branch!
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-foreground">Schedule name *</label>
                    <input required autoFocus value={sName} onChange={e => setSName(e.target.value)}
                      placeholder={sIsTournament ? "e.g. Inter-Academy League" : "e.g. Morning Batch A"} className="input-premium w-full" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-foreground">{sIsTournament ? "Host / Primary Academy *" : "Academy *"}</label>
                    <select required value={sAcademyId} onChange={e => setSAcademyId(e.target.value)} className="input-premium w-full">
                      <option value="">Select an academy…</option>
                      {academies.map(a => <option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-2 text-foreground">Days of week *</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_FULL.map((name, idx) => {
                        const active = sDaysOfWeek.includes(idx);
                        return (
                          <button key={idx} type="button"
                            onClick={() => setSDaysOfWeek(prev => active ? prev.filter(d => d !== idx) : [...prev, idx].sort())}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active ? "bg-primary/15 border-primary/40 text-primary-dark" : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"}`}>
                            {WEEKDAY_NAMES[idx]}
                          </button>
                        );
                      })}
                    </div>
                    {sDaysOfWeek.length === 0 && <p className="text-[10px] text-muted-foreground mt-1.5">Select at least one day</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 text-foreground">Valid from <span className="font-normal text-muted-foreground">(yyyy-mm-dd)</span> *</label>
                      <input required type="date" value={sValidFrom} onChange={e => setSValidFrom(e.target.value)} className="input-premium w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 text-foreground">Valid to <span className="font-normal text-muted-foreground">(yyyy-mm-dd)</span> *</label>
                      <input required type="date" value={sValidTo} min={sValidFrom || undefined} onChange={e => setSValidTo(e.target.value)} className="input-premium w-full" />
                    </div>
                  </div>
                  {sValidFrom && sValidTo && sValidFrom > sValidTo && (
                    <p className="text-xs text-destructive -mt-2">Valid to must be after valid from</p>
                  )}
                </div>
              )}

              {/* STEP 2: ADD PITCHES */}
              {scheduleModalStep === 2 && (
                <div className="space-y-4 py-2">
                  <button type="button" onClick={openCreatePitch}
                    className="w-full py-3 px-4 rounded-xl border-2 border-[#a6724a] text-[#a6724a] hover:bg-[#a6724a]/10 font-semibold text-sm transition flex items-center justify-center gap-2">
                    <Plus className="size-4" /> Add Pitch
                  </button>

                  {draftPitches.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground bg-subtle/20 border border-dashed border-border rounded-xl">
                      No pitches added yet. Click "+ Add Pitch" to configure pitches for this schedule.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {draftPitches.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-subtle/20">
                          <div>
                            <div className="text-xs font-bold text-foreground">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {formatTime(p.fromTime)} - {formatTime(p.toTime)} · {p.batsmen.length + p.bowlers.length + p.extras.length} athletes assigned
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openEditPitch(p)} className="p-1.5 rounded-md hover:bg-subtle text-muted-foreground hover:text-foreground">
                              <Pencil className="size-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDeletePitch(p.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: REVIEW & CREATE */}
              {scheduleModalStep === 3 && (
                <div className="space-y-4 bg-subtle/30 border border-border/70 rounded-xl p-5">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Schedule Name</div>
                    <div className="text-sm font-bold text-foreground mt-0.5">{sName}</div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Academy</div>
                    <div className="text-sm font-semibold text-foreground mt-0.5">
                      {academies.find(a => a.id === sAcademyId)?.name ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Days</div>
                    <div className="text-sm font-medium text-foreground mt-0.5">
                      {sDaysOfWeek.map(d => WEEKDAY_FULL[d]).join(", ")}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Date Range</div>
                    <div className="text-sm font-medium text-foreground mt-0.5">
                      {sValidFrom} → {sValidTo}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Estimated Sessions</div>
                    <div className="text-sm font-medium text-foreground mt-0.5">
                      {calculateEstimatedSessions(sValidFrom, sValidTo, sDaysOfWeek)} sessions
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-1">Pitches ({draftPitches.length})</div>
                    {draftPitches.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">No pitches configured</div>
                    ) : (
                      <div className="space-y-1">
                        {draftPitches.map(p => (
                          <div key={p.id} className="text-xs bg-surface border border-border px-3 py-2 rounded-lg flex items-center justify-between">
                            <span className="font-semibold">{p.name}</span>
                            <span className="text-muted-foreground">{formatTime(p.fromTime)} - {formatTime(p.toTime)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Footer Navigation Buttons */}
            <div className="px-6 py-4 border-t border-border bg-subtle/30 flex items-center justify-between gap-3 shrink-0">
              {scheduleModalStep === 1 ? (
                <button type="button" onClick={() => setShowScheduleModal(false)}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-subtle text-foreground hover:bg-subtle/80 transition">
                  Cancel
                </button>
              ) : (
                <button type="button" onClick={() => setScheduleModalStep(prev => (prev - 1) as 1|2)}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-subtle text-foreground hover:bg-subtle/80 transition">
                  ← Back
                </button>
              )}

              {scheduleModalStep === 1 && (
                <button type="button" disabled={!step1Valid} onClick={() => setScheduleModalStep(2)}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#a6724a] text-white hover:bg-[#8b5e3c] disabled:opacity-50 transition">
                  Next: Add Pitches →
                </button>
              )}

              {scheduleModalStep === 2 && (
                <button type="button" onClick={() => setScheduleModalStep(3)}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#a6724a] text-white hover:bg-[#8b5e3c] transition">
                  Review →
                </button>
              )}

              {scheduleModalStep === 3 && (
                <button type="button" disabled={savingSchedule} onClick={handleFinalCreateSchedule}
                  className="px-8 py-2.5 rounded-xl text-sm font-semibold bg-[#a6724a] text-white hover:bg-[#8b5e3c] disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card">
                  {savingSchedule ? <Loader2 className="size-4 animate-spin" /> : null}
                  {savingSchedule ? "Creating…" : "Create Schedule ✓"}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Overlap Warning Modal */}
      {overlapWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-warning/10 grid place-items-center mx-auto mb-4"><AlertTriangle className="size-5 text-warning" /></div>
            <h3 className="font-semibold text-base">Timing Conflict</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5 leading-relaxed">This timing is already occupied by another pitch. Do you still want to keep the timings same?</p>
            <div className="flex gap-3">
              <button onClick={() => setOverlapWarning(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">No</button>
              <button onClick={() => overlapWarning()} className="flex-1 px-4 py-2 text-sm font-semibold bg-warning text-warning-foreground rounded-xl hover:bg-warning/90 transition shadow-card">Yes, Save anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Schedule Modal */}
      {deleteScheduleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4"><Trash2 className="size-5 text-destructive" /></div>
            <h3 className="font-semibold text-base">Delete schedule?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">This action cannot be undone. All pitches in this schedule will be lost.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteScheduleId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleDeleteSchedule(deleteScheduleId)} className="flex-1 px-4 py-2 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Pitch Create / Edit Modal (Overlayed Sub-Modal) */}
      {showPitchModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-4xl my-8 animate-fade-up flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="font-display font-semibold">{editingPitchId ? "Edit Pitch Details" : "Add New Pitch"}</h3>
              <button onClick={() => setShowPitchModal(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground hover:text-foreground transition"><X className="size-4" /></button>
            </div>

            <form id="pitch-form" onSubmit={handleSavePitchAttempt} className="p-6 flex-1 overflow-y-auto space-y-8">
              {/* Basic info */}
              <div className="grid md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Pitch name *</label>
                  <input required autoFocus value={pitchForm.name} onChange={e => setPitchForm({...pitchForm, name: e.target.value})}
                    placeholder="e.g. Main Pitch 1" className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">From time <span className="font-normal text-muted-foreground">(hh:mm)</span></label>
                  <input type="time" value={pitchForm.fromTime} onChange={e => setPitchForm({...pitchForm, fromTime: e.target.value})} className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">To time <span className="font-normal text-muted-foreground">(hh:mm)</span></label>
                  <input type="time" value={pitchForm.toTime} onChange={e => setPitchForm({...pitchForm, toTime: e.target.value})} className="input-premium" />
                </div>
              </div>

              {/* Location */}
              <div className="space-y-3 pt-4 border-t border-border">
                <label className="block text-xs font-semibold">Location</label>
                <div className="flex gap-3">
                  {(["existing","custom"] as const).map(type => (
                    <button key={type} type="button"
                      onClick={() => setPitchForm({...pitchForm, locationType: type})}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${pitchForm.locationType === type ? "bg-primary/10 border-primary/40 text-primary-dark" : "border-border text-muted-foreground hover:border-border-strong"}`}>
                      {type === "existing" ? "Existing Ground" : "Custom"}
                    </button>
                  ))}
                </div>

                {pitchForm.locationType === "existing" ? (
                  <div className="rounded-xl border border-border bg-subtle/20 p-4 text-center">
                    <MapPin className="size-5 text-muted-foreground mx-auto mb-1.5" />
                    <p className="text-xs text-muted-foreground font-medium">No grounds available</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Use "Custom" to enter a location manually.</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="md:col-span-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold">Location name</label>
                        <button
                          type="button"
                          onClick={handleLocateMeForPitchForm}
                          className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-dark font-semibold text-[11px] transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Navigation className="size-3" />
                          <span>Locate Me</span>
                        </button>
                      </div>
                      <input value={pitchForm.locationName ?? ""} onChange={e => setPitchForm({...pitchForm, locationName: e.target.value})}
                        placeholder="e.g. DY Patil Stadium" className="input-premium w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Latitude</label>
                      <input type="number" step="any" value={pitchForm.latitude ?? ""} onChange={e => setPitchForm({...pitchForm, latitude: e.target.value})}
                        placeholder="19.0760" className="input-premium w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Longitude</label>
                      <input type="number" step="any" value={pitchForm.longitude ?? ""} onChange={e => setPitchForm({...pitchForm, longitude: e.target.value})}
                        placeholder="72.8777" className="input-premium w-full" />
                    </div>
                  </div>
                )}
              </div>

              {/* Assign athletes (scoped to selected schedule academy or global for tournaments) */}
              {(() => {
                const pitchAcademyStudents = (sIsTournament || (editingScheduleId && schedules.find(s => s.id === editingScheduleId && (s as any).template_type === "tournament")))
                  ? students
                  : students.filter(st =>
                      !targetAcademyId ||
                      String(st.academy_id) === String(targetAcademyId) ||
                      String((st as any).academy_id) === String(targetAcademyId)
                    );
                return (
                  <div className="grid md:grid-cols-3 gap-6 pt-4 border-t border-border">
                    <StudentMultiSelect label="Batsmen" selectedIds={pitchForm.batsmen}
                      unavailableIds={[...pitchForm.bowlers, ...pitchForm.extras]}
                      onChange={ids => updatePitchRole("batsmen", ids)} allStudents={pitchAcademyStudents.filter(isBatsmanColumnEligible)} />
                    <StudentMultiSelect label="Bowlers" selectedIds={pitchForm.bowlers}
                      unavailableIds={[...pitchForm.batsmen, ...pitchForm.extras]}
                      onChange={ids => updatePitchRole("bowlers", ids)} allStudents={pitchAcademyStudents.filter(isBowlerColumnEligible)} />
                    <StudentMultiSelect label="Extras" selectedIds={pitchForm.extras}
                      unavailableIds={[...pitchForm.batsmen, ...pitchForm.bowlers]}
                      onChange={ids => updatePitchRole("extras", ids)} allStudents={pitchAcademyStudents.filter(isExtraColumnEligible)} />
                  </div>
                );
              })()}
            </form>

            <div className="px-6 py-4 border-t border-border bg-subtle/30 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowPitchModal(false)}
                className="px-6 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button type="submit" form="pitch-form" disabled={!pitchForm.name.trim()}
                className="px-8 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card">
                {editingPitchId ? "Update Pitch" : "Save Pitch"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Date Schedule Attendance Modal Popup (Tabular UI) ─────────────────────────── */}
      {activeDateModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h2 className="font-display font-bold text-lg text-foreground">{activeDateModal.schedule.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>Date: <strong className="text-foreground">{activeDateModal.dateKey}</strong></span>
                  <span>·</span>
                  <span>Attendance & RSVP Breakdown</span>
                </p>
              </div>
              <button onClick={() => setActiveDateModal(null)} className="size-8 rounded-lg hover:bg-subtle flex items-center justify-center text-muted-foreground hover:text-foreground transition">
                <X className="size-4" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto">
              <button
                onClick={() => setModalTab("attending")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  modalTab === "attending"
                    ? "bg-success/15 text-success border border-success/30 shadow-xs"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                }`}
              >
                <Check className="size-3.5" />
                <span>Attending</span>
                <span className="px-1.5 py-0.2 rounded-full bg-success/20 text-success text-[10px] tabular font-bold">
                  {modalDetails.attending.length}
                </span>
              </button>

              <button
                onClick={() => setModalTab("not_attending")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  modalTab === "not_attending"
                    ? "bg-warning/15 text-warning border border-warning/30 shadow-xs"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                }`}
              >
                <AlertTriangle className="size-3.5" />
                <span>Declined</span>
                <span className="px-1.5 py-0.2 rounded-full bg-warning/20 text-warning text-[10px] tabular font-bold">
                  {modalDetails.notAttending.length}
                </span>
              </button>

              <button
                onClick={() => setModalTab("present")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  modalTab === "present"
                    ? "bg-primary/15 text-primary-dark border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                }`}
              >
                <MapPin className="size-3.5" />
                <span>Present</span>
                <span className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary-dark text-[10px] tabular font-bold">
                  {modalDetails.present.length}
                </span>
              </button>

              <div className="h-4 w-px bg-border my-auto mx-1 shrink-0" />

              <button
                onClick={() => setModalTab("students")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  modalTab === "students"
                    ? "bg-accent text-accent-foreground border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                }`}
              >
                <Users className="size-3.5" />
                <span>Manage Students</span>
              </button>

              <button
                onClick={() => setModalTab("location")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  modalTab === "location"
                    ? "bg-accent text-accent-foreground border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                }`}
              >
                <Navigation className="size-3.5" />
                <span>Change Location</span>
              </button>

              <button
                onClick={() => setModalTab("cancel")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  modalTab === "cancel"
                    ? "bg-destructive/15 text-destructive border border-destructive/30 shadow-xs"
                    : "text-muted-foreground hover:bg-subtle hover:text-foreground"
                }`}
              >
                <X className="size-3.5" />
                <span>Cancel Class</span>
              </button>
            </div>

            {/* Tab Content Table & Override Forms */}
            {modalDetails.loading ? (
              <div className="py-12 grid place-items-center">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground mt-2">Loading attendance details…</p>
              </div>
            ) : (
              <div className="min-h-[220px] max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-subtle/20 p-2">
                {modalTab === "attending" && (
                  modalDetails.attending.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                      No RSVPs marked as attending yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-subtle border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider sticky top-0">
                        <tr>
                          <th className="py-2.5 px-4">Athlete Name</th>
                          <th className="py-2.5 px-4">RSVP Status</th>
                          <th className="py-2.5 px-4 text-right">Verification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {modalDetails.attending.map((a) => (
                          <tr key={a.id} className="hover:bg-elevated/50 transition">
                            <td className="py-2.5 px-4 font-semibold text-foreground">{a.name}</td>
                            <td className="py-2.5 px-4">
                              <span className="px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold text-[10px] inline-flex items-center gap-1">
                                <span className="size-1.5 rounded-full bg-success" /> Attending
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right text-muted-foreground">Confirmed RSVP</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {modalTab === "not_attending" && (
                  modalDetails.notAttending.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                      No athletes declined this session.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-subtle border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider sticky top-0">
                        <tr>
                          <th className="py-2.5 px-4">Athlete Name</th>
                          <th className="py-2.5 px-4">RSVP Status</th>
                          <th className="py-2.5 px-4">Reason for Absence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {modalDetails.notAttending.map((a) => (
                          <tr key={a.id} className="hover:bg-elevated/50 transition">
                            <td className="py-2.5 px-4 font-semibold text-foreground">{a.name}</td>
                            <td className="py-2.5 px-4">
                              <span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning font-semibold text-[10px] inline-flex items-center gap-1">
                                <span className="size-1.5 rounded-full bg-warning" /> Declined
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="px-2.5 py-1 rounded-md bg-subtle text-muted-foreground italic text-[11px]">
                                "{a.reason || "No reason specified"}"
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {modalTab === "present" && (
                  modalDetails.present.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                      No geotag check-ins logged for this date yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-subtle border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider sticky top-0">
                        <tr>
                          <th className="py-2.5 px-4">Athlete Name</th>
                          <th className="py-2.5 px-4">Geotag Attendance</th>
                          <th className="py-2.5 px-4 text-right">Check-in Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {modalDetails.present.map((a) => (
                          <tr key={a.id} className="hover:bg-elevated/50 transition">
                            <td className="py-2.5 px-4 font-semibold text-foreground">{a.name}</td>
                            <td className="py-2.5 px-4">
                              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary-dark font-semibold text-[10px] inline-flex items-center gap-1">
                                <span className="size-1.5 rounded-full bg-primary" /> Present (Verified)
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right text-muted-foreground font-mono text-[11px]">
                              {a.checkInTime ? `${a.checkInTime} · Geotagged` : "Logged"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {modalTab === "students" && (
                  <div className="space-y-4 p-2">
                    <p className="text-xs text-muted-foreground">
                      Assign students of <strong>{academies.find(a => String(a.id) === String(activeDateModal.schedule.academy_id))?.name || "this academy"}</strong> to specific pitches for <strong>{activeDateModal.dateKey}</strong>.
                    </p>

                    {(activeDateModal.schedule.pitches ?? []).length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-xl">No pitches configured for this schedule.</div>
                    ) : (
                      (activeDateModal.schedule.pitches ?? []).map(pitch => {
                        const curStud = overrideStudents[pitch.id] || { batsmen: pitch.batsmen, bowlers: pitch.bowlers, extras: pitch.extras };
                        const academyScopedStudents = students.filter(st =>
                          !activeDateModal.schedule.academy_id ||
                          String(st.academy_id) === String(activeDateModal.schedule.academy_id) ||
                          String((st as any).academy_id) === String(activeDateModal.schedule.academy_id)
                        );

                        return (
                          <div key={pitch.id} className="border border-border rounded-xl p-4 bg-surface space-y-3">
                            <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
                              <span>Pitch: {pitch.name}</span>
                              <span className="text-xs font-normal text-muted-foreground">{formatTime(pitch.fromTime)} - {formatTime(pitch.toTime)}</span>
                            </h4>
                            <div className="grid md:grid-cols-3 gap-4">
                              <StudentMultiSelect
                                label="Batsmen"
                                selectedIds={curStud.batsmen}
                                unavailableIds={[...curStud.bowlers, ...curStud.extras]}
                                onChange={ids => setOverrideStudents(prev => ({
                                  ...prev,
                                  [pitch.id]: { ...curStud, batsmen: ids }
                                }))}
                                allStudents={academyScopedStudents.filter(isBatsmanColumnEligible)}
                              />
                              <StudentMultiSelect
                                label="Bowlers"
                                selectedIds={curStud.bowlers}
                                unavailableIds={[...curStud.batsmen, ...curStud.extras]}
                                onChange={ids => setOverrideStudents(prev => ({
                                  ...prev,
                                  [pitch.id]: { ...curStud, bowlers: ids }
                                }))}
                                allStudents={academyScopedStudents.filter(isBowlerColumnEligible)}
                              />
                              <StudentMultiSelect
                                label="Extras"
                                selectedIds={curStud.extras}
                                unavailableIds={[...curStud.batsmen, ...curStud.bowlers]}
                                onChange={ids => setOverrideStudents(prev => ({
                                  ...prev,
                                  [pitch.id]: { ...curStud, extras: ids }
                                }))}
                                allStudents={academyScopedStudents.filter(isExtraColumnEligible)}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSaveOverrideStudents}
                        disabled={savingOverrides}
                        className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition shadow-card flex items-center gap-2"
                      >
                        {savingOverrides ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        <span>Save Today's Student Assignments</span>
                      </button>
                    </div>
                  </div>
                )}

                {modalTab === "location" && (
                  <div className="space-y-4 p-2">
                    <p className="text-xs text-muted-foreground">
                      Change the practice location and coordinates for <strong>{activeDateModal.dateKey}</strong>. This change will be notified to all assigned athletes.
                    </p>

                    {(activeDateModal.schedule.pitches ?? []).map(pitch => (
                      <div key={pitch.id} className="border border-border rounded-xl p-4 bg-surface space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-foreground">
                            Pitch: {pitch.name} ({formatTime(pitch.fromTime)} - {formatTime(pitch.toTime)})
                          </label>
                          <button
                            type="button"
                            onClick={() => handleLocateMe(pitch.id)}
                            className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-dark font-semibold text-[11px] transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <Navigation className="size-3" />
                            <span>Locate Me</span>
                          </button>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Location Name</label>
                          <input
                            type="text"
                            value={overrideLocation[pitch.id] ?? ""}
                            onChange={e => setOverrideLocation({ ...overrideLocation, [pitch.id]: e.target.value })}
                            placeholder="e.g. Ground 2, Main Turf / DY Patil Stadium"
                            className="input-premium w-full text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Latitude</label>
                            <input
                              type="number"
                              step="any"
                              value={overrideLat[pitch.id] ?? ""}
                              onChange={e => setOverrideLat({ ...overrideLat, [pitch.id]: e.target.value })}
                              placeholder="19.0760"
                              className="input-premium w-full text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Longitude</label>
                            <input
                              type="number"
                              step="any"
                              value={overrideLng[pitch.id] ?? ""}
                              onChange={e => setOverrideLng({ ...overrideLng, [pitch.id]: e.target.value })}
                              placeholder="72.8777"
                              className="input-premium w-full text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSaveOverrideLocation}
                        disabled={savingOverrides}
                        className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition shadow-card flex items-center gap-2"
                      >
                        {savingOverrides ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}
                        <span>Save & Notify Location Change</span>
                      </button>
                    </div>
                  </div>
                )}

                {modalTab === "cancel" && (
                  <div className="space-y-4 py-8 text-center">
                    <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto text-destructive">
                      <AlertTriangle className="size-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-foreground">Cancel Class for {activeDateModal.dateKey}?</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                        Cancelling <strong>"{activeDateModal.schedule.name}"</strong> will remove it from the athletes' schedules for today and send an automated cancellation notification.
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-center gap-3">
                      <button
                        onClick={() => setModalTab("attending")}
                        className="px-4 py-2 rounded-xl border border-border text-xs font-medium hover:bg-subtle transition"
                      >
                        Go Back
                      </button>
                      <button
                        onClick={handleCancelSingleClass}
                        disabled={savingOverrides}
                        className="px-5 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold text-xs hover:bg-destructive/90 transition shadow-card flex items-center gap-2"
                      >
                        {savingOverrides ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                        <span>Cancel This Class</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FOOTER: Summary Bar */}
            <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Session Attendance Summary</span>
              <span className="font-bold text-foreground bg-subtle px-3 py-1 rounded-lg border border-border">
                Present: {modalDetails.present.length} / {modalDetails.totalAssigned} Students
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Calendar month card (superadmin variant) ──────────────────────────
function SuperAdminMonthCard({
  year, month, classDateKeys, cancelledDateKeys, todayKey, selectedDay, onSelectDay,
}: {
  year: number; month: number;
  classDateKeys: Set<string>;
  cancelledDateKeys: Set<string>;
  todayKey: string;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const cells: { day: number; type: "cancelled"|"class"|"regular"|"empty"; tooltip?: string }[] = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: 0, type: "empty" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = formatDateKey(year, month, d);
    const isCancelled = cancelledDateKeys.has(dateKey);
    const isClass = classDateKeys.has(dateKey);
    if (isCancelled) cells.push({ day: d, type: "cancelled", tooltip: "All classes cancelled" });
    else if (isClass) cells.push({ day: d, type: "class", tooltip: "Scheduled class" });
    else cells.push({ day: d, type: "regular" });
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5 text-center">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-[11px] font-bold text-muted-foreground/80 py-1 select-none uppercase tracking-wider">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((cell, idx) => {
          if (cell.type === "empty") return <div key={idx} className="h-8 sm:h-9 md:h-10" />;
          const dateKey = formatDateKey(year, month, cell.day);
          const isToday = dateKey === todayKey;
          const isSelected = selectedDay === cell.day;

          let bgStyle: React.CSSProperties = {};
          let textClass = "text-foreground font-semibold";
          let borderClass = "border border-white/10";

          if (cell.type === "cancelled") { 
            bgStyle = { background: "rgba(16, 185, 129, 0.25)" }; 
            borderClass = "border border-emerald-500/40";
            textClass = "text-emerald-300 font-bold"; 
          }
          else if (cell.type === "class") { 
            bgStyle = { background: "rgba(239, 68, 68, 0.25)" }; 
            borderClass = "border border-primary/50";
            textClass = "text-white font-bold"; 
          }
          else { 
            bgStyle = { background: "rgba(255, 255, 255, 0.04)" }; 
            textClass = "text-slate-300 font-medium hover:text-white"; 
          }

          let extra = "hover:scale-105 hover:shadow-xs";
          if (isToday) extra += " ring-2 ring-primary ring-offset-1 ring-offset-background z-10";
          if (isSelected) extra += " ring-2 ring-foreground scale-105 shadow-sm z-10";

          return (
            <button key={idx} onClick={() => onSelectDay(cell.day)}
              title={cell.tooltip ? `${cell.day} — ${cell.tooltip}` : String(cell.day)}
              className={`h-8 sm:h-9 md:h-10 rounded-lg flex items-center justify-center text-xs sm:text-sm font-semibold cursor-pointer transition-all duration-150 ${textClass} ${borderClass} ${extra}`}
              style={bgStyle}>
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────
function StudentListColumn({ title, ids, allStudents }: { title: string; ids: string[]; allStudents: Student[] }) {
  const list = ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm">{title}</h4>
        <span className="text-xs font-medium text-muted-foreground bg-elevated border border-border px-1.5 py-0.5 rounded-md">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="text-xs text-muted-foreground p-3 border border-dashed border-border rounded-lg text-center bg-subtle/20">None assigned</div>
      ) : (
        <ul className="space-y-1.5">
          {list.map(s => <li key={s.id} className="text-xs px-2.5 py-2 bg-elevated border border-border rounded-lg truncate">{s.full_name}</li>)}
        </ul>
      )}
    </div>
  );
}

function RsvpColumn({ title, tone, ids, allStudents, pitch }: {
  title: string; tone: "success"|"danger"|"neutral"; ids: string[]; allStudents: Student[]; pitch: Pitch;
}) {
  const list = ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[];
  const toneClass = tone === "success" ? "text-success bg-success/10 border-success/20"
    : tone === "danger" ? "text-destructive bg-destructive/10 border-destructive/20"
    : "text-muted-foreground bg-subtle/50 border-border";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">{title}</h4>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${toneClass}`}>{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2 text-center">—</div>
      ) : (
        <ul className="space-y-2">
          {list.map(s => {
            const reason = pitch.rsvps?.[s.id]?.reason;
            return (
              <li key={s.id} className="text-xs bg-surface border border-border rounded-lg p-2.5">
                <div className="font-medium">{s.full_name}</div>
                {reason && <div className="text-[11px] text-muted-foreground mt-1.5 bg-subtle p-1.5 rounded-md italic">"{reason}"</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StudentMultiSelect({ label, selectedIds, unavailableIds = [], onChange, allStudents }: {
  label: string; selectedIds: string[]; unavailableIds?: string[]; onChange: (ids: string[]) => void; allStudents: Student[];
}) {
  const [search, setSearch] = useState("");
  const unavailableSet = useMemo(() => new Set(unavailableIds), [unavailableIds]);

  const filtered = useMemo(() => {
    return allStudents.filter(s => {
      const matchesSearch = s.full_name.toLowerCase().includes(search.toLowerCase());
      const isSelected = selectedIds.includes(s.id);
      const isUnavailable = unavailableSet.has(s.id);
      return matchesSearch && !isSelected && !isUnavailable;
    });
  }, [allStudents, search, selectedIds, unavailableSet]);

  const selectedStudents = useMemo(() =>
    selectedIds.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[],
    [selectedIds, allStudents]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(i => i !== id));
    else if (!unavailableSet.has(id)) onChange([...selectedIds, id]);
  }

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-semibold">{label}</label>
        <span className="text-xs font-medium bg-primary/10 text-primary-dark px-2 py-0.5 rounded-full">{selectedIds.length} selected</span>
      </div>

      <div className="relative mb-2.5 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`}
          className="w-full bg-surface border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </div>

      {selectedStudents.length > 0 && (
        <div className="mb-2.5 space-y-1 max-h-[110px] overflow-y-auto pr-1 custom-scrollbar shrink-0">
          {selectedStudents.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-primary/5 border border-primary/20 px-3 py-1.5 rounded-lg text-sm">
              <div className="truncate pr-2 min-w-0">
                <span className="font-medium truncate block text-xs">{s.full_name}</span>
                {s.primary_discipline && (
                  <span className="text-[10px] text-muted-foreground block">{s.primary_discipline}</span>
                )}
              </div>
              <button type="button" onClick={() => toggle(s.id)} className="text-muted-foreground hover:text-destructive transition shrink-0"><X className="size-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto border border-border rounded-xl bg-subtle/10 custom-scrollbar p-1.5">
        {filtered.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground p-4">No matching students</div>
        ) : (
          <div className="space-y-1">
            {filtered.map(s => (
              <button key={s.id} type="button" onClick={() => toggle(s.id)}
                className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-elevated transition cursor-pointer">
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-foreground text-xs truncate">{s.full_name}</div>
                  {(s.primary_discipline || s.playing_role) && (
                    <div className="text-[10px] text-muted-foreground truncate">{s.primary_discipline || s.playing_role}</div>
                  )}
                </div>
                <Plus className="size-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
