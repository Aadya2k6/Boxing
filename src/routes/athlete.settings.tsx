import { AccessGuard } from "@/components/dashboard/AccessGuard";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Save, Loader2, Check, Eye, EyeOff, Lock, MapPin } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/athlete/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const [athleteProfile, setAthleteProfile] = useState<any | null>(null);
  const [academy, setAcademy] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) loadData();
    else setLoading(false);
  }, [user?.id, authLoading]);

  async function loadData() {
    const { data: ap } = await supabase
      .from("boxer_profiles")
      .select("*")
      .eq("user_id", user!.id)
      .maybeSingle();
    setAthleteProfile(ap);
    // Fetch academy if athlete has one assigned
    if (ap?.academy_id) {
      const { data: ac } = await supabase.from("academies").select("name, city, state, latitude, longitude, radius_meters").eq("id", ap.academy_id).maybeSingle();
      setAcademy(ac ?? null);
    } else {
      setAcademy(null);
    }
    setLoading(false);
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

  if (loading) return (
    <div className="min-h-[60vh] grid place-items-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <AccessGuard>
      <PageHeader title="Settings" subtitle="Account security and assigned academy details" />

      <div className="space-y-4 max-w-3xl">
        {/* Account info (read-only) */}
        <Card title="Account information">
          <Row label="Full name" value={profile?.full_name ?? athleteProfile?.full_name ?? "—"} />
          <Row label="Email" value={profile?.email ?? "—"} />
          <Row label="Sport" value={athleteProfile?.sport ?? "—"} />
          <Row label="Discipline" value={athleteProfile?.primary_discipline ?? "—"} />
          <Row label="Training year" value={athleteProfile?.training_year ?? "—"} />
        </Card>

        {/* Assigned academy (read-only — set by admin) */}
        <Card title="Assigned academy">
          {academy ? (
            <div className="space-y-3 pt-1">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                  <MapPin className="size-4 text-primary-dark" />
                </div>
                <div>
                  <div className="font-semibold">{academy.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{academy.city}{academy.state ? `, ${academy.state}` : ""}</div>
                  {academy.latitude && (
                    <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                      {parseFloat(academy.latitude).toFixed(4)}°N, {parseFloat(academy.longitude).toFixed(4)}°E · {academy.radius_meters ?? 200}m radius
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-info/6 border border-info/20 rounded-xl p-3 text-xs text-info">
                Your academy location is used for geo-fenced attendance verification. Contact your admin to change this.
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-2">
              No academy assigned yet — contact your admin.
            </div>
          )}
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
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition shadow-card">
              {savingPassword ? <Loader2 className="size-4 animate-spin" /> : passwordDone ? <Check className="size-4" /> : <Lock className="size-4" />}
              {savingPassword ? "Updating…" : passwordDone ? "Updated!" : "Update password"}
            </button>
          </form>
        </Card>

        {/* Account Session Actions */}
        <Card title="Account actions">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-semibold text-foreground">Sign out of your account</div>
              <div className="text-xs text-muted-foreground mt-0.5">End your active session on this device</div>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </Card>
      </div>
    </AccessGuard>
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
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
