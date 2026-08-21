import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Plus, X, Loader2, Dumbbell, ToggleLeft, ToggleRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/fitness-catalog")({ component: FitnessCatalogPage });

function FitnessCatalogPage() {
  const { user, profile } = useAuth();
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTests(); }, []);

  async function loadTests() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("fitness_test_types")
        .select("*")
        .order("created_at", { ascending: false });
      setTests(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("fitness_test_types").insert({
        name: form.name.trim(),
        unit: form.unit.trim(),
        description: form.description.trim() || null,
        academy_id: profile?.academy_id ?? null,
        created_by: user?.id,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Test type added");
      setShowModal(false);
      setForm({ name: "", unit: "", description: "" });
      loadTests();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    const { error } = await supabase.from("fitness_test_types").update({ is_active: !current }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    loadTests();
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Fitness Catalog"
        subtitle={`${tests.length} test type${tests.length !== 1 ? "s" : ""} defined`}
        actions={
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card">
            <Plus className="size-3.5" /> Add Test
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : tests.length === 0 ? (
        <div className="bento-card p-12 text-center">
          <Dumbbell className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold">No fitness tests yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add test types to record boxer fitness data.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated/60 border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Test Name</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</th>
                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-elevated/30">
                  <td className="px-5 py-3.5 font-semibold">{t.name}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{t.unit}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{t.description ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <button onClick={() => toggleActive(t.id, t.is_active)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${t.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {t.is_active ? <ToggleRight className="size-3.5" /> : <ToggleLeft className="size-3.5" />}
                      {t.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-modal w-full max-w-md animate-fade-up">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="font-display font-bold">Add Fitness Test Type</div>
              <button onClick={() => setShowModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Test Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 40m Sprint, Beep Test, Push-up Max" className="input-premium" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Unit *</label>
                <input required value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. seconds, reps, meters, level" className="input-premium" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description of the test..." className="input-premium resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-elevated">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add Test
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

