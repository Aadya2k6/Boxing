import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/coach/settings")({ component: CoachSettings });

function CoachSettings() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: "" });

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name ?? "" });
  }, [profile]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: form.full_name }).eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!user?.email) return;
    const toastId = toast.loading("Sending reset link...");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      toast.success("Password reset link sent to your email", { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset link", { id: toastId });
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your coach profile and account settings"
      />

      <SectionCard title="Profile Information" subtitle="Update your personal details">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Full Name</span>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="input-premium max-w-md"
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Email Address</span>
            <input
              type="email"
              value={user?.email || ""}
              disabled
              className="input-premium max-w-md opacity-60 cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Email address cannot be changed.</p>
          </label>
          <button
            type="submit"
            disabled={loading || !form.full_name}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition disabled:opacity-50 cursor-pointer shadow-card"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Security" subtitle="Manage your password and authentication">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Password</div>
            <div className="text-xs text-muted-foreground">Receive an email with a link to reset your password.</div>
          </div>
          <button
            onClick={handleResetPassword}
            className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-xl text-sm font-semibold hover:bg-elevated transition cursor-pointer"
          >
            <KeyRound className="size-4" /> Reset Password
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
