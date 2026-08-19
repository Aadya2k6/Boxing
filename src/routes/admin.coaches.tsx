import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { Plus, X, Mail, ShieldOff, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/coaches")({ component: AdminCoaches });

function InviteModal({
  onClose,
  onInvite,
}: {
  onClose: () => void;
  onInvite: () => void;
}) {
  const { user, profile } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please provide both email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const academyId = profile?.academy_id;
      if (!academyId) throw new Error("Admin is not assigned to an academy location.");

      // Fetch the admin's assigned center
      const { data: assignment } = await supabase
        .from("admin_center_assignments")
        .select("center_id")
        .eq("profile_id", user?.id)
        .limit(1)
        .single();
      
      if (!assignment?.center_id) {
        throw new Error("You are not assigned to any center.");
      }

      // 1. Create auth user with temporary client
      const { createClient } = await import("@supabase/supabase-js");
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name || "Coach",
            role: "coach",
            academy_id: academyId,
          },
        },
      });

      if (authError && !authError.message.toLowerCase().includes("already registered")) {
        throw authError;
      }

      if (!authData.user?.id) throw new Error("Failed to get user ID");

      // The handle_new_user trigger in the DB will automatically create the profile.
      // We just need to assign the coach to the admin's center.
      // Wait for trigger to finish
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { error: assignErr } = await supabase.from("coach_center_assignments").insert({
        profile_id: authData.user.id,
        center_id: assignment.center_id,
        assigned_by: user?.id,
      });

      if (assignErr) throw assignErr;

      toast.success(`Coach account created for ${email}!`);
      onInvite();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite coach");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Invite Coach</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSend} className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Email Address *</span>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-premium"
              placeholder="coach@example.com"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Portal Password *</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-premium"
              placeholder="Min 6 characters"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Full Name (optional)</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-premium"
              placeholder="Coach's full name"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!email || !password || submitting}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-primary/90 transition shadow-sm"
            >
              {submitting ? "Creating Account…" : "Create & Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminCoaches() {
  const { user } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const { data: assignment } = await supabase
        .from("admin_center_assignments")
        .select("center_id")
        .eq("profile_id", user?.id)
        .limit(1)
        .single();
      
      if (!assignment?.center_id) return;

      const { data: assignments } = await supabase
        .from("coach_center_assignments")
        .select("id, profile_id, created_at, profiles(full_name, id, role)")
        .eq("center_id", assignment.center_id)
        .order("created_at", { ascending: false });

      if (assignments) {
        setCoaches(assignments.map(a => ({
          ...a,
          ...a.profiles
        })));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user?.id]);

  return (
    <>
      <PageHeader
        title="Coach Management"
        subtitle="Invite and manage coaches for your center"
        actions={
          <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
            <Plus className="size-4" /> Invite Coach
          </button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <SectionCard className="md:col-span-2">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : coaches.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <div className="font-semibold mb-1">No coaches assigned</div>
              <p className="text-sm text-muted-foreground">Invite coaches to your center to allow them to manage athletes and sessions.</p>
            </div>
          ) : (
            <div className="divide-y divide-border -mx-5 -my-5">
              {coaches.map(c => (
                <div key={c.id} className="p-5 flex items-center justify-between hover:bg-subtle/50 transition">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-full bg-primary/10 text-primary grid place-items-center font-bold">
                      {c.full_name?.charAt(0) || "C"}
                    </div>
                    <div>
                      <div className="font-semibold">{c.full_name || "Unknown Coach"}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">Assigned {new Date(c.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvite={loadData}
        />
      )}
    </>
  );
}
