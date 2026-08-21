import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Plus, X, Loader2, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/categories")({ component: CategoriesPage });

const GENDER_SCOPES = ["men", "women", "boys", "girls", "all"];
const GENDERS = ["men", "women", "boys", "girls"];
const GLOVE_WEIGHTS = [10, 12];

function CategoriesPage() {
  const { user, profile } = useAuth();
  const [ageCategories, setAgeCategories] = useState<any[]>([]);
  const [weightCategories, setWeightCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"age" | "weight">("age");

  // Age category modal
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [ageForm, setAgeForm] = useState({ name: "", min_age: "", max_age: "", gender_scope: "all", round_count: "3", round_duration_seconds: "180", rest_duration_seconds: "60" });
  const [savingAge, setSavingAge] = useState(false);

  // Weight category modal
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightForm, setWeightForm] = useState({ age_category_id: "", name: "", min_kg: "", max_kg: "", gender: "men", glove_oz: "10" });
  const [savingWeight, setSavingWeight] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: ages }, { data: weights }] = await Promise.all([
        supabase.from("age_categories").select("*").order("min_age"),
        supabase.from("weight_categories").select("*, age_categories(name)").order("sort_order"),
      ]);
      setAgeCategories(ages ?? []);
      setWeightCategories(weights ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAge(e: React.FormEvent) {
    e.preventDefault();
    setSavingAge(true);
    try {
      const { error } = await supabase.from("age_categories").insert({
        name: ageForm.name.trim(),
        min_age: parseInt(ageForm.min_age),
        max_age: ageForm.max_age ? parseInt(ageForm.max_age) : null,
        gender_scope: ageForm.gender_scope,
        round_count: parseInt(ageForm.round_count),
        round_duration_seconds: parseInt(ageForm.round_duration_seconds),
        rest_duration_seconds: parseInt(ageForm.rest_duration_seconds),
        academy_id: profile?.academy_id ?? null,
        created_by: user?.id,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Age category added");
      setShowAgeModal(false);
      setAgeForm({ name: "", min_age: "", max_age: "", gender_scope: "all", round_count: "3", round_duration_seconds: "180", rest_duration_seconds: "60" });
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingAge(false);
    }
  }

  async function handleSaveWeight(e: React.FormEvent) {
    e.preventDefault();
    setSavingWeight(true);
    try {
      const { error } = await supabase.from("weight_categories").insert({
        name: weightForm.name.trim(),
        age_category_id: weightForm.age_category_id,
        min_kg: parseFloat(weightForm.min_kg),
        max_kg: weightForm.max_kg ? parseFloat(weightForm.max_kg) : null,
        gender: weightForm.gender,
        glove_oz: parseInt(weightForm.glove_oz),
        academy_id: profile?.academy_id ?? null,
        created_by: user?.id,
        is_active: true,
        sort_order: weightCategories.length,
      });
      if (error) throw error;
      toast.success("Weight category added");
      setShowWeightModal(false);
      setWeightForm({ age_category_id: "", name: "", min_kg: "", max_kg: "", gender: "men", glove_oz: "10" });
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingWeight(false);
    }
  }

  const tabs = [
    { id: "age", label: "Age Categories" },
    { id: "weight", label: "Weight Categories" },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Categories"
        subtitle="Manage age and weight categories for bouts and scheduling"
        actions={
          <button
            onClick={() => activeTab === "age" ? setShowAgeModal(true) : setShowWeightModal(true)}
            className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card"
          >
            <Plus className="size-3.5" /> Add {activeTab === "age" ? "Age" : "Weight"} Category
          </button>
        }
      />

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-elevated rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === t.id ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : activeTab === "age" ? (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {ageCategories.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">No age categories yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-elevated/60 border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Age Range</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Gender Scope</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Rounds</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Round / Rest</th>
                </tr>
              </thead>
              <tbody>
                {ageCategories.map(ac => (
                  <tr key={ac.id} className="border-b border-border/50 hover:bg-elevated/30">
                    <td className="px-5 py-3.5 font-semibold">{ac.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{ac.min_age}–{ac.max_age ?? "∞"} yrs</td>
                    <td className="px-5 py-3.5 capitalize text-muted-foreground">{ac.gender_scope}</td>
                    <td className="px-5 py-3.5">{ac.round_count}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{ac.round_duration_seconds}s / {ac.rest_duration_seconds}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {weightCategories.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">No weight categories yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-elevated/60 border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Age Category</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Weight Range</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Gender</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Gloves</th>
                </tr>
              </thead>
              <tbody>
                {weightCategories.map(wc => (
                  <tr key={wc.id} className="border-b border-border/50 hover:bg-elevated/30">
                    <td className="px-5 py-3.5 font-semibold">{wc.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{wc.age_categories?.name ?? "—"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{wc.min_kg}–{wc.max_kg ?? "∞"} kg</td>
                    <td className="px-5 py-3.5 capitalize text-muted-foreground">{wc.gender}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{wc.glove_oz}oz</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Age Category Modal */}
      {showAgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-modal w-full max-w-md animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
              <div className="font-display font-bold">Add Age Category</div>
              <button onClick={() => setShowAgeModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleSaveAge} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Category Name *</label>
                <input required value={ageForm.name} onChange={e => setAgeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sub-Junior, Junior, Senior" className="input-premium" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Min Age *</label>
                  <input required type="number" min="0" value={ageForm.min_age} onChange={e => setAgeForm(f => ({ ...f, min_age: e.target.value }))} className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Max Age (leave blank = unlimited)</label>
                  <input type="number" min="0" value={ageForm.max_age} onChange={e => setAgeForm(f => ({ ...f, max_age: e.target.value }))} className="input-premium" placeholder="∞" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Gender Scope *</label>
                <select value={ageForm.gender_scope} onChange={e => setAgeForm(f => ({ ...f, gender_scope: e.target.value }))} className="input-premium">
                  {GENDER_SCOPES.map(g => <option key={g} value={g} className="capitalize">{g}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">No. of Rounds *</label>
                  <input required type="number" min="1" value={ageForm.round_count} onChange={e => setAgeForm(f => ({ ...f, round_count: e.target.value }))} className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Round Time (sec) *</label>
                  <input required type="number" min="1" value={ageForm.round_duration_seconds} onChange={e => setAgeForm(f => ({ ...f, round_duration_seconds: e.target.value }))} className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Rest Time (sec) *</label>
                  <input required type="number" min="0" value={ageForm.rest_duration_seconds} onChange={e => setAgeForm(f => ({ ...f, rest_duration_seconds: e.target.value }))} className="input-premium" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAgeModal(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-elevated">Cancel</button>
                <button type="submit" disabled={savingAge} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingAge ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Weight Category Modal */}
      {showWeightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-modal w-full max-w-md animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
              <div className="font-display font-bold">Add Weight Category</div>
              <button onClick={() => setShowWeightModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleSaveWeight} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Age Category *</label>
                <select required value={weightForm.age_category_id} onChange={e => setWeightForm(f => ({ ...f, age_category_id: e.target.value }))} className="input-premium">
                  <option value="">Select age category...</option>
                  {ageCategories.map(ac => <option key={ac.id} value={ac.id}>{ac.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Weight Class Name *</label>
                <input required value={weightForm.name} onChange={e => setWeightForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Flyweight, Lightweight" className="input-premium" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Min Weight (kg) *</label>
                  <input required type="number" step="0.1" min="0" value={weightForm.min_kg} onChange={e => setWeightForm(f => ({ ...f, min_kg: e.target.value }))} className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Max Weight (kg, blank = no limit)</label>
                  <input type="number" step="0.1" min="0" value={weightForm.max_kg} onChange={e => setWeightForm(f => ({ ...f, max_kg: e.target.value }))} className="input-premium" placeholder="∞" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Gender *</label>
                  <select value={weightForm.gender} onChange={e => setWeightForm(f => ({ ...f, gender: e.target.value }))} className="input-premium">
                    {GENDERS.map(g => <option key={g} value={g} className="capitalize">{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Glove Weight *</label>
                  <select value={weightForm.glove_oz} onChange={e => setWeightForm(f => ({ ...f, glove_oz: e.target.value }))} className="input-premium">
                    {GLOVE_WEIGHTS.map(g => <option key={g} value={g}>{g}oz</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowWeightModal(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-elevated">Cancel</button>
                <button type="submit" disabled={savingWeight} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingWeight ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

