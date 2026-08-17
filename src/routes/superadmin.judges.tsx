/**
 * Superadmin External Judges — platform-wide view
 * §6.10: same as admin.judges.tsx but with academy-scope picker for platform-wide view.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { Plus, X, Gavel, Trash2, AlertTriangle, ShieldOff, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/judges")({ component: SuperadminJudges });

type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

interface JudgeInvite {
  id: string;
  email: string;
  name: string | null;
  status: InviteStatus;
  invitedAt: string;
  tournament: string;
  academy: string;
}

const STUB_ACADEMIES = ["All Academies", "BOXOS Academy Mumbai", "Ring Masters Delhi"];
const TOURNAMENTS = ["State Boxing Championship 2026", "District Open 2026", "National Qualifiers 2026"];

const STUB_INVITES: JudgeInvite[] = [
  { id: "j1", email: "kumar@example.com", name: "Arun Kumar", status: "accepted", invitedAt: "2026-08-12", tournament: "State Boxing Championship 2026", academy: "BOXOS Academy Mumbai" },
  { id: "j2", email: "rao@example.com", name: "Priya Rao", status: "pending", invitedAt: "2026-08-14", tournament: "State Boxing Championship 2026", academy: "Ring Masters Delhi" },
  { id: "j3", email: "mehta@example.com", name: null, status: "expired", invitedAt: "2026-07-30", tournament: "District Open 2026", academy: "BOXOS Academy Mumbai" },
];

function statusBadge(s: InviteStatus) {
  const m: Record<InviteStatus, any> = { accepted: "success", pending: "warning", expired: "neutral", revoked: "danger" };
  return <span className={`badge badge-${m[s]}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", tournament: TOURNAMENTS[0], academy: STUB_ACADEMIES[1] });
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
            <span className="block text-xs font-semibold mb-1.5">Email *</span>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-premium" placeholder="judge@example.com" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Name (optional)</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-premium" placeholder="Full name" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Academy</span>
            <select value={form.academy} onChange={e => setForm(f => ({ ...f, academy: e.target.value }))} className="input-premium">
              {STUB_ACADEMIES.slice(1).map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Tournament scope</span>
            <select value={form.tournament} onChange={e => setForm(f => ({ ...f, tournament: e.target.value }))} className="input-premium">
              {TOURNAMENTS.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button onClick={async () => { setSubmitting(true); await new Promise(r => setTimeout(r, 700)); toast.success(`Invite sent to ${form.email}`); setSubmitting(false); onClose(); }} disabled={!form.email || submitting} className="px-4 py-2 text-sm bg-primary-dark text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-primary-dark/90">{submitting ? "Sending…" : "Send Invite"}</button>
        </div>
      </div>
    </div>
  );
}

function SuperadminJudges() {
  const [showInvite, setShowInvite] = useState(false);
  const [selectedAcademy, setSelectedAcademy] = useState(STUB_ACADEMIES[0]);
  const [selectedTournament, setSelectedTournament] = useState("All Tournaments");

  const filtered = STUB_INVITES.filter(i =>
    (selectedAcademy === "All Academies" || i.academy === selectedAcademy) &&
    (selectedTournament === "All Tournaments" || i.tournament === selectedTournament)
  );

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="External Judges"
        subtitle="Platform-wide judge invitation management"
        actions={
          <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-2 bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-dark/90 transition shadow-card cursor-pointer">
            <Plus className="size-4" /> Invite Judge
          </button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
          <select value={selectedAcademy} onChange={e => setSelectedAcademy(e.target.value)} className="input-premium max-w-xs">
            {STUB_ACADEMIES.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <select value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)} className="input-premium max-w-xs">
          <option>All Tournaments</option>
          {TOURNAMENTS.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <SectionCard title="Judge Invitations" subtitle={`${filtered.length} record${filtered.length !== 1 ? "s" : ""}`}>
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Gavel className="size-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
            <div className="text-sm text-muted-foreground">No invitations match current filters</div>
          </div>
        ) : (
          <DataTable
            headers={["Judge", "Email", "Academy", "Tournament", "Status", "Invited", "Action"]}
            rows={filtered.map(invite => [
              <span className="font-medium text-sm">{invite.name || <span className="italic text-muted-foreground">Name pending</span>}</span>,
              <span className="text-sm font-mono text-muted-foreground">{invite.email}</span>,
              <span className="text-xs text-muted-foreground">{invite.academy}</span>,
              <span className="text-xs text-muted-foreground truncate max-w-[160px] block">{invite.tournament}</span>,
              statusBadge(invite.status),
              <span className="text-xs text-muted-foreground">{new Date(invite.invitedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>,
              invite.status === "accepted" || invite.status === "pending" ? (
                <button onClick={() => toast.error(`Access revoked for ${invite.email}`)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-destructive/30 text-destructive rounded-lg hover:bg-destructive hover:text-white transition cursor-pointer">
                  <Trash2 className="size-3" />Revoke
                </button>
              ) : <span className="text-xs text-muted-foreground">—</span>,
            ])}
          />
        )}
      </SectionCard>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
