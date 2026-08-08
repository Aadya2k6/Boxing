import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { Plus, Pencil, Users, Loader2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/fees")({ component: FeesPage });

function FeesPage() {
  const [tab, setTab] = useState<"plans" | "assignments">("plans");
  const [plans, setPlans] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [planId, setPlanId] = useState("");
  const [discountValue, setDiscountValue] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [
      { data: pData },
      { data: aData },
      { data: athData }
    ] = await Promise.all([
      supabase.from("fee_plans").select("*").order("created_at"),
      supabase.from("fee_assignments").select("*, fee_plans(*), athlete_profiles(full_name)"),
      supabase.from("athlete_profiles").select("id, full_name").eq("onboarding_complete", true)
    ]);

    if (pData) {
      const enrichedPlans = pData.map(plan => {
        const count = aData?.filter((a: any) => a.fee_plan_id === plan.id).length || 0;
        return { ...plan, count };
      });
      setPlans(enrichedPlans);
    }
    setAssignments(aData || []);
    setAthletes(athData || []);
    setLoading(false);
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!athleteId || !planId) return;
    setSaving(true);
    const { error } = await supabase.from("fee_assignments").insert({
      athlete_profile_id: athleteId,
      fee_plan_id: planId,
      discount_value: Number(discountValue),
      discount_reason: discountReason || null,
    });
    if (!error) {
      setShowModal(false);
      setAthleteId(""); setPlanId(""); setDiscountValue("0"); setDiscountReason("");
      loadData();
    } else {
      console.error(error);
    }
    setSaving(false);
  }
  return (
    <>
      <PageHeader title="Fee management" subtitle="Plans, billing cycles, and per-athlete assignments" actions={
        <button onClick={() => { setTab("assignments"); setShowModal(true); }} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2 rounded-md text-sm hover:bg-[#dc2626]"><Plus className="size-3.5" /> Assign Plan</button>
      } />
      <div className="flex items-center gap-1 bg-subtle rounded-md p-1 w-fit mb-6">
        {(["plans", "assignments"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-xs font-medium rounded capitalize transition ${tab === t ? "bg-surface shadow-card" : "text-muted-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "plans" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-3 py-10 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : plans.length === 0 ? (
            <div className="col-span-3 py-10 text-center text-muted-foreground text-sm">No active fee plans. Contact Superadmin to create plans.</div>
          ) : (
            plans.map(p => (
              <div key={p.id} className="bg-surface border border-border rounded-lg p-6 hover:border-border-strong transition relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="label-micro">{p.billing_cycle === "custom" && p.custom_duration_days ? `${p.custom_duration_days} Days` : p.billing_cycle}</div>
                    <div className="font-display font-semibold text-lg mt-1">{p.plan_name}</div>
                  </div>
                </div>
                <div className="text-stat tabular mt-4">₹ {Number(p.amount).toLocaleString("en-IN")}<span className="text-sm text-muted-foreground font-sans font-normal ml-1">/{p.billing_cycle === "custom" && p.custom_duration_days ? `${p.custom_duration_days} days` : p.billing_cycle.toLowerCase()}</span></div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Users className="size-3" /> {p.count} athletes</span>
                  <Badge tone="success">Active</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-5 py-3">Athlete</th>
                <th className="text-left font-medium py-3">Plan</th>
                <th className="text-right font-medium py-3">Base</th>
                <th className="text-right font-medium py-3">Discount</th>
                <th className="text-right font-medium py-3">Final</th>
                <th className="text-right font-medium px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No athletes assigned to plans yet.</td>
                </tr>
              ) : (
                assignments.map((a) => {
                  const n = a.athlete_profiles?.full_name || "Unknown";
                  const planName = a.fee_plans?.plan_name || "—";
                  const base = Number(a.fee_plans?.amount || 0);
                  const disc = Number(a.discount_value || 0);
                  const final = base - disc;
                  return (
                    <tr key={a.id} className={`border-t border-border hover:bg-subtle transition ${disc > 0 ? "bg-warning/[0.03]" : ""}`}>
                      <td className="px-5 py-4 font-medium flex items-center gap-2.5">
                        <AvatarInitials name={n} /> {n}
                      </td>
                      <td className="py-4 text-muted-foreground">{planName}</td>
                      <td className="py-4 text-right tabular">₹ {base.toLocaleString("en-IN")}</td>
                      <td className="py-4 text-right tabular text-warning" title={a.discount_reason}>{disc > 0 ? `– ₹ ${disc.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="py-4 text-right tabular font-medium">₹ {final.toLocaleString("en-IN")}</td>
                      <td className="px-5 py-4 text-right"><button className="text-xs font-medium text-primary-dark hover:underline">Edit</button></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md overflow-hidden animate-fade-up">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">Assign Fee Plan</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="size-4" /></button>
            </div>
            <form onSubmit={handleAssign} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Athlete</label>
                <select required value={athleteId} onChange={e => setAthleteId(e.target.value)} className="w-full text-sm px-3 py-2 border border-border rounded-md bg-transparent outline-none focus:border-primary">
                  <option value="">Select athlete...</option>
                  {athletes.map(ath => <option key={ath.id} value={ath.id}>{ath.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Fee Plan</label>
                <select required value={planId} onChange={e => setPlanId(e.target.value)} className="w-full text-sm px-3 py-2 border border-border rounded-md bg-transparent outline-none focus:border-primary">
                  <option value="">Select plan...</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.plan_name} (₹{Number(p.amount).toLocaleString("en-IN")})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Flat Discount (₹)</label>
                  <input type="number" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="w-full text-sm px-3 py-2 border border-border rounded-md bg-transparent outline-none focus:border-primary" />
                </div>
              </div>
              {Number(discountValue) > 0 && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Discount Reason</label>
                  <input required value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder="e.g. Sibling discount" className="w-full text-sm px-3 py-2 border border-border rounded-md bg-transparent outline-none focus:border-primary" />
                </div>
              )}
              <div className="pt-4 flex items-center gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-subtle transition-colors">Cancel</button>
                <button type="submit" disabled={saving || !athleteId || !planId} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#ef4444] text-white rounded-lg hover:bg-[#dc2626] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Assign Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
