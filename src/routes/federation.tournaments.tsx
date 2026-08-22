import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import {
  Plus, Trophy, Users, Calendar, Search, X, Loader2,
  Shield, CheckCircle2, Clock, Send
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useFederationFilters } from "@/lib/federation";

export const Route = createFileRoute("/federation/tournaments")({
  component: FederationTournaments,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  template_type: string;
  valid_from: string | null;
  valid_to: string | null;
  status: string;
  is_multi_academy: boolean;
  created_at: string;
  academy: { name: string } | null;
}

interface Athlete {
  id: string;
  full_name: string;
  gender: string;
  state: string | null;
  city: string | null;
  age_category: { name: string } | null;
  weight_category: { weight_class: string } | null;
  academy: { name: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === "completed") return <span className="badge badge-success">Completed</span>;
  if (status === "in_progress") return <span className="badge badge-warning">Live</span>;
  if (status === "cancelled") return <span className="badge badge-danger">Cancelled</span>;
  return <span className="badge badge-neutral">Scheduled</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

function FederationTournaments() {
  const { user } = useAuth();
  const { scope, states, cities } = useFederationFilters();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState<Tournament | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Federations see tournaments of type 'tournament' that are multi-academy
      const { data, error } = await supabase
        .from("ring_schedule_templates")
        .select(`
          id, name, template_type, valid_from, valid_to, status, is_multi_academy, created_at,
          academy:host_academy_id(name)
        `)
        .eq("template_type", "tournament")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTournaments((data ?? []) as unknown as Tournament[]);
    } catch (err: any) {
      toast.error(err.message || "Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="animate-fade-up space-y-6 relative">
      {/* Subtle Arena Fog */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[800px] h-[800px] top-0 right-0 -translate-y-1/3 translate-x-1/3 opacity-25 pointer-events-none" />

      <PageHeader
        title="Tournament Engine"
        subtitle="Create and manage World Boxing rules tournaments across your jurisdiction"
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> New Tournament
          </button>
        }
      />

      {/* Tournament List */}
      {loading ? (
        <div className="py-12 text-center relative z-10">
          <Loader2 className="size-8 animate-spin mx-auto text-primary mb-3" />
          <div className="text-sm text-muted-foreground">Loading tournaments…</div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center shadow-card relative z-10">
          <Trophy className="size-12 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-display font-bold text-lg text-foreground">No tournaments yet</div>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Create your first federation tournament to begin drafting athletes and generating staff.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary-dark transition cursor-pointer shadow-card"
          >
            <Plus className="size-4" /> Create Tournament
          </button>
        </div>
      ) : (
        <div className="space-y-4 relative z-10">
          {tournaments.map(t => (
            <div key={t.id} className="bg-surface border border-border rounded-2xl p-6 shadow-card hover:border-border-strong transition-all">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="font-display font-bold text-base text-foreground">{t.name}</span>
                    {statusBadge(t.status)}
                    {t.is_multi_academy && <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">Multi-Academy</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 flex-wrap">
                    {t.valid_from && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5 text-muted-foreground" />
                        {new Date(t.valid_from).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                        {t.valid_to ? ` – ${new Date(t.valid_to).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                      </span>
                    )}
                    {(t.academy as any)?.name && (
                      <span className="text-muted-foreground">Host: <strong className="text-foreground">{(t.academy as any).name}</strong></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(t.status === "scheduled" || t.status === "in_progress") && (
                    <>
                      <button
                        onClick={() => setShowDraftModal(t)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl hover:bg-blue-500/20 transition cursor-pointer"
                      >
                        <Users className="size-3.5" /> Draft Athletes
                      </button>
                      <button
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition cursor-pointer"
                        onClick={() => toast.info("Staff generation UI coming soon. Link tournament judges via Admin portal first.")}
                      >
                        <Shield className="size-3.5" /> Generate Staff
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Tournament Modal */}
      {showCreateModal && (
        <CreateTournamentModal
          actorId={user?.id ?? null}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); load(); }}
        />
      )}

      {/* Draft Athletes Modal */}
      {showDraftModal && (
        <DraftAthletesModal
          tournament={showDraftModal}
          scope={scope}
          scopeStates={states}
          scopeCities={cities}
          actorId={user?.id ?? null}
          onClose={() => setShowDraftModal(null)}
        />
      )}
    </div>
  );
}

// ─── Create Tournament Modal ──────────────────────────────────────────────────

function CreateTournamentModal({ actorId, onClose, onSuccess }: {
  actorId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    valid_from: "",
    valid_to: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Tournament name is required"); return; }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("ring_schedule_templates")
        .insert({
          name: form.name.trim(),
          template_type: "tournament",
          is_multi_academy: true,
          valid_from: form.valid_from || null,
          valid_to: form.valid_to || null,
          status: "scheduled",
          created_by: actorId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      toast.success(`Tournament "${form.name}" created!`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to create tournament");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-elevated w-full max-w-md animate-fade-up text-foreground overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="font-display font-bold text-lg flex items-center gap-2 text-foreground">
            <Trophy className="size-5 text-amber-400" /> Create Tournament
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5 text-foreground">Tournament Name *</span>
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. State Boxing Championship 2026" className="input-premium text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 text-foreground">Start Date</span>
              <input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} className="input-premium text-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5 text-foreground">End Date</span>
              <input type="date" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} className="input-premium text-sm" />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition cursor-pointer shadow-card">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create Tournament
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Draft Athletes Modal ─────────────────────────────────────────────────────

function DraftAthletesModal({ tournament, scope, scopeStates, scopeCities, actorId, onClose }: {
  tournament: Tournament;
  scope: "national" | "state" | "custom";
  scopeStates: string[];
  scopeCities: string[];
  actorId: string | null;
  onClose: () => void;
}) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [profRes, bpRes, acRes, centerRes] = await Promise.all([
          supabase.from("profiles").select("*").in("role", ["boxer", "athlete"]),
          supabase.from("boxer_profiles").select("*").eq("is_suspended", false),
          supabase.from("academies").select("*"),
          supabase.from("centers").select("*"),
        ]);
        
        const bps = bpRes.data || [];
        const profs = profRes.data || [];
        const acs = acRes.data || [];
        const centers = centerRes.data || [];

        let allAthletes: any[] = [];
        const seenIds = new Set<string>();

        for (const bp of bps) {
          const userProf = profs.find(p => p.id === bp.user_id);
          const centerId = bp.center_id || bp.preferred_center_id;
          const center = centers.find(c => c.id === centerId);
          const academyId = bp.academy_id || userProf?.academy_id || center?.academy_id;
          const academy = acs.find(a => a.id === academyId);

          const st = bp.state || center?.state || academy?.state || "";
          const ct = bp.city || center?.city || academy?.city || "";

          seenIds.add(bp.id);
          if (bp.user_id) seenIds.add(bp.user_id);
          allAthletes.push({
            ...bp,
            computed_state: st,
            computed_city: ct,
          });
        }

        for (const p of profs) {
          if (!seenIds.has(p.id)) {
            const academy = acs.find(a => a.id === p.academy_id);
            allAthletes.push({
              ...p,
              computed_state: academy?.state || "",
              computed_city: academy?.city || "",
            });
          }
        }
        
        let fetchedAthletes = allAthletes;
        if (scope === "state" && scopeStates.length > 0) {
          fetchedAthletes = fetchedAthletes.filter(a => 
            scopeStates.some(s => a.computed_state && a.computed_state.toLowerCase().trim().includes(s.toLowerCase().trim()))
          );
        } else if (scope === "custom" && scopeCities.length > 0) {
          fetchedAthletes = fetchedAthletes.filter(a => 
            scopeCities.some(c => a.computed_city && a.computed_city.toLowerCase().trim().includes(c.toLowerCase().trim()))
          );
        }

        setAthletes((fetchedAthletes as unknown as Athlete[]) || []);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scope, scopeStates, scopeCities]);

  const filtered = athletes.filter(a =>
    !search ||
    a.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.state ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleConfirmDraft() {
    if (selected.length === 0) { toast.error("Select at least one athlete"); return; }
    setSending(true);
    try {
      // Notify each selected athlete and their academy admin via notifications table
      const notifications = selected.map(athleteId => {
        const a = athletes.find(x => x.id === athleteId);
        return {
          // Academy notification (null recipient_id = federated broadcast, stored per athlete's user_id via separate query)
          academy_id: null as string | null,
          recipient_id: athleteId, // We'll need user_id, but we use boxer_profile_id as identifier for now
          type: "tournament_selection",
          title: `Selected: ${tournament.name}`,
          body: `You have been selected to participate in "${tournament.name}" organised by the Federation.`,
          data: { tournament_id: tournament.id, tournament_name: tournament.name },
          is_read: false,
          created_at: new Date().toISOString(),
        };
      });

      // Fetch user_ids for selected athletes
      const { data: profiles } = await supabase
        .from("boxer_profiles")
        .select("id, user_id")
        .in("id", selected);

      if (profiles && profiles.length > 0) {
        const notifRows = profiles.map((p: any) => ({
          recipient_id: p.user_id,
          type: "tournament_selection",
          title: `Selected: ${tournament.name}`,
          body: `You have been selected to participate in "${tournament.name}" organised by the Federation.`,
          data: { tournament_id: tournament.id, tournament_name: tournament.name },
          is_read: false,
          created_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from("notifications").insert(notifRows);
        if (error) throw error;
      }

      toast.success(`${selected.length} athlete${selected.length > 1 ? "s" : ""} notified for ${tournament.name}!`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to send draft notifications");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-elevated w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-up text-foreground">
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <div className="font-display font-bold text-base flex items-center gap-2 text-foreground">
              <Users className="size-4 text-blue-400" /> Draft Athletes
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{tournament.name}</div>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="p-4 border-b border-border shrink-0">
          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athletes…" className="input-premium pl-9 text-sm" />
          </div>
          {selected.length > 0 && (
            <div className="mt-2 text-xs font-semibold text-blue-400">{selected.length} selected</div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading athletes…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm italic">No athletes found</div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(a => {
                const isSelected = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-sm transition cursor-pointer border ${
                      isSelected ? "bg-blue-500/10 border-blue-500/30 text-foreground" : "border-transparent hover:bg-subtle/50 text-foreground"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-foreground">{a.full_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {(a.age_category as any)?.name} · {(a.weight_category as any)?.weight_class} · {[a.city, a.state].filter(Boolean).join(", ")}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="size-4 text-blue-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            Notifications will be sent to all selected athletes.
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-elevated cursor-pointer text-muted-foreground hover:text-foreground">Cancel</button>
            <button
              onClick={handleConfirmDraft}
              disabled={selected.length === 0 || sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary-dark disabled:opacity-50 transition cursor-pointer shadow-card"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Notify {selected.length > 0 ? selected.length : ""} Athletes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
