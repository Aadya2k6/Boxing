import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import {
  Plus,
  Pencil,
  X,
  Loader2,
  Check,
  Settings2,
  Zap,
  CreditCard,
  Bell,
  Percent,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/fees")({ component: SAFees });

const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "cheque", "online", "payu"];
const DISCOUNT_TYPES = ["sibling", "merit", "scholarship", "custom"];
const cycleLabels: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
};

const emptyForm = {
  plan_name: "",
  amount: "",
  billing_cycle: "monthly",
  custom_duration_days: "",
  accepted_payment_methods: ["cash", "upi", "online"] as string[],
  online_gateway_enabled: true,
  late_penalty_enabled: false,
  penalty_type: "percentage",
  penalty_value: "",
  grace_period_days: "7",
  reminder_days_before: "5",
  reminder_days_after: "1,3,7",
  discount_sibling: false,
  discount_merit: false,
  discount_scholarship: false,
  discount_custom: false,
  discount_approval_required: false,
};

function SAFees() {
  const { user, profile } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({ ...emptyForm });

  function setF(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggleMethod(m: string) {
    setF(
      "accepted_payment_methods",
      form.accepted_payment_methods.includes(m)
        ? form.accepted_payment_methods.filter((x) => x !== m)
        : [...form.accepted_payment_methods, m],
    );
  }

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const [{ data: plansData }, { data: assignments }] = await Promise.all([
        supabase.from("fee_plans").select("*").order("created_at", { ascending: false }),
        supabase.from("fee_assignments").select("fee_plan_id"),
      ]);
      if (plansData) {
        setPlans(
          plansData.map((p) => ({
            ...p,
            count: assignments?.filter((a) => a.fee_plan_id === p.id).length || 0,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingPlan(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(plan: any) {
    setEditingPlan(plan);
    setForm({
      plan_name: plan.plan_name,
      amount: String(plan.amount),
      billing_cycle: plan.billing_cycle,
      custom_duration_days: plan.custom_duration_days ? String(plan.custom_duration_days) : "",
      accepted_payment_methods: plan.accepted_payment_methods ?? ["cash", "upi", "online"],
      online_gateway_enabled: plan.online_gateway_enabled ?? true,
      late_penalty_enabled: plan.late_penalty_enabled ?? false,
      penalty_type: plan.penalty_type ?? "percentage",
      penalty_value: String(plan.penalty_value ?? ""),
      grace_period_days: String(plan.grace_period_days ?? "7"),
      reminder_days_before: String(plan.reminder_days_before ?? "5"),
      reminder_days_after: Array.isArray(plan.reminder_days_after)
        ? plan.reminder_days_after.join(",")
        : "1,3,7",
      discount_sibling: plan.discount_types?.includes("sibling") ?? false,
      discount_merit: plan.discount_types?.includes("merit") ?? false,
      discount_scholarship: plan.discount_types?.includes("scholarship") ?? false,
      discount_custom: plan.discount_types?.includes("custom") ?? false,
      discount_approval_required: plan.discount_approval_required ?? false,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const discountTypes = DISCOUNT_TYPES.filter((t) => (form as any)[`discount_${t}`]);
      const isCustom = form.billing_cycle?.toLowerCase().trim() === "custom";
      const payload = {
        plan_name: form.plan_name,
        amount: Number(form.amount),
        billing_cycle: form.billing_cycle,
        custom_duration_days: isCustom && form.custom_duration_days ? Number(form.custom_duration_days) : null,
        accepted_payment_methods: form.accepted_payment_methods,
        online_gateway_enabled: form.online_gateway_enabled,
        late_penalty_enabled: form.late_penalty_enabled,
        penalty_type: form.penalty_type,
        penalty_value: form.late_penalty_enabled ? Number(form.penalty_value) : 0,
        grace_period_days: Number(form.grace_period_days),
        reminder_days_before: Number(form.reminder_days_before),
        reminder_days_after: form.reminder_days_after
          .split(",")
          .map((n) => Number(n.trim()))
          .filter(Boolean),
        discount_types: discountTypes,
        discount_approval_required: form.discount_approval_required,
        created_by: user?.id,
        academy_id: profile?.academy_id || "11111111-1111-1111-1111-111111111111",
      };
      if (editingPlan) {
        await supabase.from("fee_plans").update(payload).eq("id", editingPlan.id);
      } else {
        await supabase.from("fee_plans").insert(payload);
      }
      setShowModal(false);
      loadPlans();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await supabase.from("fee_plans").delete().eq("id", id);
    setDeleteId(null);
    loadPlans();
  }

  return (
    <>
      <PageHeader
        title="Fee structure"
        subtitle="Section 1 — Configure global fee policies for the academy"
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card"
          >
            <Plus className="size-3.5" /> New fee plan
          </button>
        }
      />

      {/* Plans list */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-surface border border-border rounded-xl p-12 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center">
            <Settings2 className="size-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">No fee plans configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first fee plan to start assigning fees to athletes.
            </p>
          </div>
        ) : (
          plans.map((p) => (
            <div key={p.id} className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Header row */}
              <div className="px-6 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{p.plan_name}</span>
                    <Badge tone={p.is_active ? "success" : undefined}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge>
                      {p.billing_cycle === "custom" && p.custom_duration_days
                        ? `${p.custom_duration_days} Days`
                        : cycleLabels[p.billing_cycle] ?? p.billing_cycle}
                    </Badge>
                    {p.late_penalty_enabled && (
                      <Badge tone="warning">
                        <Zap className="size-2.5" /> Penalty on
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.count} athlete{p.count !== 1 ? "s" : ""} assigned
                  </div>
                </div>
                <div className="text-xl font-display font-bold tabular">
                  ₹ {Number(p.amount).toLocaleString("en-IN")}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="size-8 grid place-items-center rounded-md hover:bg-subtle transition"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setDeleteId(p.id)}
                    className="size-8 grid place-items-center rounded-md hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="size-8 grid place-items-center rounded-md hover:bg-subtle transition"
                  >
                    {expandedId === p.id ? (
                      <ChevronUp className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === p.id && (
                <div className="border-t border-border px-6 py-5 bg-subtle/40 grid md:grid-cols-3 gap-6 text-sm">
                  <div>
                    <div className="label-micro mb-3">Payment methods</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(p.accepted_payment_methods ?? []).map((m: string) => (
                        <span
                          key={m}
                          className="px-2 py-0.5 rounded-full bg-surface border border-border text-xs capitalize flex items-center gap-1"
                        >
                          <CreditCard className="size-2.5" />
                          {m.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Online gateway:{" "}
                      <span
                        className={p.online_gateway_enabled ? "text-success font-semibold" : ""}
                      >
                        {p.online_gateway_enabled ? "Enabled (Razorpay / PayU)" : "Disabled"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="label-micro mb-3">Penalty & grace</div>
                    {p.late_penalty_enabled ? (
                      <>
                        <p className="text-sm">
                          {p.penalty_type === "percentage"
                            ? `${p.penalty_value}% of due amount`
                            : `₹${p.penalty_value} flat`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.grace_period_days}-day grace period
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-xs">No penalty configured</p>
                    )}
                  </div>
                  <div>
                    <div className="label-micro mb-3">Reminders</div>
                    <p className="text-xs text-muted-foreground">
                      {p.reminder_days_before} days before · Follow-up:{" "}
                      {Array.isArray(p.reminder_days_after)
                        ? p.reminder_days_after.join(", ")
                        : "—"}{" "}
                      days after
                    </p>
                    {p.discount_types?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.discount_types.map((t: string) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark text-[10px] capitalize"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.discount_approval_required && (
                      <p className="text-[10px] text-warning mt-1.5">
                        ⚠ Superadmin approval required for discounts
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-up">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
              <h3 className="font-display font-semibold">
                {editingPlan ? "Edit fee plan" : "Create fee plan"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="size-8 grid place-items-center rounded-md hover:bg-subtle text-muted-foreground hover:text-foreground transition"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              {/* Section 1: Basic */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Plan details
                </legend>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Plan name *</label>
                    <input
                      required
                      value={form.plan_name}
                      onChange={(e) => setF("plan_name", e.target.value)}
                      placeholder="e.g. Annual Elite"
                      className="input-premium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Amount (₹) *</label>
                    <input
                      required
                      type="number"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setF("amount", e.target.value)}
                      placeholder="96000"
                      className="input-premium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Billing cycle *</label>
                    <select
                      value={form.billing_cycle}
                      onChange={(e) => setF("billing_cycle", e.target.value)}
                      className="input-premium"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  {form.billing_cycle?.toLowerCase().trim() === "custom" && (
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">
                        Number of days (custom cycle) *
                      </label>
                      <input
                        required
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={form.custom_duration_days ?? ""}
                        onChange={(e) => setF("custom_duration_days", e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="e.g. 45"
                        className="input-premium"
                      />
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Section 2: Payment methods */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Accepted payment methods *
                </legend>
                <div className="flex flex-wrap gap-2 mb-3">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMethod(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition capitalize flex items-center gap-1.5 ${
                        form.accepted_payment_methods.includes(m)
                          ? "bg-primary text-primary-foreground border-primary shadow-glow"
                          : "border-border text-muted-foreground hover:border-border-strong"
                      }`}
                    >
                      {form.accepted_payment_methods.includes(m) && <Check className="size-3" />}
                      {m.replace("_", " ")}
                    </button>
                  ))}
                </div>
                {(form.accepted_payment_methods.includes("online") ||
                  form.accepted_payment_methods.includes("payu")) && (
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <span
                      className={`size-5 rounded-md border-2 grid place-items-center transition-all ${form.online_gateway_enabled ? "bg-primary border-primary" : "border-border-strong"}`}
                    >
                      {form.online_gateway_enabled && (
                        <Check className="size-3 text-primary-foreground" strokeWidth={3} />
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={form.online_gateway_enabled}
                      onChange={(e) => setF("online_gateway_enabled", e.target.checked)}
                      className="sr-only"
                    />
                    <span className="text-xs font-medium">
                      Enable online payment gateway (Razorpay / PayU)
                    </span>
                  </label>
                )}
              </fieldset>

              {/* Section 3: Penalty */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Late payment penalty
                </legend>
                <label className="flex items-center gap-2.5 cursor-pointer mb-4">
                  <span
                    className={`size-5 rounded-md border-2 grid place-items-center transition-all ${form.late_penalty_enabled ? "bg-primary border-primary" : "border-border-strong"}`}
                  >
                    {form.late_penalty_enabled && (
                      <Check className="size-3 text-primary-foreground" strokeWidth={3} />
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={form.late_penalty_enabled}
                    onChange={(e) => setF("late_penalty_enabled", e.target.checked)}
                    className="sr-only"
                  />
                  <span className="text-xs font-medium">Enable late payment penalty</span>
                </label>
                {form.late_penalty_enabled && (
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Penalty type</label>
                      <select
                        value={form.penalty_type}
                        onChange={(e) => setF("penalty_type", e.target.value)}
                        className="input-premium appearance-none"
                      >
                        <option value="percentage">Percentage of due</option>
                        <option value="flat">Flat fee (₹)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">
                        {form.penalty_type === "percentage" ? "Penalty %" : "Penalty ₹"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.penalty_value}
                        onChange={(e) => setF("penalty_value", e.target.value)}
                        className="input-premium"
                        placeholder={form.penalty_type === "percentage" ? "5" : "500"}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">
                        Grace period (days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.grace_period_days}
                        onChange={(e) => setF("grace_period_days", e.target.value)}
                        className="input-premium"
                        placeholder="7"
                      />
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Section 4: Reminders */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Reminder schedule
                </legend>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      Days before due date
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.reminder_days_before}
                      onChange={(e) => setF("reminder_days_before", e.target.value)}
                      className="input-premium"
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      Follow-up days after due (comma separated)
                    </label>
                    <input
                      value={form.reminder_days_after}
                      onChange={(e) => setF("reminder_days_after", e.target.value)}
                      className="input-premium font-mono"
                      placeholder="1,3,7"
                    />
                  </div>
                </div>
              </fieldset>

              <div className="flex items-center gap-3 pt-2">
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
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {saving ? "Saving..." : editingPlan ? "Update plan" : "Create plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="size-12 rounded-full bg-destructive/10 grid place-items-center mx-auto mb-4">
              <Trash2 className="size-5 text-destructive" />
            </div>
            <h3 className="font-semibold text-base">Delete fee plan?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              This cannot be undone. Athletes with active assignments will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-subtle transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-destructive text-white rounded-xl hover:bg-destructive/90 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
