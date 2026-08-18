import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Check, Loader2, Eye, EyeOff, Save, MapPin, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/settings")({ component: SASettings });

function SASettings() {
  const { user, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRzpSecret, setShowRzpSecret] = useState(false);
  const [showPayuSalt, setShowPayuSalt] = useState(false);
  const [academies, setAcademies] = useState<any[]>([]);
  const [ownAcademyId, setOwnAcademyId] = useState("");
  const [savingAcademy, setSavingAcademy] = useState(false);
  const [academySaved, setAcademySaved] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    payment_gateway: "razorpay",
    razorpay_key_id: "",
    razorpay_secret: "",
    payu_merchant_key: "",
    payu_merchant_salt: "",
    sender_email: "no-reply@boxos.in",
    sms_provider: "MSG91",
    academy_name: "Boxos Boxing Academy",
    geo_fence_default_radius: "200",
    auto_penalty: true,
    penalty_grace_days: "7",
    require_aadhaar: false,
  });
  const setS = (k: string, v: any) => setSettings(s => ({ ...s, [k]: v }));

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    const [{ data: acs }, { data: prof }] = await Promise.all([
      supabase.from("academies").select("id, name, city, state, address, latitude, longitude, attendance_radius_meters, status, active_gateway, razorpay_key_id, encrypted_razorpay_secret, payu_merchant_key, encrypted_payu_salt, created_at, updated_at").order("name"),
      supabase.from("profiles").select("preferred_academy_id").eq("id", user!.id).maybeSingle(),
    ]);
    const firstAc = acs?.[0];
    if (firstAc) {
      setSettings(s => ({
        ...s,
        payment_gateway: firstAc.active_gateway ?? s.payment_gateway,
        razorpay_key_id: firstAc.razorpay_key_id ?? s.razorpay_key_id,
        razorpay_secret: firstAc.encrypted_razorpay_secret ?? s.razorpay_secret,
        payu_merchant_key: firstAc.payu_merchant_key ?? s.payu_merchant_key,
        payu_merchant_salt: firstAc.encrypted_payu_salt ?? s.payu_merchant_salt,
      }));
    }
    setAcademies(acs ?? []);
    setOwnAcademyId(prof?.preferred_academy_id ?? "");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Update academies table directly in Supabase
      const academyPayload: Record<string, any> = {
        updated_by: user?.id,
      };
      if (settings.payment_gateway) academyPayload.active_gateway = settings.payment_gateway;
      if (settings.payu_merchant_key) academyPayload.payu_merchant_key = settings.payu_merchant_key.trim();
      if (settings.payu_merchant_salt) academyPayload.encrypted_payu_salt = settings.payu_merchant_salt.trim();
      if (settings.razorpay_key_id) academyPayload.razorpay_key_id = settings.razorpay_key_id.trim();
      if (settings.razorpay_secret) academyPayload.encrypted_razorpay_secret = settings.razorpay_secret.trim();

      const { error } = await supabase
        .from("academies")
        .update(academyPayload)
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      alert("Failed to save settings: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAcademy() {
    if (!user) return;
    setSavingAcademy(true);
    await supabase.from("profiles")
      .update({ preferred_academy_id: ownAcademyId || null })
      .eq("id", user.id);
    setSavingAcademy(false);
    setAcademySaved(true);
    setTimeout(() => setAcademySaved(false), 2500);
  }

  async function handleChangePw(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPass) { setPwError("Passwords do not match."); return; }
    if (newPassword.length < 8) { setPwError("Minimum 8 characters."); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPw(false);
    if (error) { setPwError(error.message); return; }
    setPwDone(true);
    setNewPassword(""); setConfirmPass("");
    setTimeout(() => setPwDone(false), 3000);
  }

  const currentAcademy = academies.find(a => a.id === ownAcademyId);

  return (
    <>
      <PageHeader
        title="System settings"
        subtitle="Platform-wide configuration — changes take effect immediately"
        actions={
          <button form="settings-form" type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card">
            {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : <Save className="size-4" />}
            {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
          </button>
        }
      />

      <form id="settings-form" onSubmit={handleSave} className="space-y-4 max-w-3xl">
        <Section title="Academy">
          <Field label="Academy name" value={settings.academy_name} onChange={v => setS("academy_name", v)} />
          <Field label="Default geo-fence radius (m)" value={settings.geo_fence_default_radius} onChange={v => setS("geo_fence_default_radius", v)} type="number" />
        </Section>

        <Section title="Payment Gateways Configuration">
          <div className="col-span-2 space-y-4">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">Active Platform Gateway</span>
              <select
                value={settings.payment_gateway ?? "razorpay"}
                onChange={e => setS("payment_gateway", e.target.value)}
                className="w-full bg-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="razorpay">Razorpay (Default)</option>
                <option value="payu">PayU India (Bolt / Form Checkout)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Athletes will be presented with this gateway for online fee payments (unless overridden per academy location in Academy Locations).
              </p>
            </div>

            <div className="pt-3 border-t border-border/60">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3">PayU Merchant Credentials</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="PayU Merchant Key" value={settings.payu_merchant_key} onChange={v => setS("payu_merchant_key", v)} placeholder="20qqUj" />
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">PayU Merchant Salt</span>
                  <div className="relative">
                    <input
                      type={showPayuSalt ? "text" : "password"}
                      value={settings.payu_merchant_salt}
                      onChange={e => setS("payu_merchant_salt", e.target.value)}
                      placeholder="yEdVpAFuqCqg83SSRID7MmRg4baygopF"
                      className="w-full bg-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 pr-10"
                    />
                    <button type="button" onClick={() => setShowPayuSalt(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPayuSalt ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border/60">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3">Razorpay Credentials</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Key ID" value={settings.razorpay_key_id} onChange={v => setS("razorpay_key_id", v)} placeholder="rzp_live_…" />
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">Secret key</span>
                  <div className="relative">
                    <input
                      type={showRzpSecret ? "text" : "password"}
                      value={settings.razorpay_secret}
                      onChange={e => setS("razorpay_secret", e.target.value)}
                      placeholder="rzp_secret_…"
                      className="w-full bg-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 pr-10"
                    />
                    <button type="button" onClick={() => setShowRzpSecret(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showRzpSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Notifications">
          <Field label="Sender email" value={settings.sender_email} onChange={v => setS("sender_email", v)} type="email" />
          <Field label="SMS provider" value={settings.sms_provider} onChange={v => setS("sms_provider", v)} />
        </Section>

        <Section title="Fee & penalty defaults">
          <div className="col-span-2 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-border hover:bg-elevated transition">
              <span className={`size-5 rounded-md border-2 grid place-items-center transition-all ${settings.auto_penalty ? "bg-primary border-primary" : "border-border-strong"}`}>
                {settings.auto_penalty && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              <input type="checkbox" checked={settings.auto_penalty} onChange={e => setS("auto_penalty", e.target.checked)} className="sr-only" />
              <div>
                <div className="text-sm font-medium">Auto-apply late penalty</div>
                <div className="text-xs text-muted-foreground">System automatically adds penalty after grace period</div>
              </div>
            </label>
            {settings.auto_penalty && (
              <Field label="Grace period (days)" value={settings.penalty_grace_days} onChange={v => setS("penalty_grace_days", v)} type="number" />
            )}
          </div>
        </Section>

        {/* Own academy location */}
        <Section title="My academy location">
          <div className="col-span-2 space-y-3">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-info/10 grid place-items-center shrink-0">
                <MapPin className="size-4 text-info" />
              </div>
              <div>
                <div className="font-semibold">{currentAcademy?.name ?? "Not selected"}</div>
                {currentAcademy && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {currentAcademy.city}{currentAcademy.state ? `, ${currentAcademy.state}` : ""}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Change my academy</label>
              <select value={ownAcademyId} onChange={e => setOwnAcademyId(e.target.value)} className="w-full bg-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                <option value="">Select academy…</option>
                {academies.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{a.city ? ` — ${a.city}` : ""}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleSaveAcademy} disabled={savingAcademy}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card">
              {savingAcademy ? <Loader2 className="size-4 animate-spin" /> : academySaved ? <Check className="size-4" /> : <MapPin className="size-4" />}
              {savingAcademy ? "Saving…" : academySaved ? "Saved!" : "Update location"}
            </button>
          </div>
        </Section>

        {/* Password */}
        <Section title="Security">
          <form onSubmit={handleChangePw} className="col-span-2 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">New password</span>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 pr-10" placeholder="Min 8 characters" />
                  <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">Confirm password</span>
                <input type={showPw ? "text" : "password"} value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                  className="w-full bg-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Re-enter" />
              </label>
            </div>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <button type="submit" disabled={savingPw || !newPassword}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card">
              {savingPw ? <Loader2 className="size-4 animate-spin" /> : pwDone ? <Check className="size-4" /> : <Lock className="size-4" />}
              {savingPw ? "Updating…" : pwDone ? "Updated!" : "Update password"}
            </button>
          </form>
        </Section>

        {/* Account Session Actions */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="font-display font-semibold mb-4">Account actions</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Sign out of Superadmin account</div>
              <div className="text-xs text-muted-foreground mt-0.5">Safely terminate active admin session on this browser</div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h2 className="font-display font-semibold mb-4">{title}</h2>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </label>
  );
}
