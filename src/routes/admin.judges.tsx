import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { Plus, X, Mail, Gavel, Trash2, AlertTriangle, ShieldOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/judges")({ component: AdminJudges });

// ── Stub data — TODO: wire to external_judge_invites table
type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

interface JudgeInvite {
  id: string;
  email: string;
  name: string | null;
  status: InviteStatus;
  invitedAt: string;
  tournament: string;
}

const STUB_INVITES: JudgeInvite[] = [
  { id: "j1", email: "kumar.judge@example.com", name: "Arun Kumar", status: "accepted", invitedAt: "2026-08-12", tournament: "State Boxing Championship 2026" },
  { id: "j2", email: "rao.judge@example.com", name: "Priya Rao", status: "pending", invitedAt: "2026-08-14", tournament: "State Boxing Championship 2026" },
  { id: "j3", email: "mehta.judge@example.com", name: null, status: "expired", invitedAt: "2026-07-30", tournament: "District Open 2026" },
];

const TOURNAMENTS = ["State Boxing Championship 2026", "District Open 2026"];

function statusBadge(s: InviteStatus) {
  const map: Record<InviteStatus, any> = { accepted: "success", pending: "warning", expired: "neutral", revoked: "danger" };
  return <span className={`badge badge-${map[s]}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [tournament, setTournament] = useState(TOURNAMENTS[0]);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Invite External Judge</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Email address *</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-premium" placeholder="judge@example.com" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Full name (optional)</span>
            <input value={name} onChange={e => setName(e.target.value)} className="input-premium" placeholder="Judge's full name" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Tournament scope</span>
            <select value={tournament} onChange={e => setTournament(e.target.value)} className="input-premium">
              {TOURNAMENTS.map(t => <option key={t}>{t}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">This judge will only have access for the selected tournament. Access expires when all bouts reach a terminal state.</p>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button
            onClick={async () => {
              if (!email) return;
              setSubmitting(true);
              await new Promise(r => setTimeout(r, 700));
              toast.success(`Invite sent to ${email}`);
              setSubmitting(false);
              onClose();
            }}
            disabled={!email || submitting}
            className="px-4 py-2 text-sm bg-info text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-info/90"
          >
            {submitting ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EndTournamentConfirm({ onClose }: { onClose: () => void }) {
  const incompleteBouts = STUB_INVITES.filter(i => i.status === "accepted").length;
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold text-destructive flex items-center gap-2"><AlertTriangle className="size-5" />End Tournament</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          {incompleteBouts > 0 && (
            <div className="flex items-start gap-3 bg-warning/8 border border-warning/25 rounded-xl p-3">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold">{incompleteBouts} active judge invitation{incompleteBouts !== 1 ? "s" : ""}</span> will be revoked immediately. Any in-progress scoring will be lost.
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">This will manually close the tournament and revoke all judge access. The automatic path is for all bouts to reach a terminal state naturally.</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            <span className="text-sm font-medium">I understand this action cannot be undone</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button
            onClick={() => { toast.success("Tournament ended — all judge access revoked"); onClose(); }}
            disabled={!confirmed}
            className="px-4 py-2 text-sm bg-destructive text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-destructive/90"
          >
            End Tournament &amp; Revoke Judge Access
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminJudges() {
  const [showInvite, setShowInvite] = useState(false);
  const [showEndTournament, setShowEndTournament] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(TOURNAMENTS[0]);

  const filtered = STUB_INVITES.filter(i => i.tournament === selectedTournament);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="External Judges"
        subtitle="Invite and manage external judges for tournament bouts"
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
              className="inline-flex items-center gap-2 bg-info text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-info/90 transition shadow-card cursor-pointer"
            >
              <Plus className="size-4" /> Invite Judge
            </button>
          </div>
        }
      />

      {/* Tournament picker */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tournament</span>
        <select value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)} className="input-premium max-w-xs">
          {TOURNAMENTS.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <SectionCard
        title="Judge Invitations"
        subtitle={`${filtered.length} invite${filtered.length !== 1 ? "s" : ""} for ${selectedTournament}`}
      >
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Gavel className="size-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
            <div className="text-sm text-muted-foreground">No judge invitations yet</div>
            <button onClick={() => setShowInvite(true)} className="mt-3 text-sm text-info hover:underline cursor-pointer">Send first invite →</button>
          </div>
        ) : (
          <DataTable
            headers={["Judge", "Email", "Status", "Invited", "Action"]}
            rows={filtered.map(invite => [
              <div className="font-medium text-sm">{invite.name || <span className="text-muted-foreground italic">Name pending</span>}</div>,
              <div className="text-sm font-mono text-muted-foreground">{invite.email}</div>,
              statusBadge(invite.status),
              <div className="text-xs text-muted-foreground">{new Date(invite.invitedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>,
              invite.status === "accepted" || invite.status === "pending" ? (
                <button
                  onClick={() => { toast.error(`Access revoked for ${invite.email}`); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-destructive/30 text-destructive rounded-lg hover:bg-destructive hover:text-white transition cursor-pointer"
                >
                  <Trash2 className="size-3" /> Revoke
                </button>
              ) : <span className="text-muted-foreground text-xs">—</span>,
            ])}
            emptyMessage="No invites found"
          />
        )}
      </SectionCard>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
      {showEndTournament && <EndTournamentConfirm onClose={() => setShowEndTournament(false)} />}
    </div>
  );
}
