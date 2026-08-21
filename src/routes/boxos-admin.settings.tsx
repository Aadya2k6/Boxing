import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase, PlatformSettings } from "@/lib/supabase";
import { fetchPlatformSettings, updatePlatformSettingsRecord } from "@/lib/platform-store";
import { useAuth } from "@/lib/auth";
import {
  Sliders,
  Shield,
  FileText,
  Clock,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/boxos-admin/settings")({ component: PlatformSettingsPage });

function PlatformSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    academy_code_verification_days: number;
    current_terms_version: string;
  }>({
    academy_code_verification_days: 7,
    current_terms_version: "2026-01-01",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await fetchPlatformSettings();
      setForm({
        academy_code_verification_days: data.academy_code_verification_days ?? 7,
        current_terms_version: data.current_terms_version ?? "2026-01-01",
      });
    } catch (err: any) {
      console.error("Error loading platform settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePlatformSettingsRecord({
        academy_code_verification_days: form.academy_code_verification_days,
        current_terms_version: form.current_terms_version.trim(),
      });

      toast.success("Platform settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update platform settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Platform Settings"
        subtitle="Global platform configuration, athlete onboarding policies, and compliance terms"
      />

      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="size-6 animate-spin mx-auto text-fuchsia-600 mb-2" />
          <div className="text-xs text-muted-foreground">Loading configuration…</div>
        </div>
      ) : (
        <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
          {/* Athlete Verification Policies */}
          <SectionCard
            title="Athlete Onboarding & Verification"
            subtitle="Global policy for academy-code verification deadlines"
          >
            <div className="space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                  <Clock className="size-3.5 text-fuchsia-600" />
                  Academy Code Verification Window (Days)
                </span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={form.academy_code_verification_days}
                  onChange={e =>
                    setForm(f => ({ ...f, academy_code_verification_days: parseInt(e.target.value) || 7 }))
                  }
                  className="input-premium max-w-xs"
                />
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Athletes signing up have this many days to submit and verify their academy code before their provisional account expires.
                </p>
              </label>
            </div>
          </SectionCard>

          {/* Legal & Terms Version */}
          <SectionCard
            title="Terms & Privacy Consent"
            subtitle="Current legal version required for self-serve and staff signups"
          >
            <div className="space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                  <FileText className="size-3.5 text-fuchsia-600" />
                  Active Terms Version Tag
                </span>
                <input
                  type="text"
                  required
                  value={form.current_terms_version}
                  onChange={e => setForm(f => ({ ...f, current_terms_version: e.target.value }))}
                  placeholder="e.g. 2026-01-01"
                  className="input-premium max-w-xs"
                />
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Recorded in <code className="font-mono text-[11px] bg-elevated px-1 py-0.5 rounded">profiles.terms_version</code> upon account creation and agreement consent.
                </p>
              </label>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-fuchsia-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-fuchsia-700 disabled:opacity-50 transition cursor-pointer shadow-card"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Platform Settings
            </button>
          </div>
        </form>
      )}

      {/* Admin Account Settings */}
      <div className="pt-6 border-t border-border">
        <ChangePasswordSection />
      </div>
    </div>
  );
}

function ChangePasswordSection() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <SectionCard
        title="Admin Security"
        subtitle="Change the password for your BOXOS Admin account"
      >
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block relative">
              <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-fuchsia-600" />
                New Password
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input-premium w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute bottom-2.5 right-3 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5 opacity-0 sm:opacity-100">
                Confirm
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="input-premium w-full"
              />
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="inline-flex items-center gap-2 bg-surface border border-border text-foreground px-5 py-2 rounded-xl text-sm font-semibold hover:bg-elevated disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Update Password
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
