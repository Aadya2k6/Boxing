import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  Plus, X, Loader2, Check, Pencil, Percent, IndianRupee, Tag, Trash2, Building2, Package, CheckCircle2
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/discounts")({ component: CouponsPage });

function CouponsPage() {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [feePlans, setFeePlans] = useState<any[]>([]);
  const [academies, setAcademies] = useState<any[]>([]);
  const [invoiceCouponCounts, setInvoiceCouponCounts] = useState<Record<string, number>>({});
  const [couponMaxUses, setCouponMaxUses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState("");
  const [valueType, setValueType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [allPackages, setAllPackages] = useState(true);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [allAcademies, setAllAcademies] = useState(true);
  const [selectedAcademyIds, setSelectedAcademyIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [
        { data: cData },
        { data: fpData },
        { data: acData },
        { data: invData },
      ] = await Promise.all([
        supabase.from("coupons").select("*").order("created_at", { ascending: false }),
        supabase.from("fee_plans").select("id, plan_name, amount, billing_cycle").order("plan_name"),
        supabase.from("academies").select("id, name, city").order("name"),
        // Only count CONFIRMED (paid) invoices for coupon usage
        supabase.from("invoices").select("coupon_id").eq("status", "paid").not("coupon_id", "is", null),
      ]);

      setCoupons(cData || []);
      setFeePlans(fpData || []);
      setAcademies(acData || []);

      // Calculate CONFIRMED usage counts per coupon from paid invoices in Supabase
      const counts: Record<string, number> = {};
      (invData || []).forEach((i: any) => {
        if (i.coupon_id) {
          counts[i.coupon_id] = (counts[i.coupon_id] || 0) + 1;
        }
      });
      setInvoiceCouponCounts(counts);

      // Load max_uses from coupons table directly
      const limits: Record<string, number> = {};
      (cData || []).forEach((c: any) => {
        if (c.max_uses && c.max_uses > 0) {
          limits[c.id] = c.max_uses;
        }
      });
      setCouponMaxUses(limits);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setCode("");
    setValueType("percentage");
    setValue("");
    setMaxUses("");
    setAllPackages(true);
    setSelectedPlanIds([]);
    setAllAcademies(true);
    setSelectedAcademyIds([]);
    setIsActive(true);
    setErrorMsg(null);
    setShowModal(true);
  }

  function openEdit(c: any) {
    setEditing(c);
    setCode(c.code);
    setValueType(c.value_type || "percentage");
    setValue(String(c.value));
    // Load max_uses directly from coupons table column
    setMaxUses(c.max_uses ? String(c.max_uses) : "");

    const planIds = c.valid_fee_plan_ids ?? [];
    if (!planIds || planIds.length === 0) {
      setAllPackages(true);
      setSelectedPlanIds([]);
    } else {
      setAllPackages(false);
      setSelectedPlanIds(planIds);
    }

    const acIds = c.valid_academy_ids ?? [];
    if (!acIds || acIds.length === 0) {
      setAllAcademies(true);
      setSelectedAcademyIds([]);
    } else {
      setAllAcademies(false);
      setSelectedAcademyIds(acIds);
    }

    setIsActive(c.is_active !== false);
    setErrorMsg(null);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg("Please enter a coupon code.");
      return;
    }
    const numVal = Number(value);
    if (isNaN(numVal) || numVal <= 0) {
      setErrorMsg("Please enter a valid discount value.");
      return;
    }

    const parsedMaxUses = maxUses.trim() ? parseInt(maxUses.trim()) : null;
    if (parsedMaxUses !== null && (isNaN(parsedMaxUses) || parsedMaxUses <= 0)) {
      setErrorMsg("Max uses must be a positive number or left empty (unlimited).");
      return;
    }

    setSaving(true);
    try {
      const planIdsArray = allPackages ? [] : selectedPlanIds;
      const academyIdsArray = allAcademies ? [] : selectedAcademyIds;

      // Save max_uses directly in coupons table column (null = unlimited)
      const payload = {
        code: cleanCode,
        value_type: valueType,
        value: numVal,
        valid_fee_plan_ids: planIdsArray,
        valid_academy_ids: academyIdsArray,
        is_active: isActive,
        max_uses: parsedMaxUses,
        created_by: user?.id,
      };

      if (editing) {
        const { error: updateErr } = await supabase
          .from("coupons")
          .update(payload)
          .eq("id", editing.id);
        if (updateErr) throw new Error(updateErr.message);
      } else {
        const { error: insertErr } = await supabase
          .from("coupons")
          .insert(payload);
        if (insertErr) throw new Error(insertErr.message);
      }

      setShowModal(false);
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save coupon.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: any) {
    await supabase.from("coupons").update({ is_active: !c.is_active }).eq("id", c.id);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this coupon?")) return;
    await supabase.from("coupons").delete().eq("id", id);
    loadData();
  }

  const togglePlanSelect = (id: string) => {
    if (selectedPlanIds.includes(id)) {
      setSelectedPlanIds(selectedPlanIds.filter((p) => p !== id));
    } else {
      setSelectedPlanIds([...selectedPlanIds, id]);
    }
  };

  const toggleAcademySelect = (id: string) => {
    if (selectedAcademyIds.includes(id)) {
      setSelectedAcademyIds(selectedAcademyIds.filter((a) => a !== id));
    } else {
      setSelectedAcademyIds([...selectedAcademyIds, id]);
    }
  };

  return (
    <>
      <PageHeader
        title="Coupons & discounts"
        subtitle="Create & manage promotional coupon codes for fee package discounts"
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card"
          >
            <Plus className="size-3.5" /> New coupon
          </button>
        }
      />

      {/* Coupons list table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-5 py-3">Coupon Code</th>
              <th className="text-right font-medium py-3">Discount Value</th>
              <th className="text-left font-medium py-3 px-4">Valid Fee Packages</th>
              <th className="text-left font-medium py-3 px-4">Valid Academies</th>
              <th className="text-left font-medium py-3 px-4">Usage & Limits</th>
              <th className="text-left font-medium py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  No coupons created yet. Click <strong>"New coupon"</strong> to generate your first discount code.
                </td>
              </tr>
            ) : (
              coupons.map((c) => {
                const used = invoiceCouponCounts[c.id] || 0;
                // Read max_uses directly from coupons table column (null = unlimited)
                const max: number | null = c.max_uses ?? null;
                const planIds = c.valid_fee_plan_ids ?? [];
                const acIds = c.valid_academy_ids ?? [];

                return (
                  <tr key={c.id} className="border-t border-border hover:bg-subtle transition">
                    <td className="px-5 py-3.5 font-mono font-bold text-foreground">
                      <div className="inline-flex items-center gap-1.5 bg-accent/40 border border-primary/20 px-2.5 py-1 rounded-md text-xs">
                        <Tag className="size-3 text-primary-dark" />
                        {c.code}
                      </div>
                    </td>
                    <td className="py-3.5 text-right tabular font-semibold text-primary-dark">
                      {c.value_type === "percentage" ? `${c.value}% OFF` : `₹ ${Number(c.value).toLocaleString("en-IN")} OFF`}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {planIds.length === 0 ? (
                        <span className="text-success font-medium">All Fee Packages</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {planIds.length} package{planIds.length > 1 ? "s" : ""} selected
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {acIds.length === 0 ? (
                        <span className="text-success font-medium">All Academies</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {acIds.length} academie{acIds.length > 1 ? "s" : "y"} selected
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {max ? (
                        <div>
                          <span className="font-semibold text-foreground">{used} / {max} used</span>
                          <span className="text-muted-foreground ml-1.5">
                            ({Math.max(0, max - used)} remaining)
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{used} used (Unlimited)</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <button
                        onClick={() => toggleActive(c)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${c.is_active ? "bg-success" : "bg-border"}`}
                      >
                        <span
                          className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${c.is_active ? "translate-x-4.5" : "translate-x-0.5"}`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="size-7 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground transition"
                          title="Edit coupon"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="size-7 grid place-items-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                          title="Delete coupon"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* New Coupon / Edit Coupon Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-lg animate-fade-up overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="size-4 text-primary" />
                <h3 className="font-display font-semibold">{editing ? "Edit coupon" : "New coupon"}</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-xs text-destructive">
                  {errorMsg}
                </div>
              )}

              {/* Coupon Code */}
              <div>
                <label className="block text-xs font-semibold mb-1.5">Coupon Code *</label>
                <input
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="input-premium font-mono font-bold tracking-wider uppercase"
                  placeholder="e.g. SUMMER2026"
                />
              </div>

              {/* Discount Value & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Value Type *</label>
                  <select
                    value={valueType}
                    onChange={(e: any) => setValueType(e.target.value)}
                    className="input-premium appearance-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {valueType === "percentage" ? "Discount % *" : "Discount Amount (₹) *"}
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                      {valueType === "percentage" ? <Percent className="size-3.5" /> : <IndianRupee className="size-3.5" />}
                    </div>
                    <input
                      required
                      type="number"
                      min="0"
                      step="any"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="input-premium pl-9"
                      placeholder={valueType === "percentage" ? "10" : "500"}
                    />
                  </div>
                </div>
              </div>

              {/* Max Usage Limit */}
              <div>
                <label className="block text-xs font-semibold mb-1">Max Usage Count (Limit)</label>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  How many times this coupon can be redeemed across all athletes. Leave empty for unlimited.
                </p>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="input-premium"
                  placeholder="e.g. 50 (leave empty for unlimited)"
                />
              </div>

              {/* Fee Packages Selection */}
              <div className="border-t border-border pt-4">
                <label className="block text-xs font-semibold mb-2">Valid Fee Packages</label>
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={allPackages}
                    onChange={(e) => setAllPackages(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary size-4"
                  />
                  <span className="text-xs font-medium">Valid for ALL fee packages</span>
                </label>

                {!allPackages && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-xl p-2 bg-subtle/30 custom-scrollbar">
                    {feePlans.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-2">No fee packages available</div>
                    ) : (
                      feePlans.map((fp) => (
                        <label key={fp.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-elevated text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPlanIds.includes(fp.id)}
                            onChange={() => togglePlanSelect(fp.id)}
                            className="rounded border-border text-primary focus:ring-primary size-3.5"
                          />
                          <span className="font-medium text-foreground">{fp.plan_name}</span>
                          <span className="text-muted-foreground ml-auto">₹{fp.amount}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Academies Selection */}
              <div className="border-t border-border pt-4">
                <label className="block text-xs font-semibold mb-2">Valid Academies / Centers</label>
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={allAcademies}
                    onChange={(e) => setAllAcademies(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary size-4"
                  />
                  <span className="text-xs font-medium">Valid for ALL academies</span>
                </label>

                {!allAcademies && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-xl p-2 bg-subtle/30 custom-scrollbar">
                    {academies.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-2">No academies available</div>
                    ) : (
                      academies.map((ac) => (
                        <label key={ac.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-elevated text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedAcademyIds.includes(ac.id)}
                            onChange={() => toggleAcademySelect(ac.id)}
                            className="rounded border-border text-primary focus:ring-primary size-3.5"
                          />
                          <span className="font-medium text-foreground">{ac.name}</span>
                          <span className="text-muted-foreground ml-auto">{ac.city}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="border-t border-border pt-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary size-4"
                  />
                  <span className="text-xs font-medium">Active coupon (enabled)</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-card"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {saving ? "Saving…" : editing ? "Update coupon" : "Create coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
