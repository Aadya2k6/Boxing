import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import {
  Plus, X, Loader2, Check, ClipboardList, Pencil, Trash2,
  ChevronLeft, ChevronRight, Search, Clock, Users, Bell,
  AlertTriangle, MapPin, Sparkles, CalendarDays, Navigation, Swords
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/scheduling")({ component: AdminSchedulingPage });

// ── Calendar helpers ────────────────────────────────────────────────────
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
    if (daysOfWeek.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ── Types ───────────────────────────────────────────────────────────────
interface Academy {
  id: string;
  name: string;
  city?: string;
}

interface Ring {
  id: string;
  name: string;
  fromTime: string;
  toTime: string;
  locationName?: string;
  latitude?: number | string;
  longitude?: number | string;
  age_category_id?: string | null;
  weight_category_id?: string | null;
  assignedBoxerIds: string[];
  rsvps?: { [boxerId: string]: { status: "attending" | "not_attending"; reason?: string } };
}

interface Schedule {
  id: string;
  name: string;
  academy_id: string;
  daysOfWeek: number[];
  validFrom: string;
  validTo: string;
  createdAt: string;
  isTournament: boolean;
  rings: Ring[];
}

interface Boxer {
  id: string;
  full_name: string;
  user_id: string;
  academy_id?: string;
  is_suspended?: boolean;
  age_category_id?: string | null;
  weight_category_id?: string | null;
}

interface AgeCategory {
  id: string;
  name: string;
  min_age: number;
  max_age?: number;
}

interface WeightCategory {
  id: string;
  name: string;
  age_category_id: string;
  min_kg: number;
  max_kg?: number;
}

interface Bout {
  id: string;
  bout_number: number;
  status: string;
  current_round: number;
  round_count: number;
  boxer_red_id: string;
  boxer_blue_id: string;
  ring_instance_id: string;
  age_category_id?: string;
  weight_category_id?: string;
  bout_type?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function checkOverlap(f1: string, t1: string, f2: string, t2: string) {
  return f1 < t2 && f2 < t1;
}

function parseArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {}
  }
  return [];
}

function isScheduleDay(schedule: Schedule, dateKey: string): boolean {
  if (!schedule.validFrom || !schedule.validTo || !schedule.daysOfWeek?.length) return false;
  const vFrom = String(schedule.validFrom).split("T")[0];
  const vTo = String(schedule.validTo).split("T")[0];
  if (dateKey < vFrom || dateKey > vTo) return false;
  const parts = dateKey.split("-");
  if (parts.length !== 3) return false;
  const weekday = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getDay();
  return schedule.daysOfWeek.includes(weekday);
}

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const d = new Date();
  d.setHours(parseInt(h, 10)); d.setMinutes(parseInt(m, 10));
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

// ── Main component ──────────────────────────────────────────────────────
function AdminSchedulingPage() {
  const { user, profile } = useAuth();
  
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [selectedAcademyFilter, setSelectedAcademyFilter] = useState("all");

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [boxers, setBoxers] = useState<Boxer[]>([]);
  const [dbInstances, setDbInstances] = useState<any[]>([]);
  const [dbRingOverrides, setDbRingOverrides] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [leaveApplications, setLeaveApplications] = useState<any[]>([]);

  // New Categories and Bouts State
  const [ageCategories, setAgeCategories] = useState<AgeCategory[]>([]);
  const [weightCategories, setWeightCategories] = useState<WeightCategory[]>([]);
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [coaches, setCoaches] = useState<{id: string; email: string}[]>([]);
  const [judges, setJudges] = useState<{id: string; full_name: string}[]>([]);
  const [boutJudgeAssignments, setBoutJudgeAssignments] = useState<any[]>([]);

  // Bout Modal
  const [showBoutModal, setShowBoutModal] = useState(false);
  const [savingBout, setSavingBout] = useState(false);
  const [boutForm, setBoutForm] = useState({
    bout_type: "training",
    age_category_id: "",
    weight_category_id: "",
    boxer_red_id: "",
    boxer_blue_id: "",
    round_count: 3,
    round_duration_sec: 180,
    rest_time_sec: 60,
    judge_count: 3,
    coach_id: "",
  });

  // Judge Assignment State
  const [judgeAssignBoutId, setJudgeAssignBoutId] = useState<string | null>(null);
  const [selectedJudgeIds, setSelectedJudgeIds] = useState<string[]>([]);

  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [cancellingAllDay, setCancellingAllDay] = useState(false);

  // Calendar state
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

  // 3-Step Schedule Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleModalStep, setScheduleModalStep] = useState<1 | 2 | 3>(1);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Schedule draft
  const [sName, setSName] = useState("");
  const [sAcademyId, setSAcademyId] = useState("");
  const [sIsTournament, setSIsTournament] = useState(false);
  const [sDaysOfWeek, setSDaysOfWeek] = useState<number[]>([]);
  const [sValidFrom, setSValidFrom] = useState("");
  const [sValidTo, setSValidTo] = useState("");
  const [draftRings, setDraftRings] = useState<Ring[]>([]);

  // Ring modal
  const [showRingModal, setShowRingModal] = useState(false);
  const [editingRingId, setEditingRingId] = useState<string | null>(null);
  const [ringForm, setRingForm] = useState<Omit<Ring, "id" | "rsvps">>({
    name: "", fromTime: "06:00", toTime: "08:00",
    locationName: "", latitude: "", longitude: "",
    age_category_id: "", weight_category_id: "",
    assignedBoxerIds: [],
  });
  const [overlapWarning, setOverlapWarning] = useState<(() => void) | null>(null);
  const [notifyingRingId, setNotifyingRingId] = useState<string | null>(null);

  // Day modal
  const [activeDateModal, setActiveDateModal] = useState<{ dateKey: string; schedule: Schedule } | null>(null);
  const [modalTab, setModalTab] = useState<"attending" | "not_attending" | "present" | "boxers" | "location" | "bouts" | "cancel" | "notify">("attending");
  const [overrideLocation, setOverrideLocation] = useState<{ [ringId: string]: string }>({});
  const [overrideLat, setOverrideLat] = useState<{ [ringId: string]: string | number }>({});
  const [overrideLng, setOverrideLng] = useState<{ [ringId: string]: string | number }>({});
  const [overrideBoxers, setOverrideBoxers] = useState<{ [ringId: string]: { assignedBoxerIds: string[] } }>({});
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [modalDetails, setModalDetails] = useState<{
    loading: boolean;
    attending: { id: string; name: string }[];
    notAttending: { id: string; name: string; reason?: string }[];
    present: { id: string; name: string; checkInTime?: string }[];
    totalAssigned: number;
  }>({ loading: true, attending: [], notAttending: [], present: [], totalAssigned: 0 });

  // ── Geolocation ───────────────────────────────────────────────────────
  function locateMe(cb: (lat: number, lng: number) => void) {
    if (!("geolocation" in navigator)) { alert("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(
      p => cb(p.coords.latitude, p.coords.longitude),
      err => alert("Unable to get location: " + err.message)
    );
  }

  // ── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();

    const ch = supabase.channel("sa-class-assigning-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_schedule_templates" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_sessions" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_instances" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_instance_overrides" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "ring_assignment_poll_responses" }, () => loadData(true))
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  async function loadData(isSilent = false) {
    if (!isSilent) setLoading(true);
    try {
      const targetAcademyId = profile?.academy_id;

      let bpQuery = supabase.from("boxer_profiles").select("id, full_name, user_id, academy_id, is_suspended, age_category_id, weight_category_id").order("full_name");
      let tQuery = supabase.from("ring_schedule_templates").select("*").eq("is_active", true);
      let acsQuery = supabase.from("academies").select("id, name, city").order("name");

      if (targetAcademyId) {
        bpQuery = bpQuery.eq("academy_id", targetAcademyId);
        tQuery = tQuery.eq("academy_id", targetAcademyId);
        acsQuery = acsQuery.eq("id", targetAcademyId);
      }

      const [boxersRes, templatesRes, ringsRes, instancesRes, overridesRes, pollsRes, attendanceRes, leavesRes, academiesRes, ageRes, weightRes, boutsRes, coachesRes, judgesRes, assignmentsRes] = await Promise.all([
        bpQuery,
        tQuery,
        supabase.from("ring_sessions").select("*"),
        supabase.from("ring_instances").select("*"),
        supabase.from("ring_instance_overrides").select("*"),
        supabase.from("ring_assignment_polls").select("id, ring_instance_id"),
        supabase.from("attendance").select("*").order("session_date", { ascending: false }),
        supabase.from("leave_applications").select("*, boxer_profiles(full_name)").order("start_date", { ascending: false }),
        acsQuery,
        supabase.from("age_categories").select("*").order("min_age"),
        supabase.from("weight_categories").select("*").order("min_kg"),
        supabase.from("bouts").select("*"),
        supabase.from("profiles").select("id, email").eq("role", "coach"),
        supabase.from("profiles").select("id, full_name").eq("role", "external_judge").eq("is_active", true),
        supabase.from("bout_judge_assignments").select("*")
      ]);

      if (academiesRes.data) setAcademies(academiesRes.data);
      if (ageRes.data) setAgeCategories(ageRes.data);
      if (weightRes.data) setWeightCategories(weightRes.data);
      if (boutsRes.data) setBouts(boutsRes.data);
      if (coachesRes.data) setCoaches(coachesRes.data);
      if (judgesRes.data) setJudges(judgesRes.data);
      if (assignmentsRes.data) setBoutJudgeAssignments(assignmentsRes.data);

      const pollIds = (pollsRes.data ?? []).map((p: any) => p.id);
      const responsesByInstance = new Map<string, Record<string, { status: "attending" | "not_attending"; reason?: string }>>();
      if (pollIds.length > 0) {
        const { data: responses } = await supabase
          .from("ring_assignment_poll_responses")
          .select("poll_id, boxer_profile_id, response, reason")
          .in("poll_id", pollIds);
        
        (pollsRes.data ?? []).forEach((poll: any) => {
          const pr = responsesByInstance.get(poll.ring_instance_id) ?? {};
          (responses ?? []).filter((r: any) => r.poll_id === poll.id).forEach((r: any) => {
            pr[r.boxer_profile_id] = { status: r.response, reason: r.reason ?? undefined };
          });
          responsesByInstance.set(poll.ring_instance_id, pr);
        });
      }

      const dbSchedules: Schedule[] = (templatesRes.data ?? []).map((t: any) => {
        const rawDays = parseArray(t.days_of_week ?? t.daysOfWeek);
        const daysOfWeek = rawDays.map((d: any) => Number(d)).filter((n: number) => !isNaN(n));
        const ringsForTemplate: Ring[] = (ringsRes.data ?? [])
          .filter((r: any) => String(r.template_id) === String(t.id))
          .map((r: any) => ({
            id: r.id,
            name: r.name,
            fromTime: (r.from_time ?? "").slice(0, 5),
            toTime: (r.to_time ?? "").slice(0, 5),
            locationName: r.custom_location ?? "",
            latitude: r.custom_lat ?? "",
            longitude: r.custom_lng ?? "",
            assignedBoxerIds: parseArray(r.assigned_boxer_ids),
            rsvps: {}, 
          }));
        return {
          id: t.id,
          name: t.name,
          academy_id: t.academy_id ?? "",
          daysOfWeek,
          validFrom: String(t.valid_from ?? "").split("T")[0],
          validTo: String(t.valid_to ?? "").split("T")[0],
          createdAt: t.created_at ?? "",
          isTournament: t.template_type === "tournament",
          rings: ringsForTemplate,
        };
      });

      setSchedules(dbSchedules);
      if (boxersRes.data) setBoxers(boxersRes.data as Boxer[]);
      if (instancesRes.data) setDbInstances(instancesRes.data);
      if (overridesRes.data) setDbRingOverrides(overridesRes.data);
      if (attendanceRes.data) setAttendanceRecords(attendanceRes.data);
      if (leavesRes.data) setLeaveApplications(leavesRes.data);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }

  // ── Superadmin Filtering ────────────────────────────────────────────────
  const filteredSchedules = useMemo(() => {
    if (selectedAcademyFilter === "all") return schedules;
    return schedules.filter(s => String(s.academy_id) === String(selectedAcademyFilter));
  }, [schedules, selectedAcademyFilter]);

  const selectedSchedule = schedules.find(s => s.id === selectedScheduleId);
  const targetAcademyId = showScheduleModal ? sAcademyId : selectedSchedule?.academy_id;
  const activeDateModalInstance = activeDateModal ? dbInstances.find((i: any) => String(i.template_id) === String(activeDateModal.schedule.id) && String(i.date).substring(0, 10) === activeDateModal.dateKey) : null;

  const activeBoxers = useMemo(() => {
    const active = boxers.filter(b => !b.is_suspended);
    if (!targetAcademyId) return active;
    return active.filter(b => b.academy_id === targetAcademyId);
  }, [boxers, targetAcademyId]);

  // ── Day modal open ─────────────────────────────────────────────────────
  async function openDateModal(s: Schedule, dateKey: string) {
    setActiveDateModal({ schedule: s, dateKey });
    setModalTab("attending");
    setModalDetails({ loading: true, attending: [], notAttending: [], present: [], totalAssigned: 0 });

    const locMap: Record<string, string> = {};
    const latMap: Record<string, string | number> = {};
    const lngMap: Record<string, string | number> = {};
    const boxersMap: Record<string, { assignedBoxerIds: string[] }> = {};
    const inst = dbInstances.find((i: any) => String(i.template_id) === String(s.id) && String(i.date).substring(0, 10) === dateKey);

    (s.rings ?? []).forEach(r => {
      let over: any = null;
      if (inst) over = dbRingOverrides.find((o: any) => String(o.ring_instance_id) === String(inst.id) && String(o.ring_session_id) === String(r.id));
      locMap[r.id] = over?.location ?? r.locationName ?? "";
      latMap[r.id] = over?.lat ?? r.latitude ?? "";
      lngMap[r.id] = over?.lng ?? r.longitude ?? "";
      boxersMap[r.id] = {
        assignedBoxerIds: over?.assigned_boxer_ids ? parseArray(over.assigned_boxer_ids) : parseArray(r.assignedBoxerIds),
      };
    });
    setOverrideLocation(locMap);
    setOverrideLat(latMap);
    setOverrideLng(lngMap);
    setOverrideBoxers(boxersMap);

    try {
      const [{ data: rawAtt }, { data: polls }] = await Promise.all([
        supabase.from("attendance").select("*"),
        inst 
          ? supabase.from("ring_assignment_polls").select("id").eq("ring_instance_id", inst.id)
          : { data: [] as any[] },
      ]);

      const pollIds = (polls ?? []).map((p: any) => p.id);
      const { data: pollResponses } = pollIds.length > 0
        ? await supabase.from("ring_assignment_poll_responses").select("boxer_profile_id, response, reason").in("poll_id", pollIds)
        : { data: [] as any[] };

      const boxerMap = new Map<string, string>();
      boxers.forEach(b => {
        if (b.id) boxerMap.set(b.id, b.full_name);
        if (b.user_id) boxerMap.set(b.user_id, b.full_name);
      });

      const attending: { id: string; name: string }[] = [];
      const notAttending: { id: string; name: string; reason?: string }[] = [];
      (pollResponses ?? []).forEach((r: any) => {
        const name = boxerMap.get(r.boxer_profile_id) || "Boxer";
        if (r.response === "attending") attending.push({ id: r.boxer_profile_id, name });
        else if (r.response === "not_attending") notAttending.push({ id: r.boxer_profile_id, name, reason: r.reason || "" });
      });

      const dateAtt = (rawAtt ?? []).filter((a: any) => a.session_date && String(a.session_date).substring(0, 10) === dateKey);
      const present: { id: string; name: string; checkInTime?: string }[] = [];
      dateAtt.forEach((a: any) => {
        if (a.status && (String(a.status).toLowerCase() === "present" || String(a.status).toLowerCase() === "attending")) {
          const id = a.boxer_profile_id ? String(a.boxer_profile_id) : "";
          const name = boxerMap.get(id) || "Boxer";
          present.push({ id, name, checkInTime: a.checked_in_at });
        }
      });

      const assignedIds = new Set<string>();
      (s.rings ?? []).forEach(r => {
        const ids = boxersMap[r.id]?.assignedBoxerIds ?? r.assignedBoxerIds;
        ids.forEach((id: string) => assignedIds.add(id));
      });

      setModalDetails({ loading: false, attending, notAttending, present, totalAssigned: assignedIds.size || boxers.filter(b => b.academy_id === s.academy_id).length });
    } catch (err) {
      console.error(err);
      setModalDetails({ loading: false, attending: [], notAttending: [], present: [], totalAssigned: 0 });
    }
  }

  // ── Override saves ─────────────────────────────────────────────────────
  async function handleSaveOverrideBoxers() {
    if (!activeDateModal) return;
    setSavingOverrides(true);
    try {
      const { schedule, dateKey } = activeDateModal;
      let instId = dbInstances.find(i => String(i.template_id) === String(schedule.id) && String(i.date).substring(0, 10) === dateKey)?.id;
      if (!instId) {
        const { data: newInst, error } = await supabase.from("ring_instances").insert({
          template_id: schedule.id, academy_id: schedule.academy_id, date: dateKey, is_cancelled: false,
        }).select("id").single();
        if (error) throw error;
        instId = newInst.id;
      }
      for (const ring of schedule.rings ?? []) {
        const bObj = overrideBoxers[ring.id];
        if (!bObj) continue;
        const existing = dbRingOverrides.find(o => String(o.ring_instance_id) === String(instId) && String(o.ring_session_id) === String(ring.id));
        if (existing) {
          await supabase.from("ring_instance_overrides").update({ assigned_boxer_ids: bObj.assignedBoxerIds }).eq("id", existing.id);
        } else {
          await supabase.from("ring_instance_overrides").insert({ ring_instance_id: instId, ring_session_id: ring.id, assigned_boxer_ids: bObj.assignedBoxerIds, edited_by: user?.id });
        }
        const allIds = bObj.assignedBoxerIds;
        const recipients = Array.from(new Set(allIds.map(id => boxers.find(b => b.id === id)?.user_id).filter(Boolean))) as string[];
        if (recipients.length > 0) {
          await supabase.from("notifications").insert(recipients.map(uid => ({
            recipient_id: uid, type: "schedule_updated",
            title: "Ring Assignment Updated",
            body: `Your ring assignment for ${dateKey} (${ring.name}) has been updated.`,
          })));
        }
      }
      await loadData(true);
      alert("Boxer assignments saved and notifications sent!");
    } catch (err: any) {
      alert(`Error saving assignments: ${err.message || err}`);
    } finally { setSavingOverrides(false); }
  }

  async function handleSaveOverrideLocation() {
    if (!activeDateModal) return;
    setSavingOverrides(true);
    try {
      const { schedule, dateKey } = activeDateModal;
      let instId = dbInstances.find(i => String(i.template_id) === String(schedule.id) && String(i.date).substring(0, 10) === dateKey)?.id;
      if (!instId) {
        const { data: newInst, error } = await supabase.from("ring_instances").insert({
          template_id: schedule.id, academy_id: schedule.academy_id, date: dateKey, is_cancelled: false,
        }).select("id").single();
        if (error) throw error;
        instId = newInst.id;
      }
      for (const ring of schedule.rings ?? []) {
        const newLoc = overrideLocation[ring.id];
        const newLat = overrideLat[ring.id] !== "" && overrideLat[ring.id] !== undefined ? Number(overrideLat[ring.id]) : null;
        const newLng = overrideLng[ring.id] !== "" && overrideLng[ring.id] !== undefined ? Number(overrideLng[ring.id]) : null;
        const existing = dbRingOverrides.find(o => String(o.ring_instance_id) === String(instId) && String(o.ring_session_id) === String(ring.id));
        if (existing) {
          await supabase.from("ring_instance_overrides").update({ location: newLoc, lat: newLat, lng: newLng }).eq("id", existing.id);
        } else {
          await supabase.from("ring_instance_overrides").insert({ ring_instance_id: instId, ring_session_id: ring.id, location: newLoc, lat: newLat, lng: newLng, edited_by: user?.id });
        }
        const bObj = overrideBoxers[ring.id] || { assignedBoxerIds: ring.assignedBoxerIds };
        const allIds = bObj.assignedBoxerIds;
        const recipients = Array.from(new Set(allIds.map(id => boxers.find(b => b.id === id)?.user_id).filter(Boolean))) as string[];
        if (recipients.length > 0) {
          await supabase.from("notifications").insert(recipients.map(uid => ({
            recipient_id: uid, type: "location_changed",
            title: "Ring Location Changed",
            body: `Location for ${ring.name} on ${dateKey} changed to: "${newLoc}".`,
          })));
        }
      }
      await loadData(true);
      alert("Location updated and notifications sent!");
    } catch (err: any) {
      alert(`Error saving location: ${err.message || err}`);
    } finally { setSavingOverrides(false); }
  }

  async function handleCancelSingleClass() {
    if (!activeDateModal) return;
    if (!confirm(`Cancel "${activeDateModal.schedule.name}" on ${activeDateModal.dateKey}?`)) return;
    setSavingOverrides(true);
    try {
      const { schedule, dateKey } = activeDateModal;
      const existing = dbInstances.find(i => String(i.template_id) === String(schedule.id) && String(i.date).substring(0, 10) === dateKey);
      if (existing) {
        await supabase.from("ring_instances").update({ is_cancelled: true, cancel_reason: "Cancelled by Admin" }).eq("id", existing.id);
      } else {
        await supabase.from("ring_instances").insert({ template_id: schedule.id, academy_id: schedule.academy_id, date: dateKey, is_cancelled: true, cancel_reason: "Cancelled by Admin" });
      }
      const assignedIds = new Set<string>();
      (schedule.rings ?? []).forEach(r => r.assignedBoxerIds.forEach(id => assignedIds.add(id)));
      const recipients = Array.from(new Set(
        Array.from(assignedIds).map(id => boxers.find(b => b.id === id)?.user_id).filter(Boolean)
      )) as string[];
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(recipients.map(uid => ({
          recipient_id: uid, type: "class_cancelled",
          title: "Ring Session Cancelled",
          body: `"${schedule.name}" on ${dateKey} has been cancelled.`,
        })));
      }
      await loadData(true);
      setActiveDateModal(null);
      alert("Session cancelled and notifications sent.");
    } catch (err: any) {
      alert(`Error: ${err.message || err}`);
    } finally { setSavingOverrides(false); }
  }

  async function handleToggleCancelAllDay(dateKey: string, cancel: boolean) {
    if (cancel && !confirm(`Cancel ALL ring sessions on ${dateKey}?`)) return;
    setCancellingAllDay(true);
    try {
      const activeSchedules = filteredSchedules.filter(s => isScheduleDay(s, dateKey));
      for (const s of activeSchedules) {
        const existing = dbInstances.find(i => String(i.template_id) === String(s.id) && String(i.date).substring(0, 10) === dateKey);
        if (existing) {
          await supabase.from("ring_instances").update({ is_cancelled: cancel, cancel_reason: cancel ? "Cancelled by Admin" : null }).eq("id", existing.id);
        } else {
          await supabase.from("ring_instances").insert({ template_id: s.id, academy_id: s.academy_id, date: dateKey, is_cancelled: cancel, cancel_reason: cancel ? "Cancelled by Admin" : null });
        }
      }
      if (cancel) {
        const uidSet = new Set<string>();
        boxers.forEach(b => { 
          if (b.user_id && (selectedAcademyFilter === "all" || b.academy_id === selectedAcademyFilter)) uidSet.add(b.user_id); 
        });
        if (uidSet.size > 0) {
          await supabase.from("notifications").insert(Array.from(uidSet).map(uid => ({
            recipient_id: uid, type: "class_cancelled", title: "All Ring Sessions Cancelled",
            body: `All boxing ring sessions on ${dateKey} have been cancelled.`,
          })));
        }
      }
      await loadData(true);
    } catch (err: any) {
      alert(`Failed: ${err.message || err}`);
    } finally { setCancellingAllDay(false); }
  }

  // ── Schedule CRUD ──────────────────────────────────────────────────────
  function openCreateSchedule() {
    setEditingScheduleId(null);
    setSName(""); setSAcademyId(""); setSIsTournament(false); setSDaysOfWeek([]); setSValidFrom(""); setSValidTo("");
    setDraftRings([]);
    setScheduleModalStep(1);
    setShowScheduleModal(true);
  }

  function openEditSchedule(s: Schedule) {
    setEditingScheduleId(s.id);
    setSName(s.name); setSAcademyId(s.academy_id); setSIsTournament(s.isTournament);
    setSDaysOfWeek(s.daysOfWeek ?? []);
    setSValidFrom(s.validFrom ?? ""); setSValidTo(s.validTo ?? "");
    setDraftRings(s.rings ?? []);
    setScheduleModalStep(1);
    setShowScheduleModal(true);
  }

  const step1Valid = Boolean(sName.trim() && sAcademyId && sDaysOfWeek.length > 0 && sValidFrom && sValidTo && sValidFrom <= sValidTo);

  async function handleFinalCreateSchedule() {
    if (!step1Valid) return;
    setSavingSchedule(true);
    try {
      if (editingScheduleId) {
        const { error: tErr } = await supabase.from("ring_schedule_templates").update({
          name: sName.trim(),
          academy_id: sAcademyId,
          template_type: sIsTournament ? "tournament" : "training",
          days_of_week: sDaysOfWeek,
          valid_from: sValidFrom,
          valid_to: sValidTo,
          is_active: true,
        }).eq("id", editingScheduleId);
        if (tErr) throw tErr;
        await supabase.from("ring_sessions").delete().eq("template_id", editingScheduleId);
        if (draftRings.length > 0) {
          const { error: rErr } = await supabase.from("ring_sessions").insert(
            draftRings.map(r => ({
              id: r.id || crypto.randomUUID(),
              template_id: editingScheduleId,
              name: r.name,
              from_time: r.fromTime,
              to_time: r.toTime,
              custom_location: r.locationName || null,
              custom_lat: r.latitude ? Number(r.latitude) : null,
              custom_lng: r.longitude ? Number(r.longitude) : null,
              age_category_id: r.age_category_id || null,
              weight_category_id: r.weight_category_id || null,
              assigned_boxer_ids: r.assignedBoxerIds ?? [],
            }))
          );
          if (rErr) throw rErr;
        }
      } else {
        const newId = crypto.randomUUID();
        const { error: tErr } = await supabase.from("ring_schedule_templates").insert({
          id: newId,
          name: sName.trim(),
          academy_id: sAcademyId,
          template_type: sIsTournament ? "tournament" : "training",
          days_of_week: sDaysOfWeek,
          valid_from: sValidFrom,
          valid_to: sValidTo,
          is_active: true,
          created_by: user?.id,
        });
        if (tErr) throw tErr;
        if (draftRings.length > 0) {
          const { error: rErr } = await supabase.from("ring_sessions").insert(
            draftRings.map(r => ({
              id: r.id || crypto.randomUUID(),
              template_id: newId,
              name: r.name,
              from_time: r.fromTime,
              to_time: r.toTime,
              custom_location: r.locationName || null,
              custom_lat: r.latitude ? Number(r.latitude) : null,
              custom_lng: r.longitude ? Number(r.longitude) : null,
              age_category_id: r.age_category_id || null,
              weight_category_id: r.weight_category_id || null,
              assigned_boxer_ids: r.assignedBoxerIds ?? [],
            }))
          );
          if (rErr) throw rErr;
        }
      }
      await loadData(true);
      setShowScheduleModal(false);
    } catch (err: any) {
      alert(`Error saving schedule: ${err.message || err}`);
    } finally { setSavingSchedule(false); }
  }

  async function handleDeleteSchedule(id: string) {
    try {
      await supabase.from("ring_sessions").delete().eq("template_id", id);
      await supabase.from("ring_schedule_templates").delete().eq("id", id);
      setDeleteScheduleId(null);
      if (selectedScheduleId === id) setSelectedScheduleId(null);
      await loadData(true);
    } catch (err) { console.error(err); }
  }

  // ── Ring actions ───────────────────────────────────────────────────────
  function openCreateRing() {
    setEditingRingId(null);
    setRingForm({ name: "", fromTime: "06:00", toTime: "08:00", locationName: "", latitude: "", longitude: "", age_category_id: "", weight_category_id: "", assignedBoxerIds: [] });
    setShowRingModal(true);
  }

  function openEditRing(ring: Ring) {
    setEditingRingId(ring.id);
    setRingForm({ name: ring.name, fromTime: ring.fromTime, toTime: ring.toTime, locationName: ring.locationName ?? "", latitude: ring.latitude ?? "", longitude: ring.longitude ?? "", age_category_id: ring.age_category_id ?? "", weight_category_id: ring.weight_category_id ?? "", assignedBoxerIds: ring.assignedBoxerIds });
    setShowRingModal(true);
  }

  async function processRingSave() {
    if (!ringForm.name.trim()) return;
    if (showScheduleModal) {
      if (editingRingId) {
        setDraftRings(prev => prev.map(r => r.id === editingRingId ? { ...ringForm, id: editingRingId } : r));
      } else {
        setDraftRings(prev => [...prev, { ...ringForm, id: crypto.randomUUID() }]);
      }
      setShowRingModal(false); setOverlapWarning(null);
      return;
    }
    if (!selectedScheduleId) return;
    try {
      if (editingRingId) {
        const { error } = await supabase.from("ring_sessions").update({
          name: ringForm.name, from_time: ringForm.fromTime, to_time: ringForm.toTime,
          custom_location: ringForm.locationName || null,
          custom_lat: ringForm.latitude ? Number(ringForm.latitude) : null,
          custom_lng: ringForm.longitude ? Number(ringForm.longitude) : null,
          age_category_id: ringForm.age_category_id || null,
          weight_category_id: ringForm.weight_category_id || null,
          assigned_boxer_ids: ringForm.assignedBoxerIds,
        }).eq("id", editingRingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ring_sessions").insert({
          id: crypto.randomUUID(), template_id: selectedScheduleId,
          name: ringForm.name, from_time: ringForm.fromTime, to_time: ringForm.toTime,
          custom_location: ringForm.locationName || null,
          custom_lat: ringForm.latitude ? Number(ringForm.latitude) : null,
          custom_lng: ringForm.longitude ? Number(ringForm.longitude) : null,
          age_category_id: ringForm.age_category_id || null,
          weight_category_id: ringForm.weight_category_id || null,
          assigned_boxer_ids: ringForm.assignedBoxerIds,
        });
        if (error) throw error;
      }
      setShowRingModal(false); setOverlapWarning(null);
      await loadData(true);
    } catch (err: any) {
      alert(`Error saving ring: ${err.message || err}`);
    }
  }

  function handleSaveRingAttempt(e: React.FormEvent) {
    e.preventDefault();
    const curName = ringForm.name.trim().toLowerCase();
    const listToCheck = showScheduleModal ? draftRings : (filteredSchedules.find(s => s.id === selectedScheduleId)?.rings ?? []);
    let hasOverlap = false;
    for (const r of listToCheck) {
      if (editingRingId && r.id === editingRingId) continue;
      if (r.name.trim().toLowerCase() === curName && checkOverlap(ringForm.fromTime, ringForm.toTime, r.fromTime, r.toTime)) {
        hasOverlap = true; break;
      }
    }
    if (hasOverlap) setOverlapWarning(() => processRingSave);
    else processRingSave();
  }

  async function handleDeleteRing(ringId: string) {
    if (showScheduleModal) { setDraftRings(prev => prev.filter(r => r.id !== ringId)); return; }
    try { await supabase.from("ring_sessions").delete().eq("id", ringId); await loadData(true); }
    catch (err) { console.error(err); }
  }

  async function handleNotifyRing(ring: Ring, schedule: Schedule) {
    setNotifyingRingId(ring.id);
    try {
      const todayDateStr = new Date().toISOString().split("T")[0];
      let instId = dbInstances.find(i => String(i.template_id) === String(schedule.id) && String(i.date).substring(0, 10) === todayDateStr)?.id;
      if (!instId) {
        const { data: newInst, error: iErr } = await supabase.from("ring_instances").insert({
          template_id: schedule.id, academy_id: schedule.academy_id, date: todayDateStr, is_cancelled: false,
        }).select("id").single();
        if (iErr) { alert("Failed to generate day instance for notifications"); return; }
        instId = newInst.id;
        await loadData(true);
      }
      
      const { data: poll, error: pollErr } = await supabase.from("ring_assignment_polls").insert({
        ring_instance_id: instId,
        sent_by: user?.id,
      }).select("id").single();
      if (pollErr) { alert("Error sending poll for today."); return; }
      
      const recipients = ring.assignedBoxerIds.map(id => boxers.find(b => b.id === id)?.user_id).filter(Boolean) as string[];
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(recipients.map(uid => ({
          recipient_id: uid, type: "class_assignment_poll",
          title: "Boxing Ring Session RSVP",
          body: `Please confirm attendance for today's session in ${ring.name} at ${formatTime(ring.fromTime)} - ${formatTime(ring.toTime)}.`,
          related_entity_id: poll.id, related_entity_type: "class_assignment_poll",
        })));
      }
      alert("RSVP poll sent to assigned boxers!");
    } finally { setNotifyingRingId(null); }
  }

  // ── Derived calendar data ───────────────────────────────────────────────
  const selectedDateKey = calSelectedDay ? formatDateKey(calYear, calMonth, calSelectedDay) : null;

  const cancelledDateKeys = useMemo(() => {
    const keys = new Set<string>();
    (dbInstances ?? []).forEach((i: any) => { if (i.is_cancelled && i.date) keys.add(String(i.date).substring(0, 10)); });
    return keys;
  }, [dbInstances]);

  const isSelectedDayCancelled = calSelectedDay ? cancelledDateKeys.has(formatDateKey(calYear, calMonth, calSelectedDay)) : false;

  const allClassDateKeys = useMemo(() => {
    const keys = new Set<string>();
    const daysInCal = getDaysInMonth(calYear, calMonth);
    for (let d = 1; d <= daysInCal; d++) {
      const dk = formatDateKey(calYear, calMonth, d);
      if (filteredSchedules.some(s => isScheduleDay(s, dk))) keys.add(dk);
    }
    (attendanceRecords ?? []).forEach((a: any) => { 
      if (a.session_date && (selectedAcademyFilter === "all" || a.academy_id === selectedAcademyFilter)) 
        keys.add(String(a.session_date).substring(0, 10)); 
    });
    return keys;
  }, [calYear, calMonth, filteredSchedules, attendanceRecords, selectedAcademyFilter]);

  const boxerMapById = useMemo(() => {
    const m = new Map<string, Boxer>();
    boxers.forEach(b => { if (b.id) m.set(b.id, b); if (b.user_id) m.set(b.user_id, b); });
    return m;
  }, [boxers]);

  const selectedDaySchedules = useMemo(() => {
    if (!selectedDateKey) return [];
    return filteredSchedules.filter(s => isScheduleDay(s, selectedDateKey)).map(s => ({
      id: s.id, title: s.name, daysLabel: s.daysOfWeek.sort().map(d => WEEKDAY_NAMES[d]).join(", "), scheduleRef: s,
      totalAssigned: s.rings.reduce((acc, r) => acc + r.assignedBoxerIds.length, 0),
    }));
  }, [selectedDateKey, filteredSchedules]);

  const selectedDateLeaves = useMemo(() => {
    if (!selectedDateKey) return [];
    return leaveApplications.filter(l => l.start_date && String(l.start_date).substring(0, 10) <= selectedDateKey && String(l.end_date).substring(0, 10) >= selectedDateKey && String(l.status).toLowerCase() === "approved" && (selectedAcademyFilter === "all" || l.academy_id === selectedAcademyFilter));
  }, [selectedDateKey, leaveApplications, selectedAcademyFilter]);


  async function handleSaveBout(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDateModalInstance) return;
    setSavingBout(true);
    try {
      const { data: countData, error: countErr } = await supabase.from("bouts").select("id", { count: "exact" }).eq("ring_instance_id", activeDateModalInstance.id);
      const nextBoutNumber = (countData?.length || 0) + 1;

      const { error } = await supabase.from("bouts").insert({
        bout_number: nextBoutNumber,
        status: "active",
        current_round: 0,
        round_count: boutForm.round_count,
        round_duration_sec: boutForm.round_duration_sec,
        rest_time_sec: boutForm.rest_time_sec,
        boxer_red_id: boutForm.boxer_red_id,
        boxer_blue_id: boutForm.boxer_blue_id,
        ring_instance_id: activeDateModalInstance.id,
        age_category_id: boutForm.age_category_id || null,
        weight_category_id: boutForm.weight_category_id || null,
        bout_type: boutForm.bout_type,
        // Optional judge count and coach ID could be inserted into relational tables or metadata.
        // Assuming coach_id / judges are handled separately or in metadata if they exist.
      });
      if (error) throw error;
      
      setShowBoutModal(false);
      setBoutForm({ bout_type: "training", age_category_id: "", weight_category_id: "", boxer_red_id: "", boxer_blue_id: "", round_count: 3, round_duration_sec: 180, rest_time_sec: 60, judge_count: 3, coach_id: "" });
      await loadData(true);
    } catch (err: any) {
      alert(`Error saving bout: ${err.message || err}`);
    } finally {
      setSavingBout(false);
    }
  }

  async function handleSaveJudges() {
    if (!judgeAssignBoutId) return;
    setSavingBout(true);
    try {
      await supabase.from("bout_judge_assignments").delete().eq("bout_id", judgeAssignBoutId);
      
      if (selectedJudgeIds.length > 0) {
        const { error } = await supabase.from("bout_judge_assignments").insert(
          selectedJudgeIds.map(id => ({
            bout_id: judgeAssignBoutId,
            judge_profile_id: id,
            assigned_by: user?.id,
            judge_role: "judge"
          }))
        );
        if (error) throw error;
      }
      
      setJudgeAssignBoutId(null);
      await loadData(true);
    } catch (err: any) {
      alert(`Error saving judges: ${err.message || err}`);
    } finally {
      setSavingBout(false);
    }
  }



  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-8 animate-spin mb-4 text-primary" />
        <p>Loading ring schedules…</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={selectedSchedule ? selectedSchedule.name : "Ring Scheduling"}
        subtitle={
          selectedSchedule
            ? "Manage rings, boxers, and notifications for this schedule"
            : "View monthly schedule overview and manage ring sessions"
        }
        actions={
          selectedSchedule ? (
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedScheduleId(null)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border hover:bg-subtle transition">
                <ChevronLeft className="size-4" /> Back to schedules
              </button>
              <button onClick={openCreateRing} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card">
                <Plus className="size-4" /> Add Ring
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
        <div className="space-y-6">
          {/* ── Monthly Calendar ────────────────────────────────────── */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden animate-fade-up">
            <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-accent grid place-items-center">
                  <Sparkles className="size-4 text-primary-dark" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-base">Monthly Schedule Overview</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Live DB synchronized · review ring sessions, attendance & leaves</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedAcademyFilter} onChange={e => setSelectedAcademyFilter(e.target.value)} className="bg-subtle/80 border border-border text-foreground text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary">
                  <option value="all">All Academies</option>
                  {academies.map(a => <option key={a.id} value={a.id}>{a.name}{a.city ? ` (${a.city})` : ""}</option>)}
                </select>
                <div className="flex items-center gap-1 bg-subtle/70 p-1 rounded-xl border border-border/80 shadow-xs">
                  <button onClick={handleCalPrev} className="size-8 rounded-lg hover:bg-elevated flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="font-display font-bold text-sm text-foreground px-2 select-none whitespace-nowrap">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </span>
                  <button onClick={handleCalNext} className="size-8 rounded-lg hover:bg-elevated flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-emerald-500/40 bg-emerald-500/20" />Cancelled</span>
                  <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-primary/40 bg-primary/20" />Ring Session</span>
                  <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-white/10 bg-white/5" />Regular Day</span>
                </div>
              </div>
            </div>

            <div className="p-3 sm:p-4 grid md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-8 bg-subtle/30 rounded-xl p-3 border border-border/50">
                <MonthCalendar year={calYear} month={calMonth} classDateKeys={allClassDateKeys} cancelledDateKeys={cancelledDateKeys} todayKey={todayKey} selectedDay={calSelectedDay} onSelectDay={setCalSelectedDay} />
              </div>

              {/* Day detail panel */}
              <div className="md:col-span-4">
                <div className="bg-subtle/20 border border-border/80 rounded-xl p-3.5">
                  <div className="label-micro mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Day details</div>
                  {calSelectedDay ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="font-display font-bold text-base text-foreground">{calSelectedDay} {MONTH_NAMES[calMonth]} {calYear}</h3>
                        {selectedDateKey && (
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-destructive cursor-pointer bg-destructive/10 border border-destructive/20 px-2 py-1 rounded-lg hover:bg-destructive/15 transition select-none">
                            <input type="checkbox" checked={isSelectedDayCancelled} disabled={cancellingAllDay} onChange={e => handleToggleCancelAllDay(selectedDateKey, e.target.checked)} className="accent-destructive size-3.5 rounded cursor-pointer" />
                            <span>Cancel All Today</span>
                          </label>
                        )}
                      </div>

                      {isSelectedDayCancelled && (
                        <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 flex items-start gap-2">
                          <span className="size-2 rounded-full bg-destructive mt-1 shrink-0" />
                          <div>
                            <div className="text-[11px] font-semibold text-destructive">All Sessions Cancelled</div>
                            <div className="text-xs text-muted-foreground mt-0.5">All ring sessions for today have been cancelled.</div>
                          </div>
                        </div>
                      )}

                      {selectedDaySchedules.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ring Sessions ({selectedDaySchedules.length})</div>
                          {selectedDaySchedules.map(item => (
                            <div key={item.id} className="p-3 rounded-xl border border-primary/20 bg-accent/30 cursor-pointer hover:bg-accent/50 transition space-y-2" onClick={() => item.scheduleRef && openDateModal(item.scheduleRef, formatDateKey(calYear, calMonth, calSelectedDay))}>
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-bold text-foreground">{item.title}</div>
                                <span className="text-[10px] font-semibold text-primary-dark bg-primary/10 px-2 py-0.5 rounded-full">Day Settings & RSVP</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground font-medium">{item.daysLabel}</div>
                              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">Assigned Boxers:</span>
                                <span className="font-bold text-foreground">{item.totalAssigned}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        !isSelectedDayCancelled && (
                          <div className="p-3 rounded-lg border border-border bg-surface/50 text-center">
                            <p className="text-xs text-muted-foreground">No sessions scheduled.</p>
                          </div>
                        )
                      )}

                      {selectedDateLeaves.length > 0 && (
                        <div className="pt-2 border-t border-border/60 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Boxers on Leave</span>
                            <span className="text-[10px] font-bold bg-warning/10 text-warning px-2 py-0.5 rounded-full">{selectedDateLeaves.length} Approved</span>
                          </div>
                          {selectedDateLeaves.map((l: any) => (
                            <div key={l.id} className="text-xs p-2 rounded-lg bg-warning/5 border border-warning/20">
                              <div className="font-medium">{l.boxer_profiles?.full_name || "Boxer"}</div>
                              <div className="text-[11px] text-muted-foreground italic mt-0.5">"{l.reason}"</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-muted-foreground">Click any day to view details.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Schedules grid ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">All Schedules</h2>
            </div>
            {filteredSchedules.length === 0 ? (
              <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center">
                <ClipboardList className="size-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-semibold">No ring schedules created</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first schedule to get started.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSchedules.map(s => (
                  <div key={s.id} onClick={() => setSelectedScheduleId(s.id)} className="bg-surface border border-border rounded-xl p-5 group hover:border-border-strong hover:shadow-card transition-all duration-200 cursor-pointer">
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
                      {s.isTournament && <span className="text-xs text-amber-600 font-semibold mt-0.5">🏆 Tournament</span>}
                    </div>
                    {s.daysOfWeek?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {[0,1,2,3,4,5,6].map(d => (
                          <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${s.daysOfWeek.includes(d) ? "bg-primary/10 text-primary-dark" : "bg-subtle text-muted-foreground/40"}`}>{WEEKDAY_NAMES[d]}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                      {s.validFrom && <span className="font-medium">{s.validFrom} → {s.validTo}</span>}
                      <span className="ml-auto">{s.rings?.length || 0} rings</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── Ring detail view ──────────────────────────────────────────
        <div className="space-y-6">
          {selectedSchedule && (
            <div className="bg-subtle/40 border border-border rounded-xl px-5 py-3.5 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-4" />
                <span className="font-medium text-foreground">{selectedSchedule.name}</span>
                {selectedSchedule.isTournament && <span className="text-xs text-amber-600 font-semibold">🏆 Tournament</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {[0,1,2,3,4,5,6].map(d => (
                  <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${selectedSchedule.daysOfWeek?.includes(d) ? "bg-primary/10 text-primary-dark" : "bg-subtle text-muted-foreground/30"}`}>{WEEKDAY_NAMES[d]}</span>
                ))}
              </div>
              {selectedSchedule.validFrom && (
                <span className="text-xs text-muted-foreground">{selectedSchedule.validFrom} → {selectedSchedule.validTo}</span>
              )}
            </div>
          )}

          {!selectedSchedule?.rings?.length ? (
            <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center">
              <MapPin className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">No rings scheduled yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a ring to start assigning boxers.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {selectedSchedule!.rings.map(ring => {
                const assignedIds = ring.assignedBoxerIds;
                const agreedIds: string[] = [], notAgreedIds: string[] = [], pendingIds: string[] = [];
                assignedIds.forEach(id => {
                  const rsvp = ring.rsvps?.[id];
                  if (rsvp?.status === "attending") agreedIds.push(id);
                  else if (rsvp?.status === "not_attending") notAgreedIds.push(id);
                  else pendingIds.push(id);
                });
                return (
                  <div key={ring.id} className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                    <div className="px-5 py-4 border-b border-border bg-subtle/30 flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <h3 className="font-semibold text-base text-foreground">{ring.name}</h3>
                        <div className="flex items-center flex-wrap gap-3 mt-1 text-xs text-muted-foreground font-medium">
                          <span className="flex items-center gap-1"><Clock className="size-3.5" /> {formatTime(ring.fromTime)} — {formatTime(ring.toTime)}</span>
                          {ring.locationName && <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {ring.locationName}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleNotifyRing(ring, selectedSchedule!)} disabled={notifyingRingId === ring.id || assignedIds.length === 0} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-md border border-primary text-primary hover:bg-primary/10 transition disabled:opacity-50">
                          {notifyingRingId === ring.id ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />} Notify Today
                        </button>
                        <button onClick={() => openEditRing(ring)} className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-elevated transition">Edit</button>
                        <button onClick={() => handleDeleteRing(ring.id)} className="text-xs font-medium px-3 py-1.5 rounded-md border border-destructive/20 text-destructive hover:bg-destructive/10 transition">Delete</button>
                      </div>
                    </div>
                    <div className="p-5 border-b border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="size-4 text-muted-foreground" />
                        <h4 className="font-semibold text-sm">Assigned Boxers ({assignedIds.length})</h4>
                      </div>
                      {assignedIds.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No boxers assigned. Edit this ring to assign.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {assignedIds.map(id => {
                            const boxer = boxerMapById.get(id);
                            return boxer ? (
                              <span key={id} className="text-xs bg-elevated border border-border px-2.5 py-1 rounded-lg font-medium">{boxer.full_name}</span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}

      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-xl animate-fade-up overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="font-display font-semibold text-lg text-foreground">
                {scheduleModalStep === 1 && (editingScheduleId ? "Edit Schedule Details" : "New Schedule")}
                {scheduleModalStep === 2 && "Add Rings"}
                {scheduleModalStep === 3 && "Review & Create"}
              </h3>
              <button onClick={() => setShowScheduleModal(false)} className="size-8 grid place-items-center rounded-xl bg-subtle/80 hover:bg-subtle text-muted-foreground hover:text-foreground transition">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 py-3 bg-subtle/20 border-b border-border/50 shrink-0">
              {[1,2,3].map(n => <span key={n} className={`size-2.5 rounded-full transition-all ${scheduleModalStep >= n ? "bg-[#ef4444]" : "bg-muted-foreground/30"}`} />)}
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              {scheduleModalStep === 1 && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Academy *</label>
                    <select required value={sAcademyId} onChange={e => setSAcademyId(e.target.value)} className="input-premium w-full text-xs">
                      <option value="">Select Academy</option>
                      {academies.map(a => <option key={a.id} value={a.id}>{a.name}{a.city ? ` (${a.city})` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Schedule Mode</label>
                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => setSIsTournament(false)} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${!sIsTournament ? "bg-primary/15 border-primary/50 text-primary-dark shadow-xs" : "border-border text-muted-foreground hover:bg-subtle"}`}>Regular Training</button>
                      <button type="button" onClick={() => setSIsTournament(true)} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${sIsTournament ? "bg-amber-500/15 border-amber-500 text-amber-700 shadow-xs" : "border-border text-muted-foreground hover:bg-subtle"}`}>🏆 Tournament Event</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Schedule name *</label>
                    <input required autoFocus value={sName} onChange={e => setSName(e.target.value)} placeholder={sIsTournament ? "e.g. District Championship" : "e.g. Morning Training Block"} className="input-premium w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2">Days of week *</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_FULL.map((name, idx) => {
                        const active = sDaysOfWeek.includes(idx);
                        return (
                          <button key={idx} type="button" onClick={() => setSDaysOfWeek(prev => active ? prev.filter(d => d !== idx) : [...prev, idx].sort())}
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
                      <label className="block text-xs font-semibold mb-1.5">Valid from *</label>
                      <input required type="date" value={sValidFrom} onChange={e => setSValidFrom(e.target.value)} className="input-premium w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Valid to *</label>
                      <input required type="date" value={sValidTo} min={sValidFrom || undefined} onChange={e => setSValidTo(e.target.value)} className="input-premium w-full" />
                    </div>
                  </div>
                  {sValidFrom && sValidTo && sValidFrom > sValidTo && <p className="text-xs text-destructive -mt-2">Valid to must be after valid from</p>}
                </div>
              )}
              {scheduleModalStep === 2 && (
                <div className="space-y-4 py-2">
                  <button type="button" onClick={openCreateRing} className="w-full py-3 px-4 rounded-xl border-2 border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444]/10 font-semibold text-sm transition flex items-center justify-center gap-2">
                    <Plus className="size-4" /> Add Ring
                  </button>
                  {draftRings.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground bg-subtle/20 border border-dashed border-border rounded-xl">
                      No rings added yet. Click "+ Add Ring" to configure rings for this schedule.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {draftRings.map(r => (
                        <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-subtle/20">
                          <div>
                            <div className="text-xs font-bold text-foreground">{r.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {formatTime(r.fromTime)} - {formatTime(r.toTime)} · {r.assignedBoxerIds.length} boxers assigned
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openEditRing(r)} className="p-1.5 rounded-md hover:bg-subtle text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                            <button type="button" onClick={() => handleDeleteRing(r.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="size-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {scheduleModalStep === 3 && (
                <div className="space-y-4 bg-subtle/30 border border-border/70 rounded-xl p-5">
                  {[["Schedule Name", sName], ["Mode", sIsTournament ? "🏆 Tournament" : "Regular Training"], ["Days", sDaysOfWeek.map(d => WEEKDAY_FULL[d]).join(", ")], ["Date Range", `${sValidFrom} → ${sValidTo}`], ["Estimated Sessions", `${calculateEstimatedSessions(sValidFrom, sValidTo, sDaysOfWeek)} sessions`]].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">{k}</div>
                      <div className="text-sm font-semibold text-foreground mt-0.5">{v}</div>
                    </div>
                  ))}
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-1">Rings ({draftRings.length})</div>
                    {draftRings.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">No rings configured</div>
                    ) : (
                      <div className="space-y-1">
                        {draftRings.map(r => (
                          <div key={r.id} className="text-xs bg-surface border border-border px-3 py-2 rounded-lg flex items-center justify-between">
                            <span className="font-semibold">{r.name}</span>
                            <span className="text-muted-foreground">{formatTime(r.fromTime)} - {formatTime(r.toTime)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border bg-subtle/30 flex items-center justify-between gap-3 shrink-0">
              {scheduleModalStep === 1 ? (
                <button type="button" onClick={() => setShowScheduleModal(false)} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-subtle text-foreground hover:bg-subtle/80 transition">Cancel</button>
              ) : (
                <button type="button" onClick={() => setScheduleModalStep(prev => (prev - 1) as 1|2)} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-subtle text-foreground hover:bg-subtle/80 transition">← Back</button>
              )}
              {scheduleModalStep === 1 && <button type="button" disabled={!step1Valid} onClick={() => setScheduleModalStep(2)} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50 transition">Next: Add Rings →</button>}
              {scheduleModalStep === 2 && <button type="button" onClick={() => setScheduleModalStep(3)} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#ef4444] text-white hover:bg-[#dc2626] transition">Review →</button>}
              {scheduleModalStep === 3 && <button type="button" disabled={savingSchedule} onClick={handleFinalCreateSchedule} className="px-8 py-2.5 rounded-xl text-sm font-semibold bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50 transition flex items-center gap-2 shadow-card">
                {savingSchedule ? <Loader2 className="size-4 animate-spin" /> : null}
                {savingSchedule ? "Creating…" : "Create Schedule ✓"}
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* Judge Assignment Modal */}
      {judgeAssignBoutId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md animate-scale-in">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-semibold">Assign Judges to Bout</h3>
              <button onClick={() => setJudgeAssignBoutId(null)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground hover:text-foreground transition"><X className="size-4" /></button>
            </div>
            <div className="p-6">
              <p className="text-xs text-muted-foreground mb-4">Select judges to score this bout. They will see it on their Judge Portal immediately.</p>
              
              {judges.length === 0 ? (
                <div className="p-4 bg-subtle border border-border rounded-xl text-center text-sm text-muted-foreground">
                  No active external judges found. <br />Go to Judges tab to invite some.
                </div>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                  {judges.map(j => {
                    const checked = selectedJudgeIds.includes(j.id);
                    return (
                      <label key={j.id} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition ${checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedJudgeIds(prev => [...prev, j.id]);
                            else setSelectedJudgeIds(prev => prev.filter(id => id !== j.id));
                          }}
                          className="size-4 accent-primary"
                        />
                        <span className="text-sm font-semibold">{j.full_name || "Judge"}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border bg-subtle/30 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setJudgeAssignBoutId(null)} className="px-5 py-2 text-sm border border-border rounded-xl hover:bg-subtle transition font-medium">Cancel</button>
              <button onClick={handleSaveJudges} disabled={savingBout} className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition shadow-card font-semibold disabled:opacity-50 flex items-center gap-2">
                {savingBout && <Loader2 className="size-3.5 animate-spin" />} Save Assignments
              </button>
            </div>
          </div>
        </div>
      )}

      {overlapWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-warning/10 grid place-items-center mx-auto mb-4"><AlertTriangle className="size-5 text-warning" /></div>
            <h3 className="font-semibold text-base">Timing Conflict</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5 leading-relaxed">This timing is already occupied by another ring. Save anyway?</p>
            <div className="flex gap-3">
              <button onClick={() => setOverlapWarning(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">No</button>
              <button onClick={() => overlapWarning()} className="flex-1 px-4 py-2 text-sm font-semibold bg-warning text-warning-foreground rounded-xl hover:bg-warning/90 transition shadow-card">Yes, Save</button>
            </div>
          </div>
        </div>
      )}

      {deleteScheduleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4"><Trash2 className="size-5 text-destructive" /></div>
            <h3 className="font-semibold text-base">Delete schedule?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">This will remove the schedule and all its rings permanently.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteScheduleId(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button onClick={() => handleDeleteSchedule(deleteScheduleId)} className="flex-1 px-4 py-2 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {showRingModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-2xl my-8 animate-fade-up flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="font-display font-semibold">{editingRingId ? "Edit Ring" : "Add New Ring"}</h3>
              <button onClick={() => setShowRingModal(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground hover:text-foreground transition"><X className="size-4" /></button>
            </div>
            <form id="ring-form" onSubmit={handleSaveRingAttempt} className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Ring name *</label>
                  <input required autoFocus value={ringForm.name} onChange={e => setRingForm({...ringForm, name: e.target.value})} placeholder="e.g. Main Ring" className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">From time</label>
                  <input type="time" value={ringForm.fromTime} onChange={e => setRingForm({...ringForm, fromTime: e.target.value})} className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">To time</label>
                  <input type="time" value={ringForm.toTime} onChange={e => setRingForm({...ringForm, toTime: e.target.value})} className="input-premium" />
                </div>
              </div>
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold">Location (optional)</label>
                  <button type="button" onClick={() => locateMe((lat, lng) => setRingForm(prev => ({ ...prev, latitude: String(lat), longitude: String(lng) })))} className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-dark font-semibold text-[11px] transition flex items-center gap-1.5 cursor-pointer">
                    <Navigation className="size-3" /> Locate Me
                  </button>
                </div>
                <input value={ringForm.locationName ?? ""} onChange={e => setRingForm({...ringForm, locationName: e.target.value})} placeholder="e.g. Main Hall, Annex" className="input-premium w-full" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Latitude</label>
                    <input type="number" step="any" value={ringForm.latitude ?? ""} onChange={e => setRingForm({...ringForm, latitude: e.target.value})} placeholder="19.0760" className="input-premium w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Longitude</label>
                    <input type="number" step="any" value={ringForm.longitude ?? ""} onChange={e => setRingForm({...ringForm, longitude: e.target.value})} placeholder="72.8777" className="input-premium w-full" />
                  </div>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-5 pt-4 border-t border-border">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Age Category (Optional)</label>
                  <select value={ringForm.age_category_id || ""} onChange={e => setRingForm({...ringForm, age_category_id: e.target.value || null, weight_category_id: null})} className="input-premium w-full">
                    <option value="">All Ages</option>
                    {ageCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Weight Category (Optional)</label>
                  <select value={ringForm.weight_category_id || ""} onChange={e => setRingForm({...ringForm, weight_category_id: e.target.value || null})} className="input-premium w-full" disabled={!ringForm.age_category_id}>
                    <option value="">All Weights</option>
                    {weightCategories.filter(w => w.age_category_id === ringForm.age_category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <BoxerMultiSelect
                  label="Assign Boxers (filtered by category, suspended excluded)"
                  selectedIds={ringForm.assignedBoxerIds}
                  onChange={ids => setRingForm({...ringForm, assignedBoxerIds: ids})}
                  allBoxers={activeBoxers.filter(b => (!ringForm.age_category_id || b.age_category_id === ringForm.age_category_id) && (!ringForm.weight_category_id || b.weight_category_id === ringForm.weight_category_id))}
                />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border bg-subtle/30 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowRingModal(false)} className="px-6 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button type="submit" form="ring-form" disabled={!ringForm.name.trim()} className="px-8 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card">
                {editingRingId ? "Update Ring" : "Save Ring"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeDateModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h2 className="font-display font-bold text-lg text-foreground">{activeDateModal.schedule.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>Date: <strong className="text-foreground">{activeDateModal.dateKey}</strong></span>
                  <span>·</span>
                  <span>Attendance & RSVP Breakdown</span>
                </p>
              </div>
              <button onClick={() => setActiveDateModal(null)} className="size-8 rounded-lg hover:bg-subtle flex items-center justify-center text-muted-foreground hover:text-foreground transition"><X className="size-4" /></button>
            </div>

            <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto">
              {([
                { key: "attending", label: "Attending", icon: Check, count: modalDetails.attending.length, tone: "success" },
                { key: "not_attending", label: "Declined", icon: AlertTriangle, count: modalDetails.notAttending.length, tone: "warning" },
                { key: "present", label: "Present", icon: MapPin, count: modalDetails.present.length, tone: "primary" },
                { key: "boxers", label: "Manage Boxers", icon: Users, count: null, tone: "neutral" },
                { key: "location", label: "Change Location", icon: Navigation, count: null, tone: "neutral" },
                { key: "bouts", label: "Bouts", icon: Swords, count: activeDateModalInstance ? bouts.filter(b => b.ring_instance_id === activeDateModalInstance.id).length : 0, tone: "neutral" },
                { key: "cancel", label: "Cancel Session", icon: X, count: null, tone: "destructive" },
                { key: "notify", label: "Notify", icon: Bell, count: null, tone: "primary" },
              ] as const).map(tab => {
                const Icon = tab.icon;
                const isActive = modalTab === tab.key;
                const toneClasses: Record<string, string> = {
                  success: "bg-success/15 text-success border border-success/30",
                  warning: "bg-warning/15 text-warning border border-warning/30",
                  primary: "bg-primary/15 text-primary-dark border border-primary/30",
                  neutral: "bg-accent text-accent-foreground border border-primary/30",
                  destructive: "bg-destructive/15 text-destructive border border-destructive/30",
                };
                return (
                  <button key={tab.key} onClick={() => setModalTab(tab.key as any)} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${isActive ? toneClasses[tab.tone] : "text-muted-foreground hover:bg-subtle hover:text-foreground"}`}>
                    <Icon className="size-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== null && <span className="px-1.5 rounded-full bg-current/20 text-[10px] font-bold">{tab.count}</span>}
                  </button>
                );
              })}
            </div>

            {modalDetails.loading ? (
              <div className="py-12 grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /><p className="text-xs text-muted-foreground mt-2">Loading…</p></div>
            ) : (
              <div className="min-h-[220px] max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-subtle/20 p-2">
                {modalTab === "attending" && (
                  modalDetails.attending.length === 0 ? <div className="py-12 text-center text-xs text-muted-foreground">No RSVPs marked as attending yet.</div> : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-subtle border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider sticky top-0">
                        <tr><th className="py-2.5 px-4">Boxer Name</th><th className="py-2.5 px-4">Status</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {modalDetails.attending.map(a => (
                          <tr key={a.id} className="hover:bg-elevated/50">
                            <td className="py-2.5 px-4 font-semibold">{a.name}</td>
                            <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold text-[10px] inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-success" />Attending</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
                {modalTab === "not_attending" && (
                  modalDetails.notAttending.length === 0 ? <div className="py-12 text-center text-xs text-muted-foreground">No boxers declined.</div> : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-subtle border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider sticky top-0">
                        <tr><th className="py-2.5 px-4">Boxer Name</th><th className="py-2.5 px-4">Status</th><th className="py-2.5 px-4">Reason</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {modalDetails.notAttending.map(a => (
                          <tr key={a.id} className="hover:bg-elevated/50">
                            <td className="py-2.5 px-4 font-semibold">{a.name}</td>
                            <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning font-semibold text-[10px] inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-warning" />Declined</span></td>
                            <td className="py-2.5 px-4 italic text-muted-foreground text-[11px]">"{a.reason || "No reason"}"</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
                {modalTab === "present" && (
                  modalDetails.present.length === 0 ? <div className="py-12 text-center text-xs text-muted-foreground">No geotag check-ins logged yet.</div> : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-subtle border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider sticky top-0">
                        <tr><th className="py-2.5 px-4">Boxer Name</th><th className="py-2.5 px-4">Status</th><th className="py-2.5 px-4 text-right">Check-in</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {modalDetails.present.map(a => (
                          <tr key={a.id} className="hover:bg-elevated/50">
                            <td className="py-2.5 px-4 font-semibold">{a.name}</td>
                            <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary-dark font-semibold text-[10px] inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" />Present (Geotagged)</span></td>
                            <td className="py-2.5 px-4 text-right text-muted-foreground font-mono text-[11px]">{a.checkInTime || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
                {modalTab === "boxers" && (
                  <div className="space-y-4 p-2">
                    <p className="text-xs text-muted-foreground">Update boxer assignments for <strong>{activeDateModal.dateKey}</strong>. Suspended boxers are excluded.</p>
                    {(activeDateModal.schedule.rings ?? []).map(ring => {
                      const curBoxers = overrideBoxers[ring.id] || { assignedBoxerIds: ring.assignedBoxerIds };
                      return (
                        <div key={ring.id} className="border border-border rounded-xl p-4 bg-surface space-y-3">
                          <h4 className="font-semibold text-sm flex items-center justify-between">
                            <span>Ring: {ring.name}</span>
                            <span className="text-xs font-normal text-muted-foreground">{formatTime(ring.fromTime)} - {formatTime(ring.toTime)}</span>
                          </h4>
                          <BoxerMultiSelect
                            label="Assigned Boxers"
                            selectedIds={curBoxers.assignedBoxerIds}
                            onChange={ids => setOverrideBoxers(prev => ({ ...prev, [ring.id]: { assignedBoxerIds: ids } }))}
                            allBoxers={activeBoxers}
                          />
                        </div>
                      );
                    })}
                    <div className="flex justify-end pt-2">
                      <button onClick={handleSaveOverrideBoxers} disabled={savingOverrides} className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition shadow-card flex items-center gap-2">
                        {savingOverrides ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        <span>Save Today's Assignments</span>
                      </button>
                    </div>
                  </div>
                )}
                {modalTab === "bouts" && (
                  <div className="space-y-4 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Manage bouts for this session.</p>
                      <button onClick={() => setShowBoutModal(true)} disabled={!activeDateModalInstance} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-card disabled:opacity-50">+ Add Bout</button>
                    </div>
                    {(!activeDateModalInstance || bouts.filter(b => b.ring_instance_id === activeDateModalInstance.id).length === 0) ? (
                      <div className="py-8 text-center text-xs text-muted-foreground bg-surface border border-border rounded-xl">No bouts created for this session yet.</div>
                    ) : (
                      <div className="grid gap-3">
                        {bouts.filter(b => b.ring_instance_id === activeDateModalInstance.id).map(bout => {
                           const red = activeBoxers.find(b => b.id === bout.boxer_red_id)?.full_name || "Unknown";
                           const blue = activeBoxers.find(b => b.id === bout.boxer_blue_id)?.full_name || "Unknown";
                           return (
                             <div key={bout.id} className="space-y-0">
                             <div className="bg-surface border border-border rounded-t-xl p-4 flex items-center justify-between shadow-sm">
                               <div>
                                 <h4 className="font-semibold text-sm">Bout #{bout.bout_number}</h4>
                                 <div className="flex items-center gap-2 mt-1 text-xs font-medium">
                                   <span className="text-red-500">{red}</span>
                                   <span className="text-muted-foreground">vs</span>
                                   <span className="text-blue-500">{blue}</span>
                                 </div>
                               </div>
                               <div className="text-right">
                                 <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${bout.status === "completed" ? "bg-success/15 text-success" : bout.status === "active" ? "bg-primary/15 text-primary-dark" : "bg-subtle text-muted-foreground"}`}>
                                   {bout.status}
                                 </span>
                                 <p className="text-[10px] text-muted-foreground mt-1">{bout.bout_type === "tournament" ? "🏆 Tournament" : "Training"}</p>
                               </div>
                             </div>
                             
                             <div className="bg-subtle/50 px-4 py-3 border-x border-b border-border rounded-b-xl mb-2 text-xs">
                               <div className="flex items-center justify-between mb-2">
                                 <span className="font-semibold text-muted-foreground">Assigned Judges</span>
                                 <button 
                                   onClick={() => {
                                     setJudgeAssignBoutId(bout.id);
                                     setSelectedJudgeIds(boutJudgeAssignments.filter(a => a.bout_id === bout.id).map(a => a.judge_profile_id));
                                   }}
                                   className="text-primary hover:underline font-medium"
                                 >
                                   Manage Judges
                                 </button>
                               </div>
                               
                               {boutJudgeAssignments.filter(a => a.bout_id === bout.id).length === 0 ? (
                                 <div className="text-muted-foreground italic">No judges assigned yet.</div>
                               ) : (
                                 <div className="flex flex-wrap gap-1.5">
                                   {boutJudgeAssignments.filter(a => a.bout_id === bout.id).map(a => {
                                     const j = judges.find(jdg => jdg.id === a.judge_profile_id);
                                     return (
                                       <span key={a.id} className="px-2 py-1 bg-surface border border-border rounded-md shadow-sm">
                                         {j?.full_name || "Unknown Judge"}
                                       </span>
                                     );
                                   })}
                                 </div>
                               )}
                             </div>
                             </div>
                           )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {modalTab === "location" && (
                  <div className="space-y-4 p-2">
                    <p className="text-xs text-muted-foreground">Override location for <strong>{activeDateModal.dateKey}</strong>. Assigned boxers will be notified.</p>
                    {(activeDateModal.schedule.rings ?? []).map(ring => (
                      <div key={ring.id} className="border border-border rounded-xl p-4 bg-surface space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold">Ring: {ring.name} ({formatTime(ring.fromTime)} - {formatTime(ring.toTime)})</label>
                          <button type="button" onClick={() => locateMe((lat, lng) => { setOverrideLat(prev => ({ ...prev, [ring.id]: lat })); setOverrideLng(prev => ({ ...prev, [ring.id]: lng })); })} className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-dark font-semibold text-[11px] transition flex items-center gap-1.5 cursor-pointer">
                            <Navigation className="size-3" /> Locate Me
                          </button>
                        </div>
                        <input type="text" value={overrideLocation[ring.id] ?? ""} onChange={e => setOverrideLocation({ ...overrideLocation, [ring.id]: e.target.value })} placeholder="e.g. Main Hall, Venue B" className="input-premium w-full text-xs" />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Latitude</label>
                            <input type="number" step="any" value={overrideLat[ring.id] ?? ""} onChange={e => setOverrideLat({ ...overrideLat, [ring.id]: e.target.value })} placeholder="19.0760" className="input-premium w-full text-xs" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Longitude</label>
                            <input type="number" step="any" value={overrideLng[ring.id] ?? ""} onChange={e => setOverrideLng({ ...overrideLng, [ring.id]: e.target.value })} placeholder="72.8777" className="input-premium w-full text-xs" />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end pt-2">
                      <button onClick={handleSaveOverrideLocation} disabled={savingOverrides} className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition shadow-card flex items-center gap-2">
                        {savingOverrides ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}
                        <span>Save & Notify Location Change</span>
                      </button>
                    </div>
                  </div>
                )}
                {modalTab === "cancel" && (
                  <div className="space-y-4 py-8 text-center">
                    <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto text-destructive"><AlertTriangle className="size-6" /></div>
                    <div>
                      <h3 className="font-bold text-base text-foreground">Cancel Ring Sessions for {activeDateModal.dateKey}?</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">Cancelling <strong>"{activeDateModal.schedule.name}"</strong> will send automated cancellation notifications to assigned boxers.</p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={() => setModalTab("attending")} className="px-4 py-2 rounded-xl border border-border text-xs font-medium hover:bg-subtle transition">Go Back</button>
                      <button onClick={handleCancelSingleClass} disabled={savingOverrides} className="px-5 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold text-xs hover:bg-destructive/90 transition shadow-card flex items-center gap-2">
                        {savingOverrides ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                        <span>Cancel This Session</span>
                      </button>
                    </div>
                  </div>
                )}
                {modalTab === "notify" && (
                  <div className="space-y-4 py-8 text-center">
                    <div className="size-12 rounded-full bg-primary/10 grid place-items-center mx-auto text-primary-dark"><Bell className="size-6" /></div>
                    <div>
                      <h3 className="font-bold text-base text-foreground">Send Notifications?</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">This will send an attendance request poll to all boxers assigned to this session.</p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={() => setModalTab("attending")} className="px-4 py-2 rounded-xl border border-border text-xs font-medium hover:bg-subtle transition">Go Back</button>
                      <button onClick={async () => {
                        for (const r of activeDateModal.schedule.rings ?? []) {
                          await handleNotifyRing(r, activeDateModal.schedule);
                        }
                        alert("Notifications sent successfully!");
                      }} className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition shadow-card flex items-center gap-2">
                        <Bell className="size-3.5" />
                        <span>Send Notifications</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Session Summary</span>
              <span className="font-bold text-foreground bg-subtle px-3 py-1 rounded-lg border border-border">
                Present: {modalDetails.present.length} / {modalDetails.totalAssigned} Boxers
              </span>
            </div>
          </div>
        </div>
      )}
      {showBoutModal && activeDateModalInstance && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-2xl my-8 animate-fade-up flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="font-display font-semibold">Add Bout</h3>
              <button onClick={() => setShowBoutModal(false)} className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground hover:text-foreground transition"><X className="size-4" /></button>
            </div>
            <form id="bout-form" onSubmit={handleSaveBout} className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Bout Type *</label>
                  <select value={boutForm.bout_type} onChange={e => setBoutForm({...boutForm, bout_type: e.target.value})} className="input-premium w-full" required>
                    <option value="training">Training</option>
                    <option value="tournament">Tournament</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Coach (Optional)</label>
                  <select value={boutForm.coach_id} onChange={e => setBoutForm({...boutForm, coach_id: e.target.value})} className="input-premium w-full">
                    <option value="">Select Coach</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.email}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5 pt-4 border-t border-border">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Age Category *</label>
                  <select value={boutForm.age_category_id} onChange={e => setBoutForm({...boutForm, age_category_id: e.target.value, weight_category_id: "", boxer_red_id: "", boxer_blue_id: ""})} className="input-premium w-full" required>
                    <option value="">Select Age Category</option>
                    {ageCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Weight Category *</label>
                  <select value={boutForm.weight_category_id} onChange={e => setBoutForm({...boutForm, weight_category_id: e.target.value, boxer_red_id: "", boxer_blue_id: ""})} className="input-premium w-full" required disabled={!boutForm.age_category_id}>
                    <option value="">Select Weight Category</option>
                    {weightCategories.filter(w => w.age_category_id === boutForm.age_category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5 pt-4 border-t border-border">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Red Corner Boxer *</label>
                  <select value={boutForm.boxer_red_id} onChange={e => setBoutForm({...boutForm, boxer_red_id: e.target.value})} className="input-premium w-full" required disabled={!boutForm.weight_category_id}>
                    <option value="">Select Boxer (Red)</option>
                    {activeBoxers.filter(b => b.age_category_id === boutForm.age_category_id && b.weight_category_id === boutForm.weight_category_id && b.id !== boutForm.boxer_blue_id).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Blue Corner Boxer *</label>
                  <select value={boutForm.boxer_blue_id} onChange={e => setBoutForm({...boutForm, boxer_blue_id: e.target.value})} className="input-premium w-full" required disabled={!boutForm.weight_category_id}>
                    <option value="">Select Boxer (Blue)</option>
                    {activeBoxers.filter(b => b.age_category_id === boutForm.age_category_id && b.weight_category_id === boutForm.weight_category_id && b.id !== boutForm.boxer_red_id).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5 pt-4 border-t border-border">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">No. of Rounds *</label>
                  <input type="number" min="1" max="15" value={boutForm.round_count} onChange={e => setBoutForm({...boutForm, round_count: Number(e.target.value)})} className="input-premium w-full" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Round Duration (sec) *</label>
                  <input type="number" min="30" max="600" value={boutForm.round_duration_sec} onChange={e => setBoutForm({...boutForm, round_duration_sec: Number(e.target.value)})} className="input-premium w-full" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Rest Time (sec) *</label>
                  <input type="number" min="10" max="300" value={boutForm.rest_time_sec} onChange={e => setBoutForm({...boutForm, rest_time_sec: Number(e.target.value)})} className="input-premium w-full" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">No. of Judges *</label>
                  <select value={boutForm.judge_count} onChange={e => setBoutForm({...boutForm, judge_count: Number(e.target.value)})} className="input-premium w-full" required>
                    {[1, 3, 5].map(n => <option key={n} value={n}>{n} Judge{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border bg-subtle/30 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowBoutModal(false)} className="px-6 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition">Cancel</button>
              <button type="submit" form="bout-form" disabled={savingBout} className="px-8 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition shadow-card">
                {savingBout ? "Saving..." : "Save Bout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Calendar month card ───────────────────────────────────────────────
function MonthCalendar({ year, month, classDateKeys, cancelledDateKeys, todayKey, selectedDay, onSelectDay }: {
  year: number; month: number;
  classDateKeys: Set<string>; cancelledDateKeys: Set<string>;
  todayKey: string; selectedDay: number | null; onSelectDay: (d: number) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: { day: number; type: "cancelled" | "class" | "regular" | "empty" }[] = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: 0, type: "empty" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = formatDateKey(year, month, d);
    const isCancelled = cancelledDateKeys.has(dateKey);
    const isClass = classDateKeys.has(dateKey);
    if (isCancelled) cells.push({ day: d, type: "cancelled" });
    else if (isClass) cells.push({ day: d, type: "class" });
    else cells.push({ day: d, type: "regular" });
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5 text-center">
        {DAY_LABELS.map(d => <div key={d} className="text-[11px] font-bold text-muted-foreground/80 py-1 select-none uppercase tracking-wider">{d}</div>)}
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
          if (cell.type === "cancelled") { bgStyle = { background: "rgba(16, 185, 129, 0.25)" }; borderClass = "border border-emerald-500/40"; textClass = "text-emerald-300 font-bold"; }
          else if (cell.type === "class") { bgStyle = { background: "rgba(var(--color-primary-rgb, 220,38,38), 0.25)" }; borderClass = "border border-primary/40"; textClass = "text-primary-dark font-bold"; }
          return (
            <button key={idx} onClick={() => onSelectDay(cell.day)} style={bgStyle}
              className={`h-8 sm:h-9 md:h-10 rounded-xl text-xs transition-all cursor-pointer select-none ${borderClass} ${textClass} ${isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""} ${isSelected ? "ring-2 ring-white/40 ring-offset-1 ring-offset-background scale-105 shadow-md z-10" : "hover:scale-105 hover:shadow-md hover:z-10"}`}>
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Boxer multi-select component ──────────────────────────────────────
function BoxerMultiSelect({ label, selectedIds, onChange, allBoxers }: {
  label: string; selectedIds: string[]; onChange: (ids: string[]) => void; allBoxers: Boxer[];
}) {
  const [search, setSearch] = useState("");
  const filtered = allBoxers.filter(b => 
    (selectedIds.includes(b.id) || !b.is_suspended) && 
    b.full_name.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };
  return (
    <div>
      <div className="text-xs font-semibold text-foreground mb-2">{label} ({selectedIds.length} selected)</div>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search boxers…" className="input-premium pl-8 text-xs w-full" />
      </div>
      <div className="max-h-48 overflow-y-auto border border-border rounded-xl bg-subtle/10 divide-y divide-border/40">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No boxers found</div>
        ) : (
          filtered.map(b => {
            const isSelected = selectedIds.includes(b.id);
            return (
              <button key={b.id} type="button" onClick={() => toggle(b.id)} className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition hover:bg-elevated/60 ${isSelected ? "bg-primary/5 text-primary-dark" : "text-foreground"}`}>
                <div className="flex items-center gap-2">
                  <span className={b.is_suspended ? "text-muted-foreground line-through" : ""}>{b.full_name}</span>
                  {b.is_suspended && <span className="text-[9px] uppercase tracking-wider font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Suspended</span>}
                </div>
                {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── RSVP column ───────────────────────────────────────────────────────
function RsvpColumn({ title, tone, ids, allBoxers }: {
  title: string; tone: "success" | "danger" | "neutral"; ids: string[]; allBoxers: Boxer[];
}) {
  const toneClass = tone === "success" ? "bg-success/10 text-success" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-subtle text-muted-foreground";
  return (
    <div>
      <div className={`text-[10px] font-bold px-2 py-0.5 rounded mb-2 inline-block ${toneClass}`}>{title} ({ids.length})</div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {ids.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">None</div>
        ) : (
          ids.map(id => {
            const boxer = allBoxers.find(b => b.id === id);
            return <div key={id} className="text-xs font-medium truncate">{boxer?.full_name || id.slice(0, 8)}</div>;
          })
        )}
      </div>
    </div>
  );
}
