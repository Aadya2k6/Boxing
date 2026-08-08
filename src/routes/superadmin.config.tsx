import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Badge } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Loader2, Check, Save, Key, Plus, Shield, Copy, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/superadmin/config")({ component: ConfigPage });

function ConfigPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Academy settings state
  const [settings, setSettings] = useState({
    academy_name: "Crickos Pilot Academy",
    tagline: "Precision since 2018",
    primary_sport: "Cricket",
    secondary_sports: "Cricket",
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
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: acData }, { data: codeData }] = await Promise.all([
        supabase.from("academies").select("*").limit(1).maybeSingle(),
        supabase.from("academy_codes").select("*").order("created_at", { ascending: false }),
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

    const { data: firstAc } = await supabase.from("academies").select("id").limit(1).maybeSingle();
    if (firstAc?.id) {
      await supabase.from("academies").update({
        name: settings.academy_name,
      }).eq("id", firstAc.id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function generateRandomCode() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setNewCodeInput(`CRICK-${randomNum}`);
  }

  async function handleCreateCode(e: React.FormEvent) {
    e.preventDefault();
    if (!newCodeInput.trim()) return;
    setCodeLoading(true);
    setCodeError(null);
    try {
      const formatted = newCodeInput.trim().toUpperCase();
      const { error } = await supabase.from("academy_codes").insert({
        code: formatted,
        created_by: user?.id || null,
        is_active: true,
        uses_count: 0,
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

  async function toggleCodeStatus(id: string, currentActive: boolean) {
    setTogglingId(id);
    try {
      await supabase
        .from("academy_codes")
        .update({ is_active: !currentActive })
        .eq("id", id);
      loadData();
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
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        title="Academy configuration & access codes"
        subtitle="Manage platform parameters & academy access codes for athlete registration"
      />

      {/* Section 1: Academy Access Codes Management */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 grid place-items-center text-primary-dark shrink-0">
              <Key className="size-5" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-lg">Academy Access Codes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Athletes must enter an active code to unlock onboarding. Prevents unauthorized signups.
              </p>
            </div>
          </div>
        </div>

        {/* Create Code Form */}
        <form onSubmit={handleCreateCode} className="space-y-3">
          <label className="block text-xs font-semibold text-foreground">
            Generate or enter new Academy Access Code
          </label>
          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                required
                value={newCodeInput}
                onChange={(e) => setNewCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. CRICKOS1 or CRICK-8842"
                className="w-full bg-elevated border border-border rounded-xl px-4 py-2.5 text-sm font-mono font-bold uppercase tracking-wider focus:outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={generateRandomCode}
              className="px-3.5 py-2.5 text-xs font-semibold border border-border rounded-xl hover:bg-subtle transition cursor-pointer shrink-0"
            >
              Generate Random
            </button>
            <button
              type="submit"
              disabled={codeLoading || !newCodeInput.trim()}
              className="px-5 py-2.5 bg-[#ef4444] text-white text-xs font-semibold rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-card"
            >
              {codeLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {codeLoading ? "Saving..." : "Create Code"}
            </button>
          </div>
          {codeError && (
            <div className="flex items-center gap-2 text-xs text-destructive mt-1">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{codeError}</span>
            </div>
          )}
        </form>

        {/* Existing Codes Table */}
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-4 py-3">Code</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Uses</th>
                <th className="text-left font-medium px-4 py-3">Created Date</th>
                <th className="text-right font-medium px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
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
                          title="Copy Code"
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
                    <td className="px-4 py-3 text-right tabular text-xs font-semibold">
                      {c.uses_count ?? 0} athlete{(c.uses_count ?? 0) !== 1 ? "s" : ""}
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
