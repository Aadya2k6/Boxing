import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Loader2, Check, Save, Key, KeyRound, Plus, Shield, Copy, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/superadmin/config")({ component: ConfigPage });

function ConfigPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Academy settings state
  const [settings, setSettings] = useState({
    academy_name: "Boxos Pilot Academy",
    tagline: "Precision since 2018",
    primary_sport: "Boxing",
    secondary_sports: "Boxing",
    operating_hours: "06:00 — 21:00",
    time_zone: "Asia/Kolkata",
    default_fee_currency: "INR",
    default_billing_cycle: "Quarterly",
  });

  // Academy codes state
  const [codes, setCodes] = useState<any[]>([]);
  const [newCodeInput, setNewCodeInput] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [profile?.academy_id]);

  async function loadData() {
    setLoading(true);
    try {
      const targetAcademyId = profile?.academy_id;
      // Security: only query the superadmin's own academy.
      // Never fall back to querying all academies without a filter.
      if (!targetAcademyId) {
        setLoading(false);
        return;
      }

      const acQuery = supabase
        .from("academies")
        .select("id, name, city, state, address, latitude, longitude, attendance_radius_meters, status, active_gateway, razorpay_key_id, payu_merchant_key, created_at, updated_at")
        .eq("id", targetAcademyId)
        .maybeSingle();

      const codeQuery = supabase
        .from("academy_codes")
        .select("*")
        .eq("academy_id", targetAcademyId)
        .order("created_at", { ascending: false });

      const [{ data: acData }, { data: codeData }] = await Promise.all([
        acQuery,
        codeQuery,
      ]);

      if (acData) {
        setSettings((s) => ({
          ...s,
          academy_name: acData.name ?? s.academy_name,
        }));
      }

      setCodes(codeData ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const targetId = profile?.academy_id;
    if (!targetId) {
      setSaving(false);
      return;
    }
    await supabase.from("academies").update({
      name: settings.academy_name,
    }).eq("id", targetId);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function generateRandomCode() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setNewCodeInput(`BOX-${randomNum}`);
  }
  async function handleCreateCode(e: React.FormEvent) {
    e.preventDefault();
    if (!newCodeInput.trim()) return;
    setCodeLoading(true);
    setCodeError(null);
    try {
      const formatted = newCodeInput.trim().toUpperCase();
      let academyId = profile?.academy_id;
      if (!academyId && user?.id) {
        const { data: p } = await supabase.from("profiles").select("academy_id").eq("id", user.id).maybeSingle();
        academyId = p?.academy_id;
      }
      if (!academyId) {
        throw new Error("No academy associated with your account. Cannot create an academy code.");
      }

      const { error } = await supabase.from("academy_codes").insert({
        code: formatted,
        created_by: user?.id || null,
        academy_id: academyId || null,
        is_active: true,
      });

      if (error) throw new Error(error.message);

      setNewCodeInput("");
      loadData();
    } catch (err: any) {
      setCodeError(err.message || "Failed to create academy code.");
    } finally {
      setCodeLoading(false);
    }
  }

  async function toggleCodeStatus(id: string, currentStatus: boolean) {
    setTogglingId(id);
    try {
      const { error } = await supabase
        .from("academy_codes")
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw new Error(error.message);
      loadData();
    } catch (err: any) {
      alert(`Failed to update code: ${err.message}`);
    } finally {
      setTogglingId(null);
    }
  }

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fieldsList = [
    { label: "Academy name", key: "academy_name" },
    { label: "Tagline", key: "tagline" },
    { label: "Primary sport", key: "primary_sport" },
    { label: "Secondary sports", key: "secondary_sports" },
    { label: "Operating hours", key: "operating_hours" },
    { label: "Time zone", key: "time_zone" },
    { label: "Default fee currency", key: "default_fee_currency" },
    { label: "Default billing cycle", key: "default_billing_cycle" },
  ] as const;

  return (
    <div className="animate-fade-up space-y-6 max-w-4xl">
      <PageHeader
        title="Settings & Access Control"
        subtitle="Configure academy parameters and athlete onboarding access codes"
      />

      {/* Access Code Management Section */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-card space-y-6">
        <div>
          <div className="flex items-center gap-2 text-foreground font-semibold text-base">
            <KeyRound className="size-4 text-brand-primary" />
            Academy Access Codes
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Athletes must enter an active code during registration to link their profile to your academy.
          </p>
        </div>

        {/* Create Code Form */}
        <form onSubmit={handleCreateCode} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="e.g. BOXING2026"
              value={newCodeInput}
              onChange={(e) => setNewCodeInput(e.target.value.toUpperCase())}
              disabled={codeLoading}
              className="w-full bg-subtle border border-border rounded-lg px-3.5 py-2 text-sm font-mono tracking-wider uppercase text-foreground placeholder:text-muted-foreground placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-brand-primary transition"
            />
          </div>
          <button
            type="submit"
            disabled={codeLoading || !newCodeInput.trim()}
            className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition disabled:opacity-50 cursor-pointer"
          >
            {codeLoading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Generate Code
          </button>
        </form>

        {codeError && (
          <div className="flex items-center gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 p-2.5 rounded-lg">
            <AlertCircle className="size-4 shrink-0" />
            {codeError}
          </div>
        )}

        {/* Existing Codes Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-elevated text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="font-medium px-4 py-3">Access Code</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Created Date</th>
                <th className="text-right font-medium px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                    No access codes configured yet. Create a code above to allow athletes to register.
                  </td>
                </tr>
              ) : (
                codes.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-subtle transition">
                    <td className="px-4 py-3 font-mono font-bold text-sm text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{c.code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(c.code)}
                          className="text-muted-foreground hover:text-foreground transition cursor-pointer"
                        >
                          {copiedCode === c.code ? <CheckCircle2 className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={c.is_active ? "success" : undefined}>
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular">
                      {new Date(c.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleCodeStatus(c.id, c.is_active)}
                        disabled={togglingId === c.id}
                        className="text-xs font-medium px-3 py-1 rounded-md border border-border hover:bg-subtle transition disabled:opacity-50 cursor-pointer"
                      >
                        {togglingId === c.id ? (
                          <Loader2 className="size-3 animate-spin mx-auto" />
                        ) : c.is_active ? (
                          "Deactivate"
                        ) : (
                          "Activate"
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: General Academy Configuration */}
      <form onSubmit={handleSaveSettings} className="bg-surface border border-border rounded-xl p-6 shadow-card space-y-5">
        <h2 className="font-display font-semibold text-lg border-b border-border pb-3">General Settings</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {fieldsList.map(({ label, key }) => (
            <label key={key} className="block">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">{label}</span>
              <input
                value={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                className="w-full bg-elevated border border-border rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => window.history.back()} className="text-sm px-4 py-2 border border-border rounded-md hover:bg-subtle">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="text-sm bg-[#ef4444] text-white px-4 py-2 rounded-md hover:bg-[#dc2626] flex items-center gap-1.5 disabled:opacity-60 transition shadow-card">
            {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : <Save className="size-4" />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
