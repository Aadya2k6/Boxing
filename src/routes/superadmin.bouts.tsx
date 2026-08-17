import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import {
  Plus, X, Clock, Users, AlertTriangle, CheckCircle, Building2, Swords, Edit2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/bouts")({ component: SuperadminBouts });

function statusBadge(s: string) {
  const map: Record<string, string> = { scheduled: "info", weigh_in_confirmed: "warning", active: "success", completed: "neutral", in_progress: "success" };
  const mapped = map[s] || "neutral";
  return <span className={`badge badge-${mapped}`}>{s.replace(/_/g, ' ')}</span>;
}

function SuperadminBouts() {
  const { user } = useAuth();
  const [bouts, setBouts] = useState<any[]>([]);
  const [academies, setAcademies] = useState<any[]>([]);
  const [selectedAcademy, setSelectedAcademy] = useState("all");
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({
    redCorner: "", blueCorner: "", ageCategory: "", weightCategory: "", judgeCount: 3, academyId: ""
  });
  
  const [boxers, setBoxers] = useState<any[]>([]);
  const [ageCats, setAgeCats] = useState<any[]>([]);
  const [weightCats, setWeightCats] = useState<any[]>([]);
  const [ringInstances, setRingInstances] = useState<any[]>([]);
  const [ringSessions, setRingSessions] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [
        { data: bs }, { data: acs }, { data: bx }, { data: ac }, { data: wc }, { data: ri }, { data: rs }
      ] = await Promise.all([
        supabase.from("bouts").select(`
          *,
          red:boxer_red_id(id, first_name, last_name, academy_id),
          blue:boxer_blue_id(id, first_name, last_name),
          age:age_category_id(id, name, round_count, round_duration_seconds),
          weight:weight_category_id(id, weight_class),
          coach:coach_id(id, full_name)
        `).order("created_at", { ascending: false }),
        supabase.from("academies").select("id, name"),
        supabase.from("boxer_profiles").select("id, first_name, last_name, academy_id"),
        supabase.from("age_categories").select("*"),
        supabase.from("weight_categories").select("*"),
        supabase.from("ring_instances").select("id, name, academy_id"),
        supabase.from("ring_sessions").select("id, name, ring_instance_id")
      ]);

      setBouts(bs || []);
      setAcademies(acs || []);
      setBoxers(bx || []);
      setAgeCats(ac || []);
      setWeightCats(wc || []);
      setRingInstances(ri || []);
      setRingSessions(rs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = selectedAcademy === "all"
    ? bouts
    : bouts.filter(b => b.red?.academy_id === selectedAcademy || b.academy_id === selectedAcademy); // Basic filter

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const session = ringSessions[0];
      if (!session) throw new Error("No active ring session found. Please create a tournament first.");
      
      const payload = {
        ring_instance_id: session.ring_instance_id,
        ring_session_id: session.id,
        boxer_red_id: form.redCorner,
        boxer_blue_id: form.blueCorner,
        age_category_id: form.ageCategory,
        weight_category_id: form.weightCategory,
        judge_count: form.judgeCount,
        bout_kind: "training",
        created_by: user?.id
      };

      const { error } = await supabase.from("bouts").insert(payload);
      if (error) throw error;
      toast.success("Bout created successfully!");
      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Bout Management"
        subtitle="Platform-wide view of all bouts across academies"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> Add Bout
          </button>
        }
      />

      <div className="flex items-center gap-3">
        <Building2 className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
        <select value={selectedAcademy} onChange={e => setSelectedAcademy(e.target.value)} className="input-premium max-w-xs">
          <option value="all">All Academies</option>
          {academies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading bouts...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <Swords className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No bouts found</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(bout => {
            const acName = academies.find(a => a.id === bout.red?.academy_id)?.name || "Unknown Academy";
            return (
            <div key={bout.id} className="bg-surface border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-display font-bold text-sm">Bout #{bout.bout_number || "-"}</span>
                    {statusBadge(bout.status)}
                    <span className="badge badge-neutral">{bout.age?.name}</span>
                    <span className="badge badge-neutral">{bout.weight?.weight_class}</span>
                    <span className="badge badge-gold flex items-center gap-1"><Building2 className="size-2.5" />{acName}</span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap mt-2">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full bg-red-500 shrink-0" />
                      <AvatarInitials name={`${bout.red?.first_name} ${bout.red?.last_name}`} size="sm" />
                      <span className="text-sm font-semibold">{bout.red?.first_name} {bout.red?.last_name}</span>
                    </div>
                    <span className="text-muted-foreground font-bold text-sm">vs</span>
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full bg-blue-500 shrink-0" />
                      <AvatarInitials name={`${bout.blue?.first_name} ${bout.blue?.last_name}`} size="sm" />
                      <span className="text-sm font-semibold">{bout.blue?.first_name} {bout.blue?.last_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="size-3" />{bout.age?.round_count || 0}R × {bout.age?.round_duration_seconds || 0}s</span>
                    <span className="flex items-center gap-1"><Users className="size-3" />{bout.judge_count} judges</span>
                    {bout.coach
                      ? <span className="flex items-center gap-1"><CheckCircle className="size-3 text-success" />{bout.coach?.full_name}</span>
                      : <span className="flex items-center gap-1 text-warning"><AlertTriangle className="size-3" />No coach</span>}
                  </div>
                </div>
                <button className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-elevated flex items-center gap-1 cursor-pointer shrink-0"><Edit2 className="size-3" />Edit</button>
              </div>
            </div>
          )})}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl border border-border">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="font-display font-bold">Add Bout</div>
              <button onClick={() => setShowModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5 text-red-500">Red Corner *</span>
                  <select required value={form.redCorner} onChange={e => setForm({...form, redCorner: e.target.value})} className="input-premium">
                    <option value="">Select boxer...</option>
                    {boxers.map(b => <option key={b.id} value={b.id}>{b.first_name} {b.last_name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5 text-blue-500">Blue Corner *</span>
                  <select required value={form.blueCorner} onChange={e => setForm({...form, blueCorner: e.target.value})} className="input-premium">
                    <option value="">Select boxer...</option>
                    {boxers.filter(b => b.id !== form.redCorner).map(b => <option key={b.id} value={b.id}>{b.first_name} {b.last_name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5">Age Category *</span>
                  <select required value={form.ageCategory} onChange={e => setForm({...form, ageCategory: e.target.value})} className="input-premium">
                    <option value="">Select category...</option>
                    {ageCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5">Weight Category *</span>
                  <select required value={form.weightCategory} onChange={e => setForm({...form, weightCategory: e.target.value})} className="input-premium">
                    <option value="">Select category...</option>
                    {weightCats.map(c => <option key={c.id} value={c.id}>{c.weight_class}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5">Number of Judges</span>
                  <input type="number" required min={1} max={5} value={form.judgeCount} onChange={e => setForm({...form, judgeCount: +e.target.value})} className="input-premium" />
                </label>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-subtle">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#ef4444] text-white hover:bg-[#dc2626]">Save Bout</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
