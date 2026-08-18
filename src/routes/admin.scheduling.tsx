import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import {
  Calendar, Plus, X, Clock, MapPin, Users, Edit2, Bell,
  CalendarCheck, ChevronLeft, ChevronRight, Trash2
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/scheduling")({ component: AdminScheduling });

// ── Stub data — same class_schedule_* tables as superadmin.class-assigning
// TODO: wire to real ring_schedule_templates / ring_instances queries
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ScheduleTemplate {
  id: string;
  name: string;
  days: string[];
  validFrom: string;
  validTo: string | null;
  isTournament: boolean;
  rings: RingSlot[];
}

interface RingSlot {
  id: string;
  name: string;
  from: string;
  to: string;
  location: string;
  category: string;
  rosterCount: number;
}

const STUB_TEMPLATES: ScheduleTemplate[] = [
  {
    id: "t1",
    name: "Morning Training Block",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    validFrom: "2026-07-01",
    validTo: null,
    isTournament: false,
    rings: [
      { id: "r1", name: "Ring A", from: "06:00", to: "08:00", location: "Main Hall", category: "Youth (17–18)", rosterCount: 12 },
      { id: "r2", name: "Ring B", from: "07:00", to: "09:00", location: "Annex", category: "Senior (19+)", rosterCount: 8 },
    ],
  },
  {
    id: "t2",
    name: "Weekend Sparring",
    days: ["Sat"],
    validFrom: "2026-07-01",
    validTo: "2026-12-31",
    isTournament: false,
    rings: [
      { id: "r3", name: "Ring A", from: "09:00", to: "12:00", location: "Main Hall", category: "All", rosterCount: 20 },
    ],
  },
];

// Compact calendar for selected-month overview
function MiniCalendar({ year, month, onDayClick }: { year: number; month: number; onDayClick: (d: number) => void }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isToday = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  const nullCells: (number | null)[] = Array(firstDay).fill(null);
  const dayCells: (number | null)[] = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const cells: (number | null)[] = [...nullCells, ...dayCells];

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => (
          <button
            key={i}
            onClick={() => d && onDayClick(d)}
            disabled={!d}
            className={`h-8 rounded-md text-xs font-medium transition-all cursor-pointer ${
              !d ? "invisible" :
              isToday(d!) ? "bg-primary text-primary-foreground" :
              "hover:bg-elevated text-foreground"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminScheduling() {
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showNewWizard, setShowNewWizard] = useState(false);

  const monthName = new Date(calYear, calMonth).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Ring Scheduling"
        subtitle="Manage training sessions and ring assignments"
        actions={
          <button
            onClick={() => setShowNewWizard(true)}
            className="inline-flex items-center gap-2 bg-info text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-info/90 transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> New Schedule
          </button>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="bento-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold text-sm">{monthName}</div>
            <div className="flex gap-1">
              <button onClick={prevMonth} className="size-7 rounded-md hover:bg-elevated grid place-items-center cursor-pointer"><ChevronLeft className="size-4" /></button>
              <button onClick={nextMonth} className="size-7 rounded-md hover:bg-elevated grid place-items-center cursor-pointer"><ChevronRight className="size-4" /></button>
            </div>
          </div>
          <MiniCalendar year={calYear} month={calMonth} onDayClick={setSelectedDay} />

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary inline-block" />Today</div>
            <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-info inline-block" />Session</div>
            <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive inline-block" />Cancelled</div>
          </div>
        </div>

        {/* Active schedules + day detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedDay ? (
            <SectionCard
              title={`${new Date(calYear, calMonth, selectedDay).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`}
              action={<button onClick={() => setSelectedDay(null)} className="size-7 rounded-md hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>}
            >
              <div className="space-y-3">
                {STUB_TEMPLATES.filter(t => {
                  const day = new Date(calYear, calMonth, selectedDay).toLocaleDateString("en-US", { weekday: "short" });
                  return t.days.some(d => d.startsWith(day.slice(0, 2)));
                }).flatMap(t => t.rings).map(ring => (
                  <div key={ring.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-elevated/50">
                    <div className="size-9 rounded-lg bg-info/10 grid place-items-center shrink-0">
                      <CalendarCheck className="size-4 text-info" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{ring.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1"><Clock className="size-3" />{ring.from}–{ring.to}</span>
                        <span className="flex items-center gap-1"><MapPin className="size-3" />{ring.location}</span>
                        <span className="flex items-center gap-1"><Users className="size-3" />{ring.rosterCount}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => toast.success("Override saved")} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-elevated cursor-pointer"><Edit2 className="size-3 inline mr-1" />Edit today</button>
                      <button onClick={() => toast.info("Notification sent")} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-elevated cursor-pointer"><Bell className="size-3 inline mr-1" />Notify</button>
                    </div>
                  </div>
                ))}
                {STUB_TEMPLATES.filter(t => {
                  const day = new Date(calYear, calMonth, selectedDay).toLocaleDateString("en-US", { weekday: "short" });
                  return t.days.some(d => d.startsWith(day.slice(0, 2)));
                }).length === 0 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">No sessions scheduled on this day.</div>
                )}
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Active Schedules" subtitle={`${STUB_TEMPLATES.length} schedule templates`}>
              {STUB_TEMPLATES.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No schedules yet. Create one to get started.</div>
              ) : (
                <div className="space-y-3">
                  {STUB_TEMPLATES.map(t => (
                    <div key={t.id} className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-border-strong transition-all">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{t.name}</span>
                          {t.isTournament && <span className="badge badge-neutral">Tournament</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>{t.days.join(", ")}</span>
                          <span>·</span>
                          <span>{t.validFrom} {t.validTo ? `→ ${t.validTo}` : "→ ongoing"}</span>
                          <span>·</span>
                          <span>{t.rings.length} ring{t.rings.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {t.rings.map(r => (
                            <span key={r.id} className="badge badge-neutral">{r.name} · {r.from}–{r.to}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => toast.error("Schedule deleted")}
                        className="size-8 rounded-lg hover:bg-destructive/10 hover:text-destructive grid place-items-center text-muted-foreground transition cursor-pointer shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      {/* New Schedule Wizard Modal */}
      {showNewWizard && (
        <NewScheduleModal onClose={() => setShowNewWizard(false)} />
      )}
    </div>
  );
}

function NewScheduleModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "", isTournament: false, days: [] as string[],
    validFrom: "", validTo: "",
  });

  function toggleDay(d: string) {
    setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }));
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="font-display font-bold">New Schedule</div>
            <div className="text-xs text-muted-foreground mt-0.5">Step {step} of 3</div>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>

        {/* Progress */}
        <div className="px-5 pt-4">
          <div className="flex gap-2">
            {["Basics", "Rings", "Review"].map((s, i) => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${i + 1 <= step ? "bg-info" : "bg-border"}`} />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Schedule Name *</span>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-premium" placeholder="e.g. Morning Training Block" />
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isTournament} onChange={e => setForm(f => ({ ...f, isTournament: e.target.checked }))} className="rounded" />
                  <span className="text-sm font-medium">Tournament schedule</span>
                </label>
              </div>
              <div>
                <div className="text-xs font-semibold mb-2">Days of week *</div>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map(d => (
                    <button key={d} onClick={() => toggleDay(d)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${form.days.includes(d) ? "bg-info text-white border-info" : "border-border hover:border-border-strong"}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5">Valid From *</span>
                  <input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} className="input-premium" />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5">Valid To (optional)</span>
                  <input type="date" value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} className="input-premium" />
                </label>
              </div>
            </>
          )}
          {step === 2 && (
            <div className="py-6 text-center text-muted-foreground">
              <CalendarCheck className="size-8 mx-auto mb-2" strokeWidth={1.5} />
              <div className="font-medium">Ring configuration</div>
              <div className="text-sm mt-1">Add rings with time slots, locations, and boxer rosters.</div>
              <div className="text-xs mt-3 text-info">TODO: wire to ring add/edit sub-form</div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Review</div>
              {[["Name", form.name || "—"], ["Type", form.isTournament ? "Tournament" : "Regular training"], ["Days", form.days.join(", ") || "—"], ["Valid From", form.validFrom || "—"], ["Valid To", form.validTo || "Ongoing"]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-border last:border-0 text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <button
            onClick={() => {
              if (step < 3) { setStep(s => s + 1); }
              else { toast.success("Schedule created"); onClose(); }
            }}
            disabled={step === 1 && (!form.name || form.days.length === 0 || !form.validFrom)}
            className="px-4 py-2 text-sm bg-info text-white rounded-lg hover:bg-info/90 disabled:opacity-50 font-semibold cursor-pointer"
          >
            {step === 3 ? "Create Schedule" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
