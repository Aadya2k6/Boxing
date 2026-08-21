import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { Plus, X, Gavel, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/superadmin/judges")({ component: SuperadminJudges });

type InviteStatus = "pending" | "active" | "expired" | "revoked";

function statusBadge(s: InviteStatus) {
  const m: Record<InviteStatus, string> = { active: "success", pending: "warning", expired: "neutral", revoked: "danger" };
  return <span className={`badge badge-${m[s]}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

function InviteModal({ onClose, academies, tournaments, onInvite }: { onClose: () => void, academies: any[], tournaments: any[], onInvite: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ email: "", name: "", password: "", tournament: tournaments[0]?.id || "", academy: academies[0]?.id || "" });
  const [submitting, setSubmitting] = useState(false);
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error("Please provide both email and password.");
      return;
    }
    setSubmitting(true);
    try {
      if (!form.tournament || !form.academy) throw new Error("Please select a tournament and academy.");

      // 1. Create auth user with temporary client (does not overwrite superadmin session)
      const { createClient } = await import("@supabase/supabase-js");
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.name || "Judge",
            role: "external_judge",
            academy_id: form.academy,
          },
        },
      });

      if (authError && !authError.message.toLowerCase().includes("already registered")) {
        throw authError;
      }

      if (authData?.user) {
        await supabase.from("profiles").upsert({
          id: authData.user.id,
          email: form.email,
          full_name: form.name || "Judge",
          role: "external_judge",
          academy_id: form.academy,
        });
      }

      // 2. Insert into external_judge_invites
      const { error: inviteErr } = await supabase.from("external_judge_invites").insert({
        email: form.email,
        full_name: form.name || null,
        tournament_template_id: form.tournament,
        academy_id: form.academy,
        invited_by: user?.id,
        status: "accepted",
      });

      if (inviteErr) throw inviteErr;

      toast.success(`Judge account & invite created for ${form.email}! They can now log in to /judge.`);
      onInvite();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to invite judge");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Invite Judge</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Email Address *</span>
            <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-premium" placeholder="judge@example.com" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Portal Password *</span>
            <input type="password" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input-premium" placeholder="Min 6 characters" />
            <span className="text-[11px] text-muted-foreground mt-1 block">Used by the external judge to log in to the Judge Portal.</span>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Judge Name (optional)</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-premium" placeholder="Full name" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Academy</span>
            <select required value={form.academy} onChange={e => setForm(f => ({ ...f, academy: e.target.value }))} className="input-premium">
              {academies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Tournament Scope</span>
            <select required value={form.tournament} onChange={e => setForm(f => ({ ...f, tournament: e.target.value }))} className="input-premium">
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
            <button type="submit" disabled={!form.email || !form.password || submitting} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-primary/90 transition shadow-sm">
              {submitting ? "Creating Account…" : "Create & Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SuperadminJudges() {
  const { user } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [selectedAcademy, setSelectedAcademy] = useState("all");
  const [selectedTournament, setSelectedTournament] = useState("all");
  
  const [invites, setInvites] = useState<any[]>([]);
  const [academies, setAcademies] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: invs }, { data: acs }, { data: ts }] = await Promise.all([
        supabase.from("external_judge_invites").select(`
          *,
          academy:academy_id(id, name),
          tournament:tournament_template_id(id, name)
        `).order("invited_at", { ascending: false }),
        supabase.from("academies").select("id, name"),
        supabase.from("ring_schedule_templates").select("id, name")
      ]);
      setInvites(invs || []);
      setAcademies(acs || []);
      setTournaments(ts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id: string, email: string) {
    if (!confirm(`Revoke access for ${email}?`)) return;
    try {
      const { error } = await supabase.from("external_judge_invites")
        .update({ status: "revoked", revoked_by: user?.id, revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(`Access revoked for ${email}`);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const filtered = invites.filter(i =>
    (selectedAcademy === "all" || i.academy_id === selectedAcademy) &&
    (selectedTournament === "all" || i.tournament_template_id === selectedTournament)
  );

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Judges"
        subtitle="Platform-wide judge invitation management"
        actions={
          <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-2 bg-[#ef4444] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#dc2626] transition shadow-card cursor-pointer">
            <Plus className="size-4" /> Invite Judge
          </button>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
          <select value={selectedAcademy} onChange={e => setSelectedAcademy(e.target.value)} className="input-premium max-w-xs">
            <option value="all">All Academies</option>
            {academies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <select value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)} className="input-premium max-w-xs">
          <option value="all">All Tournaments</option>
          {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <SectionCard title="Judge Invitations" subtitle={`${filtered.length} record${filtered.length !== 1 ? "s" : ""}`}>
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading invitations...</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Gavel className="size-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
            <div className="text-sm text-muted-foreground">No invitations match current filters</div>
          </div>
        ) : (
          <DataTable
            headers={["Judge", "Email", "Academy", "Tournament", "Status", "Invited", "Action"]}
            rows={filtered.map(invite => [
              <span key={`name-${invite.id}`} className="font-medium text-sm">{invite.full_name || <span className="italic text-muted-foreground">Name pending</span>}</span>,
              <span key={`email-${invite.id}`} className="text-sm font-mono text-muted-foreground">{invite.email}</span>,
              <span key={`ac-${invite.id}`} className="text-xs text-muted-foreground">{invite.academy?.name}</span>,
              <span key={`t-${invite.id}`} className="text-xs text-muted-foreground truncate max-w-[160px] block">{invite.tournament?.name}</span>,
              <span key={`s-${invite.id}`}>{statusBadge(invite.status)}</span>,
              <span key={`d-${invite.id}`} className="text-xs text-muted-foreground">{new Date(invite.invited_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>,
              <span key={`a-${invite.id}`}>
                {invite.status === "active" || invite.status === "pending" ? (
                  <button onClick={() => handleRevoke(invite.id, invite.email)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-destructive/30 text-destructive rounded-lg hover:bg-destructive hover:text-white transition cursor-pointer">
                    <Trash2 className="size-3" />Revoke
                  </button>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </span>,
            ])}
          />
        )}
      </SectionCard>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} academies={academies} tournaments={tournaments} onInvite={loadData} />}
    </div>
  );
}
