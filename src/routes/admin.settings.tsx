import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Save, Loader2, Check, Eye, EyeOff, Lock, MapPin } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettings });

function AdminSettings() {
  const { user, profile, loading: authLoading } = useAuth();
  const [academies, setAcademies] = useState<any[]>([]);
  const [currentAcademyId, setCurrentAcademyId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Academy change
  const [savingAcademy, setSavingAcademy] = useState(false);
  const [academySaved, setAcademySaved] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user) loadData();
    else setLoading(false);
  }, [user?.id, authLoading]);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: acs }, { data: prof }] = await Promise.all([
        supabase.from("academies").select("id, name, city, state").order("name"),
        supabase.from("profiles").select("preferred_academy_id").eq("id", user!.id).maybeSingle(),
      ]);
      setAcademies(acs ?? []);
      setCurrentAcademyId(prof?.preferred_academy_id ?? "");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAcademy() {
    if (!user) return;
    setSavingAcademy(true);
    await supabase.from("profiles")
      .update({ preferred_academy_id: currentAcademyId || null })
      .eq("id", user.id);
    setSavingAcademy(false);
    setAcademySaved(true);
    setTimeout(() => setAcademySaved(false), 2500);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPass) { setPwError("Passwords do not match."); return; }
    if (newPassword.length < 8) { setPwError("Password must be at least 8 characters."); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) { setPwError(error.message); return; }
    setPasswordDone(true);
    setNewPassword(""); setConfirmPass("");
    setTimeout(() => setPasswordDone(false), 3000);
  }

  const currentAcademy = academies.find(a => a.id === currentAcademyId);

  if (loading) return (
    <div className="min-h-[60vh] grid place-items-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <>
      <PageHeader title="Settings" subtitle="Account, location, and security settings" />

      <div className="space-y-4 max-w-3xl">
        {/* Account info */}
        <Card title="Account information">
          <Row label="Full name" value={profile?.full_name ?? "—"} />
          <Row label="Email" value={profile?.email ?? "—"} />
          <Row label="Role" value={profile?.role ?? "—"} />
        </Card>

        {/* Assigned academy — Admin CAN change their own */}
        <Card title="My academy location">
          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-info/10 grid place-items-center shrink-0">
                <MapPin className="size-4 text-info" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">
                  {currentAcademy?.name ?? "No academy selected"}
                </div>
                {currentAcademy && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {currentAcademy.city}{currentAcademy.state ? `, ${currentAcademy.state}` : ""}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Change academy</label>
              <select
                value={currentAcademyId}
                onChange={e => setCurrentAcademyId(e.target.value)}
                className="input-premium"
              >
                <option value="">Select academy…</option>
                {academies.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.city ? ` — ${a.city}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSaveAcademy}
              disabled={savingAcademy}
              className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card"
            >
              {savingAcademy ? <Loader2 className="size-4 animate-spin" /> : academySaved ? <Check className="size-4" /> : <Save className="size-4" />}
              {savingAcademy ? "Saving…" : academySaved ? "Saved!" : "Update location"}
            </button>
          </div>
        </Card>

        {/* Change password */}
        <Card title="Security">
          <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5">New password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    className="input-premium pr-10" placeholder="Min 8 characters" />
                  <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Confirm password</label>
                <input type={showPw ? "text" : "password"} value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                  className="input-premium" placeholder="Re-enter password" />
              </div>
            </div>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <button type="submit" disabled={savingPassword || !newPassword}
              className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-50 transition shadow-card">
              {savingPassword ? <Loader2 className="size-4 animate-spin" /> : passwordDone ? <Check className="size-4" /> : <Lock className="size-4" />}
              {savingPassword ? "Updating…" : passwordDone ? "Updated!" : "Update password"}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}

function Card({ title, children }: any) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h2 className="font-display font-semibold mb-4">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-t first:border-0 border-border">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium capitalize">{value}</span>
    </div>
  );
}
