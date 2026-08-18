import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { Users, Trophy, TrendingDown, Award, ChevronRight, X, Swords, Eye } from "lucide-react";

export const Route = createFileRoute("/coach/boxers")({ component: CoachBoxers });

// ── Stub data — TODO: wire to boxer profiles from boxer_profiles joined through coach_athlete_assignments
interface Boxer {
  id: string;
  name: string;
  age: number;
  weight: number;
  stance: "orthodox" | "southpaw";
  category: string;
  wins: number;
  losses: number;
  kos: number;
  lastBout: string | null;
  nextBout: string | null;
  fitStatus: "fit" | "injured" | "suspended";
  injuryNote?: string;
}

const STUB_BOXERS: Boxer[] = [
  { id: "bx1", name: "Aisha Khan", age: 18, weight: 59.8, stance: "orthodox", category: "Youth · 60 kg", wins: 8, losses: 1, kos: 3, lastBout: "2026-08-10", nextBout: "2026-09-05", fitStatus: "fit" },
  { id: "bx2", name: "Priya Sharma", age: 17, weight: 57.2, stance: "southpaw", category: "Youth · 57 kg", wins: 5, losses: 3, kos: 1, lastBout: "2026-08-10", nextBout: null, fitStatus: "injured", injuryNote: "Right hand sprain — 2 week rest" },
  { id: "bx3", name: "Sana Sheikh", age: 16, weight: 45.5, stance: "orthodox", category: "Junior · 46 kg", wins: 12, losses: 0, kos: 7, lastBout: "2026-07-22", nextBout: null, fitStatus: "suspended", injuryNote: "Medical suspension" },
  { id: "bx4", name: "Divya Rao", age: 22, weight: 70.1, stance: "southpaw", category: "Senior · 70 kg", wins: 15, losses: 4, kos: 4, lastBout: "2026-06-15", nextBout: "2026-09-05", fitStatus: "fit" },
];

function fitBadge(status: Boxer["fitStatus"]) {
  if (status === "fit") return <span className="badge badge-success">Fit</span>;
  if (status === "injured") return <span className="badge badge-warning">Injured</span>;
  return <span className="badge badge-danger">Suspended</span>;
}

function BoxerDetailModal({ boxer, onClose }: { boxer: Boxer; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <AvatarInitials name={boxer.name} size="md" />
            <div>
              <div className="font-display font-bold">{boxer.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{boxer.category}</div>
            </div>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          {/* Status */}
          <div className="flex items-center gap-2">{fitBadge(boxer.fitStatus)}{boxer.injuryNote && <span className="text-xs text-muted-foreground">{boxer.injuryNote}</span>}</div>

          {/* Physical details */}
          <div className="grid grid-cols-3 gap-4 bg-elevated rounded-xl p-4">
            <div className="text-center"><div className="text-xs text-muted-foreground mb-1">Age</div><div className="font-bold">{boxer.age}</div></div>
            <div className="text-center"><div className="text-xs text-muted-foreground mb-1">Weight</div><div className="font-bold">{boxer.weight} kg</div></div>
            <div className="text-center"><div className="text-xs text-muted-foreground mb-1">Stance</div><div className="font-bold capitalize">{boxer.stance}</div></div>
          </div>

          {/* Record */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bento-card p-3">
              <div className="text-2xl font-display font-bold text-success">{boxer.wins}</div>
              <div className="text-xs text-muted-foreground mt-1">Wins</div>
            </div>
            <div className="bento-card p-3">
              <div className="text-2xl font-display font-bold text-destructive">{boxer.losses}</div>
              <div className="text-xs text-muted-foreground mt-1">Losses</div>
            </div>
            <div className="bento-card p-3">
              <div className="text-2xl font-display font-bold text-warning">{boxer.kos}</div>
              <div className="text-xs text-muted-foreground mt-1">KOs</div>
            </div>
          </div>

          {/* Upcoming / recent bout */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bouts</div>
            {boxer.nextBout && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-info/30 bg-info/6">
                <Swords className="size-4 text-info shrink-0" strokeWidth={1.75} />
                <span className="text-sm">Next bout: {new Date(boxer.nextBout).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="badge badge-info ml-auto">Upcoming</span>
              </div>
            )}
            {boxer.lastBout && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-border">
                <Swords className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span className="text-sm text-muted-foreground">Last bout: {new Date(boxer.lastBout).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            )}
            {!boxer.nextBout && !boxer.lastBout && (
              <div className="text-sm text-muted-foreground">No bout history</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachBoxers() {
  const [selected, setSelected] = useState<Boxer | null>(null);
  const [filter, setFilter] = useState<"all" | "fit" | "injured" | "suspended">("all");

  const filtered = STUB_BOXERS.filter(b => filter === "all" || b.fitStatus === filter);

  const chips: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "fit", label: "Fit" },
    { key: "injured", label: "Injured" },
    { key: "suspended", label: "Suspended" },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="My Boxers"
        subtitle={`${STUB_BOXERS.length} boxer${STUB_BOXERS.length !== 1 ? "s" : ""} under your supervision`}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2"><Trophy className="size-4 text-success" strokeWidth={1.75} /><span className="label-micro">Fit</span></div>
          <div className="text-stat font-display text-success">{STUB_BOXERS.filter(b => b.fitStatus === "fit").length}</div>
        </div>
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2"><TrendingDown className="size-4 text-warning" strokeWidth={1.75} /><span className="label-micro">Injured</span></div>
          <div className="text-stat font-display text-warning">{STUB_BOXERS.filter(b => b.fitStatus === "injured").length}</div>
        </div>
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2"><Award className="size-4 text-destructive" strokeWidth={1.75} /><span className="label-micro">Suspended</span></div>
          <div className="text-stat font-display text-destructive">{STUB_BOXERS.filter(b => b.fitStatus === "suspended").length}</div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)} className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${filter === key ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border text-muted-foreground hover:border-border-strong hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      {/* Boxer list */}
      {filtered.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <Users className="size-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
          <div className="text-sm text-muted-foreground">No boxers match this filter</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(boxer => (
            <button
              key={boxer.id}
              onClick={() => setSelected(boxer)}
              className="w-full text-left bento-card p-4 flex items-center gap-4 hover:border-border-strong hover:shadow-elevated transition-all cursor-pointer"
            >
              <AvatarInitials name={boxer.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{boxer.name}</span>
                  {fitBadge(boxer.fitStatus)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{boxer.category} · {boxer.stance}</div>
                {boxer.injuryNote && <div className="text-xs text-warning mt-0.5">{boxer.injuryNote}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-foreground">{boxer.wins}W · {boxer.losses}L</div>
                <div className="text-xs text-muted-foreground">{boxer.kos} KOs</div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {selected && <BoxerDetailModal boxer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
