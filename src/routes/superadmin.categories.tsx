import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { Plus, X, Edit2, Globe, Building2, Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/categories")({ component: SuperadminCategories });

// ── Stub data — TODO: wire to age_categories + weight_categories tables
// Global defaults vs academy overrides per architecture.md §3.4
interface AgeCategory {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
  isGlobal: boolean;
  gender: "male" | "female" | "both";
}

interface WeightCategory {
  id: string;
  name: string;
  maxWeightKg: number;
  gender: "male" | "female";
  ageCategoryId: string;
  isGlobal: boolean;
}

const STUB_AGE: AgeCategory[] = [
  { id: "a1", name: "Junior", minAge: 15, maxAge: 16, isGlobal: true, gender: "both" },
  { id: "a2", name: "Youth", minAge: 17, maxAge: 18, isGlobal: true, gender: "both" },
  { id: "a3", name: "Senior", minAge: 19, maxAge: 40, isGlobal: true, gender: "both" },
  { id: "a4", name: "Masters", minAge: 41, maxAge: 99, isGlobal: false, gender: "both" },
];

const STUB_WEIGHT: WeightCategory[] = [
  { id: "w1", name: "50 kg", maxWeightKg: 50, gender: "female", ageCategoryId: "a2", isGlobal: true },
  { id: "w2", name: "54 kg", maxWeightKg: 54, gender: "female", ageCategoryId: "a2", isGlobal: true },
  { id: "w3", name: "57 kg", maxWeightKg: 57, gender: "female", ageCategoryId: "a2", isGlobal: true },
  { id: "w4", name: "60 kg", maxWeightKg: 60, gender: "female", ageCategoryId: "a2", isGlobal: true },
  { id: "w5", name: "63 kg", maxWeightKg: 63, gender: "female", ageCategoryId: "a3", isGlobal: true },
  { id: "w6", name: "70 kg", maxWeightKg: 70, gender: "female", ageCategoryId: "a3", isGlobal: false },
];

type Tab = "age" | "weight";

function SourceBadge({ isGlobal }: { isGlobal: boolean }) {
  return isGlobal ? (
    <span className="badge badge-info flex items-center gap-1"><Globe className="size-2.5" />BOXOS Default</span>
  ) : (
    <span className="badge badge-gold flex items-center gap-1"><Building2 className="size-2.5" />Academy Override</span>
  );
}

function AgeCategoryModal({ existing, onClose }: { existing?: AgeCategory; onClose: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    minAge: existing?.minAge ?? 15,
    maxAge: existing?.maxAge ?? 18,
    gender: existing?.gender ?? "both",
  });
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">{existing ? "Edit Age Category" : "Add Age Category"}</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Name *</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-premium" placeholder="e.g. Youth" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Min Age *</span>
              <input type="number" min={10} max={99} value={form.minAge} onChange={e => setForm(f => ({ ...f, minAge: +e.target.value }))} className="input-premium" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Max Age *</span>
              <input type="number" min={10} max={99} value={form.maxAge} onChange={e => setForm(f => ({ ...f, maxAge: +e.target.value }))} className="input-premium" />
            </label>
          </div>
          <div>
            <div className="text-xs font-semibold mb-2">Gender</div>
            <div className="flex gap-2">
              {(["both", "female", "male"] as const).map(g => (
                <button key={g} onClick={() => setForm(f => ({ ...f, gender: g }))} className={`px-4 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer capitalize ${form.gender === g ? "bg-primary-dark text-white border-primary-dark" : "border-border hover:border-border-strong"}`}>{g}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button onClick={() => { toast.success(existing ? "Category updated" : "Category added"); onClose(); }} disabled={!form.name} className="px-4 py-2 text-sm bg-primary-dark text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-primary-dark/90">{existing ? "Save" : "Add Category"}</button>
        </div>
      </div>
    </div>
  );
}

function WeightCategoryModal({ existing, onClose }: { existing?: WeightCategory; onClose: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    maxWeightKg: existing?.maxWeightKg ?? 60,
    gender: existing?.gender ?? "female",
    ageCategoryId: existing?.ageCategoryId ?? "a2",
  });
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">{existing ? "Edit Weight Category" : "Add Weight Category"}</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Name *</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-premium" placeholder="e.g. 60 kg" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Max Weight (kg) *</span>
            <input type="number" min={30} max={150} value={form.maxWeightKg} onChange={e => setForm(f => ({ ...f, maxWeightKg: +e.target.value }))} className="input-premium" />
          </label>
          <div>
            <div className="text-xs font-semibold mb-2">Gender *</div>
            <div className="flex gap-2">
              {(["female", "male"] as const).map(g => (
                <button key={g} onClick={() => setForm(f => ({ ...f, gender: g }))} className={`px-4 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer capitalize ${form.gender === g ? "bg-primary-dark text-white border-primary-dark" : "border-border hover:border-border-strong"}`}>{g}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Age Category *</span>
            <select value={form.ageCategoryId} onChange={e => setForm(f => ({ ...f, ageCategoryId: e.target.value }))} className="input-premium">
              {STUB_AGE.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button onClick={() => { toast.success(existing ? "Category updated" : "Category added"); onClose(); }} disabled={!form.name} className="px-4 py-2 text-sm bg-primary-dark text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-primary-dark/90">{existing ? "Save" : "Add Category"}</button>
        </div>
      </div>
    </div>
  );
}

function SuperadminCategories() {
  const [tab, setTab] = useState<Tab>("age");
  const [showAddAge, setShowAddAge] = useState(false);
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [editAge, setEditAge] = useState<AgeCategory | null>(null);
  const [editWeight, setEditWeight] = useState<WeightCategory | null>(null);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Age &amp; Weight Categories"
        subtitle="Configure global defaults and academy-specific overrides"
        actions={
          <button
            onClick={() => tab === "age" ? setShowAddAge(true) : setShowAddWeight(true)}
            className="inline-flex items-center gap-2 bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-dark/90 transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> Add {tab === "age" ? "Age" : "Weight"} Category
          </button>
        }
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-info/8 border border-info/20 rounded-xl px-4 py-3">
        <Layers className="size-4 text-info shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">BOXOS Default</span> categories apply to all academies on the platform. <span className="font-semibold text-foreground">Academy Override</span> categories are specific to this academy and take precedence for matching boxers.
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 bg-elevated rounded-xl w-fit">
        {(["age", "weight"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 text-sm font-medium rounded-lg capitalize transition cursor-pointer ${tab === t ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "age" ? "Age Categories" : "Weight Categories"}
          </button>
        ))}
      </div>

      {tab === "age" ? (
        <SectionCard title="Age Categories" subtitle={`${STUB_AGE.length} categories defined`}>
          <DataTable
            headers={["Name", "Age Range", "Gender", "Source", "Actions"]}
            rows={STUB_AGE.map(cat => [
              <span className="font-semibold text-sm">{cat.name}</span>,
              <span className="text-sm tabular">{cat.minAge}–{cat.maxAge} yrs</span>,
              <span className="badge badge-neutral capitalize">{cat.gender}</span>,
              <SourceBadge isGlobal={cat.isGlobal} />,
              !cat.isGlobal ? (
                <button onClick={() => setEditAge(cat)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-elevated cursor-pointer"><Edit2 className="size-3" />Edit</button>
              ) : <span className="text-xs text-muted-foreground">Platform-managed</span>,
            ])}
          />
        </SectionCard>
      ) : (
        <SectionCard title="Weight Categories" subtitle={`${STUB_WEIGHT.length} categories defined`}>
          <DataTable
            headers={["Name", "Max Weight", "Gender", "Age Category", "Source", "Actions"]}
            rows={STUB_WEIGHT.map(cat => {
              const ageCat = STUB_AGE.find(a => a.id === cat.ageCategoryId);
              return [
                <span className="font-semibold text-sm">{cat.name}</span>,
                <span className="text-sm tabular">{cat.maxWeightKg} kg</span>,
                <span className="badge badge-neutral capitalize">{cat.gender}</span>,
                <span className="text-xs text-muted-foreground">{ageCat?.name ?? "—"}</span>,
                <SourceBadge isGlobal={cat.isGlobal} />,
                !cat.isGlobal ? (
                  <button onClick={() => setEditWeight(cat)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-elevated cursor-pointer"><Edit2 className="size-3" />Edit</button>
                ) : <span className="text-xs text-muted-foreground">Platform-managed</span>,
              ];
            })}
          />
        </SectionCard>
      )}

      {showAddAge && <AgeCategoryModal onClose={() => setShowAddAge(false)} />}
      {showAddWeight && <WeightCategoryModal onClose={() => setShowAddWeight(false)} />}
      {editAge && <AgeCategoryModal existing={editAge} onClose={() => setEditAge(null)} />}
      {editWeight && <WeightCategoryModal existing={editWeight} onClose={() => setEditWeight(null)} />}
    </div>
  );
}
