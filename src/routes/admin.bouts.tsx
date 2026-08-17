import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import {
  Plus, X, ChevronRight, Users, Clock, Tag,
  AlertTriangle, Check, Baby, Swords, Edit2, CheckCircle
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/bouts")({ component: AdminBouts });

// ── Stub data — TODO: wire to bouts + bout_rounds + bout_judge_assignments tables
interface Bout {
  id: string;
  boutNumber: number;
  redCorner: string;
  blueCorner: string;
  ageCategory: string;
  weightCategory: string;
  status: "scheduled" | "weigh-in" | "active" | "completed";
  coachAssigned: string | null;
  judgeCount: number;
  roundCount: number;
  roundDuration: number;
  redSuspended?: boolean;
  blueSuspended?: boolean;
  redDeclarationStatus?: "declared" | "pending" | "missed" | null;
  blueDeclarationStatus?: "declared" | "pending" | "missed" | null;
}

const STUB_BOUTS: Bout[] = [
  {
    id: "b1", boutNumber: 1, redCorner: "Aisha Khan", blueCorner: "Priya Sharma",
    ageCategory: "Youth (17–18)", weightCategory: "60 kg",
    status: "scheduled", coachAssigned: "Coach Ravi", judgeCount: 3,
    roundCount: 3, roundDuration: 120,
    redDeclarationStatus: "declared", blueDeclarationStatus: "pending",
  },
  {
    id: "b2", boutNumber: 2, redCorner: "Meera Nair", blueCorner: "Divya Rao",
    ageCategory: "Senior (19+)", weightCategory: "54 kg",
    status: "weigh-in", coachAssigned: null, judgeCount: 3,
    roundCount: 5, roundDuration: 120,
  },
  {
    id: "b3", boutNumber: 3, redCorner: "Sana Sheikh", blueCorner: "Lakshmi Devi",
    ageCategory: "Junior (15–16)", weightCategory: "46 kg",
    status: "completed", coachAssigned: "Coach Ravi", judgeCount: 3,
    roundCount: 3, roundDuration: 120,
    redSuspended: true,
  },
];

const WEIGHT_CATEGORIES = ["46 kg", "50 kg", "54 kg", "57 kg", "60 kg", "63 kg", "66 kg", "70 kg", "75 kg", "81 kg", "+81 kg"];
const AGE_CATEGORIES = ["Junior (15–16)", "Youth (17–18)", "Senior (19+)"];
const STUB_BOXERS = ["Aisha Khan", "Priya Sharma", "Meera Nair", "Divya Rao", "Sana Sheikh", "Lakshmi Devi", "Riya Joshi", "Kavya Patel"];
const STUB_COACHES = ["Coach Ravi", "Coach Meena", "Coach Arjun"];

function statusBadge(status: Bout["status"]) {
  const map: Record<Bout["status"], { tone: any; label: string }> = {
    scheduled: { tone: "info", label: "Scheduled" },
    "weigh-in": { tone: "warning", label: "Weigh-in" },
    active: { tone: "success", label: "Active" },
    completed: { tone: "neutral", label: "Completed" },
  };
  const { tone, label } = map[status];
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function declarationBadge(s: Bout["redDeclarationStatus"]) {
  if (!s) return null;
  if (s === "declared") return <span className="badge badge-success">Declared</span>;
  if (s === "pending") return <span className="badge badge-warning">Pending</span>;
  return <span className="badge badge-danger">Missed</span>;
}

function AddEditBoutModal({ onClose, existing }: { onClose: () => void; existing?: Bout }) {
  const [form, setForm] = useState({
    redCorner: existing?.redCorner ?? "",
    blueCorner: existing?.blueCorner ?? "",
    ageCategory: existing?.ageCategory ?? AGE_CATEGORIES[0],
    weightCategory: existing?.weightCategory ?? WEIGHT_CATEGORIES[4],
    roundCount: existing?.roundCount ?? 3,
    roundDuration: existing?.roundDuration ?? 120,
    restDuration: 60,
    judgeCount: existing?.judgeCount ?? 3,
    coachAssigned: existing?.coachAssigned ?? "",
    boutKind: "training",
  });

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
          <div className="font-display font-bold">{existing ? "Edit Bout" : "Add Bout"}</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          {/* Corner pickers */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5"><span className="size-3 rounded-full bg-red-500 inline-block" />Red Corner *</span>
              <select value={form.redCorner} onChange={e => setForm(f => ({ ...f, redCorner: e.target.value }))} className="input-premium">
                <option value="">Select boxer…</option>
                {STUB_BOXERS.map(b => <option key={b}>{b}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5"><span className="size-3 rounded-full bg-blue-500 inline-block" />Blue Corner *</span>
              <select value={form.blueCorner} onChange={e => setForm(f => ({ ...f, blueCorner: e.target.value }))} className="input-premium">
                <option value="">Select boxer…</option>
                {STUB_BOXERS.filter(b => b !== form.redCorner).map(b => <option key={b}>{b}</option>)}
              </select>
            </label>
          </div>

          {/* Category pickers */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Age Category *</span>
              <select value={form.ageCategory} onChange={e => setForm(f => ({ ...f, ageCategory: e.target.value }))} className="input-premium">
                {AGE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Weight Category *</span>
              <select value={form.weightCategory} onChange={e => setForm(f => ({ ...f, weightCategory: e.target.value }))} className="input-premium">
                {WEIGHT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {/* Round / duration */}
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Rounds</span>
              <input type="number" min={1} max={12} value={form.roundCount} onChange={e => setForm(f => ({ ...f, roundCount: +e.target.value }))} className="input-premium" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Round (sec)</span>
              <input type="number" min={60} max={300} step={10} value={form.roundDuration} onChange={e => setForm(f => ({ ...f, roundDuration: +e.target.value }))} className="input-premium" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Rest (sec)</span>
              <input type="number" min={30} max={120} step={10} value={form.restDuration} onChange={e => setForm(f => ({ ...f, restDuration: +e.target.value }))} className="input-premium" />
            </label>
          </div>

          {/* Judge count */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Judge Count (1–5)</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, judgeCount: Math.max(1, f.judgeCount - 1) }))} className="size-9 rounded-lg border border-border hover:bg-elevated grid place-items-center cursor-pointer text-sm font-bold">−</button>
                <span className="flex-1 text-center font-semibold text-lg">{form.judgeCount}</span>
                <button onClick={() => setForm(f => ({ ...f, judgeCount: Math.min(5, f.judgeCount + 1) }))} className="size-9 rounded-lg border border-border hover:bg-elevated grid place-items-center cursor-pointer text-sm font-bold">+</button>
              </div>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Coach *</span>
              <select value={form.coachAssigned} onChange={e => setForm(f => ({ ...f, coachAssigned: e.target.value }))} className="input-premium">
                <option value="">Select coach…</option>
                {STUB_COACHES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {/* Bout kind */}
          <div>
            <div className="text-xs font-semibold mb-2">Bout Type</div>
            <div className="flex gap-2">
              {["training", "tournament"].map(k => (
                <button key={k} onClick={() => setForm(f => ({ ...f, boutKind: k }))} className={`px-4 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer capitalize ${form.boutKind === k ? "bg-info text-white border-info" : "border-border hover:border-border-strong"}`}>{k}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-border sticky bottom-0 bg-surface">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button
            onClick={() => { toast.success(existing ? "Bout updated" : "Bout created"); onClose(); }}
            disabled={!form.redCorner || !form.blueCorner || !form.coachAssigned}
            className="px-4 py-2 text-sm bg-info text-white rounded-lg hover:bg-info/90 disabled:opacity-50 font-semibold cursor-pointer"
          >
            {existing ? "Save Changes" : "Create Bout"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WeighInModal({ bout, onClose }: { bout: Bout; onClose: () => void }) {
  const [redWeight, setRedWeight] = useState("");
  const [blueWeight, setBlueWeight] = useState("");
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Confirm Weigh-in</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5"><span className="size-3 rounded-full bg-red-500 inline-block" />{bout.redCorner} — declared weight (kg)</span>
            <input type="number" value={redWeight} onChange={e => setRedWeight(e.target.value)} className="input-premium" placeholder="e.g. 59.8" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5"><span className="size-3 rounded-full bg-blue-500 inline-block" />{bout.blueCorner} — declared weight (kg)</span>
            <input type="number" value={blueWeight} onChange={e => setBlueWeight(e.target.value)} className="input-premium" placeholder="e.g. 60.0" />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg cursor-pointer hover:bg-elevated">Cancel</button>
          <button onClick={() => { toast.success("Weigh-in confirmed"); onClose(); }} disabled={!redWeight || !blueWeight} className="px-4 py-2 text-sm bg-info text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-info/90">Confirm Weigh-in</button>
        </div>
      </div>
    </div>
  );
}

function AssignJudgesModal({ bout, onClose }: { bout: Bout; onClose: () => void }) {
  const [judges, setJudges] = useState<string[]>(Array(bout.judgeCount).fill(""));
  const JUDGE_OPTIONS = ["Judge Kumar", "Judge Rao", "Judge Mehta", "Coach Ravi", "Admin Staff"];
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Assign Judges</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          {judges.map((j, i) => (
            <label key={i} className="block">
              <span className="block text-xs font-semibold mb-1.5">Judge Slot {i + 1}</span>
              <select value={j} onChange={e => { const next = [...judges]; next[i] = e.target.value; setJudges(next); }} className="input-premium">
                <option value="">Select judge…</option>
                {JUDGE_OPTIONS.map(opt => <option key={opt}>{opt}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg cursor-pointer hover:bg-elevated">Cancel</button>
          <button onClick={() => { toast.success("Judges assigned"); onClose(); }} className="px-4 py-2 text-sm bg-info text-white rounded-lg font-semibold cursor-pointer hover:bg-info/90">Save Assignments</button>
        </div>
      </div>
    </div>
  );
}

function AdminBouts() {
  const [showAdd, setShowAdd] = useState(false);
  const [editBout, setEditBout] = useState<Bout | null>(null);
  const [weighInBout, setWeighInBout] = useState<Bout | null>(null);
  const [assignJudgesBout, setAssignJudgesBout] = useState<Bout | null>(null);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Bout Management"
        subtitle="Schedule, manage and monitor boxing bouts"
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 bg-info text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-info/90 transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> Add Bout
          </button>
        }
      />

      {STUB_BOUTS.length === 0 ? (
        <div className="bento-card p-12 text-center">
          <Swords className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No bouts scheduled</div>
        </div>
      ) : (
        <div className="space-y-3">
          {STUB_BOUTS.map(bout => (
            <div key={bout.id} className="bento-card p-5">
              <div className="flex items-start gap-4 flex-wrap">
                {/* Bout number + corners */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-display font-bold text-sm">Bout #{bout.boutNumber}</span>
                    {statusBadge(bout.status)}
                    <span className="badge badge-neutral">{bout.ageCategory}</span>
                    <span className="badge badge-neutral">{bout.weightCategory}</span>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Red corner */}
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full bg-red-500 shrink-0" />
                      <AvatarInitials name={bout.redCorner} size="sm" />
                      <div>
                        <div className="text-sm font-semibold">{bout.redCorner}</div>
                        {bout.redSuspended && <span className="badge badge-danger text-[10px]">Suspended</span>}
                        {bout.redDeclarationStatus && declarationBadge(bout.redDeclarationStatus)}
                      </div>
                    </div>
                    <span className="text-muted-foreground font-bold text-sm">vs</span>
                    {/* Blue corner */}
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full bg-blue-500 shrink-0" />
                      <AvatarInitials name={bout.blueCorner} size="sm" />
                      <div>
                        <div className="text-sm font-semibold">{bout.blueCorner}</div>
                        {bout.blueSuspended && <span className="badge badge-danger text-[10px]">Suspended</span>}
                        {bout.blueDeclarationStatus && declarationBadge(bout.blueDeclarationStatus)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="size-3" />{bout.roundCount}R × {bout.roundDuration}s</span>
                    <span className="flex items-center gap-1"><Users className="size-3" />{bout.judgeCount} judge{bout.judgeCount !== 1 ? "s" : ""}</span>
                    {bout.coachAssigned ? (
                      <span className="flex items-center gap-1"><CheckCircle className="size-3 text-success" />{bout.coachAssigned}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-warning"><AlertTriangle className="size-3" />No coach assigned</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => setEditBout(bout)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-elevated flex items-center gap-1 cursor-pointer"><Edit2 className="size-3" />Edit</button>
                  {bout.status === "scheduled" && (
                    <button onClick={() => setWeighInBout(bout)} className="px-3 py-1.5 text-xs border border-warning/40 text-warning bg-warning/8 rounded-lg hover:bg-warning/15 flex items-center gap-1 cursor-pointer"><Check className="size-3" />Weigh-in</button>
                  )}
                  <button onClick={() => setAssignJudgesBout(bout)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-elevated flex items-center gap-1 cursor-pointer"><Users className="size-3" />Judges</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddEditBoutModal onClose={() => setShowAdd(false)} />}
      {editBout && <AddEditBoutModal existing={editBout} onClose={() => setEditBout(null)} />}
      {weighInBout && <WeighInModal bout={weighInBout} onClose={() => setWeighInBout(null)} />}
      {assignJudgesBout && <AssignJudgesModal bout={assignJudgesBout} onClose={() => setAssignJudgesBout(null)} />}
    </div>
  );
}
