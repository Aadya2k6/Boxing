import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { Plus, X, Mail, Gavel, Trash2, AlertTriangle, ShieldOff, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/judges")({ component: AdminJudges });

type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

function statusBadge(s: string) {
  const map: Record<string, string> = {
    accepted: "success",
    pending: "warning",
    expired: "neutral",
    revoked: "danger",
    active: "success",
  };
  const tone = map[s] || "neutral";
  return <Badge tone={tone as any}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
}

function InviteModal({
  onClose,
  tournaments,
  onInvite,
}: {
  onClose: () => void;
  tournaments: any[];
  onInvite: () => void;
}) {
  const { user, profile } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [tournament, setTournament] = useState(tournaments[0]?.id || "");
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

      // 1. Create auth user with temporary client (does not overwrite admin session)
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
            full_name: name || "Judge",
            role: "external_judge",
            academy_id: academyId,
          },
        },
      });

      if (authError && !authError.message.toLowerCase().includes("already registered")) {
        throw authError;
      }

      if (authData?.user) {
        await supabase.from("profiles").upsert({
          id: authData.user.id,
          email,
          full_name: name || "Judge",
          role: "external_judge",
          academy_id: academyId,
        });
      }

      // 2. Insert into external_judge_invites
      const { error: inviteErr } = await supabase.from("external_judge_invites").insert({
        email,
        full_name: name || null,
        tournament_template_id: tournament || null,
        academy_id: academyId,
        invited_by: user?.id,
        status: "accepted",
      });

      if (inviteErr) throw inviteErr;

      toast.success(`Judge account & invite created for ${email}! They can now log in to /judge.`);
      onInvite();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to send judge invite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Invite External Judge</div>
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
              placeholder="judge@example.com"
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
            <span className="text-[11px] text-muted-foreground mt-1 block">Used by the external judge to log in to the Judge Portal.</span>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Full Name (optional)</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-premium"
              placeholder="Judge's full name"
            />
          </label>
          {tournaments.length > 0 && (
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Tournament Scope</span>
              <select
                value={tournament}
                onChange={e => setTournament(e.target.value)}
                className="input-premium"
              >
                {tournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1.5">
                This judge will only have scoring access for bouts in the selected tournament.
              </p>
            </label>
          )}
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

function EndTournamentConfirm({
  onClose,
  activeCount,
  onEnd,
}: {
  onClose: () => void;
  activeCount: number;
  onEnd: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onEnd();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold text-destructive flex items-center gap-2">
            <AlertTriangle className="size-5" /> End Tournament
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {activeCount > 0 && (
            <div className="flex items-start gap-3 bg-warning/10 border border-warning/25 rounded-xl p-3">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold">{activeCount} active judge invitation{activeCount !== 1 ? "s" : ""}</span> will be revoked immediately.
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            This will manually close tournament judge sessions and revoke all judge invitation access.
          </p>
          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            <span className="text-sm font-medium">I understand this action will revoke judge access</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || submitting}
            className="px-4 py-2 text-sm bg-destructive text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-destructive/90 transition"
          >
            {submitting ? "Closing…" : "End Tournament & Revoke Judges"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminJudges() {
  const { user, profile } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [showEndTournament, setShowEndTournament] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    const channel = supabase.channel("admin-judges-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "external_judge_invites" }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.academy_id]);

  async function loadData() {
    setLoading(true);
    try {
      const academyId = profile?.academy_id;

      let invitesQuery = supabase.from("external_judge_invites").select(`
        *,
        tournament:tournament_template_id(id, name)
      `).order("invited_at", { ascending: false });

      if (academyId) {
        invitesQuery = invitesQuery.eq("academy_id", academyId);
      }

      const [
        { data: invs, error: invErr },
        { data: ts, error: tErr },
      ] = await Promise.all([
        invitesQuery,
        supabase.from("ring_schedule_templates").select("id, name").order("name"),
      ]);

      if (invErr) console.error("Error loading invites:", invErr);
      if (tErr) console.error("Error loading tournaments:", tErr);

      setInvites(invs || []);
      setTournaments(ts || []);
    } catch (e) {
      console.error("Error in loadData:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id: string, email: string) {
    if (!confirm(`Revoke access for ${email}?`)) return;
    try {
      const { error } = await supabase.from("external_judge_invites")
        .update({
          status: "revoked",
          revoked_by: user?.id,
          revoked_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success(`Access revoked for ${email}`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || "Failed to revoke judge");
    }
  }

  async function handleEndTournament() {
    const academyId = profile?.academy_id;
    let q = supabase.from("external_judge_invites")
      .update({
        status: "revoked",
        revoked_by: user?.id,
        revoked_at: new Date().toISOString(),
      })
      .neq("status", "revoked");

    if (academyId) q = q.eq("academy_id", academyId);

    const { error } = await q;
    if (error) throw error;
    toast.success("Tournament closed — all external judge invitations revoked.");
    loadData();
  }

  const activeInvitesCount = invites.filter(i => i.status === "pending" || i.status === "accepted" || i.status === "active").length;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="External Judges"
        subtitle="Invite and manage external tournament judges and scoring access"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowEndTournament(true)}
              className="inline-flex items-center gap-2 border border-destructive/30 bg-destructive/8 text-destructive px-4 py-2 rounded-lg text-sm font-semibold hover:bg-destructive hover:text-white transition cursor-pointer"
            >
              <ShieldOff className="size-4" /> End Tournament
            </button>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 transition shadow-card cursor-pointer"
            >
              <Plus className="size-4" /> Invite Judge
            </button>
          </div>
        }
      />

      <SectionCard title="Invitations & Access Panels" subtitle="External guest judges with bout evaluation permissions">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading judge invitations...</div>
        ) : invites.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Gavel className="size-8 mx-auto mb-2 text-muted-foreground/50" />
            No judge invites sent yet. Click "Invite Judge" to add an external judge.
          </div>
        ) : (
          <DataTable
            headers={["Judge", "Email", "Tournament", "Status", "Invited Date", "Actions"]}
            rows={invites.map((i) => [
              <div key="name" className="flex items-center gap-2 font-medium">
                <Gavel className="size-4 text-muted-foreground shrink-0" />
                {i.full_name || "—"}
              </div>,
              <span key="email" className="text-xs text-muted-foreground">{i.email}</span>,
              <span key="tourn" className="text-xs">{i.tournament?.name || "General Tournament"}</span>,
              <div key="st">{statusBadge(i.status || "pending")}</div>,
              <span key="date" className="text-xs text-muted-foreground">
                {i.invited_at ? new Date(i.invited_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
              </span>,
              <div key="actions">
                {i.status !== "revoked" && (
                  <button
                    onClick={() => handleRevoke(i.id, i.email)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition cursor-pointer"
                    title="Revoke access"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>,
            ])}
          />
        )}
      </SectionCard>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          tournaments={tournaments}
          onInvite={loadData}
        />
      )}

      {showEndTournament && (
        <EndTournamentConfirm
          onClose={() => setShowEndTournament(false)}
          activeCount={activeInvitesCount}
          onEnd={handleEndTournament}
        />
      )}
    </div>
  );
}
