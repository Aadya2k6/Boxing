import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import {
  Plus, X, Clock, Users, AlertTriangle, CheckCircle, Swords, Edit2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/bouts")({ component: AdminBouts });

function statusBadge(s: string) {
  const map: Record<string, string> = {
    scheduled: "info",
    weigh_in_confirmed: "warning",
    active: "success",
    completed: "neutral",
    in_progress: "success",
    cancelled: "danger",
  };
  const tone = map[s] || "neutral";
  return <Badge tone={tone as any}>{s.replace(/_/g, " ")}</Badge>;
}

function AdminBouts() {
  const { user, profile } = useAuth();
  const [bouts, setBouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({
    redCorner: "",
    blueCorner: "",
    ageCategory: "",
    weightCategory: "",
    judgeCount: 3,
  });

  const [boxers, setBoxers] = useState<any[]>([]);
  const [ageCats, setAgeCats] = useState<any[]>([]);
  const [weightCats, setWeightCats] = useState<any[]>([]);
  const [ringInstances, setRingInstances] = useState<any[]>([]);
  const [ringSessions, setRingSessions] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();

    const channel = supabase.channel("admin-bouts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bouts" }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.academy_id]);

  async function loadData() {
    setLoading(true);
    try {
      const academyId = profile?.academy_id;

      let boutsQuery = supabase.from("bouts").select(`
        *,
        red:boxer_red_id(id, full_name, first_name, last_name, academy_id),
        blue:boxer_blue_id(id, full_name, first_name, last_name),
        age:age_category_id(id, name, round_count, round_duration_seconds),
        weight:weight_category_id(id, weight_class),
        coach:coach_id(id, full_name)
      `).order("created_at", { ascending: false });

      let boxersQuery = supabase.from("boxer_profiles").select("id, full_name, first_name, last_name, academy_id").order("full_name");
      let instancesQuery = supabase.from("ring_instances").select("id, name, academy_id");
      let sessionsQuery = supabase.from("ring_sessions").select("id, name, ring_instance_id");

      if (academyId) {
        boxersQuery = boxersQuery.eq("academy_id", academyId);
        instancesQuery = instancesQuery.eq("academy_id", academyId);
      }

      const [
        { data: bs, error: bErr },
        { data: bx, error: bxErr },
        { data: ac, error: acErr },
        { data: wc, error: wcErr },
        { data: ri, error: riErr },
        { data: rs, error: rsErr },
      ] = await Promise.all([
        boutsQuery,
        boxersQuery,
        supabase.from("age_categories").select("*").order("name"),
        supabase.from("weight_categories").select("*").order("weight_class"),
        instancesQuery,
        sessionsQuery,
      ]);

      if (bErr) console.error("Error fetching bouts:", bErr);
      if (bxErr) console.error("Error fetching boxers:", bxErr);

      setBouts(bs || []);
      setBoxers(bx || []);
      setAgeCats(ac || []);
      setWeightCats(wc || []);
      setRingInstances(ri || []);
      setRingSessions(rs || []);

      if (ac && ac.length > 0 && !form.ageCategory) {
        setForm((f: any) => ({ ...f, ageCategory: ac[0].id }));
      }
      if (wc && wc.length > 0 && !form.weightCategory) {
        setForm((f: any) => ({ ...f, weightCategory: wc[0].id }));
      }
    } catch (e) {
      console.error("Error loading bouts data:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.redCorner || !form.blueCorner) {
      toast.error("Please select boxers for both Red and Blue corners.");
      return;
    }
    if (form.redCorner === form.blueCorner) {
      toast.error("Red and Blue corners cannot be the same boxer.");
      return;
    }

    setSubmitting(true);
    try {
      let ringInstanceId = ringInstances[0]?.id;
      let ringSessionId = ringSessions[0]?.id;

      if (!ringInstanceId) {
        const { data: newInst } = await supabase.from("ring_instances").insert({
          name: "Main Ring",
          academy_id: profile?.academy_id || boxers[0]?.academy_id,
        }).select("id").single();
        if (newInst) ringInstanceId = newInst.id;
      }

      if (!ringSessionId && ringInstanceId) {
        const { data: newSess } = await supabase.from("ring_sessions").insert({
          name: "Daily Sparring Session",
          ring_instance_id: ringInstanceId,
        }).select("id").single();
        if (newSess) ringSessionId = newSess.id;
      }

      const payload = {
        ring_instance_id: ringInstanceId,
        ring_session_id: ringSessionId,
        boxer_red_id: form.redCorner,
        boxer_blue_id: form.blueCorner,
        age_category_id: form.ageCategory || ageCats[0]?.id,
        weight_category_id: form.weightCategory || weightCats[0]?.id,
        judge_count: form.judgeCount || 3,
        bout_kind: "training",
        status: "scheduled",
        created_by: user?.id,
      };

      const { error } = await supabase.from("bouts").insert(payload);
      if (error) throw error;

      toast.success("Bout created successfully!");
      setShowModal(false);
      setForm({
        redCorner: "",
        blueCorner: "",
        ageCategory: ageCats[0]?.id || "",
        weightCategory: weightCats[0]?.id || "",
        judgeCount: 3,
      });
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create bout");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(boutId: string, newStatus: string) {
    try {
      const { error } = await supabase.from("bouts").update({ status: newStatus }).eq("id", boutId);
      if (error) throw error;
      toast.success(`Bout status updated to ${newStatus.replace(/_/g, " ")}`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update bout status");
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Bout Management"
        subtitle="Schedule and manage academy training and tournament bouts"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> Add Bout
          </button>
        }
      />

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading bouts...</div>
      ) : bouts.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <Swords className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No bouts found</div>
          <p className="text-xs text-muted-foreground mt-1">Click "Add Bout" above to create your first bout.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bouts.map((b) => {
            const redName = b.red?.full_name || (b.red ? `${b.red.first_name || ""} ${b.red.last_name || ""}`.trim() : "Red Boxer");
            const blueName = b.blue?.full_name || (b.blue ? `${b.blue.first_name || ""} ${b.blue.last_name || ""}`.trim() : "Blue Boxer");

            return (
              <div key={b.id} className="bg-surface border border-border rounded-xl p-5 hover:border-border/80 transition shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-subtle grid place-items-center shrink-0">
                      <Swords className="size-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-base text-red-600 flex items-center gap-1.5">
                          <span className="size-2.5 rounded-full bg-red-500 inline-block" />
                          {redName}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground uppercase">vs</span>
                        <span className="font-bold text-base text-blue-600 flex items-center gap-1.5">
                          <span className="size-2.5 rounded-full bg-blue-500 inline-block" />
                          {blueName}
                        </span>
                        {statusBadge(b.status || "scheduled")}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1 flex-wrap">
                        <span>Category: <strong>{b.age?.name || "Open"}</strong> ({b.weight?.weight_class || "Open weight"})</span>
                        <span>Judges: <strong>{b.judge_count || 3}</strong></span>
                        {b.coach?.full_name && <span>Coach: <strong>{b.coach.full_name}</strong></span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {b.status === "scheduled" && (
                      <button
                        onClick={() => handleStatusChange(b.id, "active")}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/20 transition cursor-pointer"
                      >
                        Start Bout
                      </button>
                    )}
                    {b.status === "active" && (
                      <button
                        onClick={() => handleStatusChange(b.id, "completed")}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition cursor-pointer"
                      >
                        Complete Bout
                      </button>
                    )}
                    {b.status !== "completed" && b.status !== "cancelled" && (
                      <button
                        onClick={() => handleStatusChange(b.id, "cancelled")}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Bout Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-surface rounded-2xl shadow-modal w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
              <div className="font-display font-bold text-lg">Add New Bout</div>
              <button onClick={() => setShowModal(false)} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-red-500 inline-block" /> Red Corner *
                  </span>
                  <select
                    required
                    value={form.redCorner}
                    onChange={e => setForm((f: any) => ({ ...f, redCorner: e.target.value }))}
                    className="input-premium"
                  >
                    <option value="">Select Red Boxer...</option>
                    {boxers.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.full_name || `${b.first_name || ""} ${b.last_name || ""}`.trim() || "Boxer"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-blue-500 inline-block" /> Blue Corner *
                  </span>
                  <select
                    required
                    value={form.blueCorner}
                    onChange={e => setForm((f: any) => ({ ...f, blueCorner: e.target.value }))}
                    className="input-premium"
                  >
                    <option value="">Select Blue Boxer...</option>
                    {boxers.filter(b => b.id !== form.redCorner).map(b => (
                      <option key={b.id} value={b.id}>
                        {b.full_name || `${b.first_name || ""} ${b.last_name || ""}`.trim() || "Boxer"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5">Age Category</span>
                  <select
                    value={form.ageCategory}
                    onChange={e => setForm((f: any) => ({ ...f, ageCategory: e.target.value }))}
                    className="input-premium"
                  >
                    {ageCats.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold mb-1.5">Weight Category</span>
                  <select
                    value={form.weightCategory}
                    onChange={e => setForm((f: any) => ({ ...f, weightCategory: e.target.value }))}
                    className="input-premium"
                  >
                    {weightCats.map(c => (
                      <option key={c.id} value={c.id}>{c.weight_class}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Judges Count</span>
                <select
                  value={form.judgeCount}
                  onChange={e => setForm((f: any) => ({ ...f, judgeCount: Number(e.target.value) }))}
                  className="input-premium"
                >
                  <option value={1}>1 Judge</option>
                  <option value={3}>3 Judges (Standard)</option>
                  <option value={5}>5 Judges (Championship)</option>
                </select>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Bout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
